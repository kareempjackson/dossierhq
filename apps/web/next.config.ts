import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Railway restores .next/cache between deploys, and a build started from
    // that cache can ship CSS made from an older globals.css. Always build
    // from the files themselves.
    turbopackFileSystemCacheForBuild: false,
    // A long-running dev server here kept serving an old compile of a file
    // after it changed, and a restart would restore that compile from
    // .next/dev/cache. Start each dev server from the files themselves too.
    turbopackFileSystemCacheForDev: false,
    // Contract files go to the API through a server action, up to 10 MB
    // each (the API's limit) plus the form's own bytes. The proxy buffers
    // every request body, so it has to hold one too.
    serverActions: { bodySizeLimit: '11mb' },
    proxyClientMaxBodySize: '11mb',
  },
  turbopack: {
    rules: {
      // Tailwind v4 runs as a Turbopack loader, as in apps/admin, so
      // there's no PostCSS config.
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
