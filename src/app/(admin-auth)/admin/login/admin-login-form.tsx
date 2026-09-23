'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';
import { adminLogin, type AdminLoginState } from './actions';

export function AdminLoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction] = useActionState<AdminLoginState, FormData>(adminLogin, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath ?? ''} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="owner@yourgym.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
