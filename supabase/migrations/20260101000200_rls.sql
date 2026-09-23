-- =============================================================================
-- Iron Core Gym - Row Level Security
--
-- Baseline: revoke the permissive defaults, then grant precisely.
--   anon          -> public catalogue only (plans, categories, live offers, gym info)
--   authenticated -> a member sees strictly their own records; staff see the gym
--   service_role  -> bypasses RLS; used only by server-side route handlers
--
-- Members never write to a table directly. Self-service edits go through
-- fn_update_my_profile so the set of editable columns is explicit.
-- =============================================================================

alter table public.users                 enable row level security;
alter table public.admin_users           enable row level security;
alter table public.gym_settings          enable row level security;
alter table public.members               enable row level security;
alter table public.membership_categories enable row level security;
alter table public.membership_plans      enable row level security;
alter table public.offers                enable row level security;
alter table public.offer_plan_rules      enable row level security;
alter table public.memberships           enable row level security;
alter table public.payments              enable row level security;
alter table public.receipts              enable row level security;
alter table public.notifications         enable row level security;
alter table public.otp_challenges        enable row level security;
alter table public.audit_logs            enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Public catalogue: readable by anyone, writable by admins
-- -----------------------------------------------------------------------------
grant select on public.gym_settings          to anon, authenticated;
grant select on public.membership_categories to anon, authenticated;
grant select on public.membership_plans      to anon, authenticated;
grant select on public.offers                to anon, authenticated;
grant select on public.offer_plan_rules      to anon, authenticated;

grant insert, update, delete on public.membership_categories to authenticated;
grant insert, update, delete on public.membership_plans      to authenticated;
grant insert, update, delete on public.offers                to authenticated;
grant insert, update, delete on public.offer_plan_rules      to authenticated;
grant update on public.gym_settings to authenticated;

create policy gym_settings_read on public.gym_settings
  for select to anon, authenticated using (true);
create policy gym_settings_admin_write on public.gym_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy categories_read_active on public.membership_categories
  for select to anon, authenticated using (is_active or public.is_staff());
create policy categories_admin_all on public.membership_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy plans_read_active on public.membership_plans
  for select to anon, authenticated using (is_active or public.is_staff());
create policy plans_admin_all on public.membership_plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Only live, active offers are visible publicly. Staff see the full history so
-- they can edit scheduled and lapsed campaigns.
create policy offers_read_live on public.offers
  for select to anon, authenticated
  using ((is_active and now() between starts_at and ends_at) or public.is_staff());
create policy offers_admin_all on public.offers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy offer_rules_read on public.offer_plan_rules
  for select to anon, authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.offers o
      where o.id = offer_id and o.is_active and now() between o.starts_at and o.ends_at
    )
  );
create policy offer_rules_admin_all on public.offer_plan_rules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- users / admin_users
-- -----------------------------------------------------------------------------
grant select on public.users to authenticated;
grant insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.admin_users to authenticated;

create policy users_read_self on public.users
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy users_admin_all on public.users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin_users_read on public.admin_users
  for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy admin_users_admin_all on public.admin_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- members - a member reads only their own row
-- -----------------------------------------------------------------------------
grant select on public.members to authenticated;
grant insert, update, delete on public.members to authenticated;

create policy members_read_own on public.members
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy members_staff_insert on public.members
  for insert to authenticated with check (public.is_staff());
create policy members_staff_update on public.members
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy members_admin_delete on public.members
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- memberships / payments / receipts - read-own for members, full for staff.
-- Writes are performed by server-side handlers holding the service role, or by
-- staff through the admin UI.
-- -----------------------------------------------------------------------------
grant select on public.memberships to authenticated;
grant insert, update on public.memberships to authenticated;
grant select on public.payments to authenticated;
grant insert, update on public.payments to authenticated;
grant select on public.receipts to authenticated;
grant select on public.notifications to authenticated;
grant select on public.audit_logs to authenticated;

create policy memberships_read_own on public.memberships
  for select to authenticated
  using (
    public.is_staff()
    or member_id = public.current_member_id()
  );
create policy memberships_staff_write on public.memberships
  for insert to authenticated with check (public.is_staff());
create policy memberships_staff_update on public.memberships
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy payments_read_own on public.payments
  for select to authenticated
  using (
    public.is_staff()
    or member_id = public.current_member_id()
  );
create policy payments_staff_write on public.payments
  for insert to authenticated with check (public.is_staff());
create policy payments_staff_update on public.payments
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy receipts_read_own on public.receipts
  for select to authenticated
  using (
    public.is_staff()
    or member_id = public.current_member_id()
  );

create policy notifications_read_own on public.notifications
  for select to authenticated
  using (
    public.is_staff()
    or member_id = public.current_member_id()
  );

create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- otp_challenges - no client access at all. Service role only.
-- (RLS is enabled with zero policies, so every non-service query returns empty.)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Member self-service profile edit. The column list here is the whole contract:
-- a member can never change their own phone number, membership or amounts.
-- -----------------------------------------------------------------------------
create or replace function public.fn_update_my_profile(
  p_full_name               text default null,
  p_email                   text default null,
  p_date_of_birth           date default null,
  p_gender                  public.gender default null,
  p_weight_kg               numeric default null,
  p_height_cm               numeric default null,
  p_emergency_contact_name  text default null,
  p_emergency_contact_phone text default null,
  p_photo_url               text default null
)
returns public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_row public.members%rowtype;
begin
  if v_member_id is null then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  update public.members
  set full_name               = coalesce(nullif(btrim(p_full_name), ''), full_name),
      email                   = coalesce(nullif(btrim(p_email), ''), email),
      date_of_birth           = coalesce(p_date_of_birth, date_of_birth),
      gender                  = coalesce(p_gender, gender),
      weight_kg               = coalesce(p_weight_kg, weight_kg),
      height_cm               = coalesce(p_height_cm, height_cm),
      emergency_contact_name  = coalesce(nullif(btrim(p_emergency_contact_name), ''), emergency_contact_name),
      emergency_contact_phone = coalesce(nullif(btrim(p_emergency_contact_phone), ''), emergency_contact_phone),
      photo_url               = coalesce(nullif(btrim(p_photo_url), ''), photo_url)
  where id = v_member_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.fn_update_my_profile(
  text, text, date, public.gender, numeric, numeric, text, text, text
) to authenticated;

-- Photo needs its own function because fn_update_my_profile reads NULL as
-- "leave unchanged", and removing a photo has to be able to write NULL.
create or replace function public.fn_set_my_photo(p_photo_url text)
returns public.members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_row public.members%rowtype;
begin
  if v_member_id is null then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  update public.members
  set photo_url = nullif(btrim(coalesce(p_photo_url, '')), '')
  where id = v_member_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.fn_set_my_photo(text) to authenticated;

-- The member_directory view inherits RLS from its base tables
-- (security_invoker = true), so this grant is safe for members too.
grant select on public.member_directory to authenticated;
