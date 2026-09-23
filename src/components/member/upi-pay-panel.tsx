'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, BadgeIndianRupee, Check, CheckCircle2, Clock, Copy, Loader2, Smartphone } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';

interface UpiSession {
  paymentId: string;
  amount: number;
  vpa: string;
  payeeName: string;
  link: string;
  apps: { label: string; href: string }[];
  qrSvg: string | null;
}

type Stage = 'idle' | 'ready' | 'submitted';

/**
 * UPI Direct payment.
 *
 * Three steps, because UPI gives us no callback: open your app and pay, come
 * back, tell us the reference number. The gym matches that reference against
 * their bank SMS and confirms.
 *
 * It is a little more work for the member than a card checkout, and in exchange
 * neither they nor the gym pays a transaction fee.
 */
export function UpiPayPanel({
  planId,
  couponCode,
  amount,
  gymName,
}: {
  planId: string;
  couponCode: string | null;
  amount: number;
  gymName: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [session, setSession] = useState<UpiSession | null>(null);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function start() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch('/api/payments/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, couponCode }),
      });
      const payload = (await response.json()) as Partial<UpiSession> & { error?: string };

      if (!response.ok || !payload.paymentId) {
        setError(payload.error ?? 'Could not start the payment.');
        return;
      }

      setSession(payload as UpiSession);
      setStage('ready');
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function submitReference() {
    if (!session) return;
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/payments/upi/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: session.paymentId, reference }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Could not save that reference.');
        return;
      }

      setStage('submitted');
      router.refresh();
    } catch {
      setError('Network problem. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function copyVpa() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.vpa);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Please type the UPI id manually.');
    }
  }

  if (stage === 'submitted') {
    return (
      <Alert variant="success">
        <CheckCircle2 aria-hidden />
        <AlertTitle>Thanks — we have your reference</AlertTitle>
        <AlertDescription>
          <p>
            {gymName} will check the payment against their bank and confirm it, usually within a few hours. Your
            membership starts the moment they do, and you will get a receipt.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <a href="/payments">See my payments</a>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (stage === 'idle' || !session) {
    return (
      <div className="space-y-3">
        <Button size="xl" variant="outline" className="w-full" onClick={() => void start()} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <BadgeIndianRupee aria-hidden />}
          Pay {formatCurrency(amount)} by UPI
          <Badge variant="success" className="ml-1">
            No fees
          </Badge>
        </Button>
        <p className="text-muted-foreground text-center text-xs text-pretty">
          Pays the gym directly from your UPI app. You will enter the reference number afterwards so the gym can
          confirm it.
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <Card className="gap-4 py-5">
      <div className="space-y-1 px-5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Pay by UPI</p>
          <Badge variant="success">No transaction fee</Badge>
        </div>
        <p className="tnum text-2xl font-bold">{formatCurrency(session.amount)}</p>
      </div>

      <Separator />

      {/* -------------------------------------------------- Step 1: pay */}
      <div className="space-y-3 px-5">
        <p className="text-sm font-semibold">
          <span className="bg-primary text-primary-foreground mr-2 inline-flex size-5 items-center justify-center rounded-full text-xs">
            1
          </span>
          Open your UPI app and pay
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {session.apps.map((app) => (
            <Button key={app.label} asChild variant="outline" size="sm" className="justify-center">
              <a href={app.href}>
                <Smartphone aria-hidden />
                {app.label}
              </a>
            </Button>
          ))}
        </div>

        {session.qrSvg ? (
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">On a computer? Scan this QR</summary>
            <div className="flex justify-center px-4 pb-4">
              <div
                className="rounded-lg bg-white p-3 [&_svg]:size-44"
                // The SVG is generated on our own server from the link we just
                // authorised — no third-party markup reaches this page.
                dangerouslySetInnerHTML={{ __html: session.qrSvg }}
              />
            </div>
          </details>
        ) : null}

        <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Or pay this UPI id manually</p>
            <p className="truncate font-mono text-sm font-semibold">{session.vpa}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => void copyVpa()} aria-label="Copy UPI id">
            {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </div>
      </div>

      <Separator />

      {/* ------------------------------------- Step 2: report the reference */}
      <div className="space-y-3 px-5">
        <p className="text-sm font-semibold">
          <span className="bg-primary text-primary-foreground mr-2 inline-flex size-5 items-center justify-center rounded-full text-xs">
            2
          </span>
          Enter the reference number
        </p>
        <p className="text-muted-foreground text-xs text-pretty">
          After paying, your UPI app shows a 12-digit UPI transaction id or UTR. Type it here so the gym can match it
          to their bank statement.
        </p>

        <div className="space-y-2">
          <Label htmlFor="upi-reference" className="sr-only">
            UPI reference number
          </Label>
          <Input
            id="upi-reference"
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
              if (error) setError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 123456789012"
            className="text-center font-mono text-lg tracking-wider"
            maxLength={40}
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          size="lg"
          className="w-full"
          onClick={() => void submitReference()}
          disabled={pending || reference.replace(/\D/g, '').length < 6}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          I have paid — submit reference
        </Button>
      </div>

      <div className="px-5">
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs text-pretty">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your membership activates once {gymName} confirms the payment. If anything goes wrong, nothing is lost — the
          money is in the gym&apos;s account and the desk can sort it out.
        </p>
      </div>
    </Card>
  );
}
