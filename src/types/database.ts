/**
 * Hand-maintained mirror of the SQL in `supabase/migrations`.
 *
 * Once the project is linked you can regenerate this file instead:
 *   npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'ADMIN' | 'STAFF' | 'MEMBER';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED';
export type MembershipPaymentStatus = 'PAID' | 'UNPAID' | 'PARTIAL';
export type PaymentMethod = 'ONLINE' | 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER';
export type PaymentState = 'CREATED' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type DiscountType = 'FIXED' | 'PERCENTAGE';
export type NotificationChannel = 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH';
export type NotificationState = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type NotificationKind =
  | 'OTP'
  | 'WELCOME'
  | 'PAYMENT_RECEIPT'
  | 'EXPIRY_REMINDER'
  | 'EXPIRED'
  | 'OFFER_ANNOUNCEMENT'
  | 'CUSTOM';

export type AppUser = {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AdminUser = {
  id: string;
  user_id: string;
  display_name: string;
  designation: string | null;
  can_collect_cash: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type GymSettings = {
  id: boolean;
  gym_name: string;
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  contact_email: string | null;
  gstin: string | null;
  logo_url: string | null;
  currency: string;
  receipt_prefix: string;
  receipt_terms: string | null;
  reminder_offsets_days: number[];
  opening_hours: string | null;
  maps_url: string | null;
  /** The gym's own UPI id. Payments via UPI Direct land straight in this account. */
  upi_vpa: string | null;
  upi_payee_name: string | null;
  upi_enabled: boolean;
  updated_at: string;
}

export type Member = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  weight_kg: number | null;
  height_cm: number | null;
  join_date: string;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MembershipCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type MembershipPlan = {
  id: string;
  category_id: string;
  name: string;
  duration_months: number;
  base_price: number;
  description: string | null;
  highlight: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type Offer = {
  id: string;
  name: string;
  description: string | null;
  banner_text: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  min_purchase_amount: number;
  starts_at: string;
  ends_at: string;
  coupon_code: string | null;
  auto_apply: boolean;
  is_active: boolean;
  usage_limit: number | null;
  per_member_limit: number | null;
  used_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OfferPlanRule = {
  id: string;
  offer_id: string;
  category_id: string | null;
  plan_id: string | null;
  duration_months: number | null;
  created_at: string;
}

export type Membership = {
  id: string;
  member_id: string;
  plan_id: string | null;
  category_id: string | null;
  plan_name: string;
  category_name: string;
  duration_months: number;
  start_date: string;
  expiry_date: string;
  status: MembershipStatus;
  payment_status: MembershipPaymentStatus;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  offer_id: string | null;
  offer_name: string | null;
  is_renewal: boolean;
  previous_membership_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Payment = {
  id: string;
  member_id: string;
  membership_id: string | null;
  plan_id: string | null;
  plan_snapshot: Json;
  base_amount: number;
  discount_amount: number;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentState;
  offer_id: string | null;
  coupon_code: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  collected_by: string | null;
  collected_by_name: string | null;
  /** UTR the member reported after paying by UPI Direct. */
  upi_reference: string | null;
  upi_reference_at: string | null;
  /** Staff member who matched the UPI reference against the bank statement. */
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  notes: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export type ReceiptSnapshot = {
  receipt_number: string;
  issued_at: string;
  gym: {
    name: string;
    address: string | null;
    phone: string | null;
    email?: string | null;
    gstin?: string | null;
    terms?: string | null;
  };
  member: { id: string; name: string; phone: string; email: string | null };
  membership: {
    id?: string;
    plan_name: string;
    category_name: string;
    duration_months: number;
    start_date: string | null;
    expiry_date: string | null;
  };
  payment: {
    id: string;
    base_amount: number;
    discount_amount: number;
    amount: number;
    currency: string;
    method: PaymentMethod;
    offer_name: string | null;
    coupon_code?: string | null;
    reference: string;
    paid_at: string;
    collected_by: string | null;
  };
}

export type Receipt = {
  id: string;
  receipt_number: string;
  payment_id: string;
  member_id: string;
  membership_id: string | null;
  snapshot: ReceiptSnapshot;
  issued_at: string;
}

export type NotificationLog = {
  id: string;
  member_id: string | null;
  membership_id: string | null;
  kind: NotificationKind;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationState;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  dedupe_key: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  metadata: Json;
  created_at: string;
}

export type OtpChallenge = {
  id: string;
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type AuditLog = {
  id: string;
  actor_user_id: string | null;
  actor_label: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  ip_address: string | null;
  created_at: string;
}

/** Row shape of the `member_directory` view. */
export type MemberDirectoryRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null;
  join_date: string;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  membership_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  category_id: string | null;
  category_name: string | null;
  duration_months: number | null;
  start_date: string | null;
  expiry_date: string | null;
  membership_status: MembershipStatus | null;
  payment_status: MembershipPaymentStatus | null;
  final_amount: number | null;
  days_remaining: number | null;
  last_payment_method: PaymentMethod | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
}

export type DashboardStats = {
  total_members: number;
  active_members: number;
  expiring_soon: number;
  expired_members: number;
  never_subscribed: number;
  new_members_this_month: number;
  todays_collection: number;
  todays_payment_count: number;
  monthly_revenue: number;
  last_month_revenue: number;
  lifetime_revenue: number;
  unpaid_memberships: number;
}

export type RevenueSeriesRow = {
  bucket: string;
  label: string;
  revenue: number;
  payment_count: number;
  cash_revenue: number;
  online_revenue: number;
  new_memberships: number;
  renewals: number;
}

export type CategoryDistributionRow = {
  category_name: string;
  member_count: number;
}

export type SettlementResult = {
  already_settled: boolean;
  payment_id: string;
  membership_id: string | null;
  receipt_id: string | null;
  receipt_number: string | null;
  start_date?: string;
  expiry_date?: string;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      users: Table<AppUser>;
      admin_users: Table<AdminUser>;
      gym_settings: Table<GymSettings>;
      members: Table<Member, Omit<Partial<Member>, 'full_name' | 'phone'> & { full_name: string; phone: string }>;
      membership_categories: Table<MembershipCategory>;
      membership_plans: Table<MembershipPlan>;
      offers: Table<Offer>;
      offer_plan_rules: Table<OfferPlanRule>;
      memberships: Table<Membership>;
      payments: Table<Payment>;
      receipts: Table<Receipt>;
      notifications: Table<NotificationLog>;
      otp_challenges: Table<OtpChallenge>;
      audit_logs: Table<AuditLog>;
    };
    Views: {
      member_directory: { Row: MemberDirectoryRow; Relationships: [] };
    };
    Functions: {
      fn_admin_dashboard_stats: { Args: Record<string, never>; Returns: DashboardStats };
      fn_revenue_series: { Args: { p_months?: number }; Returns: RevenueSeriesRow[] };
      fn_category_distribution: { Args: Record<string, never>; Returns: CategoryDistributionRow[] };
      fn_next_start_date: { Args: { p_member_id: string }; Returns: string };
      fn_next_start_date_internal: { Args: { p_member_id: string }; Returns: string };
      fn_refresh_membership_statuses: {
        Args: Record<string, never>;
        Returns: { expired_count: number; expiring_count: number; active_count: number }[];
      };
      fn_settle_payment: {
        Args: { p_payment_id: string; p_razorpay_payment_id?: string; p_razorpay_signature?: string };
        Returns: SettlementResult;
      };
      fn_record_offline_payment: {
        Args: {
          p_member_id: string;
          p_plan_id: string;
          p_base_amount: number;
          p_discount_amount: number;
          p_amount: number;
          p_method: PaymentMethod;
          p_collected_by: string | null;
          p_collected_by_name?: string | null;
          p_offer_id?: string | null;
          p_coupon_code?: string | null;
          p_notes?: string | null;
          p_paid_at?: string;
        };
        Returns: SettlementResult;
      };
      fn_update_my_profile: {
        Args: {
          p_full_name?: string | null;
          p_email?: string | null;
          p_date_of_birth?: string | null;
          p_gender?: Gender | null;
          p_weight_kg?: number | null;
          p_height_cm?: number | null;
          p_emergency_contact_name?: string | null;
          p_emergency_contact_phone?: string | null;
          p_photo_url?: string | null;
        };
        Returns: Member;
      };
      fn_set_my_photo: { Args: { p_photo_url: string | null }; Returns: Member };
      fn_start_upi_payment: {
        Args: {
          p_member_id: string;
          p_plan_id: string;
          p_base_amount: number;
          p_discount_amount: number;
          p_amount: number;
          p_plan_snapshot: Json;
          p_offer_id?: string | null;
          p_coupon_code?: string | null;
        };
        Returns: Payment;
      };
      fn_submit_upi_reference: { Args: { p_payment_id: string; p_reference: string }; Returns: Payment };
      fn_confirm_upi_payment: {
        Args: { p_payment_id: string; p_confirmed_by: string; p_confirmed_name?: string | null };
        Returns: SettlementResult;
      };
      fn_reject_upi_payment: {
        Args: { p_payment_id: string; p_reason: string; p_rejected_by: string };
        Returns: Payment;
      };
      fn_purge_expired_otps: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      user_role: UserRole;
      gender: Gender;
      membership_status: MembershipStatus;
      membership_payment_status: MembershipPaymentStatus;
      payment_method: PaymentMethod;
      payment_state: PaymentState;
      discount_type: DiscountType;
      notification_channel: NotificationChannel;
      notification_state: NotificationState;
      notification_kind: NotificationKind;
    };
    CompositeTypes: Record<string, never>;
  };
}
