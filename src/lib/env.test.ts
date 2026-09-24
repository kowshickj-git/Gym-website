import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteUrl, supabasePublicConfig } from './env';

/**
 * These two functions are what fixed the first production outage: the landing
 * page returned 500 on Vercel because the Supabase variables were added after
 * the build that inlined them. They must read the environment when called, not
 * when the module was loaded.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('supabasePublicConfig', () => {
  it('reads values set after the module was loaded', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://late.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_late');

    expect(supabasePublicConfig()).toEqual({
      url: 'https://late.supabase.co',
      anonKey: 'sb_publishable_late',
    });
  });

  it('treats blank values as missing rather than as a URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '   ');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const config = supabasePublicConfig();
    expect(config.url).toBe('');
    expect(config.anonKey).toBe('');
  });
});

describe('siteUrl', () => {
  it('uses the configured domain, without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ironcore.in/');
    expect(siteUrl()).toBe('https://ironcore.in');
  });

  it('never uses the deploy-kit placeholder', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://REPLACE-WITH-YOUR-VERCEL-URL');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'gym-websitee-three.vercel.app');
    expect(siteUrl()).toBe('https://gym-websitee-three.vercel.app');
  });

  it('refuses localhost on Vercel, where it would break every reminder link', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'gym-websitee-three.vercel.app');
    expect(siteUrl()).toBe('https://gym-websitee-three.vercel.app');
  });

  it('keeps localhost for local development', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('falls back to the Vercel domain when nothing is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_URL', 'gym-websitee-git-main.vercel.app');
    expect(siteUrl()).toBe('https://gym-websitee-git-main.vercel.app');
  });
});
