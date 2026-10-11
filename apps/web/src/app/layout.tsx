import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';

const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: { default: 'Dossier', template: '%s · Dossier' },
  description: 'What needs attention at every client, and why.',
};

export const viewport: Viewport = {
  themeColor: '#eaeeec',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en-GB"
      className={`${instrumentSans.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
