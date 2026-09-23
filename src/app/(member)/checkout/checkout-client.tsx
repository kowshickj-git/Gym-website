'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { AlertCircle, BadgeIndianRupee, CheckCircle2, Loader2, Lock, Phone, ShieldCheck, Tag, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/misc';
import { formatCurrency, formatDate, telLink } from '@/lib/utils';
import type { Quote } from '@/lib/pricing';

interface CheckoutPlan {
  id: string;
  name: string;
  category_name: string;
  duration_months: number;
  base_price: number;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void; close: () => void };
  }
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

/** Loads the Razorpay script on demand, so it costs nothing until Pay is tapped. */
function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CheckoutClient({
  plan,
  initialQuote,
  member,
  gymName,
  gymPhone,
  razorpayKeyId,
  razorpayConfigured,
  startDate,
}: {
  plan: CheckoutPlan;
  initialQuote: Quote;
  member: { name: string; phone: string; email: string | null };
  gymName: string;
  gymPhone: string | null;
  razorpayKeyId: string;
  razorpayConfigured: boolean;
  startDate: string | null;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const [couponInput, setCouponInput] = useState(initialQuote.offer?.via_coupon ? (initialQuote.offer.coupon_code ?? '') : '');
  const [couponPending, setCouponPending] = useState(false);
  const [payPending, setPayPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appliedCoupon = quote.offer?.via_coupon ? quote.offer : null;

  const reprice = useCallback(
    async (code: string | null) => {
      setCouponPending(true);
      setError(null);
      try {
        const response = await fetch('/api/payments/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan.id, couponCode: code }),
        });
        const payload = (await response.json()) as { quote?: Quote; error?: string };

        if (!response.ok || !payload.quote) {
          setError(payload.error ?? 'Could not check that coupon.');
          return;
        }
        setQuote(payload.quote);
      } catch {
        setError('Network problem. Check your connection and try again.');
      } finally {
        setCouponPending(false);
      }
    },
    [plan.id],
  );

  async function onPay() {
    setError(null);
    setPayPending(true);
    setStatus('Preparing your payment…');

    try {
      const orderResponse = await fetch('/api/payments/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, couponCode: appliedCoupon?.coupon_code ?? null }),
      });
      const order = (await orderResponse.json()) as {
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        error?: string;
        prefill?: { name?: string; contact?: string; email?: string };
      };

      if (!orderResponse.ok || !order.orderId) {
        setError(order.error ?? 'Could not start the payment.');
        return;
      }

      setStatus('Opening the payment window…');
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        setError('The payment window could not load. Check your connection and try again.');
        return;
      }

      const checkout = new window.Razorpay({
        key: order.keyId ?? razorpayKeyId,
        amount: order.amount!,
        currency: order.currency ?? 'INR',
        name: gymName,
        description: `${plan.category_name} — ${plan.name}`,
        order_id: order.orderId,
        prefill: order.prefill ?? { name: member.name, contact: member.phone, email: member.email ?? undefined },
        theme: { color: '#E23A1F' },
        modal: {
          ondismiss: () => {
            setPayPending(false);
            setStatus(null);
          },
        },
        handler: (response) => {
          void confirmPayment(response);
        },
      });

      checkout.open();
    } catch {
      setError('Something went wrong starting the payment. Please try again.');
      setPayPending(false);
      setStatus(null);
    }
  }

  async function confirmPayment(response: RazorpayResponse) {
    setStatus('Confirming your payment…');

    try {
      const verifyResponse = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
      const payload = (await verifyResponse.json()) as { redirectTo?: string; error?: string };

      if (!verifyResponse.ok) {
        // The webhook is the safety net here, so say so rather than alarming them.
        setError(
          payload.error ??
            'We could not confirm the payment right away. If money has left your account, your membership will activate shortly.',
        );
        setStatus(null);
        setPayPending(false);
        return;
      }

      setStatus('Payment received. Opening your receipt…');
      router.replace(payload.redirectTo ?? '/dashboard');
      router.refresh();
    } catch {
      setError('We could not reach the server to confirm. Your payment is safe — check your receipts in a minute.');
      setStatus(null);
      setPayPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------- Order summary */}
      <Card className="gap-4">
        <div className="space-y-1 px-5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Your plan</p>
          <p className="text-lg font-bold">{plan.category_name}</p>
          <p className="text-muted-foreground text-sm">
            {plan.name} · {plan.duration_months} {plan.duration_months === 1 ? 'month' : 'months'}
          </p>
        </div>

        {startDate ? (
          <p className="text-muted-foreground px-5 text-xs">
            Starts {formatDate(startDate)}
            {new Date(`${startDate}T12:00:00Z`) > new Date() ? ' — the day after your current plan ends' : ''}
          </p>
        ) : null}

        <Separator />

        <dl className="space-y-2.5 px-5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Plan price</dt>
            <dd className="tnum font-medium">{formatCurrency(quote.base_amount)}</dd>
          </div>

          {quote.discount_amount > 0 ? (
            <div className="text-success flex items-center justify-between">
              <dt className="flex items-center gap-1.5">
                <Tag className="size-3.5" aria-hidden />
                {quote.offer?.name ?? 'Discount'}
              </dt>
              <dd className="tnum font-medium">− {formatCurrency(quote.discount_amount)}</dd>
            </div>
          ) : null}

          <Separator />

          <div className="flex items-baseline justify-between">
            <dt className="font-semibold">Total payable</dt>
            <dd className="tnum text-2xl font-bold">{formatCurrency(quote.final_amount)}</dd>
          </div>
        </dl>
      </Card>

      {/* --------------------------------------------------------- Coupon */}
      <Card className="gap-3 py-4">
        <div className="space-y-2 px-5">
          <Label htmlFor="coupon">Coupon code</Label>

          {appliedCoupon ? (
            <div className="border-success/40 bg-success/10 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
                <span className="truncate">
                  <span className="font-mono font-semibold">{appliedCoupon.coupon_code}</span> — {appliedCoupon.name}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove coupon"
                disabled={couponPending || payPending}
                onClick={() => {
                  setCouponInput('');
                  void reprice(null);
                }}
              >
                <X aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                id="coupon"
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                placeholder="e.g. PONGAL"
                className="font-mono uppercase"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={couponPending || payPending}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!couponInput.trim() || couponPending || payPending}
                onClick={() => void reprice(couponInput.trim())}
              >
                {couponPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Apply
              </Button>
            </div>
          )}

          {quote.coupon_error ? <p className="text-destructive text-xs">{quote.coupon_error}</p> : null}

          {!appliedCoupon && quote.offer ? (
            <p className="text-muted-foreground text-xs">
              <Badge variant="success" className="mr-1.5">
                Auto
              </Badge>
              {quote.offer.name} is already applied.
            </p>
          ) : null}
        </div>
      </Card>

      {/* ----------------------------------------------------- Pay / notice */}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!razorpayConfigured ? (
        <Alert variant="warning">
          <BadgeIndianRupee aria-hidden />
          <AlertTitle>Online payment is not switched on yet</AlertTitle>
          <AlertDescription>
            <p>
              Pay at the front desk and the staff will record it against your account straight away — your membership and
              receipt work exactly the same.
            </p>
            {gymPhone ? (
              <Button asChild variant="outline" size="sm" className="mt-2">
                <a href={telLink(gymPhone)}>
                  <Phone aria-hidden />
                  Call the gym
                </a>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {status ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {status}
            </p>
          ) : null}

          {/* Sticky so the primary action stays in reach on a long phone page. */}
          <div className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-0 -mx-4 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <Button size="xl" className="w-full" onClick={() => void onPay()} disabled={payPending || couponPending}>
              {payPending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
              {payPending ? 'Processing…' : `Pay ${formatCurrency(quote.final_amount)}`}
            </Button>
          </div>

          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
            <ShieldCheck className="size-3.5" aria-hidden />
            Secured by Razorpay. UPI, cards and netbanking accepted.
          </p>
        </>
      )}
    </div>
  );
}
