'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from '@/lib/constants';

export function VerifyForm({
  phone,
  nextPath,
  demoCode,
}: {
  phone: string;
  nextPath?: string;
  demoCode?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(demoCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const submitted = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (value: string) => {
      if (submitted.current) return;
      submitted.current = true;
      setPending(true);
      setError(null);

      try {
        const response = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code: value }),
        });
        const payload = (await response.json()) as { error?: string; redirectTo?: string };

        if (!response.ok) {
          setError(payload.error ?? 'That code is not correct.');
          setCode('');
          return;
        }

        // A full navigation so server components re-read the new session.
        router.replace(nextPath || payload.redirectTo || '/dashboard');
        router.refresh();
      } catch {
        setError('Network problem. Check your connection and try again.');
      } finally {
        setPending(false);
        submitted.current = false;
      }
    },
    [phone, nextPath, router],
  );

  /**
   * Auto-submit once all six digits are in — one less tap on a phone, and it
   * makes the SMS autofill path feel instant. Driven from the change event
   * rather than an effect, because this is a reaction to input, not
   * synchronisation with anything external.
   */
  function onCodeChange(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(next);
    if (error) setError(null);
    if (next.length === OTP_LENGTH && !pending) void submit(next);
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload = (await response.json()) as { error?: string; devCode?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Could not resend the code.');
        return;
      }

      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setNotice(payload.devCode ? `Demo code: ${payload.devCode}` : 'A new code is on its way.');
      if (payload.devCode) setCode(payload.devCode);
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length === OTP_LENGTH) void submit(code);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">Six-digit code</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={OTP_LENGTH}
          placeholder="123456"
          className="h-14 text-center text-2xl font-semibold tracking-[0.5em]"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'code-error' : undefined}
          disabled={pending}
        />
      </div>

      {demoCode ? (
        <Alert variant="info">
          <CheckCircle2 aria-hidden />
          <AlertDescription>
            Demo mode: your code is <span className="font-mono font-semibold">{demoCode}</span>.
          </AlertDescription>
        </Alert>
      ) : null}

      {notice ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" id="code-error">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="xl" className="w-full" disabled={pending || code.length !== OTP_LENGTH}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? 'Checking…' : 'Verify and sign in'}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Button type="button" variant="link" className="h-auto p-0" onClick={onResend} disabled={cooldown > 0 || pending}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
        <Link href="/login" className="text-muted-foreground hover:text-foreground underline underline-offset-4">
          Change number
        </Link>
      </div>
    </form>
  );
}
