import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ServiceWorker } from '@/components/service-worker';
import { siteUrl } from '@/lib/env';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Iron Core Fitness — Gym Membership & Payments',
    template: '%s | Iron Core Fitness',
  },
  description:
    'Manage your Iron Core Fitness gym membership online: view your plan, see festival offers, pay securely and download receipts.',
  applicationName: 'Iron Core Fitness',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Iron Core' },
  formatDetection: { telephone: true },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111113' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
          <ServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
