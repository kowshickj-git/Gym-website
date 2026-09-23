import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  const lastModified = new Date();

  return [
    { url: `${base}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/plans`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/offers`, lastModified, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/about`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/contact`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
