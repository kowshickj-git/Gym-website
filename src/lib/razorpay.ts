import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRazorpayConfigured, requireEnv, serverEnv } from '@/lib/env';

/**
 * Razorpay integration.
 *
 * Talks to the REST API directly rather than pulling in the Node SDK: the three
 * calls we need are small, and it keeps the serverless bundle light.
 *
 * The rule the rest of the app depends on: a membership is only ever activated
 * after `verifyPaymentSignature` or `verifyWebhookSignature` returns true on
 * the server. The browser's "payment succeeded" callback is treated as a hint
 * to re-check, never as proof.
 */

const API_BASE = 'https://api.razorpay.com/v1';

function authHeader(): string {
  const keyId = requireEnv('RAZORPAY_KEY_ID', serverEnv.razorpayKeyId);
  const keySecret = requireEnv('RAZORPAY_KEY_SECRET', serverEnv.razorpayKeySecret);
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'RazorpayError';
  }
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
  created_at: number;
}

export interface CreateOrderInput {
  /** Amount in paise. Razorpay rejects anything that is not a whole number. */
  amountPaise: number;
  /** Our own reference, shown in the Razorpay dashboard. Max 40 chars. */
  receipt: string;
  notes?: Record<string, string>;
}

export async function createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    throw new RazorpayError('Razorpay requires a whole-paise amount of at least ₹1.');
  }

  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt.slice(0, 40),
      payment_capture: 1,
      notes: input.notes ?? {},
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as
    | RazorpayOrder
    | { error?: { description?: string; code?: string } };

  if (!response.ok) {
    const error = (payload as { error?: { description?: string; code?: string } }).error;
    throw new RazorpayError(error?.description ?? `Razorpay returned HTTP ${response.status}`, response.status, error?.code);
  }

  return payload as RazorpayOrder;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  method?: string;
  email?: string;
  contact?: string;
  error_description?: string;
}

/** Fetches a payment so the server can confirm the amount actually captured. */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const response = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as
    | RazorpayPayment
    | { error?: { description?: string } };

  if (!response.ok) {
    const error = (payload as { error?: { description?: string } }).error;
    throw new RazorpayError(error?.description ?? `Razorpay returned HTTP ${response.status}`, response.status);
  }

  return payload as RazorpayPayment;
}

/**
 * Every payment attempt against one order.
 *
 * Used for reconciliation from the admin dashboard: if a member says money left
 * their account but no membership appeared, this is how staff find out what
 * Razorpay actually recorded.
 */
export async function fetchOrderPayments(orderId: string): Promise<RazorpayPayment[]> {
  const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as
    | { items?: RazorpayPayment[] }
    | { error?: { description?: string } };

  if (!response.ok) {
    const error = (payload as { error?: { description?: string } }).error;
    throw new RazorpayError(error?.description ?? `Razorpay returned HTTP ${response.status}`, response.status);
  }

  return (payload as { items?: RazorpayPayment[] }).items ?? [];
}

function safeCompareHex(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Checkout handshake: HMAC-SHA256 of "<order_id>|<payment_id>" keyed by the
 * API secret. Proves the callback really came from Razorpay for this order.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = serverEnv.razorpayKeySecret;
  if (!secret) return false;

  const expected = createHmac('sha256', secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  return safeCompareHex(expected, params.signature);
}

/**
 * Webhook authenticity: HMAC-SHA256 of the *raw* request body keyed by the
 * webhook secret. The body must not be re-serialised before hashing.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = serverEnv.razorpayWebhookSecret;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeCompareHex(expected, signature);
}

export { isRazorpayConfigured };

/** Public config the checkout page needs. Contains no secret. */
export function checkoutConfig() {
  return {
    keyId: serverEnv.razorpayKeyId ?? '',
    configured: isRazorpayConfigured(),
  };
}
