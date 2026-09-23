-- =============================================================================
-- Iron Core Gym - UPI Direct
--
-- A zero-fee payment route that uses no gateway at all. The member pays the
-- gym's own UPI id from their own UPI app, so the money lands directly in the
-- gym's bank account and nobody takes a cut.
--
-- The trade-off, and it is a real one: UPI apps do not call anybody back. There
-- is no webhook. So a UPI Direct payment sits in PENDING carrying the reference
-- number the member typed in, and a staff member confirms it against the bank
-- SMS with one tap. That confirmation runs the same fn_settle_payment as every
-- other payment, so the membership, the receipt and the reports are identical.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Where the money goes. Owner-editable from /admin/settings.
-- -----------------------------------------------------------------------------
alter table public.gym_settings
  add column if not exists upi_vpa          text,
  add column if not exists upi_payee_name   text,
  add column if not exists upi_enabled      boolean not null default false;

comment on column public.gym_settings.upi_vpa is
  'The gym''s own UPI id, e.g. ironcore@okaxis. Payments go straight to this account.';

-- A VPA is name@handle. Deliberately permissive: handles vary by bank and new
-- ones appear, so this rejects obvious typos rather than policing the list.
alter table public.gym_settings
  drop constraint if exists gym_settings_upi_vpa_shape;
alter table public.gym_settings
  add constraint gym_settings_upi_vpa_shape
  check (upi_vpa is null or upi_vpa ~ '^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,32}$');

-- -----------------------------------------------------------------------------
-- The reference the member reports after paying.
--
-- UPI calls it the UTR (Unique Transaction Reference): 12 digits, shown in the
-- member's app and in the gym's bank SMS. Matching those two is the whole
-- verification step.
-- -----------------------------------------------------------------------------
alter table public.payments
  add column if not exists upi_reference     text,
  add column if not exists upi_reference_at  timestamptz,
  add column if not exists confirmed_by      uuid references public.users(id) on delete set null,
  add column if not exists confirmed_by_name text;

alter table public.payments
  drop constraint if exists payments_upi_reference_shape;
alter table public.payments
  add constraint payments_upi_reference_shape
  check (upi_reference is null or upi_reference ~ '^[A-Za-z0-9]{6,32}$');

-- Two members must never be able to claim the same bank reference.
create unique index if not exists payments_upi_reference_key
  on public.payments (upi_reference)
  where upi_reference is not null;

-- The queue the front desk works through.
create index if not exists payments_awaiting_confirmation_idx
  on public.payments (created_at desc)
  where status = 'PENDING' and method = 'UPI';

-- -----------------------------------------------------------------------------
-- fn_start_upi_payment - opens a pending UPI payment for a member.
--
-- Called with the service role from the checkout route, which has already
-- re-priced the plan. Returns the payment id the deep link is built around.
-- -----------------------------------------------------------------------------
create or replace function public.fn_start_upi_payment(
  p_member_id       uuid,
  p_plan_id         uuid,
  p_base_amount     numeric,
  p_discount_amount numeric,
  p_amount          numeric,
  p_plan_snapshot   jsonb,
  p_offer_id        uuid default null,
  p_coupon_code     text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
begin
  -- One open UPI attempt per member at a time: otherwise a member who taps
  -- "pay" five times leaves five rows the desk has to reason about.
  update public.payments
  set status = 'FAILED',
      failure_reason = 'Superseded by a newer UPI attempt'
  where member_id = p_member_id
    and method = 'UPI'
    and status = 'PENDING'
    and upi_reference is null;

  insert into public.payments (
    member_id, plan_id, plan_snapshot, base_amount, discount_amount, amount,
    method, status, offer_id, coupon_code
  ) values (
    p_member_id, p_plan_id, coalesce(p_plan_snapshot, '{}'::jsonb),
    p_base_amount, p_discount_amount, p_amount,
    'UPI', 'PENDING', p_offer_id, p_coupon_code
  )
  returning * into v_payment;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- fn_submit_upi_reference - the member reports what their app showed them.
--
-- Runs as the member, so it can only touch their own pending payment. Storing
-- the reference does not settle anything; it just moves the payment into the
-- desk's confirmation queue.
-- -----------------------------------------------------------------------------
create or replace function public.fn_submit_upi_reference(
  p_payment_id uuid,
  p_reference  text
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_payment   public.payments%rowtype;
  v_clean     text := upper(btrim(coalesce(p_reference, '')));
begin
  if v_member_id is null then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  if v_clean !~ '^[A-Za-z0-9]{6,32}$' then
    raise exception 'BAD_REFERENCE' using errcode = '22023';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id and member_id = v_member_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_payment.status = 'PAID' then
    return v_payment;
  end if;

  if v_payment.method <> 'UPI' or v_payment.status <> 'PENDING' then
    raise exception 'NOT_AWAITING_REFERENCE' using errcode = 'P0001';
  end if;

  update public.payments
  set upi_reference    = v_clean,
      upi_reference_at = now()
  where id = v_payment.id
  returning * into v_payment;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- fn_confirm_upi_payment - a staff member has seen the money arrive.
--
-- This is the human step that replaces a gateway webhook. It delegates to
-- fn_settle_payment, so a confirmed UPI payment produces exactly the same
-- membership and receipt as a card payment.
-- -----------------------------------------------------------------------------
create or replace function public.fn_confirm_upi_payment(
  p_payment_id      uuid,
  p_confirmed_by    uuid,
  p_confirmed_name  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_payment.method <> 'UPI' then
    raise exception 'NOT_A_UPI_PAYMENT' using errcode = 'P0001';
  end if;

  update public.payments
  set confirmed_by      = p_confirmed_by,
      confirmed_by_name = p_confirmed_name,
      collected_by      = coalesce(collected_by, p_confirmed_by),
      collected_by_name = coalesce(collected_by_name, p_confirmed_name)
  where id = v_payment.id;

  return public.fn_settle_payment(v_payment.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- fn_reject_upi_payment - the money never arrived, or the reference was wrong.
-- -----------------------------------------------------------------------------
create or replace function public.fn_reject_upi_payment(
  p_payment_id uuid,
  p_reason     text,
  p_rejected_by uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
begin
  update public.payments
  set status         = 'FAILED',
      failure_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Not found on the gym bank statement'), 300),
      confirmed_by   = p_rejected_by
  where id = p_payment_id
    and method = 'UPI'
    and status <> 'PAID'
  returning * into v_payment;

  if not found then
    raise exception 'PAYMENT_NOT_REJECTABLE' using errcode = 'P0001';
  end if;

  return v_payment;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants. The member-facing one runs as the member; the rest are server-side
-- only, behind the staff guard in the route handlers.
-- -----------------------------------------------------------------------------
revoke execute on function public.fn_start_upi_payment(
  uuid, uuid, numeric, numeric, numeric, jsonb, uuid, text
) from public;
revoke execute on function public.fn_confirm_upi_payment(uuid, uuid, text) from public;
revoke execute on function public.fn_reject_upi_payment(uuid, text, uuid) from public;

grant execute on function public.fn_start_upi_payment(
  uuid, uuid, numeric, numeric, numeric, jsonb, uuid, text
) to service_role;
grant execute on function public.fn_confirm_upi_payment(uuid, uuid, text) to service_role;
grant execute on function public.fn_reject_upi_payment(uuid, text, uuid) to service_role;

grant execute on function public.fn_submit_upi_reference(uuid, text) to authenticated, service_role;
