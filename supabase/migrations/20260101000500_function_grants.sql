-- =============================================================================
-- Lock down EXECUTE on every function this project owns.
--
-- Why this migration exists
-- -------------------------
-- The earlier migrations tried to protect the money-moving functions with
--
--     revoke execute on function public.fn_settle_payment(...) from public;
--
-- That looked right and did nothing. Supabase ships a default ACL on schema
-- public that grants EXECUTE to anon, authenticated and service_role on every
-- function as it is created:
--
--     postgres:       anon=X/postgres | authenticated=X/postgres | ...
--     supabase_admin: anon=X/supabase_admin | authenticated=X/...
--
-- PUBLIC was never where the privilege came from, so revoking PUBLIC changed
-- nothing. Verified against a live project: a caller holding only the
-- publishable key could call fn_settle_payment(<payment uuid>) and have it
-- create a membership and issue a receipt for a payment nobody ever made.
--
-- The fix is to revoke from the roles that actually hold the grant, grant back
-- only what each role genuinely calls, and stop the default ACL from re-opening
-- the next function somebody writes.
--
-- The grant is the control here, so it is worth saying where the second layer
-- is: scripts/verify-rls.mjs calls every privileged function with the
-- publishable key and fails if any of them answers. Run it after any change to
-- this file.
--
-- Extension functions (pg_trgm) are deliberately left alone: authenticated
-- needs similarity() and the % operator for member search, and they expose
-- nothing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Stop new functions from being world-executable the moment they are created.
--    Without this, the next `create function` silently re-opens the hole.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Revoke everything on the functions this project owns.
-- -----------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'fn\_%'
           or p.proname in ('is_admin', 'is_staff', 'current_user_role',
                            'current_member_id', 'rls_auto_enable'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Grant back, narrowly.
-- -----------------------------------------------------------------------------

-- Row Level Security policies and the member_directory view call these while
-- running as the requesting role, so the requesting role must be able to
-- execute them, or every policy that references one fails closed.
grant execute on function public.current_user_role() to anon, authenticated, service_role;
grant execute on function public.current_member_id() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.fn_effective_membership_status(public.membership_status, date)
  to anon, authenticated, service_role;
grant execute on function public.fn_expiring_soon_days() to anon, authenticated, service_role;

-- A signed-in member acting on their own record. Each one is already limited to
-- the caller internally: fn_update_my_profile and fn_set_my_photo resolve the
-- member from auth.uid(), fn_submit_upi_reference only touches the caller's own
-- payment row, and fn_next_start_date is self-or-staff guarded.
grant execute on function public.fn_update_my_profile(
  text, text, date, public.gender, numeric, numeric, text, text, text
) to authenticated, service_role;
grant execute on function public.fn_set_my_photo(text) to authenticated, service_role;
grant execute on function public.fn_submit_upi_reference(uuid, text) to authenticated, service_role;
grant execute on function public.fn_next_start_date(uuid) to authenticated, service_role;

-- Staff reporting. These are SECURITY DEFINER, but each one opens with an
-- is_staff() check, so a signed-in member calling them gets FORBIDDEN. That
-- held up under test even while the grants were wrong.
grant execute on function public.fn_admin_dashboard_stats() to authenticated, service_role;
grant execute on function public.fn_revenue_series(integer) to authenticated, service_role;
grant execute on function public.fn_category_distribution() to authenticated, service_role;

-- Everything below is reached only through createAdminClient(), i.e. the
-- service role on our own server. None of it is callable with a browser key.
grant execute on function public.fn_settle_payment(uuid, text, text) to service_role;
grant execute on function public.fn_record_offline_payment(
  uuid, uuid, numeric, numeric, numeric, public.payment_method, uuid, text, uuid, text, text, timestamptz
) to service_role;
grant execute on function public.fn_start_upi_payment(
  uuid, uuid, numeric, numeric, numeric, jsonb, uuid, text
) to service_role;
grant execute on function public.fn_confirm_upi_payment(uuid, uuid, text) to service_role;
grant execute on function public.fn_reject_upi_payment(uuid, text, uuid) to service_role;
grant execute on function public.fn_refresh_membership_statuses() to service_role;
grant execute on function public.fn_purge_expired_otps() to service_role;
grant execute on function public.fn_next_start_date_internal(uuid) to service_role;
grant execute on function public.fn_next_receipt_number() to service_role;

-- fn_touch_updated_at and rls_auto_enable are only ever fired by triggers,
-- which do not consult EXECUTE at fire time. Nobody gets a grant.
