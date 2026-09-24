-- =============================================================================
-- Never store a login code in the message log.
--
-- The OTP itself is kept only as an HMAC in otp_challenges. But the SMS that
-- carries it went through the ordinary notification pipeline, which logs every
-- message body — so the live code sat in notifications.body in plain text:
--
--     285562 is your Iron Core Fitness login code. It expires in 5 minutes.
--
-- Every staff account can read that table (notifications_read_own allows
-- is_staff()), which meant any member of staff could read a member's code
-- during its five minutes and sign in as them.
--
-- The dispatcher inserts the row and then sends from the copy it holds in
-- memory, so masking the stored copy cannot affect delivery. Doing it in a
-- trigger rather than in the application means no future code path can
-- reintroduce the leak by forgetting to.
-- =============================================================================

create or replace function public.fn_redact_otp_notification()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'OTP' then
    new.body := regexp_replace(new.body, '[0-9]{4,8}', '••••••', 'g');
  end if;
  return new;
end $$;

revoke all on function public.fn_redact_otp_notification() from public, anon, authenticated;

drop trigger if exists notifications_redact_otp on public.notifications;
create trigger notifications_redact_otp
  before insert or update of body on public.notifications
  for each row execute function public.fn_redact_otp_notification();

-- Scrub the codes already logged. The update fires the trigger above.
update public.notifications set body = body where kind = 'OTP';
