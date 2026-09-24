'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Loader2, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidPhone } from '@/lib/phone';

export function LoginForm({ nextPath, demoMode }: { nextPath?: string; demoMode: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const looksValid = isValidPhone(phone);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!looksValid) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload = (await response.json()) as { error?: string; devCode?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Could not send the code. Please try again.');
        return;
      }

      const params = new URLSearchParams({ phone });
      if (nextPath) params.set('next', nextPath);
      if (payload.devCode) params.set('demo', payload.devCode);
      router.push(`/verify-otp?${params.toString()}`);
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="phone">Mobile number</Label>
        <div className="relative">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium">
            +91
          </span>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            autoFocus
            enterKeyHint="send"
            placeholder="98765 43210"
            className="pl-12 text-lg tracking-wide"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'phone-error' : undefined}
          />
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Smartphone className="size-3.5" aria-hidden />
          Use the number registered at the gym.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" id="phone-error">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {demoMode ? (
        <Alert variant="info">
          <AlertCircle aria-hidden />
          <AlertDescription>
            <p>
              Want to look around? Sign in as a sample member with{' '}
              <span className="font-mono font-semibold">9000000001</span> (Arun Kumar) — the code appears on the next
              screen.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="xl" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? 'Sending code…' : 'Send code'}
        {!pending ? <ArrowRight aria-hidden /> : null}
      </Button>
    </form>
  );
}
