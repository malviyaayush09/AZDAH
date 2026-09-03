import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/studio';

/**
 * /workshops is a client component, so it cannot export metadata itself -- which
 * is why it was inheriting the landing page's title and description verbatim.
 * Two pages with the same title is two pages Google picks one of.
 */
const TITLE = 'Pole Workshops & Drop-in Classes · AZDAH Bangalore';
const DESCRIPTION =
  'Book a pole workshop or a single drop-in class at AZDAH, Bengaluru. Beginner-friendly pole art, exotic and flexibility sessions in New Thippasandra, minutes from Indiranagar.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/workshops' },
  openGraph: {
    type: 'website',
    siteName: 'AZDAH',
    title: TITLE,
    description: DESCRIPTION,
    url: '/workshops',
    locale: 'en_IN',
    // Next replaces the parent openGraph wholesale instead of merging, so
    // the image has to be restated or this page shares as a bare link.
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

export default function WorkshopsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
