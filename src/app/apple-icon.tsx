import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111113',
          color: '#F04A2E',
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -5,
        }}
      >
        IC
      </div>
    ),
    size,
  );
}
