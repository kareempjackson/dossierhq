import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Contract documents go to the API through a Server Action, and may be
    // up to 10 MB; the rest of the form adds a little.
    serverActions: { bodySizeLimit: '11mb' },
    // Railway restores .next/cache between deploys, and a build started from
    // that cache shipped CSS made from the previous globals.css (new classes,
    // old theme). Always build from the files themselves.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
