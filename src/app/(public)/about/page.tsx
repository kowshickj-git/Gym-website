import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, Dumbbell, HeartPulse, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formattedGymAddress, getCategories, getGymSettings } from '@/lib/data';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getGymSettings();
  const location = [settings.city, settings.state].filter(Boolean).join(', ');
  return {
    title: `About ${settings.gym_name}`,
    description: `${settings.gym_name}${location ? ` in ${location}` : ''} — equipment, timings, trainers and membership categories.`,
    alternates: { canonical: '/about' },
  };
}

export default async function AboutPage() {
  const [settings, categories] = await Promise.all([getGymSettings(), getCategories()]);
  const address = formattedGymAddress(settings);

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:py-12">
      <header className="space-y-3">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">About us</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{settings.gym_name}</h1>
        {settings.tagline ? <p className="text-muted-foreground text-lg text-pretty">{settings.tagline}</p> : null}
      </header>

      <section className="space-y-4">
        <p className="text-pretty">
          We are a neighbourhood gym built for people who want to train properly without paying city-centre prices. The
          floor is set up for serious strength work, with a separate cardio section for members who want both.
        </p>
        <p className="text-pretty">
          Membership is deliberately simple. Choose how you train, choose how long you are committing for, and pay
          however suits you — online from your phone, or cash at the desk. Either way your membership, your renewal date
          and every receipt live in one place you can open any time.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Membership categories</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
            <Card key={category.id} className="gap-2 py-4">
              <div className="space-y-2 px-4">
                <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                  {category.slug.includes('cardio') ? (
                    <HeartPulse className="size-4.5" aria-hidden />
                  ) : (
                    <Dumbbell className="size-4.5" aria-hidden />
                  )}
                </span>
                <p className="font-semibold">{category.name}</p>
                {category.description ? (
                  <p className="text-muted-foreground text-sm text-pretty">{category.description}</p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-2 py-4">
          <div className="space-y-1 px-4">
            <Clock className="text-primary size-5" aria-hidden />
            <p className="text-sm font-semibold">Opening hours</p>
            <p className="text-muted-foreground text-sm text-pretty">
              {settings.opening_hours ?? 'Call the gym for current timings.'}
            </p>
          </div>
        </Card>
        <Card className="gap-2 py-4">
          <div className="space-y-1 px-4">
            <MapPin className="text-primary size-5" aria-hidden />
            <p className="text-sm font-semibold">Where we are</p>
            <p className="text-muted-foreground text-sm text-pretty">{address || 'Address coming soon.'}</p>
          </div>
        </Card>
        <Card className="gap-2 py-4">
          <div className="space-y-1 px-4">
            <Users className="text-primary size-5" aria-hidden />
            <p className="text-sm font-semibold">Who trains here</p>
            <p className="text-muted-foreground text-sm text-pretty">
              First-timers, regulars and competitive lifters. Staff on the floor through every session.
            </p>
          </div>
        </Card>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/plans">
            See plans and prices
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/contact">Contact us</Link>
        </Button>
      </div>
    </div>
  );
}
