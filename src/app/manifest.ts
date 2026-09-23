import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Iron Core Fitness — Membership',
    short_name: 'Iron Core',
    description: 'View your gym membership, offers, payments and receipts.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#111113',
    theme_color: '#111113',
    categories: ['health', 'fitness', 'lifestyle'],
    lang: 'en-IN',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'My membership', url: '/dashboard' },
      { name: 'Buy or renew', url: '/plans' },
      { name: 'Payments', url: '/payments' },
    ],
  };
}
