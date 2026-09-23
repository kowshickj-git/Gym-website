-- =============================================================================
-- Iron Core Gym - stored procedures, views and derived reporting
-- Money-moving operations live here so activation is atomic and idempotent.
-- =============================================================================

-- Number of days before expiry at which a membership is considered
-- "expiring soon". Mirrored in src/lib/constants.ts (EXPIRING_SOON_DAYS).
create or replace function public.fn_expiring_soon_days()
returns integer
language sql
immutable
as $$ select 7 $$;

-- -----------------------------------------------------------------------------
-- Identity helpers. SECURITY DEFINER so RLS policies can call them without
-- recursing into the policies of the tables they read.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role
  from public.users u
  where u.id = auth.uid() and u.is_active
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'ADMIN', false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'STAFF'), false)
$$;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id from public.members m where m.user_id = auth.uid() limit 1
$$;

-- -----------------------------------------------------------------------------
-- Membership lifecycle
-- -----------------------------------------------------------------------------
create or replace function public.fn_effective_membership_status(
  p_status public.membership_status,
  p_expiry date
)
returns public.membership_status
language sql
stable
as $$
  select case
    when p_status in ('CANCELLED', 'PENDING') then p_status
    when p_expiry < current_date then 'EXPIRED'::public.membership_status
    when p_expiry <= current_date + public.fn_expiring_soon_days() then 'EXPIRING_SOON'::public.membership_status
    else 'ACTIVE'::public.membership_status
  end
$$;

-- Re-derives the stored status column. Called by the daily cron job and after
-- any write that can shift a membership across a bucket boundary.
create or replace function public.fn_refresh_membership_statuses()
returns table (expired_count integer, expiring_count integer, active_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired  integer := 0;
  v_expiring integer := 0;
  v_active   integer := 0;
begin
  with updated as (
    update public.memberships
    set status = 'EXPIRED'
    where status in ('ACTIVE', 'EXPIRING_SOON') and expiry_date < current_date
    returning 1
  )
  select count(*) into v_expired from updated;

  with updated as (
    update public.memberships
    set status = 'EXPIRING_SOON'
    where status = 'ACTIVE'
      and expiry_date >= current_date
      and expiry_date <= current_date + public.fn_expiring_soon_days()
    returning 1
  )
  select count(*) into v_expiring from updated;

  with updated as (
    update public.memberships
    set status = 'ACTIVE'
    where status = 'EXPIRING_SOON'
      and expiry_date > current_date + public.fn_expiring_soon_days()
    returning 1
  )
  select count(*) into v_active from updated;

  return query select v_expired, v_expiring, v_active;
end;
$$;

-- The date a newly purchased term should begin: the day after the member's
-- current term ends, so renewing early never costs the member days.
-- SECURITY DEFINER so it can read across memberships, but it refuses to answer
-- for anyone other than the caller unless the caller is staff — otherwise a
-- member could probe another member's expiry date by guessing ids.
create or replace function public.fn_next_start_date(p_member_id uuid)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() and p_member_id is distinct from public.current_member_id() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return coalesce(
    (
      select greatest(m.expiry_date + 1, current_date)
      from public.memberships m
      where m.member_id = p_member_id
        and m.status <> 'CANCELLED'
        and m.expiry_date >= current_date
      order by m.expiry_date desc
      limit 1
    ),
    current_date
  );
end;
$$;

-- Internal variant with no caller check, for use inside other SECURITY DEFINER
-- functions where the caller has already been authorised (payment settlement).
create or replace function public.fn_next_start_date_internal(p_member_id uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select greatest(m.expiry_date + 1, current_date)
      from public.memberships m
      where m.member_id = p_member_id
        and m.status <> 'CANCELLED'
        and m.expiry_date >= current_date
      order by m.expiry_date desc
      limit 1
    ),
    current_date
  )
$$;

create or replace function public.fn_next_receipt_number()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
begin
  select coalesce(receipt_prefix, 'GYM') into v_prefix from public.gym_settings where id;
  return coalesce(v_prefix, 'GYM')
    || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY')
    || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
end;
$$;

-- -----------------------------------------------------------------------------
-- fn_settle_payment - the single path by which money becomes a membership.
--
-- Idempotent: calling it twice for the same payment (verify callback AND the
-- Razorpay webhook, which routinely race) returns the first result unchanged.
-- -----------------------------------------------------------------------------
create or replace function public.fn_settle_payment(
  p_payment_id          uuid,
  p_razorpay_payment_id text default null,
  p_razorpay_signature  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment      public.payments%rowtype;
  v_member       public.members%rowtype;
  v_settings     public.gym_settings%rowtype;
  v_snapshot     jsonb;
  v_membership   public.memberships%rowtype;
  v_receipt      public.receipts%rowtype;
  v_start        date;
  v_expiry       date;
  v_duration     integer;
  v_previous_id  uuid;
  v_is_renewal   boolean;
  v_receipt_no   text;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Already settled: return the existing result so webhook replays are safe.
  if v_payment.status = 'PAID' then
    select * into v_receipt from public.receipts where payment_id = v_payment.id;
    return jsonb_build_object(
      'already_settled', true,
      'payment_id', v_payment.id,
      'membership_id', v_payment.membership_id,
      'receipt_id', v_receipt.id,
      'receipt_number', v_receipt.receipt_number
    );
  end if;

  if v_payment.status = 'REFUNDED' then
    raise exception 'PAYMENT_REFUNDED' using errcode = 'P0001';
  end if;

  select * into v_member from public.members where id = v_payment.member_id;
  select * into v_settings from public.gym_settings where id;

  v_snapshot := coalesce(v_payment.plan_snapshot, '{}'::jsonb);
  v_duration := coalesce((v_snapshot ->> 'duration_months')::integer, 1);

  -- Stack the new term on top of any term the member is still inside.
  v_start  := public.fn_next_start_date_internal(v_payment.member_id);
  v_expiry := (v_start + make_interval(months => v_duration))::date - 1;

  select id into v_previous_id
  from public.memberships
  where member_id = v_payment.member_id and status <> 'CANCELLED'
  order by expiry_date desc, created_at desc
  limit 1;
  v_is_renewal := v_previous_id is not null;

  insert into public.memberships (
    member_id, plan_id, category_id, plan_name, category_name, duration_months,
    start_date, expiry_date, status, payment_status,
    base_amount, discount_amount, final_amount,
    offer_id, offer_name, is_renewal, previous_membership_id, created_by
  ) values (
    v_payment.member_id,
    v_payment.plan_id,
    nullif(v_snapshot ->> 'category_id', '')::uuid,
    coalesce(v_snapshot ->> 'plan_name', 'Membership'),
    coalesce(v_snapshot ->> 'category_name', 'General'),
    v_duration,
    v_start,
    v_expiry,
    public.fn_effective_membership_status('ACTIVE'::public.membership_status, v_expiry),
    'PAID',
    v_payment.base_amount,
    v_payment.discount_amount,
    v_payment.amount,
    v_payment.offer_id,
    nullif(v_snapshot ->> 'offer_name', ''),
    v_is_renewal,
    v_previous_id,
    v_payment.collected_by
  )
  returning * into v_membership;

  update public.payments
  set status              = 'PAID',
      membership_id       = v_membership.id,
      paid_at             = coalesce(paid_at, now()),
      razorpay_payment_id = coalesce(p_razorpay_payment_id, razorpay_payment_id),
      razorpay_signature  = coalesce(p_razorpay_signature, razorpay_signature)
  where id = v_payment.id
  returning * into v_payment;

  if v_payment.offer_id is not null then
    update public.offers set used_count = used_count + 1 where id = v_payment.offer_id;
  end if;

  v_receipt_no := public.fn_next_receipt_number();

  insert into public.receipts (receipt_number, payment_id, member_id, membership_id, snapshot)
  values (
    v_receipt_no,
    v_payment.id,
    v_payment.member_id,
    v_membership.id,
    jsonb_build_object(
      'receipt_number', v_receipt_no,
      'issued_at', now(),
      'gym', jsonb_build_object(
        'name', coalesce(v_settings.gym_name, 'Iron Core Fitness'),
        'address', concat_ws(', ',
          nullif(v_settings.address_line1, ''), nullif(v_settings.address_line2, ''),
          nullif(v_settings.city, ''), nullif(v_settings.state, ''), nullif(v_settings.pincode, '')),
        'phone', v_settings.contact_phone,
        'email', v_settings.contact_email,
        'gstin', v_settings.gstin,
        'terms', v_settings.receipt_terms
      ),
      'member', jsonb_build_object(
        'id', v_member.id, 'name', v_member.full_name,
        'phone', v_member.phone, 'email', v_member.email
      ),
      'membership', jsonb_build_object(
        'id', v_membership.id,
        'plan_name', v_membership.plan_name,
        'category_name', v_membership.category_name,
        'duration_months', v_membership.duration_months,
        'start_date', v_membership.start_date,
        'expiry_date', v_membership.expiry_date
      ),
      'payment', jsonb_build_object(
        'id', v_payment.id,
        'base_amount', v_payment.base_amount,
        'discount_amount', v_payment.discount_amount,
        'amount', v_payment.amount,
        'currency', v_payment.currency,
        'method', v_payment.method,
        'offer_name', nullif(v_snapshot ->> 'offer_name', ''),
        'coupon_code', v_payment.coupon_code,
        'reference', coalesce(v_payment.razorpay_payment_id, v_payment.id::text),
        'paid_at', v_payment.paid_at,
        'collected_by', v_payment.collected_by_name
      )
    )
  )
  returning * into v_receipt;

  return jsonb_build_object(
    'already_settled', false,
    'payment_id', v_payment.id,
    'membership_id', v_membership.id,
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'start_date', v_membership.start_date,
    'expiry_date', v_membership.expiry_date
  );
end;
$$;

-- Records a cash / UPI / card payment taken at the desk and activates the
-- membership in the same transaction.
create or replace function public.fn_record_offline_payment(
  p_member_id       uuid,
  p_plan_id         uuid,
  p_base_amount     numeric,
  p_discount_amount numeric,
  p_amount          numeric,
  p_method          public.payment_method,
  p_collected_by    uuid,
  p_collected_by_name text default null,
  p_offer_id        uuid default null,
  p_coupon_code     text default null,
  p_notes           text default null,
  p_paid_at         timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan     public.membership_plans%rowtype;
  v_category public.membership_categories%rowtype;
  v_offer    public.offers%rowtype;
  v_payment  public.payments%rowtype;
begin
  if p_method = 'ONLINE' then
    raise exception 'ONLINE_NOT_ALLOWED_HERE' using errcode = 'P0001';
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_category from public.membership_categories where id = v_plan.category_id;

  if p_offer_id is not null then
    select * into v_offer from public.offers where id = p_offer_id;
  end if;

  insert into public.payments (
    member_id, plan_id, plan_snapshot, base_amount, discount_amount, amount,
    method, status, offer_id, coupon_code, collected_by, collected_by_name,
    notes, paid_at
  ) values (
    p_member_id,
    p_plan_id,
    jsonb_build_object(
      'plan_id', v_plan.id,
      'plan_name', v_plan.name,
      'category_id', v_plan.category_id,
      'category_name', coalesce(v_category.name, 'General'),
      'duration_months', v_plan.duration_months,
      'base_price', v_plan.base_price,
      'offer_name', v_offer.name
    ),
    p_base_amount, p_discount_amount, p_amount,
    p_method, 'CREATED', p_offer_id, p_coupon_code,
    p_collected_by, p_collected_by_name, p_notes, p_paid_at
  )
  returning * into v_payment;

  return public.fn_settle_payment(v_payment.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Reporting views. security_invoker keeps RLS applied to the caller.
-- -----------------------------------------------------------------------------
create view public.member_directory with (security_invoker = true) as
select
  m.id,
  m.user_id,
  m.full_name,
  m.phone,
  m.email,
  m.gender,
  m.weight_kg,
  m.height_cm,
  m.date_of_birth,
  m.join_date,
  m.photo_url,
  m.emergency_contact_name,
  m.emergency_contact_phone,
  m.is_active,
  m.created_at,
  ms.id             as membership_id,
  ms.plan_id,
  ms.plan_name,
  ms.category_id,
  ms.category_name,
  ms.duration_months,
  ms.start_date,
  ms.expiry_date,
  public.fn_effective_membership_status(ms.status, ms.expiry_date) as membership_status,
  ms.payment_status,
  ms.final_amount,
  (ms.expiry_date - current_date) as days_remaining,
  lp.method  as last_payment_method,
  lp.paid_at as last_payment_at,
  lp.amount  as last_payment_amount
from public.members m
left join lateral (
  select x.* from public.memberships x
  where x.member_id = m.id and x.status <> 'CANCELLED'
  order by x.expiry_date desc, x.created_at desc
  limit 1
) ms on true
left join lateral (
  select p.* from public.payments p
  where p.member_id = m.id and p.status = 'PAID'
  order by p.paid_at desc nulls last
  limit 1
) lp on true;

-- Aggregated KPI block for the admin dashboard.
create or replace function public.fn_admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_members',    (select count(*) from public.members),
    'active_members',   (select count(*) from public.member_directory where membership_status = 'ACTIVE'),
    'expiring_soon',    (select count(*) from public.member_directory where membership_status = 'EXPIRING_SOON'),
    'expired_members',  (select count(*) from public.member_directory where membership_status = 'EXPIRED'),
    'never_subscribed', (select count(*) from public.member_directory where membership_id is null),
    'new_members_this_month',
      (select count(*) from public.members where join_date >= date_trunc('month', v_today)::date),
    'todays_collection',
      (select coalesce(sum(amount), 0) from public.payments
       where status = 'PAID' and (paid_at at time zone 'Asia/Kolkata')::date = v_today),
    'todays_payment_count',
      (select count(*) from public.payments
       where status = 'PAID' and (paid_at at time zone 'Asia/Kolkata')::date = v_today),
    'monthly_revenue',
      (select coalesce(sum(amount), 0) from public.payments
       where status = 'PAID' and paid_at >= date_trunc('month', v_today)),
    'last_month_revenue',
      (select coalesce(sum(amount), 0) from public.payments
       where status = 'PAID'
         and paid_at >= date_trunc('month', v_today) - interval '1 month'
         and paid_at <  date_trunc('month', v_today)),
    'lifetime_revenue',
      (select coalesce(sum(amount), 0) from public.payments where status = 'PAID'),
    'unpaid_memberships',
      (select count(*) from public.memberships where payment_status <> 'PAID' and status <> 'CANCELLED')
  ) into v_result;

  return v_result;
end;
$$;

-- Month-by-month revenue, new joins and renewals for the dashboard charts.
create or replace function public.fn_revenue_series(p_months integer default 6)
returns table (
  bucket          date,
  label           text,
  revenue         numeric,
  payment_count   bigint,
  cash_revenue    numeric,
  online_revenue  numeric,
  new_memberships bigint,
  renewals        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with months as (
    select generate_series(
      date_trunc('month', now() at time zone 'Asia/Kolkata') - make_interval(months => greatest(p_months, 1) - 1),
      date_trunc('month', now() at time zone 'Asia/Kolkata'),
      interval '1 month'
    )::date as bucket
  )
  select
    mo.bucket,
    to_char(mo.bucket, 'Mon YY') as label,
    coalesce(pay.revenue, 0)::numeric,
    coalesce(pay.payment_count, 0)::bigint,
    coalesce(pay.cash_revenue, 0)::numeric,
    coalesce(pay.online_revenue, 0)::numeric,
    coalesce(mem.new_memberships, 0)::bigint,
    coalesce(mem.renewals, 0)::bigint
  from months mo
  left join lateral (
    select
      sum(p.amount) as revenue,
      count(*) as payment_count,
      sum(p.amount) filter (where p.method <> 'ONLINE') as cash_revenue,
      sum(p.amount) filter (where p.method = 'ONLINE') as online_revenue
    from public.payments p
    where p.status = 'PAID'
      and p.paid_at >= mo.bucket
      and p.paid_at < mo.bucket + interval '1 month'
  ) pay on true
  left join lateral (
    select
      count(*) filter (where not m.is_renewal) as new_memberships,
      count(*) filter (where m.is_renewal) as renewals
    from public.memberships m
    where m.created_at >= mo.bucket
      and m.created_at < mo.bucket + interval '1 month'
  ) mem on true
  order by mo.bucket;
end;
$$;

-- Category mix for the dashboard donut.
create or replace function public.fn_category_distribution()
returns table (category_name text, member_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select d.category_name::text, count(*)::bigint
  from public.member_directory d
  where d.membership_status in ('ACTIVE', 'EXPIRING_SOON') and d.category_name is not null
  group by d.category_name
  order by 2 desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Housekeeping
-- -----------------------------------------------------------------------------
create or replace function public.fn_purge_expired_otps()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from public.otp_challenges
    where expires_at < now() - interval '1 day'
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execution grants.
--
-- Postgres grants EXECUTE to PUBLIC by default, which would let any signed-in
-- member call the money-moving functions directly through PostgREST. Revoking
-- from PUBLIC also removes it from service_role, so each revoked function is
-- granted back to service_role explicitly — those are the ones the server-side
-- route handlers call with the service key after doing their own auth check.
-- -----------------------------------------------------------------------------
revoke execute on function public.fn_settle_payment(uuid, text, text) from public;
revoke execute on function public.fn_record_offline_payment(
  uuid, uuid, numeric, numeric, numeric, public.payment_method, uuid, text, uuid, text, text, timestamptz
) from public;
revoke execute on function public.fn_refresh_membership_statuses() from public;
revoke execute on function public.fn_purge_expired_otps() from public;
revoke execute on function public.fn_next_start_date_internal(uuid) from public;
-- Burning receipt numbers is not something a client should be able to do.
revoke execute on function public.fn_next_receipt_number() from public;

grant execute on function public.fn_settle_payment(uuid, text, text) to service_role;
grant execute on function public.fn_record_offline_payment(
  uuid, uuid, numeric, numeric, numeric, public.payment_method, uuid, text, uuid, text, text, timestamptz
) to service_role;
grant execute on function public.fn_refresh_membership_statuses() to service_role;
grant execute on function public.fn_purge_expired_otps() to service_role;
-- The unchecked variant: server-side callers have already authorised the request.
grant execute on function public.fn_next_start_date_internal(uuid) to service_role;

grant execute on function public.fn_admin_dashboard_stats() to authenticated, service_role;
grant execute on function public.fn_revenue_series(integer) to authenticated, service_role;
grant execute on function public.fn_category_distribution() to authenticated, service_role;
grant execute on function public.fn_next_start_date(uuid) to authenticated, service_role;
