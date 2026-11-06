import type { Metadata, Viewport } from 'next';
import { MotionProvider } from '@/components/providers/motion-provider';
import { StoreProvider } from '@/components/providers/store-provider';
import { bricolage, geist, geistMono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Dossier', template: '%s · Dossier' },
  description: 'What needs attention at every client, and why.',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
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
