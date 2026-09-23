import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Clock, Dumbbell, HeartPulse, MapPin, Phone, Receipt, ShieldCheck, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PlanGrid } from '@/components/plan-grid';
import { formattedGymAddress, getCategories, getGymSettings, getOffersWithRules, getPlans, toPricingPlan } from '@/lib/data';
import { quotePlans } from '@/lib/pricing';
import { formatDate, formatCurrency, telLink } from '@/lib/utils';
import { formatPhone } from '@/lib/phone';
import { publicEnv } from '@/lib/env';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getGymSettings();
  const location = [settings.city, settings.state].filter(Boolean).join(', ');
  const title = `${settings.gym_name} — Gym Membership${location ? ` in ${location}` : ''}`;
  const description =
    settings.tagline ??
    `Cardio and weight-training memberships at ${settings.gym_name}. Monthly, 3-month, 6-month and annual plans. Pay online and manage your membership from your phone.`;

  return {
    title,
    description,
    keywords: [
      'gym membership',
      'fitness centre',
      settings.city ?? 'Tamil Nadu',
      'weight training',
      'cardio',
      'gym near me',
      settings.gym_name,
    ].filter(Boolean) as string[],
    alternates: { canonical: '/' },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'en_IN',
      siteName: settings.gym_name,
      url: publicEnv.siteUrl,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function HomePage() {
  const [settings, categories, plans, offers] = await Promise.all([
    getGymSettings(),
    getCategories(),
    getPlans(),
    getOffersWithRules(),
  ]);

  const quotes = quotePlans(plans.map(toPricingPlan), offers);
  const address = formattedGymAddress(settings);

  // Cheapest live entry point, used for the hero price teaser.
  const cheapest = plans.reduce<{ price: number; label: string } | null>((best, plan) => {
    const price = quotes[plan.id]?.final_amount ?? Number(plan.base_price);
    if (plan.duration_months !== 1) return best;
    return !best || price < best.price ? { price, label: plan.name } : best;
  }, null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HealthAndBeautyBusiness',
    '@id': `${publicEnv.siteUrl}/#gym`,
    name: settings.gym_name,
    description: settings.tagline ?? undefined,
    url: publicEnv.siteUrl,
    telephone: settings.contact_phone ?? undefined,
    email: settings.contact_email ?? undefined,
    priceRange: '₹₹',
    address: {
      '@type': 'PostalAddress',
      streetAddress: [settings.address_line1, settings.address_line2].filter(Boolean).join(', ') || undefined,
      addressLocality: settings.city ?? undefined,
      addressRegion: settings.state ?? undefined,
      postalCode: settings.pincode ?? undefined,
      addressCountry: 'IN',
    },
    openingHours: settings.opening_hours ?? undefined,
    hasMap: settings.maps_url ?? undefined,
    makesOffer: plans.slice(0, 8).map((plan) => ({
      '@type': 'Offer',
      name: `${plan.category?.name ?? 'Membership'} — ${plan.name}`,
      price: quotes[plan.id]?.final_amount ?? Number(plan.base_price),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ------------------------------------------------------------- Hero */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="space-y-6">
              {offers.length > 0 ? (
                <Link href="/offers" className="inline-block">
                  <Badge variant="success" className="gap-1.5 px-3 py-1 text-sm">
                    <Tag className="size-3.5" aria-hidden />
                    {offers[0]!.banner_text ?? offers[0]!.name} — ends {formatDate(offers[0]!.ends_at)}
                  </Badge>
                </Link>
              ) : null}

              <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Train hard.
                <br />
                <span className="text-primary">Skip the paperwork.</span>
              </h1>

              <p className="text-muted-foreground max-w-xl text-lg text-pretty">
                {settings.tagline ??
                  'Cardio and weight-training memberships you can buy, renew and track from your phone.'}{' '}
                No registers, no lost receipts, no guessing when your plan runs out.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="xl" className="w-full sm:w-auto">
                  <Link href="/plans">
                    Join now
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="outline" className="w-full sm:w-auto">
                  <Link href="/login">Member login</Link>
                </Button>
              </div>

              {cheapest ? (
                <p className="text-muted-foreground text-sm">
                  Memberships from{' '}
                  <span className="text-foreground tnum font-semibold">{formatCurrency(cheapest.price)}</span> per month.
                  Cancel any time — no lock-in.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeatureTile
                icon={<HeartPulse aria-hidden />}
                title="Cardio + Weights"
                body="Treadmills, cycles, cross-trainers and the full strength floor."
              />
              <FeatureTile
                icon={<Dumbbell aria-hidden />}
                title="Weights only"
                body="A lower-cost plan for members who live on the strength floor."
              />
              <FeatureTile
                icon={<Receipt aria-hidden />}
                title="Every receipt saved"
                body="Digital receipts for every payment, cash or online."
              />
              <FeatureTile
                icon={<ShieldCheck aria-hidden />}
                title="Secure payments"
                body="Pay by UPI, card or netbanking through Razorpay."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Plans */}
      <section id="plans" className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="mb-8 space-y-2">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">Membership plans</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pick a category, pick a length</h2>
          <p className="text-muted-foreground max-w-2xl text-pretty">
            Longer plans cost less per month. Any festival discount you qualify for is already applied to the prices
            below.
          </p>
        </div>

        <PlanGrid
          categories={categories}
          plans={plans}
          quotes={quotes}
          hrefForPlan={(planId) => `/checkout?plan=${planId}`}
          ctaLabel="Get this plan"
        />
      </section>

      {/* ---------------------------------------------------------- Contact */}
      <section className="bg-muted/40 border-y">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:py-16 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold tracking-tight">Come and look around</h2>
            <p className="text-muted-foreground max-w-xl text-pretty">
              Walk in for a free tour of the floor. Our staff will talk you through the equipment, the timings and which
              plan actually suits how you train.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/plans">
                  See plans and prices
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              {settings.contact_phone ? (
                <Button asChild size="lg" variant="outline">
                  <a href={telLink(settings.contact_phone)}>
                    <Phone aria-hidden />
                    {formatPhone(settings.contact_phone)}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <Card className="gap-3">
            <div className="space-y-3 px-5 text-sm">
              {address ? (
                <p className="flex gap-2.5">
                  <MapPin className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="text-pretty">{address}</span>
                </p>
              ) : null}
              {settings.opening_hours ? (
                <p className="flex gap-2.5">
                  <Clock className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{settings.opening_hours}</span>
                </p>
              ) : null}
              {settings.contact_phone ? (
                <p className="flex gap-2.5">
                  <Phone className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                  <a href={telLink(settings.contact_phone)} className="hover:underline">
                    {formatPhone(settings.contact_phone)}
                  </a>
                </p>
              ) : null}
            </div>
            {settings.maps_url ? (
              <div className="px-5">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href={settings.maps_url} target="_blank" rel="noopener noreferrer">
                    Open in Maps
                  </a>
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </section>
    </>
  );
}

function FeatureTile({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="gap-2 py-4">
      <div className="space-y-2 px-4">
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg [&_svg]:size-4.5">
          {icon}
        </span>
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground text-sm text-pretty">{body}</p>
      </div>
    </Card>
  );
}
