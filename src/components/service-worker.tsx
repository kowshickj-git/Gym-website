'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell.
 *
 * Only in production: an active service worker during development makes code
 * changes confusing. The worker itself (public/sw.js) caches the app shell and
 * static assets so a member on a weak connection still sees the interface.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Service worker registration failed', error);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
