import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, MessageCircle, Phone, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/guards';
import { isStaffRole } from '@/lib/auth/guards';
import { getGymSettings } from '@/lib/data';
import { formatPhone } from '@/lib/phone';
import { telLink, whatsappLink } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Almost there',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Landing spot for someone who signed in with a number the gym has not
 * registered. Rather than a dead end, it gives them the two things that
 * actually move them forward: a phone call and the plans page.
 */
export default async function WelcomePage() {
  const user = await requireUser();

  if (isStaffRole(user.role)) redirect('/admin');
  if (user.member) redirect('/dashboard');

  const settings = await getGymSettings();
  const whatsapp = settings.whatsapp_phone ?? settings.contact_phone;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4 py-10">
      <div className="w-full space-y-5">
        <div className="space-y-2 text-center">
          <span className="bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-2xl">
            <UserPlus className="size-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">You are signed in</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            We could not find a membership registered to{' '}
            <span className="text-foreground font-medium">{formatPhone(user.profile.phone)}</span>. That usually means
            the gym has your details under a different number, or you have not joined yet.
          </p>
        </div>

        <Card className="gap-3 py-5">
          <div className="space-y-3 px-5">
            <p className="text-sm font-semibold">What to do next</p>
            <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
              <li>Browse the plans and pick the one that suits how you train.</li>
              <li>
                Or call the front desk — they can register this number against your existing record in a few seconds.
              </li>
            </ol>
          </div>
        </Card>

        <div className="space-y-2">
          <Button asChild size="xl" className="w-full">
            <Link href="/plans">
              See plans and prices
              <ArrowRight aria-hidden />
            </Link>
          </Button>

          {settings.contact_phone ? (
            <Button asChild size="lg" variant="outline" className="w-full">
              <a href={telLink(settings.contact_phone)}>
                <Phone aria-hidden />
                Call {settings.gym_name}
              </a>
            </Button>
          ) : null}

          {whatsapp ? (
            <Button asChild size="lg" variant="outline" className="w-full">
              <a
                href={whatsappLink(
                  whatsapp,
                  `Hi ${settings.gym_name}, I signed in with ${user.profile.phone ?? 'my mobile number'} but my membership is not linked.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle aria-hidden />
                Message on WhatsApp
              </a>
            </Button>
          ) : null}
        </div>

        <form action="/api/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
