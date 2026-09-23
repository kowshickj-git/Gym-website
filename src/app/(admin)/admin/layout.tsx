import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { requireStaff } from '@/lib/auth/guards';
import { getGymSettings } from '@/lib/data';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin' },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireStaff(), getGymSettings()]);

  return (
    <AdminShell
      gymName={settings.gym_name}
      role={user.role}
      displayName={user.profile.full_name ?? user.profile.email ?? 'Staff'}
    >
      {children}
    </AdminShell>
  );
}
