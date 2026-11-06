import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';

/**
 * Bricolage Grotesque for headlines, big numbers and short statements: Light
 * and Regular, with Medium for the rare emphasis. Headlines run 22–64px, so
 * the 36pt optical cut; the unsuffixed files are cut for small text.
 */
export const bricolage = localFont({
  src: [
    {
      path: '../public/fonts/BricolageGrotesque_36pt-Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/BricolageGrotesque_36pt-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/BricolageGrotesque_36pt-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-bricolage',
});

/** Geist for body copy, interface text and captions. */
export const geist = localFont({
  src: [
    {
      path: '../public/fonts/Geist-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/Geist-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/Geist-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-geist',
});

/**
 * Geist Mono for sources, labels, dates and numbers in tables. It isn't in
 * public/fonts, so it comes from Google Fonts at build time.
 */
export const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
});
