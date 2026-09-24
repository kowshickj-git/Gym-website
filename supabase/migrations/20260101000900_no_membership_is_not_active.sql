-- =============================================================================
-- A member with no membership is not ACTIVE.
--
-- member_directory derives membership_status by passing the member's current
-- membership into fn_effective_membership_status. When there is no current
-- membership — never subscribed, or every membership cancelled — both arguments
-- are NULL, every comparison in the CASE is NULL, and it fell through to its
-- ELSE branch: 'ACTIVE'.
--
-- Seen in production: two members whose memberships had all been cancelled were
-- listed as Active with no plan, no dates and no category, and were counted in
-- the dashboard's Active tile. NULL now stays NULL, which the app already shows
-- as "No membership".
-- =============================================================================

create or replace function public.fn_effective_membership_status(
  p_status public.membership_status,
  p_expiry date
)
returns public.membership_status
language sql
stable
as $$
  select case
    when p_status is null or p_expiry is null then null
    when p_status in ('CANCELLED', 'PENDING') then p_status
    when p_expiry < current_date then 'EXPIRED'::public.membership_status
    when p_expiry <= current_date + public.fn_expiring_soon_days() then 'EXPIRING_SOON'::public.membership_status
    else 'ACTIVE'::public.membership_status
  end
$$;
