import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config. eslint-config-next 16 exports flat configs directly, so there is
 * no FlatCompat shim here.
 */
const config = [
  {
    // deploy/ is generated and gitignored: SQL bundles, env exports, local test harnesses.
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/sw.js', 'next-env.d.ts', 'deploy/**'],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The Supabase JSON boundary is genuinely dynamic; everything else is typed.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
];

export default config;
