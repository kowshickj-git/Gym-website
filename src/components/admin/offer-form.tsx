'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Separator, Switch } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/submit-button';
import { saveOffer, type OfferState } from '@/app/(admin)/admin/offers/actions';
import { FESTIVAL_PRESETS } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import type { MembershipCategory, Offer, OfferPlanRule } from '@/types/database';

const DURATIONS = [1, 3, 6, 12];

/**
 * Create / edit a campaign.
 *
 * The festival presets only fill in a name and a description — the dates are
 * always the owner's to choose, because Pongal, Puthandu and Diwali land on
 * different days every year.
 */
export function OfferForm({
  offer,
  rules,
  categories,
}: {
  offer?: Offer;
  rules?: OfferPlanRule[];
  categories: MembershipCategory[];
}) {
  const [state, formAction] = useActionState<OfferState, FormData>(saveOffer, {});

  const [name, setName] = useState(offer?.name ?? '');
  const [banner, setBanner] = useState(offer?.banner_text ?? '');
  const [description, setDescription] = useState(offer?.description ?? '');
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>(offer?.discount_type ?? 'PERCENTAGE');
  const [discountValue, setDiscountValue] = useState(String(offer?.discount_value ?? ''));
  const [autoApply, setAutoApply] = useState(offer?.auto_apply ?? true);

  const selectedCategories = new Set((rules ?? []).map((rule) => rule.category_id).filter(Boolean) as string[]);
  const selectedDurations = new Set((rules ?? []).map((rule) => rule.duration_months).filter(Boolean) as number[]);

  const error = (field: string) => state.fieldErrors?.[field];

  // A worked example beats any amount of explanation of how the maths lands.
  const example = (() => {
    const value = Number(discountValue);
    if (!Number.isFinite(value) || value <= 0) return null;
    const base = 10000;
    const off = discountType === 'FIXED' ? Math.min(value, base) : Math.min((base * value) / 100, base);
    return { base, off, final: base - off };
  })();

  return (
    <form action={formAction} className="space-y-6">
      {offer ? <input type="hidden" name="id" value={offer.id} /> : null}

      {!offer ? (
        <Card className="gap-3 py-4">
          <div className="space-y-2 px-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" aria-hidden />
              Start from a festival
            </p>
            <div className="flex flex-wrap gap-2">
              {FESTIVAL_PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setName(preset.name);
                    setBanner(preset.banner);
                    setDescription(preset.description);
                  }}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Fills in the wording only. You always choose the dates — these festivals move every year.
            </p>
          </div>
        </Card>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          What the offer is called
        </legend>

        <div className="space-y-2">
          <Label htmlFor="name">Campaign name</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Diwali Special"
            required
          />
          {error('name') ? <p className="text-destructive text-xs">{error('name')}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="banner_text">Short banner text</Label>
          <Input
            id="banner_text"
            name="banner_text"
            value={banner}
            onChange={(event) => setBanner(event.target.value)}
            placeholder="e.g. Diwali Special - 20% OFF"
            maxLength={60}
          />
          <p className="text-muted-foreground text-xs">Shown on the home page banner. Keep it short.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A sentence members will read on the offers page."
          />
        </div>
      </fieldset>

      <Separator />

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          The discount
        </legend>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDiscountType('PERCENTAGE')}
            aria-pressed={discountType === 'PERCENTAGE'}
            className={
              discountType === 'PERCENTAGE'
                ? 'border-primary bg-primary/5 ring-primary/20 rounded-lg border-2 px-4 py-3 text-left ring-2'
                : 'hover:bg-accent rounded-lg border px-4 py-3 text-left'
            }
          >
            <span className="block text-sm font-semibold">Percentage</span>
            <span className="text-muted-foreground block text-xs">20% off the plan price</span>
          </button>
          <button
            type="button"
            onClick={() => setDiscountType('FIXED')}
            aria-pressed={discountType === 'FIXED'}
            className={
              discountType === 'FIXED'
                ? 'border-primary bg-primary/5 ring-primary/20 rounded-lg border-2 px-4 py-3 text-left ring-2'
                : 'hover:bg-accent rounded-lg border px-4 py-3 text-left'
            }
          >
            <span className="block text-sm font-semibold">Fixed amount</span>
            <span className="text-muted-foreground block text-xs">₹500 off the plan price</span>
          </button>
        </div>
        <input type="hidden" name="discount_type" value={discountType} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="discount_value">{discountType === 'PERCENTAGE' ? 'Percentage off' : 'Rupees off'}</Label>
            <Input
              id="discount_value"
              name="discount_value"
              type="number"
              min={1}
              max={discountType === 'PERCENTAGE' ? 100 : undefined}
              step={discountType === 'PERCENTAGE' ? 1 : 10}
              inputMode="decimal"
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              required
            />
            {error('discount_value') ? <p className="text-destructive text-xs">{error('discount_value')}</p> : null}
          </div>

          {discountType === 'PERCENTAGE' ? (
            <div className="space-y-2">
              <Label htmlFor="max_discount_amount">Cap the discount at (₹)</Label>
              <Input
                id="max_discount_amount"
                name="max_discount_amount"
                type="number"
                min={1}
                step={100}
                inputMode="decimal"
                defaultValue={offer?.max_discount_amount ?? ''}
                placeholder="Optional"
              />
              <p className="text-muted-foreground text-xs">Stops a big percentage costing too much on annual plans.</p>
            </div>
          ) : null}
        </div>

        {example ? (
          <div className="bg-muted/40 rounded-lg border p-3 text-sm">
            <p className="text-muted-foreground mb-1 text-xs font-medium">On a {formatCurrency(example.base)} plan</p>
            <p className="tnum">
              {formatCurrency(example.base)} − {formatCurrency(example.off)} ={' '}
              <span className="font-bold">{formatCurrency(example.final)}</span>
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="min_purchase_amount">Minimum plan price (₹)</Label>
          <Input
            id="min_purchase_amount"
            name="min_purchase_amount"
            type="number"
            min={0}
            step={100}
            inputMode="decimal"
            defaultValue={offer?.min_purchase_amount ?? 0}
          />
          <p className="text-muted-foreground text-xs">Leave at 0 to apply to every plan regardless of price.</p>
        </div>
      </fieldset>

      <Separator />

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          When it runs
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="starts_at">Starts</Label>
            <Input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              defaultValue={toLocalInput(offer?.starts_at) ?? defaultStart()}
              required
            />
            {error('starts_at') ? <p className="text-destructive text-xs">{error('starts_at')}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ends_at">Ends</Label>
            <Input
              id="ends_at"
              name="ends_at"
              type="datetime-local"
              defaultValue={toLocalInput(offer?.ends_at) ?? defaultEnd()}
              required
            />
            {error('ends_at') ? <p className="text-destructive text-xs">{error('ends_at')}</p> : null}
          </div>
        </div>
      </fieldset>

      <Separator />

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Which plans it applies to
        </legend>
        <p className="text-muted-foreground text-sm">
          Tick nothing to apply the offer to every plan. Ticking a category and a length together means only that
          combination.
        </p>

        <div className="space-y-3">
          <p className="text-sm font-medium">Categories</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((category) => (
              <label
                key={category.id}
                className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
              >
                <Checkbox
                  name="category_ids"
                  value={category.id}
                  defaultChecked={selectedCategories.has(category.id)}
                />
                {category.name}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Plan lengths</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DURATIONS.map((months) => (
              <label
                key={months}
                className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
              >
                <Checkbox
                  name="duration_months"
                  value={String(months)}
                  defaultChecked={selectedDurations.has(months)}
                />
                {months} {months === 1 ? 'month' : 'months'}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <Separator />

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          How members get it
        </legend>

        <div className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3">
          <div>
            <Label htmlFor="auto_apply">Apply automatically</Label>
            <p className="text-muted-foreground text-xs text-pretty">
              On: the discounted price shows on the plans page for everyone. Off: members must type the coupon code.
            </p>
          </div>
          <Switch
            id="auto_apply"
            name="auto_apply"
            checked={autoApply}
            onCheckedChange={setAutoApply}
            className="mt-1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coupon_code">Coupon code {autoApply ? '(optional)' : '(required)'}</Label>
          <Input
            id="coupon_code"
            name="coupon_code"
            defaultValue={offer?.coupon_code ?? ''}
            placeholder="e.g. PONGAL"
            className="font-mono uppercase"
            autoCapitalize="characters"
            spellCheck={false}
          />
          {error('coupon_code') ? <p className="text-destructive text-xs">{error('coupon_code')}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="usage_limit">Total redemptions allowed</Label>
            <Input
              id="usage_limit"
              name="usage_limit"
              type="number"
              min={1}
              inputMode="numeric"
              defaultValue={offer?.usage_limit ?? ''}
              placeholder="Unlimited"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="per_member_limit">Per member</Label>
            <Input
              id="per_member_limit"
              name="per_member_limit"
              type="number"
              min={1}
              inputMode="numeric"
              defaultValue={offer?.per_member_limit ?? ''}
              placeholder="Unlimited"
            />
          </div>
        </div>

        {offer && offer.used_count > 0 ? (
          <Badge variant="secondary">Redeemed {offer.used_count} times so far</Badge>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <Label htmlFor="is_active">Offer is live</Label>
            <p className="text-muted-foreground text-xs">Switch off to pause it without losing the settings.</p>
          </div>
          <Switch id="is_active" name="is_active" defaultChecked={offer?.is_active ?? true} />
        </div>
      </fieldset>

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 border-t px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <SubmitButton size="lg" className="w-full md:w-auto" pendingLabel="Saving…">
          {offer ? 'Save offer' : 'Create offer'}
        </SubmitButton>
      </div>
    </form>
  );
}

/** `datetime-local` needs a zone-less local string. */
function toLocalInput(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultStart(): string {
  return toLocalInput(new Date().toISOString())!;
}

function defaultEnd(): string {
  const end = new Date();
  end.setDate(end.getDate() + 14);
  end.setHours(23, 59, 0, 0);
  return toLocalInput(end.toISOString())!;
}
