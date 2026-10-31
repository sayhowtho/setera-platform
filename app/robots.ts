import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/site-content';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/dashboard', '/rep', '/setter', '/client', '/auth', '/api', '/service-ended'],
    },
    sitemap: `${BRAND.url}/sitemap.xml`,
    host: BRAND.url,
  };
}
