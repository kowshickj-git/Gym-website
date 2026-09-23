import 'server-only';

/**
 * Rate limiting.
 *
 * The in-memory limiter below is per-instance. On Vercel that means a
 * determined attacker spread across cold starts gets a somewhat higher
 * effective ceiling — which is why the OTP endpoints *also* enforce a durable
 * limit by counting rows in `otp_challenges` (see lib/auth/otp.ts). The memory
 * limiter is the cheap first line that keeps ordinary bursts off the database.
 *
 * To make it strict across instances, swap `hit()` for an Upstash Redis
 * INCR/EXPIRE; the call signature is deliberately small enough to do that in
 * one place.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfter: windowSeconds };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter,
  };
}

/** Best-effort caller identity for rate-limit keys. */
export function clientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? 'unknown';
}

export function rateLimitResponse(result: RateLimitResult, message = 'Too many requests. Please slow down.') {
  return Response.json(
    { error: message, retryAfter: result.retryAfter },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  );
}
