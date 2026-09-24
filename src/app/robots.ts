import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/plans', '/offers', '/about', '/contact'],
        // Everything behind a login is private and must never be indexed.
        disallow: ['/admin', '/dashboard', '/profile', '/payments', '/receipts', '/checkout', '/api/', '/verify-otp'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
