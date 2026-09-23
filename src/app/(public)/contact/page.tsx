import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formattedGymAddress, getGymSettings } from '@/lib/data';
import { formatPhone } from '@/lib/phone';
import { telLink, whatsappLink } from '@/lib/utils';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getGymSettings();
  return {
    title: `Contact ${settings.gym_name}`,
    description: `Call, WhatsApp or visit ${settings.gym_name}. Address, timings and directions.`,
    alternates: { canonical: '/contact' },
  };
}

export default async function ContactPage() {
  const settings = await getGymSettings();
  const address = formattedGymAddress(settings);
  const whatsapp = settings.whatsapp_phone ?? settings.contact_phone;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:py-12">
      <header className="space-y-2">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Contact</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Get in touch</h1>
        <p className="text-muted-foreground text-pretty">
          The quickest answer is always a phone call — someone is on the desk through every opening hour.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {settings.contact_phone ? (
          <Button asChild size="xl" className="justify-start">
            <a href={telLink(settings.contact_phone)}>
              <Phone aria-hidden />
              {formatPhone(settings.contact_phone)}
            </a>
          </Button>
        ) : null}
        {whatsapp ? (
          <Button asChild size="xl" variant="outline" className="justify-start">
            <a
              href={whatsappLink(whatsapp, `Hi ${settings.gym_name}, I would like to know about gym membership.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle aria-hidden />
              WhatsApp us
            </a>
          </Button>
        ) : null}
      </div>

      <Card className="gap-4">
        <dl className="space-y-4 px-5 text-sm">
          {address ? (
            <div className="flex gap-3">
              <MapPin className="text-primary mt-0.5 size-4.5 shrink-0" aria-hidden />
              <div>
                <dt className="font-semibold">Address</dt>
                <dd className="text-muted-foreground text-pretty">{address}</dd>
              </div>
            </div>
          ) : null}

          {settings.opening_hours ? (
            <div className="flex gap-3">
              <Clock className="text-primary mt-0.5 size-4.5 shrink-0" aria-hidden />
              <div>
                <dt className="font-semibold">Opening hours</dt>
                <dd className="text-muted-foreground">{settings.opening_hours}</dd>
              </div>
            </div>
          ) : null}

          {settings.contact_email ? (
            <div className="flex gap-3">
              <Mail className="text-primary mt-0.5 size-4.5 shrink-0" aria-hidden />
              <div>
                <dt className="font-semibold">Email</dt>
                <dd>
                  <a href={`mailto:${settings.contact_email}`} className="text-muted-foreground hover:underline">
                    {settings.contact_email}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
        </dl>

        {settings.maps_url ? (
          <div className="px-5">
            <Button asChild variant="outline" className="w-full">
              <a href={settings.maps_url} target="_blank" rel="noopener noreferrer">
                Get directions
              </a>
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="bg-muted/40 gap-2">
        <div className="space-y-2 px-5">
          <p className="font-semibold">Already a member?</p>
          <p className="text-muted-foreground text-sm text-pretty">
            Sign in with your mobile number to check your expiry date, renew, or download a receipt.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">
              Member login
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
