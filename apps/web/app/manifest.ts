import type { MetadataRoute } from 'next';

/**
 * Lets a phone or a desktop install Dossier as an app of its own: it opens
 * on Today, in its own window, with the mark on its icon. The icons in
 * public/app-icons are the lime mark on deep, as the brand book allows.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Dossier',
    short_name: 'Dossier',
    description: 'What needs attention at every client, and why.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/app-icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Ask Dossier', url: '/ask' },
      { name: 'Clients', url: '/clients' },
      { name: 'Reports', url: '/reports' },
    ],
  };
}
