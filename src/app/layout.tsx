import type { Metadata } from 'next';
import { Hanken_Grotesk, Bodoni_Moda } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SITE_URL, OG_IMAGE } from '@/lib/studio';
import './globals.css';

// Body / UI typeface — clean grotesque (replaces Inter)
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
});

// Display typeface — high-contrast Didone that echoes the AZDAH logo
const bodoniModa = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-bodoni',
  adjustFontFallback: false,
});

const TITLE = 'AZDAH · Pole Dance Studio in Bangalore';
const DESCRIPTION =
  'A women & queer-first pole dance studio in Bangalore — pole art, pole fitness, exotic, flexibility, strength & mindfulness. Classes in New Thippasandra, minutes from Indiranagar and Domlur.';

/**
 * metadataBase is what makes the relative '/og.jpg' below resolve to an
 * absolute URL. Without it Next emits a relative og:image, which every scraper
 * that matters (WhatsApp, Instagram, Slack, X) silently drops -- which is why
 * sharing azdah.in produced a bare grey link with no picture.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'AZDAH',
  alternates: { canonical: '/' },
  keywords: [
    'pole dance Bangalore',
    'pole dance classes Bangalore',
    'pole fitness Bangalore',
    'pole dance studio Indiranagar',
    'pole dance New Thippasandra',
    'aerial and pole art Bengaluru',
    'women only fitness studio Bangalore',
  ],
  openGraph: {
    type: 'website',
    siteName: 'AZDAH',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_IN',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${bodoniModa.variable}`}>
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#15110D',
        fontFamily: 'var(--font-sans), -apple-system, BlinkMacSystemFont, sans-serif',
        color: '#F1E9DA',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
