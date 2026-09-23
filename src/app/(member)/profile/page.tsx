import type { Metadata } from 'next';
import Link from 'next/link';
import { LogOut, Phone, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberBottomNav } from '@/components/member/bottom-nav';
import { MembershipStatusBadge } from '@/components/status-badge';
import { ProfileForm } from './profile-form';
import { ProfilePhoto } from './profile-photo';
import { requireMember } from '@/lib/auth/guards';
import { getCurrentMembership, getGymSettings } from '@/lib/data';
import { formatPhone } from '@/lib/phone';
import { formatDate, telLink } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'My profile',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { member } = await requireMember();
  const [settings, membership] = await Promise.all([getGymSettings(), getCurrentMembership(member.id)]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <header className="space-y-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{member.full_name}</h1>
          <p className="text-muted-foreground text-sm">{formatPhone(member.phone)}</p>
          <MembershipStatusBadge status={membership?.status ?? null} />
        </div>
        <ProfilePhoto memberId={member.id} currentUrl={member.photo_url} name={member.full_name} />
      </header>

      {membership ? (
        <Card className="gap-2 py-4">
          <dl className="grid grid-cols-2 gap-3 px-5 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Current plan</dt>
              <dd className="font-semibold">{membership.plan_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Category</dt>
              <dd className="font-semibold">{membership.category_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Started</dt>
              <dd className="font-semibold">{formatDate(membership.start_date)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Expires</dt>
              <dd className="font-semibold">{formatDate(membership.expiry_date)}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <Card className="py-5">
        <div className="space-y-1 px-5">
          <h2 className="font-semibold">Your details</h2>
          <p className="text-muted-foreground text-sm">
            Keep these up to date so we can reach you about renewals and record your progress.
          </p>
        </div>
        <div className="px-5">
          <ProfileForm member={member} />
        </div>
      </Card>

      <Card className="gap-3 py-4">
        <div className="space-y-2 px-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldQuestion className="size-4" aria-hidden />
            Need your mobile number changed?
          </p>
          <p className="text-muted-foreground text-sm text-pretty">
            Your number is how you sign in, so only gym staff can change it. Call the desk and they will update it for
            you.
          </p>
          {settings.contact_phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={telLink(settings.contact_phone)}>
                <Phone aria-hidden />
                Call {settings.gym_name}
              </a>
            </Button>
          ) : null}
        </div>
      </Card>

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline" className="text-destructive w-full">
          <LogOut aria-hidden />
          Sign out
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-xs">
        <Link href="/contact" className="underline underline-offset-4">
          Contact the gym
        </Link>
      </p>

      <MemberBottomNav active="profile" />
    </div>
  );
}
