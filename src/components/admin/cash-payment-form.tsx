'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { AlertCircle, Loader2, Search, Tag } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/misc';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/submit-button';
import { recordCashPayment, type CashPaymentState } from '@/app/(admin)/admin/payments/actions';
import { OFFLINE_PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import type { Quote } from '@/lib/pricing';

export interface PaymentFormMember {
  id: string;
  full_name: string;
  phone: string;
  expiry_date: string | null;
  plan_name: string | null;
}

export interface PaymentFormPlan {
  id: string;
  name: string;
  duration_months: number;
  base_price: number;
  category_name: string;
}

/**
 * Record a payment taken at the desk.
 *
 * Built for speed on a phone at the counter: pick the member, tap the plan, tap
 * the method, done. The total re-quotes from the server whenever the plan or
 * coupon changes, so staff always see the same price the member would.
 */
export function CashPaymentForm({
  members,
  plans,
  preselectedMemberId,
}: {
  members: PaymentFormMember[];
  plans: PaymentFormPlan[];
  preselectedMemberId?: string;
}) {
  const [state, formAction] = useActionState<CashPaymentState, FormData>(recordCashPayment, {});
  const [quoting, startQuoting] = useTransition();

  const [memberId, setMemberId] = useState(preselectedMemberId ?? '');
  const [memberSearch, setMemberSearch] = useState('');
  const [planId, setPlanId] = useState('');
  const [coupon, setCoupon] = useState('');
  const [method, setMethod] = useState<string>('CASH');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [override, setOverride] = useState('');
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const selectedMember = members.find((member) => member.id === memberId) ?? null;

  const visibleMembers = memberSearch.trim()
    ? members
        .filter((member) => {
          const term = memberSearch.trim().toLowerCase();
          return member.full_name.toLowerCase().includes(term) || member.phone.includes(term.replace(/\D/g, ''));
        })
        .slice(0, 8)
    : [];

  // Re-price whenever the member, plan or coupon changes. The effect only
  // fetches; clearing is done by the handlers below, so nothing calls setState
  // synchronously during the effect body.
  useEffect(() => {
    if (!memberId || !planId) return;

    const controller = new AbortController();
    startQuoting(async () => {
      try {
        const response = await fetch('/api/admin/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, planId, couponCode: coupon.trim() || null }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { quote?: Quote; startDate?: string; error?: string };

        if (!response.ok || !payload.quote) {
          setQuoteError(payload.error ?? 'Could not price that plan.');
          setQuote(null);
          return;
        }
        setQuote(payload.quote);
        setStartDate(payload.startDate ?? null);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setQuoteError('Could not reach the server.');
      }
    });

    return () => controller.abort();
  }, [memberId, planId, coupon]);

  /**
   * Any change to what is being bought invalidates the quote immediately, so
   * the desk never sees a stale total attached to a new selection.
   */
  function invalidateQuote() {
    setQuote(null);
    setStartDate(null);
    setQuoteError(null);
  }

  function chooseMember(id: string) {
    setMemberId(id);
    invalidateQuote();
  }

  function clearMember() {
    setMemberId('');
    setMemberSearch('');
    invalidateQuote();
  }

  function choosePlan(id: string) {
    setPlanId(id);
    invalidateQuote();
  }

  function changeCoupon(value: string) {
    setCoupon(value.toUpperCase());
    setQuoteError(null);
  }

  const total = override.trim() !== '' ? Number(override) : (quote?.final_amount ?? 0);
  const isOverridden = override.trim() !== '' && quote !== null && Math.abs(Number(override) - quote.final_amount) > 0.009;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="coupon_code" value={coupon} />

      {/* ------------------------------------------------------------ Member */}
      <section className="space-y-3">
        <Label htmlFor="member-search">1. Who is paying?</Label>

        {selectedMember ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{selectedMember.full_name}</p>
              <p className="text-muted-foreground tnum text-xs">{formatPhone(selectedMember.phone)}</p>
              {selectedMember.expiry_date ? (
                <p className="text-muted-foreground text-xs">
                  Current plan ends {formatDate(selectedMember.expiry_date)}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">No membership yet</p>
              )}
            </div>
            <button
              type="button"
              className="text-primary shrink-0 text-sm font-medium hover:underline"
              onClick={clearMember}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="member-search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search name or mobile number"
                className="pl-9"
                autoComplete="off"
              />
            </div>

            {visibleMembers.length > 0 ? (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {visibleMembers.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => chooseMember(member.id)}
                      className="hover:bg-accent flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{member.full_name}</span>
                        <span className="text-muted-foreground tnum block text-xs">{formatPhone(member.phone)}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {member.expiry_date ? formatDate(member.expiry_date) : 'New'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : memberSearch.trim() ? (
              <p className="text-muted-foreground text-sm">No member matches that.</p>
            ) : null}
          </>
        )}

        {state.fieldErrors?.member_id ? (
          <p className="text-destructive text-xs">{state.fieldErrors.member_id}</p>
        ) : null}
      </section>

      <Separator />

      {/* -------------------------------------------------------------- Plan */}
      <section className="space-y-3">
        <Label>2. Which plan?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => choosePlan(plan.id)}
              aria-pressed={planId === plan.id}
              className={
                planId === plan.id
                  ? 'border-primary bg-primary/5 ring-primary/20 rounded-lg border-2 p-3 text-left ring-2'
                  : 'hover:bg-accent rounded-lg border-2 border-transparent bg-transparent p-3 text-left shadow-[inset_0_0_0_1px_var(--color-border)]'
              }
            >
              <span className="block text-sm font-semibold">{plan.name}</span>
              <span className="text-muted-foreground block truncate text-xs">{plan.category_name}</span>
              <span className="tnum mt-1 block text-sm font-bold">{formatCurrency(plan.base_price)}</span>
            </button>
          ))}
        </div>
        {state.fieldErrors?.plan_id ? <p className="text-destructive text-xs">{state.fieldErrors.plan_id}</p> : null}
      </section>

      <Separator />

      {/* ------------------------------------------------------------ Method */}
      <section className="space-y-3">
        <Label>3. How did they pay?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OFFLINE_PAYMENT_METHODS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMethod(option)}
              aria-pressed={method === option}
              className={
                method === option
                  ? 'bg-primary text-primary-foreground h-11 rounded-lg text-sm font-semibold'
                  : 'hover:bg-accent h-11 rounded-lg border text-sm font-medium'
              }
            >
              {PAYMENT_METHOD_LABEL[option]}
            </button>
          ))}
        </div>
      </section>

      <Separator />

      {/* ------------------------------------------------------------- Total */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="coupon_code_input">4. Discount and total</Label>
          {quoting ? <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden /> : null}
        </div>

        <Input
          id="coupon_code_input"
          value={coupon}
          onChange={(event) => changeCoupon(event.target.value)}
          placeholder="Coupon code (optional)"
          className="font-mono uppercase"
          autoComplete="off"
        />

        {quoteError ? <p className="text-destructive text-xs">{quoteError}</p> : null}
        {quote?.coupon_error ? <p className="text-destructive text-xs">{quote.coupon_error}</p> : null}

        {quote ? (
          <div className="bg-muted/40 space-y-2 rounded-lg border p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan price</span>
              <span className="tnum font-medium">{formatCurrency(quote.base_amount)}</span>
            </div>
            {quote.discount_amount > 0 ? (
              <div className="text-success flex justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="size-3.5" aria-hidden />
                  {quote.offer?.name ?? 'Discount'}
                </span>
                <span className="tnum font-medium">− {formatCurrency(quote.discount_amount)}</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Amount to collect</span>
              <span className="tnum text-xl font-bold">{formatCurrency(total)}</span>
            </div>
            {startDate ? (
              <p className="text-muted-foreground text-xs">New term starts {formatDate(startDate)}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="amount_override">Collected a different amount?</Label>
          <Input
            id="amount_override"
            name="amount_override"
            type="number"
            step="1"
            inputMode="decimal"
            value={override}
            onChange={(event) => setOverride(event.target.value)}
            placeholder={quote ? String(quote.final_amount) : 'Leave blank for the quoted total'}
          />
          {isOverridden ? (
            <p className="text-warning-foreground dark:text-warning text-xs">
              Recorded as a manual price of {formatCurrency(Number(override))} instead of{' '}
              {formatCurrency(quote!.final_amount)}. This is logged against your account.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">Use this only when you have agreed a different price.</p>
          )}
          {state.fieldErrors?.amount_override ? (
            <p className="text-destructive text-xs">{state.fieldErrors.amount_override}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="paid_at">Payment date</Label>
          <Input id="paid_at" name="paid_at" type="datetime-local" defaultValue={localNow()} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={2} placeholder="e.g. Paid Rs.500 now, balance next week" />
        </div>
      </section>

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 space-y-2 border-t px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        {quote ? (
          <Badge variant="secondary" className="tnum">
            Collecting {formatCurrency(total)} by {PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL]}
          </Badge>
        ) : null}
        <SubmitButton size="xl" className="w-full" disabled={!memberId || !planId || quoting} pendingLabel="Recording…">
          Record payment and activate
        </SubmitButton>
      </div>
    </form>
  );
}

/** `datetime-local` wants the browser's own clock, formatted without a zone. */
function localNow(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}
