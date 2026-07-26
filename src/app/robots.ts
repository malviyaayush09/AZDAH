import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.azdah.in';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/instructor', '/login', '/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
