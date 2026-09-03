import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/studio';

/**
 * /schedule is the public timetable, and it was missing from the sitemap while
 * inheriting the landing page's title. It is the page most likely to answer a
 * real search -- someone looking for a pole class on a particular evening --
 * so it gets its own title and its own sitemap entry.
 */
const TITLE = 'Class Timetable \u00b7 AZDAH Pole Studio, Bangalore';
const DESCRIPTION =
  'This week at AZDAH: pole art, pole fitness, exotic, flexibility and mobility classes in New Thippasandra, Bengaluru. See times, instructors and which classes still have space.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/schedule' },
  openGraph: {
    type: 'website',
    siteName: 'AZDAH',
    title: TITLE,
    description: DESCRIPTION,
    url: '/schedule',
    locale: 'en_IN',
    // Next replaces the parent openGraph wholesale instead of merging, so
    // the image has to be restated or this page shares as a bare link.
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
