-- =============================================================================
-- Drop admin_users.can_manage_plans.
--
-- It was written when a staff account was created and never read anywhere.
-- Plans and offers are owner-only, enforced by is_admin() in the RLS policies
-- and by requireAdmin() on the pages, so the flag could not grant anything.
-- A permission column that silently does nothing is a trap: sooner or later
-- someone sets it and believes a member of staff can now edit prices.
--
-- Its sibling can_collect_cash is kept, and is now enforced by
-- canTakePayments() on every action that records or confirms a payment.
-- =============================================================================

alter table public.admin_users drop column if exists can_manage_plans;
