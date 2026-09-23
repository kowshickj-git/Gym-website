-- =============================================================================
-- Iron Core Gym - core schema
-- Normalised membership, pricing, discount, payment and notification model.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type public.user_role            as enum ('ADMIN', 'STAFF', 'MEMBER');
create type public.gender               as enum ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');
create type public.membership_status    as enum ('PENDING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED');
create type public.membership_payment_status as enum ('PAID', 'UNPAID', 'PARTIAL');
create type public.payment_method       as enum ('ONLINE', 'CASH', 'UPI', 'CARD', 'BANK_TRANSFER');
create type public.payment_state        as enum ('CREATED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');
create type public.discount_type        as enum ('FIXED', 'PERCENTAGE');
create type public.notification_channel as enum ('SMS', 'WHATSAPP', 'EMAIL', 'PUSH');
create type public.notification_state   as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
create type public.notification_kind    as enum (
  'OTP', 'WELCOME', 'PAYMENT_RECEIPT', 'EXPIRY_REMINDER', 'EXPIRED', 'OFFER_ANNOUNCEMENT', 'CUSTOM'
);

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- users - application-level mirror of auth.users carrying the role
-- -----------------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'MEMBER',
  full_name   text,
  phone       text unique,
  email       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint users_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);
create index users_role_idx on public.users (role);
create trigger users_touch before update on public.users
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- admin_users - staff directory with per-account operational metadata
-- -----------------------------------------------------------------------------
create table public.admin_users (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.users(id) on delete cascade,
  display_name     text not null,
  designation      text,
  can_collect_cash boolean not null default true,
  can_manage_plans boolean not null default true,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger admin_users_touch before update on public.admin_users
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- gym_settings - single row of owner-editable business configuration
-- -----------------------------------------------------------------------------
create table public.gym_settings (
  id                    boolean primary key default true,
  gym_name              text not null default 'Iron Core Fitness',
  tagline               text,
  address_line1         text,
  address_line2         text,
  city                  text,
  state                 text default 'Tamil Nadu',
  pincode               text,
  contact_phone         text,
  whatsapp_phone        text,
  contact_email         text,
  gstin                 text,
  logo_url              text,
  currency              text not null default 'INR',
  receipt_prefix        text not null default 'GYM',
  receipt_terms         text,
  reminder_offsets_days integer[] not null default array[7, 3, 1, 0],
  opening_hours         text,
  maps_url              text,
  updated_at            timestamptz not null default now(),
  constraint gym_settings_singleton check (id)
);
create trigger gym_settings_touch before update on public.gym_settings
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- members - the gym customer records
-- -----------------------------------------------------------------------------
create table public.members (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid unique references public.users(id) on delete set null,
  full_name               text not null,
  phone                   text not null unique,
  email                   text,
  date_of_birth           date,
  gender                  public.gender,
  weight_kg               numeric(5,2),
  height_cm               numeric(5,2),
  join_date               date not null default current_date,
  photo_url               text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  address                 text,
  notes                   text,
  is_active               boolean not null default true,
  created_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint members_full_name_present check (length(btrim(full_name)) > 0),
  constraint members_phone_e164 check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint members_emergency_phone_e164
    check (emergency_contact_phone is null or emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint members_email_shape check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint members_weight_range check (weight_kg is null or (weight_kg > 0 and weight_kg < 500)),
  constraint members_height_range check (height_cm is null or (height_cm > 0 and height_cm < 300))
);
create index members_phone_idx      on public.members (phone);
create index members_is_active_idx  on public.members (is_active);
create index members_join_date_idx  on public.members (join_date desc);
create index members_name_trgm_idx  on public.members using gin (full_name gin_trgm_ops);
create index members_phone_trgm_idx on public.members using gin (phone gin_trgm_ops);
create trigger members_touch before update on public.members
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- membership_categories - extensible; ships with the two launch categories
-- -----------------------------------------------------------------------------
create table public.membership_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  description text,
  icon        text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index membership_categories_active_idx on public.membership_categories (is_active, sort_order);
create trigger membership_categories_touch before update on public.membership_categories
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- membership_plans - category x duration x price, fully admin editable
-- -----------------------------------------------------------------------------
create table public.membership_plans (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.membership_categories(id) on delete restrict,
  name            text not null,
  duration_months integer not null,
  base_price      numeric(10,2) not null,
  description     text,
  highlight       text,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint membership_plans_duration_positive check (duration_months between 1 and 60),
  constraint membership_plans_price_positive check (base_price >= 0),
  constraint membership_plans_unique_combo unique (category_id, duration_months)
);
create index membership_plans_active_idx   on public.membership_plans (is_active, sort_order);
create index membership_plans_category_idx on public.membership_plans (category_id);
create trigger membership_plans_touch before update on public.membership_plans
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- offers - the discount engine configuration surface
-- -----------------------------------------------------------------------------
create table public.offers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  banner_text         text,
  discount_type       public.discount_type not null,
  discount_value      numeric(10,2) not null,
  max_discount_amount numeric(10,2),
  min_purchase_amount numeric(10,2) not null default 0,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  coupon_code         text unique,
  auto_apply          boolean not null default true,
  is_active           boolean not null default true,
  usage_limit         integer,
  per_member_limit    integer,
  used_count          integer not null default 0,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint offers_window_valid check (ends_at > starts_at),
  constraint offers_value_positive check (discount_value > 0),
  constraint offers_percentage_bound
    check (discount_type <> 'PERCENTAGE' or discount_value <= 100),
  constraint offers_max_discount_positive
    check (max_discount_amount is null or max_discount_amount > 0),
  constraint offers_coupon_shape
    check (coupon_code is null or coupon_code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$')
);
create index offers_active_window_idx on public.offers (is_active, starts_at, ends_at);
create index offers_coupon_idx        on public.offers (coupon_code) where coupon_code is not null;
create trigger offers_touch before update on public.offers
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- offer_plan_rules - scopes an offer. No rows for an offer means "applies to all".
-- -----------------------------------------------------------------------------
create table public.offer_plan_rules (
  id              uuid primary key default gen_random_uuid(),
  offer_id        uuid not null references public.offers(id) on delete cascade,
  category_id     uuid references public.membership_categories(id) on delete cascade,
  plan_id         uuid references public.membership_plans(id) on delete cascade,
  duration_months integer,
  created_at      timestamptz not null default now(),
  constraint offer_plan_rules_has_predicate
    check (category_id is not null or plan_id is not null or duration_months is not null)
);
create index offer_plan_rules_offer_idx on public.offer_plan_rules (offer_id);

-- -----------------------------------------------------------------------------
-- memberships - one row per purchased term
-- -----------------------------------------------------------------------------
create table public.memberships (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null references public.members(id) on delete cascade,
  plan_id                uuid references public.membership_plans(id) on delete set null,
  category_id            uuid references public.membership_categories(id) on delete set null,
  plan_name              text not null,
  category_name          text not null,
  duration_months        integer not null,
  start_date             date not null,
  expiry_date            date not null,
  status                 public.membership_status not null default 'ACTIVE',
  payment_status         public.membership_payment_status not null default 'UNPAID',
  base_amount            numeric(10,2) not null default 0,
  discount_amount        numeric(10,2) not null default 0,
  final_amount           numeric(10,2) not null default 0,
  offer_id               uuid references public.offers(id) on delete set null,
  offer_name             text,
  is_renewal             boolean not null default false,
  previous_membership_id uuid references public.memberships(id) on delete set null,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint memberships_dates_valid check (expiry_date >= start_date),
  constraint memberships_amounts_valid check (
    base_amount >= 0 and discount_amount >= 0 and final_amount >= 0
    and discount_amount <= base_amount
  )
);
create index memberships_member_idx         on public.memberships (member_id, expiry_date desc);
create index memberships_expiry_idx         on public.memberships (expiry_date);
create index memberships_status_idx         on public.memberships (status);
create index memberships_payment_status_idx on public.memberships (payment_status);
create index memberships_live_expiry_idx    on public.memberships (status, expiry_date)
  where status in ('ACTIVE', 'EXPIRING_SOON');
create index memberships_created_at_idx     on public.memberships (created_at desc);
create trigger memberships_touch before update on public.memberships
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- payments - every rupee collected, online or cash
-- -----------------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references public.members(id) on delete cascade,
  membership_id       uuid references public.memberships(id) on delete set null,
  plan_id             uuid references public.membership_plans(id) on delete set null,
  plan_snapshot       jsonb not null default '{}'::jsonb,
  base_amount         numeric(10,2) not null,
  discount_amount     numeric(10,2) not null default 0,
  amount              numeric(10,2) not null,
  currency            text not null default 'INR',
  method              public.payment_method not null,
  status              public.payment_state not null default 'CREATED',
  offer_id            uuid references public.offers(id) on delete set null,
  coupon_code         text,
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  razorpay_signature  text,
  failure_reason      text,
  paid_at             timestamptz,
  collected_by        uuid references public.users(id) on delete set null,
  collected_by_name   text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_amount_positive check (amount >= 0 and base_amount >= 0 and discount_amount >= 0)
);
create index payments_member_idx     on public.payments (member_id, created_at desc);
create index payments_status_idx     on public.payments (status);
create index payments_method_idx     on public.payments (method);
create index payments_paid_at_idx    on public.payments (paid_at desc);
create index payments_created_at_idx on public.payments (created_at desc);
create index payments_membership_idx on public.payments (membership_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.fn_touch_updated_at();

-- -----------------------------------------------------------------------------
-- receipts - immutable snapshot issued for each successful payment
-- -----------------------------------------------------------------------------
create sequence public.receipt_number_seq start 1001;

create table public.receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  payment_id     uuid not null unique references public.payments(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  membership_id  uuid references public.memberships(id) on delete set null,
  snapshot       jsonb not null,
  issued_at      timestamptz not null default now()
);
create index receipts_member_idx on public.receipts (member_id, issued_at desc);

-- -----------------------------------------------------------------------------
-- notifications - outbound log, provider agnostic, duplicate-proof
-- -----------------------------------------------------------------------------
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid references public.members(id) on delete cascade,
  membership_id       uuid references public.memberships(id) on delete set null,
  kind                public.notification_kind not null,
  channel             public.notification_channel not null,
  recipient           text not null,
  subject             text,
  body                text not null,
  status              public.notification_state not null default 'PENDING',
  provider            text,
  provider_message_id text,
  error               text,
  dedupe_key          text unique,
  scheduled_for       timestamptz,
  sent_at             timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index notifications_member_idx on public.notifications (member_id, created_at desc);
create index notifications_status_idx on public.notifications (status);
create index notifications_kind_idx   on public.notifications (kind, created_at desc);

-- -----------------------------------------------------------------------------
-- otp_challenges - phone login codes (hashed at rest, rate limited)
-- -----------------------------------------------------------------------------
create table public.otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index otp_challenges_phone_idx   on public.otp_challenges (phone, created_at desc);
create index otp_challenges_expires_idx on public.otp_challenges (expires_at);

-- -----------------------------------------------------------------------------
-- audit_logs - who changed what
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_label   text,
  action        text not null,
  entity        text not null,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  ip_address    text,
  created_at    timestamptz not null default now()
);
create index audit_logs_entity_idx     on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_actor_idx      on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
