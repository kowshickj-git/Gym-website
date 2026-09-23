'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/misc';
import { SubmitButton } from '@/components/submit-button';
import { createMember, updateMember, type MemberFormState } from '@/app/(admin)/admin/members/actions';
import { todayInIst } from '@/lib/utils';
import type { Member } from '@/types/database';

const GENDERS = [
  { value: '', label: 'Not specified' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

/**
 * Add / edit member.
 *
 * Only name and mobile number are required — the front desk should be able to
 * register a walk-in in fifteen seconds and fill in the rest later.
 */
export function MemberForm({ member }: { member?: Member }) {
  const action = member ? updateMember : createMember;
  const [state, formAction] = useActionState<MemberFormState, FormData>(action, {});

  useEffect(() => {
    if (state.success) toast.success('Member details saved.');
  }, [state.success]);

  const error = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="space-y-6">
      {member ? <input type="hidden" name="id" value={member.id} /> : null}

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Required
        </legend>

        <Field
          label="Full name"
          name="full_name"
          defaultValue={member?.full_name ?? ''}
          required
          autoFocus={!member}
          autoComplete="name"
          placeholder="e.g. Arun Kumar"
          error={error('full_name')}
        />

        <Field
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="numeric"
          defaultValue={member?.phone ?? ''}
          required
          placeholder="98765 43210"
          error={error('phone')}
          hint="This is how the member signs in. It must be unique."
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Optional details
        </legend>

        <Field
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={member?.email ?? ''}
          placeholder="name@example.com"
          error={error('email')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date of birth"
            name="date_of_birth"
            type="date"
            defaultValue={member?.date_of_birth ?? ''}
            error={error('date_of_birth')}
          />

          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <select
              id="gender"
              name="gender"
              defaultValue={member?.gender ?? ''}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm"
            >
              {GENDERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Weight (kg)"
            name="weight_kg"
            type="number"
            step="0.1"
            inputMode="decimal"
            defaultValue={member?.weight_kg ?? ''}
            error={error('weight_kg')}
          />
          <Field
            label="Height (cm)"
            name="height_cm"
            type="number"
            step="0.1"
            inputMode="decimal"
            defaultValue={member?.height_cm ?? ''}
            error={error('height_cm')}
          />
          <Field
            label="Join date"
            name="join_date"
            type="date"
            defaultValue={member?.join_date ?? todayInIst()}
            error={error('join_date')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Emergency contact name"
            name="emergency_contact_name"
            defaultValue={member?.emergency_contact_name ?? ''}
            error={error('emergency_contact_name')}
          />
          <Field
            label="Emergency contact number"
            name="emergency_contact_phone"
            type="tel"
            inputMode="numeric"
            defaultValue={member?.emergency_contact_phone ?? ''}
            placeholder="98765 43210"
            error={error('emergency_contact_phone')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" name="address" rows={2} defaultValue={member?.address ?? ''} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={member?.notes ?? ''}
            placeholder="Injuries, preferences, anything the floor staff should know."
          />
          <p className="text-muted-foreground text-xs">Staff only — the member never sees this.</p>
        </div>
      </fieldset>

      {member ? (
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <Label htmlFor="is_active">Active member</Label>
            <p className="text-muted-foreground text-xs">
              Turning this off hides them from the active lists but keeps all their history.
            </p>
          </div>
          <Switch id="is_active" name="is_active" defaultChecked={member.is_active} />
        </div>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 border-t px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <SubmitButton size="lg" className="w-full md:w-auto" pendingLabel="Saving…">
          {member ? 'Save changes' : 'Add member'}
        </SubmitButton>
      </div>
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
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${name}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
