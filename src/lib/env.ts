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
  /**
   * Demo mode relaxes exactly one thing: the OTP is echoed back to the browser
   * so a reviewer with no SMS gateway can still sign in. It must be off in
   * production.
   */
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
} as const;

/**
 * The Supabase URL and anon key as the *server* sees them, read when a request
 * arrives rather than when the app was built.
 *
 * `publicEnv` holds what Next.js inlined at build time. On Vercel, a variable
 * added after the first deploy is invisible to that build: the dashboard shows
 * it set while every server query still sees ''. That is exactly how this app
 * first failed in production — the landing page 500ed while the variables sat
 * there, correct, in the project settings. Dynamic lookups are never inlined,
 * so server code reads here, and setting a variable is enough on its own.
 *
 * Browser code cannot do this and still uses `publicEnv`.
 */
export function supabasePublicConfig(): { url: string; anonKey: string } {
  return {
    url: read('NEXT_PUBLIC_SUPABASE_URL') ?? publicEnv.supabaseUrl,
    anonKey: read('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? publicEnv.supabaseAnonKey,
  };
}

/**
 * The public origin, used in links inside SMS, WhatsApp and email, and in
 * canonical and Open Graph metadata. Server-only; no browser code needs it.
 *
 * A localhost or placeholder value is never right on a deployment — it would
 * put an unreachable link in every reminder — so on Vercel those fall through
 * to the project's own production domain, which Vercel always provides.
 */
export function siteUrl(): string {
  const onVercel = read('VERCEL') === '1';
  const usable = (value: string | undefined) =>
    value && !/REPLACE-WITH/i.test(value) && !(onVercel && /localhost|127\.0\.0\.1/.test(value))
      ? value
      : undefined;

  const configured = usable(read('NEXT_PUBLIC_SITE_URL')) ?? usable(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured.replace(/\/$/, '');

  const vercelHost = read('VERCEL_PROJECT_PRODUCTION_URL') ?? read('VERCEL_URL');
  if (vercelHost) return `https://${vercelHost}`;

  return 'http://localhost:3000';
}

export const serverEnv = {
  get supabaseUrl() {
    return read('SUPABASE_URL') ?? supabasePublicConfig().url;
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
