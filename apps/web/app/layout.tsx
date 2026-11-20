import type { Metadata, Viewport } from 'next';
import { MotionProvider } from '@/components/providers/motion-provider';
import { StoreProvider } from '@/components/providers/store-provider';
import { bricolage, geist, geistMono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Dossier', template: '%s · Dossier' },
  description:
    'Ticket context and weekly client reports for managed service providers.',
  applicationName: 'Dossier',
  // Added to a phone's home screen, Dossier opens as an app of its own.
  appleWebApp: { capable: true, title: 'Dossier', statusBarStyle: 'default' },
  // Next writes the standard tag; iPhones before iOS 16.4 read only this one.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  // Edge to edge on phones with a notch; the shell pads for the safe areas.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en-GB"
      className={`${geist.variable} ${geistMono.variable} ${bricolage.variable}`}
    >
      <body>
        <StoreProvider>
          <MotionProvider>{children}</MotionProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
