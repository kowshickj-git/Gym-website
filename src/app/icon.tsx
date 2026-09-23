import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** App icon: the Iron Core monogram on the brand red. */
export default function Icon() {
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
          fontSize: 260,
          fontWeight: 800,
          letterSpacing: -14,
          borderRadius: 96,
        }}
      >
        IC
      </div>
    ),
    size,
  );
}
