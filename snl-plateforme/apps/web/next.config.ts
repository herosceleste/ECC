import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@snl/shared'],
  // Le typage est vérifié par « tsc » ; l'ESLint du dépôt parent ne s'applique pas ici.
  eslint: { ignoreDuringBuilds: true },
  // Le monorepo : le traçage des fichiers de « standalone » part de sa racine.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  experimental: {
    serverActions: { bodySizeLimit: '16mb' },
  },
  async headers() {
    return [
      {
        source: '/:chemin*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
