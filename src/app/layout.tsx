import type { Metadata } from 'next';
import { Archivo, Bodoni_Moda } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-archivo',
});

const bodoniModa = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-bodoni',
});

export const metadata: Metadata = {
  title: 'AZDAH Fitness · Bangalore',
  description: 'Movement, aerial arts & holistic fitness studio in Bangalore. Join AZDAH.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${bodoniModa.variable}`}>
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#15110D',
        fontFamily: 'var(--font-archivo), system-ui, sans-serif',
        color: '#F1E9DA',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}>
        {children}
      </body>
    </html>
  );
}
