'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator, Switch } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { SubmitButton } from '@/components/submit-button';
import { saveGymSettings, type SettingsState } from '@/app/(admin)/admin/settings/actions';
import type { GymSettings } from '@/types/database';

export function GymSettingsForm({ settings }: { settings: GymSettings }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(saveGymSettings, {});

  useEffect(() => {
    if (state.success) toast.success('Settings saved.');
  }, [state.success]);

  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Gym name" name="gym_name" defaultValue={settings.gym_name} required error={error('gym_name')} />
      <Field
        label="Tagline"
        name="tagline"
        defaultValue={settings.tagline ?? ''}
        placeholder="One line for the home page"
        error={error('tagline')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 1" name="address_line1" defaultValue={settings.address_line1 ?? ''} />
        <Field label="Address line 2" name="address_line2" defaultValue={settings.address_line2 ?? ''} />
        <Field label="City" name="city" defaultValue={settings.city ?? ''} />
        <Field label="State" name="state" defaultValue={settings.state ?? ''} />
        <Field label="PIN code" name="pincode" inputMode="numeric" defaultValue={settings.pincode ?? ''} />
        <Field label="GSTIN" name="gstin" defaultValue={settings.gstin ?? ''} placeholder="Optional" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Contact number"
          name="contact_phone"
          type="tel"
          inputMode="numeric"
          defaultValue={settings.contact_phone ?? ''}
          error={error('contact_phone')}
          hint="Shown on the site as a tap-to-call link."
        />
        <Field
          label="WhatsApp number"
          name="whatsapp_phone"
          type="tel"
          inputMode="numeric"
          defaultValue={settings.whatsapp_phone ?? ''}
          error={error('whatsapp_phone')}
          hint="Leave blank to use the contact number."
        />
      </div>

      <Field
        label="Contact email"
        name="contact_email"
        type="email"
        inputMode="email"
        defaultValue={settings.contact_email ?? ''}
        error={error('contact_email')}
      />

      <Field
        label="Opening hours"
        name="opening_hours"
        defaultValue={settings.opening_hours ?? ''}
        placeholder="Mon-Sat 5:00 AM - 10:00 PM"
      />

      <Field
        label="Google Maps link"
        name="maps_url"
        type="url"
        defaultValue={settings.maps_url ?? ''}
        placeholder="https://maps.google.com/..."
      />

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field
          label="Receipt prefix"
          name="receipt_prefix"
          defaultValue={settings.receipt_prefix}
          required
          error={error('receipt_prefix')}
          hint="e.g. ICF-2026-000123"
        />
        <div className="space-y-2">
          <Label htmlFor="receipt_terms">Receipt footer text</Label>
          <Textarea
            id="receipt_terms"
            name="receipt_terms"
            rows={2}
            defaultValue={settings.receipt_terms ?? ''}
            placeholder="e.g. Membership fees once paid are non-refundable."
          />
        </div>
      </div>

      <Separator />

      {/* --------------------------------------------------------- UPI Direct */}
      <fieldset className="space-y-4">
        <legend className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <span className="text-muted-foreground">Accept UPI directly</span>
          <Badge variant="success">No transaction fee</Badge>
        </legend>

        <p className="text-muted-foreground text-sm text-pretty">
          Members pay your UPI id straight from their own app, so the money lands in your bank account and nobody takes
          a percentage. Because UPI does not notify us, you confirm each payment against your bank SMS from the{' '}
          <span className="font-medium">UPI confirmations</span> screen.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Your UPI id"
            name="upi_vpa"
            defaultValue={settings.upi_vpa ?? ''}
            placeholder="ironcore@okaxis"
            className="font-mono lowercase"
            autoCapitalize="none"
            spellCheck={false}
            error={error('upi_vpa')}
            hint="The id you would give someone to pay you by UPI."
          />
          <Field
            label="Name shown in their app"
            name="upi_payee_name"
            defaultValue={settings.upi_payee_name ?? ''}
            placeholder={settings.gym_name}
            error={error('upi_payee_name')}
            hint="Leave blank to use the gym name."
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3">
          <div>
            <Label htmlFor="upi_enabled">Offer UPI payment at checkout</Label>
            <p className="text-muted-foreground text-xs text-pretty">
              Only switch this on once the id above is correct — a wrong id sends members&apos; money to a stranger.
            </p>
          </div>
          <Switch id="upi_enabled" name="upi_enabled" defaultChecked={settings.upi_enabled} className="mt-1" />
        </div>
      </fieldset>

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Saving…">
        Save settings
      </SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string; error?: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} {...props} />
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
