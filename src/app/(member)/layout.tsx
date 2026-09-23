import { MemberHeader } from '@/components/member/member-header';
import { requireMember } from '@/lib/auth/guards';
import { getGymSettings } from '@/lib/data';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [{ member }, settings] = await Promise.all([requireMember(), getGymSettings()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <MemberHeader gymName={settings.gym_name} member={member} />
      <main className="pb-safe-nav flex-1 md:pb-8">{children}</main>
    </div>
  );
}
