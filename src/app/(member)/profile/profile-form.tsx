'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';
import { updateMyProfile, type ProfileFormState } from './actions';
import type { Member } from '@/types/database';

const GENDERS = [
  { value: '', label: 'Prefer not to say' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export function ProfileForm({ member }: { member: Member }) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(updateMyProfile, {});

  useEffect(() => {
    if (state.success) toast.success('Your details are saved.');
  }, [state.success]);

  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Full name" name="full_name" defaultValue={member.full_name} required error={fieldError('full_name')} />

      <Field
        label="Email (optional)"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={member.email ?? ''}
        placeholder="you@example.com"
        error={fieldError('email')}
        hint="We use this for receipts. It is never required."
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Weight (kg)"
          name="weight_kg"
          type="number"
          step="0.1"
          inputMode="decimal"
          defaultValue={member.weight_kg ?? ''}
          error={fieldError('weight_kg')}
        />
        <Field
          label="Height (cm)"
          name="height_cm"
          type="number"
          step="0.1"
          inputMode="decimal"
          defaultValue={member.height_cm ?? ''}
          error={fieldError('height_cm')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Date of birth"
          name="date_of_birth"
          type="date"
          defaultValue={member.date_of_birth ?? ''}
          error={fieldError('date_of_birth')}
        />

        <div className="space-y-2">
          <Label htmlFor="gender">Gender</Label>
          {/* A native select is the right control here: it uses the phone's own
              picker, which is faster than any custom dropdown. */}
          <select
            id="gender"
            name="gender"
            defaultValue={member.gender ?? ''}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Emergency contact name"
          name="emergency_contact_name"
          defaultValue={member.emergency_contact_name ?? ''}
          error={fieldError('emergency_contact_name')}
        />
        <Field
          label="Emergency contact number"
          name="emergency_contact_phone"
          type="tel"
          inputMode="numeric"
          defaultValue={member.emergency_contact_phone ?? ''}
          placeholder="98765 43210"
          error={fieldError('emergency_contact_phone')}
        />
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Saving…">
        Save changes
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
