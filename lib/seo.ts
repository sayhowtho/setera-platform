import type { Metadata } from 'next';
import { AUDIENCE, BRAND, CONTACT, type Faq } from './site-content';

/** Per-page metadata: unique title + description, self-canonical, and
 *  OG/Twitter tags pointing at the page's own URL. Setting openGraph here
 *  replaces the inherited file-based image, so the shared image generated
 *  by app/opengraph-image.tsx is attached explicitly. */
const OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Setera: AI receptionist for contractors and home-service businesses across Canada. Nothing Slips.',
};
export function buildMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  const url = `${BRAND.url}${path === '/' ? '' : path}`;
  return {
    title,
    description,
    alternates: { canonical: url, languages: { 'en-CA': url } },
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND.name,
      locale: 'en_CA',
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/* ── JSON-LD (no Offer / price anywhere: pricing is scoped on a demo) ── */
const ORG_ID = `${BRAND.url}/#organization`;
const CANADA_PLACE = { '@type': 'Country', name: 'Canada' };

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: BRAND.name,
    url: BRAND.url,
    logo: `${BRAND.url}${BRAND.logo.ink}`,
    slogan: BRAND.tagline,
    description: `${BRAND.name} is an AI receptionist for ${AUDIENCE.name} across Canada, ${AUDIENCE.examples}. ${AUDIENCE.adapts}`,
    email: CONTACT.email,
    areaServed: CANADA_PLACE,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: CONTACT.email,
      areaServed: 'CA',
      availableLanguage: ['en'],
    },
  };
}

export function serviceLd({ name, serviceType, description, path }: { name: string; serviceType: string; description: string; path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    serviceType,
    description,
    url: `${BRAND.url}${path === '/' ? '' : path}`,
    provider: { '@id': ORG_ID },
    areaServed: CANADA_PLACE,
    audience: { '@type': 'BusinessAudience', audienceType: 'Contractors and home-service businesses' },
  };
}

export function faqLd(faqs: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
