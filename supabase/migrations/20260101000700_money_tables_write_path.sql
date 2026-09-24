-- =============================================================================
-- Money tables are written through the server, not by signed-in users.
--
-- The RLS migration let any staff account insert and update `payments` and
-- `memberships` directly through PostgREST with its own session. The app never
-- does that: every payment write goes through createAdminClient() and the
-- SECURITY DEFINER settlement functions, which run as their owner and are not
-- affected by anything here.
--
-- So the policies served no caller, and they were a way around the rules the
-- app does enforce. A member of staff whose "Can take payments" switch is off
-- could skip the app, take their own access token, and PATCH a payment to PAID
-- or insert a membership, with no receipt and no audit row.
--
-- What remains is exactly what the app uses: the owner cancelling a membership,
-- limited to the three columns that cancelling touches.
-- =============================================================================

-- ---------------------------------------------------------------- payments
drop policy if exists payments_staff_write on public.payments;
drop policy if exists payments_staff_update on public.payments;
revoke insert, update, delete on public.payments from authenticated;

-- ------------------------------------------------------------- memberships
drop policy if exists memberships_staff_write on public.memberships;
drop policy if exists memberships_staff_update on public.memberships;
revoke insert, update, delete on public.memberships from authenticated;

-- Column-level: an owner's session can mark a membership cancelled, and can
-- change nothing else about it — not its dates, price or payment status.
grant update (status, cancelled_at, cancel_reason) on public.memberships to authenticated;

create policy memberships_owner_cancel on public.memberships
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and status = 'CANCELLED');
