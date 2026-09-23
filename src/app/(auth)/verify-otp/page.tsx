import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { VerifyForm } from './verify-form';
import { normalisePhone, maskPhone } from '@/lib/phone';

export const metadata: Metadata = {
  title: 'Enter your code',
  robots: { index: false, follow: false },
};

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; next?: string; demo?: string }>;
}) {
  const { phone: rawPhone, next, demo } = await searchParams;
  const phone = normalisePhone(rawPhone);

  // No number in the URL means the visitor jumped straight here; start over.
  if (!phone) redirect('/login');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Enter your code</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          We sent a six-digit code to <span className="text-foreground font-medium">{maskPhone(phone)}</span>.
        </p>
      </div>

      <VerifyForm phone={phone} nextPath={next} demoCode={demo} />
    </div>
  );
}
