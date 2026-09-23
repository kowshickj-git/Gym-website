import Link from 'next/link';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { formattedGymAddress, getGymSettings } from '@/lib/data';
import { formatPhone } from '@/lib/phone';
import { telLink } from '@/lib/utils';

export async function SiteFooter() {
  const settings = await getGymSettings();
  const address = formattedGymAddress(settings);

  return (
    <footer data-app-footer className="bg-muted/40 mt-16 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="text-base font-bold">{settings.gym_name}</p>
          {settings.tagline ? <p className="text-muted-foreground text-sm text-pretty">{settings.tagline}</p> : null}
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold tracking-wide uppercase">Visit us</p>
          {address ? (
            <p className="text-muted-foreground flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="text-pretty">{address}</span>
            </p>
          ) : null}
          {settings.opening_hours ? (
            <p className="text-muted-foreground flex gap-2">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{settings.opening_hours}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold tracking-wide uppercase">Contact</p>
          {settings.contact_phone ? (
            <a href={telLink(settings.contact_phone)} className="text-muted-foreground hover:text-foreground flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
              {formatPhone(settings.contact_phone)}
            </a>
          ) : null}
          {settings.contact_email ? (
            <a
              href={`mailto:${settings.contact_email}`}
              className="text-muted-foreground hover:text-foreground flex gap-2 break-all"
            >
              <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
              {settings.contact_email}
            </a>
          ) : null}
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold tracking-wide uppercase">Members</p>
          <nav className="text-muted-foreground flex flex-col gap-1.5">
            <Link href="/plans" className="hover:text-foreground w-fit">
              Membership plans
            </Link>
            <Link href="/offers" className="hover:text-foreground w-fit">
              Current offers
            </Link>
            <Link href="/login" className="hover:text-foreground w-fit">
              Member login
            </Link>
            <Link href="/admin/login" className="hover:text-foreground w-fit">
              Staff login
            </Link>
          </nav>
        </div>
      </div>

      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {settings.gym_name}. All rights reserved.
          </p>
          {settings.gstin ? <p>GSTIN {settings.gstin}</p> : null}
        </div>
      </div>
    </footer>
  );
}
