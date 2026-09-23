/**
 * Environment access.
 *
 * Nothing here throws at module load: `next build` runs without secrets, and a
 * missing integration should degrade to its documented mock rather than crash
 * the whole app. Call `requireServerEnv` at the point of use instead.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function flag(name: string, fallback = false): boolean {
  const value = read(name);
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** Values that are safe to inline into the browser bundle. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  /**
   * Demo mode relaxes exactly one thing: the OTP is echoed back to the browser
   * so a reviewer with no SMS gateway can still sign in. It must be off in
   * production.
   */
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
} as const;

export const serverEnv = {
  get supabaseUrl() {
    return read('SUPABASE_URL') ?? publicEnv.supabaseUrl;
  },
  get supabaseServiceRoleKey() {
    return read('SUPABASE_SERVICE_ROLE_KEY');
  },
  get razorpayKeyId() {
    return read('RAZORPAY_KEY_ID') ?? read('NEXT_PUBLIC_RAZORPAY_KEY_ID');
  },
  get razorpayKeySecret() {
    return read('RAZORPAY_KEY_SECRET');
  },
  get razorpayWebhookSecret() {
    return read('RAZORPAY_WEBHOOK_SECRET');
  },
  /** Pepper for hashing OTPs and deriving member auth passwords. */
  get authSecret() {
    return read('AUTH_SECRET');
  },
  get cronSecret() {
    return read('CRON_SECRET');
  },
  get smsProvider() {
    return (read('SMS_PROVIDER') ?? 'console').toLowerCase();
  },
  get emailProvider() {
    return (read('EMAIL_PROVIDER') ?? 'console').toLowerCase();
  },
  get whatsappProvider() {
    return (read('WHATSAPP_PROVIDER') ?? 'console').toLowerCase();
  },
  get msg91AuthKey() {
    return read('MSG91_AUTH_KEY');
  },
  get msg91SenderId() {
    return read('MSG91_SENDER_ID');
  },
  get msg91TemplateId() {
    return read('MSG91_TEMPLATE_ID');
  },
  get msg91OtpTemplateId() {
    return read('MSG91_OTP_TEMPLATE_ID');
  },
  get twilioAccountSid() {
    return read('TWILIO_ACCOUNT_SID');
  },
  get twilioAuthToken() {
    return read('TWILIO_AUTH_TOKEN');
  },
  get twilioFrom() {
    return read('TWILIO_FROM');
  },
  get twilioWhatsappFrom() {
    return read('TWILIO_WHATSAPP_FROM');
  },
  get whatsappPhoneNumberId() {
    return read('WHATSAPP_PHONE_NUMBER_ID');
  },
  get whatsappAccessToken() {
    return read('WHATSAPP_ACCESS_TOKEN');
  },
  get resendApiKey() {
    return read('RESEND_API_KEY');
  },
  get emailFrom() {
    return read('EMAIL_FROM') ?? 'Iron Core Fitness <no-reply@example.com>';
  },
  get demoMode() {
    return flag('DEMO_MODE', publicEnv.demoMode);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
} as const;

export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(
      `Missing required environment variable ${variable}. ` +
        `Copy .env.example to .env.local and fill it in (see README).`,
    );
    this.name = 'MissingEnvError';
  }
}

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new MissingEnvError(name);
  return value;
}

/** True when Razorpay is configured well enough to take a real payment. */
export function isRazorpayConfigured(): boolean {
  return Boolean(serverEnv.razorpayKeyId && serverEnv.razorpayKeySecret);
}

/** True when the Supabase service role is available for privileged writes. */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl && serverEnv.supabaseServiceRoleKey);
}
