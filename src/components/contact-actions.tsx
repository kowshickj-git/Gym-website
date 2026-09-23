import Link from 'next/link';
import { MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, telLink, whatsappLink } from '@/lib/utils';

/**
 * Call and WhatsApp buttons.
 *
 * `tel:` and `wa.me` are plain links so they open the phone's own dialler and
 * WhatsApp app — the fastest possible path from "this member is expiring" to
 * "I am talking to them", which is the whole point of the expiring list.
 */
export function ContactActions({
  phone,
  name,
  message,
  size = 'icon-sm',
  className,
  labelled = false,
}: {
  phone: string;
  name?: string;
  message?: string;
  size?: 'icon-sm' | 'icon' | 'sm' | 'default';
  className?: string;
  labelled?: boolean;
}) {
  const isIcon = size === 'icon-sm' || size === 'icon';
  const text = message ?? defaultMessage(name);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button asChild variant="outline" size={size} aria-label={`Call ${name ?? phone}`}>
        <a href={telLink(phone)}>
          <Phone aria-hidden />
          {!isIcon || labelled ? <span className={isIcon ? 'sr-only' : undefined}>Call</span> : null}
        </a>
      </Button>
      <Button asChild variant="outline" size={size} aria-label={`Message ${name ?? phone} on WhatsApp`}>
        <a href={whatsappLink(phone, text)} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden />
          {!isIcon || labelled ? <span className={isIcon ? 'sr-only' : undefined}>WhatsApp</span> : null}
        </a>
      </Button>
    </div>
  );
}

function defaultMessage(name?: string): string {
  const greeting = name ? `Hi ${name.split(' ')[0]}` : 'Hi';
  return `${greeting}, this is Iron Core Fitness. Just checking in about your gym membership.`;
}

/** A single call button, for tight card footers. */
export function CallButton({ phone, name, className }: { phone: string; name?: string; className?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link href={telLink(phone)} aria-label={`Call ${name ?? phone}`}>
        <Phone aria-hidden />
        Call
      </Link>
    </Button>
  );
}
