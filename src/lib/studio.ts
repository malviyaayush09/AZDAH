/**
 * The studio's own facts, in one place.
 *
 * These strings were previously spread across page.tsx, layout.tsx and the
 * JSON-LD block, which is how the Instagram handle ended up needing a change in
 * four files. Anything Google reads about AZDAH -- name, address, coordinates,
 * social profile -- is defined here and nowhere else.
 *
 * Deliberately free of 'use client' and of any React import, so both the server
 * (metadata, sitemap) and the client pages can pull from it.
 */

export const SITE_URL = 'https://www.azdah.in';
export const STUDIO_NAME = 'AZDAH';
export const STUDIO_PHONE = '+91-85880-56122';
export const INSTAGRAM_URL = 'https://instagram.com/polewithazdah';
export const INSTAGRAM_AT = '@polewithazdah';

export const ADDRESS = {
  street: 'AU Small Finance Bank (3rd floor), 10/3, Jeevan Bima Nagar Main Rd, LIC Colony, Sector 11, New Thippasandra',
  locality: 'Bengaluru',
  region: 'Karnataka',
  postalCode: '560075',
  country: 'IN',
} as const;

// Read off the studio's own Google Maps place entry, so the pin in the
// structured data is the same pin as the listing rather than a geocode guess.
export const GEO = { lat: 12.9678133, lng: 77.6530654 } as const;

const MAPS_QUERY = encodeURIComponent(
  '10/3, Jeevan Bima Nagar Main Rd, LIC Colony, Sector 11, New Thippasandra, Bengaluru, Karnataka 560075',
);
export const MAPS_LINK = `https://www.google.com/maps?q=${MAPS_QUERY}`;

/**
 * The neighbourhoods people actually travel from. The studio sits in New
 * Thippasandra, so a search naming Indiranagar or Domlur is a search for a
 * studio 3 km away -- true, and worth saying, because Google will not infer it
 * from a 560075 postcode on its own.
 */
export const AREAS_SERVED = [
  'Indiranagar',
  'Domlur',
  'Jeevan Bima Nagar',
  'New Thippasandra',
  'HAL 2nd Stage',
  'Kodihalli',
] as const;

export const OG_IMAGE = {
  url: '/og.jpg',
  width: 1200,
  height: 630,
  alt: 'AZDAH — pole dance studio in Bengaluru',
} as const;

/**
 * Opening hours as published to Google.
 *
 * NOTE: this does not match the "Tuesday - Sunday: By appointment only" line in
 * the contact section of the landing page, and one of the two is wrong. Left as
 * it was rather than guessed at -- see the note raised with the studio.
 */
const OPENING_HOURS = [
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '06:00', closes: '21:00' },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '07:00', closes: '14:00' },
];

/**
 * schema.org description of the studio, for the landing page's JSON-LD.
 *
 * SportsActivityLocation is a LocalBusiness subtype, so Google reads the
 * address, coordinates and hours from it for the knowledge panel. No
 * aggregateRating: Google does not grant stars for a business rating a
 * business supplies about itself, and marking it up anyway risks the whole
 * block being ignored.
 */
export function studioSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    '@id': `${SITE_URL}/#studio`,
    name: STUDIO_NAME,
    description:
      'Women and queer-first pole dance studio in Bengaluru — pole art, pole fitness, exotic, flexibility, strength and mindfulness.',
    url: SITE_URL,
    telephone: STUDIO_PHONE,
    image: `${SITE_URL}${OG_IMAGE.url}`,
    // Bands rather than figures: the pack prices change, and a stale number in
    // structured data is worse than no number.
    priceRange: '₹₹',
    currenciesAccepted: 'INR',
    // No email on purpose. The inbox is not monitored, and the studio takes
    // contact on Instagram first, then WhatsApp.
    sameAs: [INSTAGRAM_URL],
    hasMap: MAPS_LINK,
    address: {
      '@type': 'PostalAddress',
      streetAddress: ADDRESS.street,
      addressLocality: ADDRESS.locality,
      addressRegion: ADDRESS.region,
      postalCode: ADDRESS.postalCode,
      addressCountry: ADDRESS.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: GEO.lat, longitude: GEO.lng },
    areaServed: AREAS_SERVED.map((name) => ({ '@type': 'Place', name })),
    openingHoursSpecification: OPENING_HOURS,
  };
}
