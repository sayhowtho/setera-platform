import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/site-content';
import { TRADE_LIST } from '@/lib/trades';

// Public marketing pages only. Auth, dashboards and API routes are excluded
// (and disallowed in robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const page = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' | 'yearly' = 'monthly') => ({
    url: `${BRAND.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });
  return [
    page('', 1, 'weekly'),
    page('/what-we-do', 0.9),
    page('/how-it-works', 0.9),
    ...TRADE_LIST.map((t) => page(`/${t.slug}`, 0.9)),
    page('/missed-call-revenue-calculator', 0.8),
    page('/overflow', 0.6),
    page('/demo', 0.7),
    page('/privacy', 0.3, 'yearly'),
    page('/terms', 0.3, 'yearly'),
  ];
}
