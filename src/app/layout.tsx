import type { Metadata } from 'next';
import { Hanken_Grotesk, Bodoni_Moda } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'AZDAH Fitness · Bangalore',
  description: 'Movement, aerial arts & holistic fitness studio in Bangalore. Join AZDAH.',
  icons: { icon: '/favicon.svg' },
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
      </body>
    </html>
  );
}
