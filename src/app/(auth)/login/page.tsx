import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Member login',
  description: 'Sign in to your gym membership with your mobile number.',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Member login</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Enter the mobile number you gave the gym. We will text you a six-digit code.
        </p>
      </div>

      <LoginForm nextPath={next} demoMode={publicEnv.demoMode} />

      <p className="text-muted-foreground text-center text-sm">
        Not a member yet?{' '}
        <Link href="/plans" className="text-foreground font-medium underline underline-offset-4">
          See plans
        </Link>
      </p>

      <p className="text-muted-foreground text-center text-xs">
        Gym staff?{' '}
        <Link href="/admin/login" className="underline underline-offset-4">
          Staff login
        </Link>
      </p>
    </div>
  );
}
