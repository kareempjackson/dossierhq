import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
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
