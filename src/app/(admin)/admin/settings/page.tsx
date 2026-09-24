import type { Metadata } from 'next';
import { BellRing, CreditCard, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GymSettingsForm } from '@/components/admin/gym-settings-form';
import { StaffManager } from '@/components/admin/staff-manager';
import { requireAdmin } from '@/lib/auth/guards';
import { createReadOnlyServerSupabase } from '@/lib/supabase/server';
import { getGymSettings } from '@/lib/data';
import { isRazorpayConfigured, serverEnv } from '@/lib/env';
import { isLiveChannel } from '@/lib/notifications/providers';
import { DEFAULT_REMINDER_OFFSETS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const supabase = await createReadOnlyServerSupabase();

  const [settings, { data: staff }] = await Promise.all([
    getGymSettings(),
    supabase
      .from('users')
      .select('id, full_name, email, role, is_active, created_at, admin_users(can_collect_cash)')
      .in('role', ['ADMIN', 'STAFF'])
      .order('created_at'),
  ]);

  const integrations = [
    {
      name: 'Razorpay payments',
      icon: <CreditCard aria-hidden />,
      live: isRazorpayConfigured(),
      liveLabel: 'Connected',
      offLabel: 'Not configured',
      detail: isRazorpayConfigured()
        ? 'Members can pay online by UPI, card or netbanking.'
        : 'Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to take online payments. Cash and UPI at the desk work without it.',
    },
    {
      name: 'SMS',
      icon: <MessageSquare aria-hidden />,
      live: isLiveChannel('SMS'),
      liveLabel: serverEnv.smsProvider.toUpperCase(),
      offLabel: 'Logging only',
      detail: isLiveChannel('SMS')
        ? 'Login codes and expiry reminders are sent by SMS.'
        : 'Messages are written to the server log instead of being sent. Set SMS_PROVIDER and its credentials to go live.',
    },
    {
      name: 'WhatsApp',
      icon: <MessageSquare aria-hidden />,
      live: isLiveChannel('WHATSAPP'),
      liveLabel: serverEnv.whatsappProvider.toUpperCase(),
      offLabel: 'Not configured',
      detail: isLiveChannel('WHATSAPP')
        ? 'Reminders go out over WhatsApp first, then fall back to SMS.'
        : 'Optional. Cheaper than SMS for reminders once a WhatsApp Business number is approved.',
    },
    {
      name: 'Email',
      icon: <BellRing aria-hidden />,
      live: isLiveChannel('EMAIL'),
      liveLabel: serverEnv.emailProvider.toUpperCase(),
      offLabel: 'Logging only',
      detail: 'Used only for members who have given an email address. Never required.',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 md:px-6 md:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Your gym details, the people who can use this dashboard, and what is connected.
        </p>
      </header>

      <Card className="py-5">
        <CardHeader>
          <CardTitle>Gym details</CardTitle>
          <CardDescription>
            These appear on the public site, on every receipt and in the messages members receive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GymSettingsForm settings={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expiry reminders</CardTitle>
          <CardDescription>
            Reminders go out automatically {DEFAULT_REMINDER_OFFSETS.filter((d) => d > 0).join(', ')} days before a
            membership ends, and again on the day it expires. Each member gets each reminder once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-pretty">
            The daily job runs at 08:00 IST. If a message cannot be sent — no SMS credit, a wrong number — it is
            recorded as failed rather than retried silently, so it shows up in the notification log.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected services</CardTitle>
          <CardDescription>Set by environment variables, so no keys are ever stored in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {integrations.map((integration) => (
              <li key={integration.name} className="flex items-start gap-3">
                <span className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
                  {integration.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{integration.name}</p>
                    <Badge variant={integration.live ? 'success' : 'muted'}>
                      {integration.live ? integration.liveLabel : integration.offLabel}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm text-pretty">{integration.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="py-5">
        <CardHeader>
          <CardTitle>Staff accounts</CardTitle>
          <CardDescription>
            Owners can change pricing, offers and settings. Staff can manage members and take payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffManager
            staff={(staff ?? []).map(({ admin_users: extra, ...row }) => ({
              ...row,
              // One-to-one embed. The owner may always take payments, whatever their row says.
              can_take_payments:
                row.role === 'ADMIN' || Boolean((Array.isArray(extra) ? extra[0] : extra)?.can_collect_cash),
            }))}
            currentUserId={admin.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
