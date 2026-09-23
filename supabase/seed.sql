-- =============================================================================
-- Iron Core Gym - seed / demo data
--
-- Safe to run repeatedly: every row is keyed by a fixed UUID and upserted.
-- All people, phone numbers and payments below are fictional.
-- Dates are relative to the moment of seeding so the demo always shows a
-- realistic mix of active / expiring / expired memberships.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gym profile
-- -----------------------------------------------------------------------------
insert into public.gym_settings (
  id, gym_name, tagline, address_line1, address_line2, city, state, pincode,
  contact_phone, whatsapp_phone, contact_email, currency, receipt_prefix,
  receipt_terms, opening_hours, maps_url
) values (
  true,
  'Iron Core Fitness',
  'Strength for every body, every day.',
  '2nd Floor, Ranganathan Complex',
  'Trichy Main Road',
  'Coimbatore',
  'Tamil Nadu',
  '641001',
  '+919000000000',
  '+919000000000',
  'hello@ironcorefitness.example',
  'INR',
  'ICF',
  'Membership fees once paid are non-refundable and non-transferable.',
  'Mon-Sat 5:00 AM - 10:00 PM | Sun 6:00 AM - 12:00 PM',
  'https://maps.google.com/?q=Coimbatore+Tamil+Nadu'
)
on conflict (id) do update set
  gym_name       = excluded.gym_name,
  tagline        = excluded.tagline,
  address_line1  = excluded.address_line1,
  address_line2  = excluded.address_line2,
  city           = excluded.city,
  state          = excluded.state,
  pincode        = excluded.pincode,
  contact_phone  = excluded.contact_phone,
  whatsapp_phone = excluded.whatsapp_phone,
  contact_email  = excluded.contact_email,
  receipt_prefix = excluded.receipt_prefix,
  receipt_terms  = excluded.receipt_terms,
  opening_hours  = excluded.opening_hours,
  maps_url       = excluded.maps_url;

-- -----------------------------------------------------------------------------
-- Membership categories (the two the gym launches with)
-- -----------------------------------------------------------------------------
insert into public.membership_categories (id, name, slug, description, icon, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Cardio + Weight Training', 'cardio-weight',
   'Full access to the cardio floor, free weights, machines and group sessions.', 'flame', 1),
  ('11111111-1111-4111-8111-000000000002', 'Weight Training Only', 'weight-only',
   'Free weights, machines and the strength floor. Cardio equipment not included.', 'dumbbell', 2)
on conflict (id) do update set
  name        = excluded.name,
  slug        = excluded.slug,
  description = excluded.description,
  icon        = excluded.icon,
  sort_order  = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Plans. Prices live here, never in code - the owner edits them from /admin/plans.
-- -----------------------------------------------------------------------------
insert into public.membership_plans
  (id, category_id, name, duration_months, base_price, description, highlight, sort_order) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'Monthly', 1, 1200.00, 'Pay as you go. Full cardio and weights access.', null, 1),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000001',
   '3 Months', 3, 3200.00, 'Save over a monthly plan. Full cardio and weights access.', null, 2),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001',
   '6 Months', 6, 5800.00, 'Half-yearly commitment with the best mid-term value.', 'Popular', 3),
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000001',
   'Annual', 12, 10000.00, 'Twelve months of unlimited cardio and strength training.', 'Best value', 4),
  ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000002',
   'Monthly', 1, 800.00, 'Strength floor access, month to month.', null, 1),
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000002',
   '3 Months', 3, 2100.00, 'Three months on the strength floor.', null, 2),
  ('22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000002',
   '6 Months', 6, 3800.00, 'Six months on the strength floor.', 'Popular', 3),
  ('22222222-2222-4222-8222-000000000008', '11111111-1111-4111-8111-000000000002',
   'Annual', 12, 6500.00, 'A full year of weight training.', 'Best value', 4)
on conflict (id) do update set
  category_id     = excluded.category_id,
  name            = excluded.name,
  duration_months = excluded.duration_months,
  base_price      = excluded.base_price,
  description     = excluded.description,
  highlight       = excluded.highlight,
  sort_order      = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Offers. Windows are relative to seeding time so the demo always has a live
-- campaign, one scheduled for later and one already finished.
-- -----------------------------------------------------------------------------
insert into public.offers (
  id, name, description, banner_text, discount_type, discount_value,
  max_discount_amount, min_purchase_amount, starts_at, ends_at,
  coupon_code, auto_apply, is_active
) values
  ('33333333-3333-4333-8333-000000000001',
   'Diwali Special', '20% off every 6-month and annual membership this Diwali.',
   'Diwali Special - 20% OFF', 'PERCENTAGE', 20, 2000, 3000,
   now() - interval '4 days', now() + interval '20 days', null, true, true),

  ('33333333-3333-4333-8333-000000000002',
   'Pongal Offer', 'Flat Rs.500 off on any membership of Rs.2000 or more.',
   'Pongal - Flat Rs.500 OFF', 'FIXED', 500, null, 2000,
   now() - interval '2 days', now() + interval '12 days', 'PONGAL', false, true),

  ('33333333-3333-4333-8333-000000000003',
   'New Member Offer', '10% off your first membership. Use code NEWYOU at checkout.',
   'New here? 10% OFF', 'PERCENTAGE', 10, 1000, 0,
   now() - interval '30 days', now() + interval '180 days', 'NEWYOU', false, true),

  ('33333333-3333-4333-8333-000000000004',
   'Tamil New Year Offer', 'Puthandu savings on annual memberships.',
   'Puthandu Special', 'PERCENTAGE', 15, 1500, 5000,
   now() + interval '30 days', now() + interval '45 days', null, true, true)
on conflict (id) do update set
  name                = excluded.name,
  description         = excluded.description,
  banner_text         = excluded.banner_text,
  discount_type       = excluded.discount_type,
  discount_value      = excluded.discount_value,
  max_discount_amount = excluded.max_discount_amount,
  min_purchase_amount = excluded.min_purchase_amount,
  starts_at           = excluded.starts_at,
  ends_at             = excluded.ends_at,
  coupon_code         = excluded.coupon_code,
  auto_apply          = excluded.auto_apply,
  is_active           = excluded.is_active;

-- Diwali applies only to 6 and 12 month terms; Puthandu only to annual.
delete from public.offer_plan_rules
where offer_id in (
  '33333333-3333-4333-8333-000000000001',
  '33333333-3333-4333-8333-000000000004'
);
insert into public.offer_plan_rules (offer_id, duration_months) values
  ('33333333-3333-4333-8333-000000000001', 6),
  ('33333333-3333-4333-8333-000000000001', 12),
  ('33333333-3333-4333-8333-000000000004', 12);

-- -----------------------------------------------------------------------------
-- Demo members. Fictional names, synthetic sequential phone numbers.
-- -----------------------------------------------------------------------------
insert into public.members (
  id, full_name, phone, email, date_of_birth, gender, weight_kg, height_cm,
  join_date, emergency_contact_name, emergency_contact_phone, address, is_active
) values
  ('44444444-4444-4444-8444-000000000001', 'Arun Kumar', '+919000000001', 'arun.demo@example.com',
   '1995-04-12', 'MALE', 78.50, 174.00, current_date - 400, 'Lakshmi Kumar', '+919000000101',
   'Gandhipuram, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000002', 'Karthik Raj', '+919000000002', null,
   '1992-11-03', 'MALE', 84.20, 180.00, current_date - 210, 'Suresh Raj', '+919000000102',
   'R.S. Puram, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000003', 'Priya S', '+919000000003', 'priya.demo@example.com',
   '1998-07-21', 'FEMALE', 58.00, 162.00, current_date - 150, 'Saravanan S', '+919000000103',
   'Peelamedu, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000004', 'Vignesh M', '+919000000004', null,
   '1990-01-30', 'MALE', 91.00, 177.00, current_date - 320, 'Meena M', '+919000000104',
   'Saibaba Colony, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000005', 'Divya R', '+919000000005', 'divya.demo@example.com',
   '2000-09-15', 'FEMALE', 54.50, 158.00, current_date - 95, 'Ramesh R', '+919000000105',
   'Singanallur, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000006', 'Mohan Balaji', '+919000000006', null,
   '1988-03-08', 'MALE', 96.30, 172.00, current_date - 500, 'Anitha Balaji', '+919000000106',
   'Ukkadam, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000007', 'Nandhini V', '+919000000007', 'nandhini.demo@example.com',
   '1996-12-25', 'FEMALE', 61.80, 165.00, current_date - 40, null, null,
   'Vadavalli, Coimbatore', true),

  ('44444444-4444-4444-8444-000000000008', 'Sathish Kannan', '+919000000008', null,
   '1993-06-18', 'MALE', 72.40, 169.00, current_date - 12, null, null,
   'Kuniyamuthur, Coimbatore', true)
on conflict (id) do update set
  full_name               = excluded.full_name,
  phone                   = excluded.phone,
  email                   = excluded.email,
  date_of_birth           = excluded.date_of_birth,
  gender                  = excluded.gender,
  weight_kg               = excluded.weight_kg,
  height_cm               = excluded.height_cm,
  join_date               = excluded.join_date,
  emergency_contact_name  = excluded.emergency_contact_name,
  emergency_contact_phone = excluded.emergency_contact_phone,
  address                 = excluded.address,
  is_active               = excluded.is_active;

-- -----------------------------------------------------------------------------
-- Demo memberships covering every status bucket the admin dashboard surfaces.
-- -----------------------------------------------------------------------------
delete from public.receipts where member_id in (
  select id from public.members where phone like '+91900000000%'
);
delete from public.payments where member_id in (
  select id from public.members where phone like '+91900000000%'
);
delete from public.memberships where member_id in (
  select id from public.members where phone like '+91900000000%'
);

insert into public.memberships (
  id, member_id, plan_id, category_id, plan_name, category_name, duration_months,
  start_date, expiry_date, status, payment_status,
  base_amount, discount_amount, final_amount, is_renewal
) values
  -- Arun Kumar: comfortably active annual member
  ('55555555-5555-4555-8555-000000000001', '44444444-4444-4444-8444-000000000001',
   '22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000001',
   'Annual', 'Cardio + Weight Training', 12,
   current_date - 90, current_date + 274, 'ACTIVE', 'PAID', 10000, 1000, 9000, true),

  -- Karthik Raj: expiring in 7 days
  ('55555555-5555-4555-8555-000000000002', '44444444-4444-4444-8444-000000000002',
   '22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001',
   '6 Months', 'Cardio + Weight Training', 6,
   current_date - 175, current_date + 7, 'EXPIRING_SOON', 'PAID', 5800, 0, 5800, false),

  -- Priya S: expiring in 3 days
  ('55555555-5555-4555-8555-000000000003', '44444444-4444-4444-8444-000000000003',
   '22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000002',
   '3 Months', 'Weight Training Only', 3,
   current_date - 88, current_date + 3, 'EXPIRING_SOON', 'PAID', 2100, 0, 2100, true),

  -- Vignesh M: expired three weeks ago
  ('55555555-5555-4555-8555-000000000004', '44444444-4444-4444-8444-000000000004',
   '22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000001',
   '3 Months', 'Cardio + Weight Training', 3,
   current_date - 112, current_date - 21, 'EXPIRED', 'PAID', 3200, 500, 2700, true),

  -- Divya R: active, mid-term
  ('55555555-5555-4555-8555-000000000005', '44444444-4444-4444-8444-000000000005',
   '22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000002',
   '6 Months', 'Weight Training Only', 6,
   current_date - 60, current_date + 122, 'ACTIVE', 'PAID', 3800, 380, 3420, false),

  -- Mohan Balaji: expired long ago, a win-back target
  ('55555555-5555-4555-8555-000000000006', '44444444-4444-4444-8444-000000000006',
   '22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'Monthly', 'Cardio + Weight Training', 1,
   current_date - 95, current_date - 65, 'EXPIRED', 'PAID', 1200, 0, 1200, false),

  -- Nandhini V: expiring tomorrow, and the fee is still outstanding
  ('55555555-5555-4555-8555-000000000007', '44444444-4444-4444-8444-000000000007',
   '22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000002',
   'Monthly', 'Weight Training Only', 1,
   current_date - 29, current_date + 1, 'EXPIRING_SOON', 'UNPAID', 800, 0, 800, false);

-- Sathish Kannan intentionally has no membership yet: he shows up in the
-- "registered, never subscribed" bucket.

-- -----------------------------------------------------------------------------
-- Demo payments + receipts for the paid memberships above.
-- -----------------------------------------------------------------------------
insert into public.payments (
  id, member_id, membership_id, plan_id, plan_snapshot,
  base_amount, discount_amount, amount, method, status,
  paid_at, collected_by_name, notes
) values
  ('66666666-6666-4666-8666-000000000001', '44444444-4444-4444-8444-000000000001',
   '55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000004',
   jsonb_build_object('plan_name', 'Annual', 'category_name', 'Cardio + Weight Training',
                      'duration_months', 12, 'offer_name', 'Diwali Special'),
   10000, 1000, 9000, 'ONLINE', 'PAID', now() - interval '90 days', null, null),

  ('66666666-6666-4666-8666-000000000002', '44444444-4444-4444-8444-000000000002',
   '55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000003',
   jsonb_build_object('plan_name', '6 Months', 'category_name', 'Cardio + Weight Training',
                      'duration_months', 6),
   5800, 0, 5800, 'CASH', 'PAID', now() - interval '175 days', 'Front desk', 'Paid at counter'),

  ('66666666-6666-4666-8666-000000000003', '44444444-4444-4444-8444-000000000003',
   '55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000006',
   jsonb_build_object('plan_name', '3 Months', 'category_name', 'Weight Training Only',
                      'duration_months', 3),
   2100, 0, 2100, 'UPI', 'PAID', now() - interval '88 days', 'Front desk', null),

  ('66666666-6666-4666-8666-000000000004', '44444444-4444-4444-8444-000000000004',
   '55555555-5555-4555-8555-000000000004', '22222222-2222-4222-8222-000000000002',
   jsonb_build_object('plan_name', '3 Months', 'category_name', 'Cardio + Weight Training',
                      'duration_months', 3, 'offer_name', 'Pongal Offer'),
   3200, 500, 2700, 'CASH', 'PAID', now() - interval '112 days', 'Front desk', null),

  ('66666666-6666-4666-8666-000000000005', '44444444-4444-4444-8444-000000000005',
   '55555555-5555-4555-8555-000000000005', '22222222-2222-4222-8222-000000000007',
   jsonb_build_object('plan_name', '6 Months', 'category_name', 'Weight Training Only',
                      'duration_months', 6, 'offer_name', 'New Member Offer'),
   3800, 380, 3420, 'ONLINE', 'PAID', now() - interval '60 days', null, null),

  ('66666666-6666-4666-8666-000000000006', '44444444-4444-4444-8444-000000000006',
   '55555555-5555-4555-8555-000000000006', '22222222-2222-4222-8222-000000000001',
   jsonb_build_object('plan_name', 'Monthly', 'category_name', 'Cardio + Weight Training',
                      'duration_months', 1),
   1200, 0, 1200, 'CASH', 'PAID', now() - interval '95 days', 'Front desk', null),

  -- A collection recorded today so the dashboard KPI is never empty
  ('66666666-6666-4666-8666-000000000007', '44444444-4444-4444-8444-000000000005',
   null, '22222222-2222-4222-8222-000000000005',
   jsonb_build_object('plan_name', 'Monthly', 'category_name', 'Weight Training Only',
                      'duration_months', 1),
   800, 0, 800, 'CASH', 'PAID', now() - interval '2 hours', 'Front desk', 'Day pass bundle');

insert into public.receipts (receipt_number, payment_id, member_id, membership_id, snapshot)
select
  'ICF-DEMO-' || lpad((row_number() over (order by p.paid_at))::text, 4, '0'),
  p.id,
  p.member_id,
  p.membership_id,
  jsonb_build_object(
    'receipt_number', 'ICF-DEMO-' || lpad((row_number() over (order by p.paid_at))::text, 4, '0'),
    'issued_at', p.paid_at,
    'gym', jsonb_build_object('name', 'Iron Core Fitness',
                              'address', '2nd Floor, Ranganathan Complex, Trichy Main Road, Coimbatore, Tamil Nadu, 641001',
                              'phone', '+919000000000'),
    'member', jsonb_build_object('id', m.id, 'name', m.full_name, 'phone', m.phone, 'email', m.email),
    'membership', jsonb_build_object(
      'plan_name', p.plan_snapshot ->> 'plan_name',
      'category_name', p.plan_snapshot ->> 'category_name',
      'duration_months', (p.plan_snapshot ->> 'duration_months')::int,
      'start_date', ms.start_date,
      'expiry_date', ms.expiry_date
    ),
    'payment', jsonb_build_object(
      'id', p.id, 'base_amount', p.base_amount, 'discount_amount', p.discount_amount,
      'amount', p.amount, 'currency', p.currency, 'method', p.method,
      'offer_name', p.plan_snapshot ->> 'offer_name',
      'reference', p.id::text, 'paid_at', p.paid_at, 'collected_by', p.collected_by_name
    )
  )
from public.payments p
join public.members m on m.id = p.member_id
left join public.memberships ms on ms.id = p.membership_id
where p.id::text like '66666666-%'
on conflict (payment_id) do nothing;

-- -----------------------------------------------------------------------------
-- Make sure derived statuses match the dates we just wrote.
-- -----------------------------------------------------------------------------
select public.fn_refresh_membership_statuses();
