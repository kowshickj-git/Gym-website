import { ImageResponse } from 'next/og';
import { getGymSettings } from '@/lib/data';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Iron Core Fitness — gym memberships in Tamil Nadu';

export default async function OpengraphImage() {
  const settings = await getGymSettings().catch(() => null);
  const name = settings?.gym_name ?? 'Iron Core Fitness';
  const city = [settings?.city, settings?.state].filter(Boolean).join(', ') || 'Tamil Nadu';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#111113',
          padding: 80,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#F04A2E',
              color: '#111113',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            IC
          </div>
          <div style={{ color: '#A1A1AA', fontSize: 28, letterSpacing: 2, textTransform: 'uppercase' }}>{city}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ color: '#FAFAFA', fontSize: 86, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {name}
          </div>
          <div style={{ color: '#D4D4D8', fontSize: 34, maxWidth: 900 }}>
            Cardio and weight-training memberships. Pay online, renew in seconds, keep every receipt.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {['Monthly', '3 Months', '6 Months', 'Annual'].map((label) => (
            <div
              key={label}
              style={{
                padding: '12px 26px',
                borderRadius: 999,
                border: '2px solid #3F3F46',
                color: '#E4E4E7',
                fontSize: 26,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
