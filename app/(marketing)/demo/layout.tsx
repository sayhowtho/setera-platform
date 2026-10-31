import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

// The demo page is a client component, so its metadata lives here.
export const metadata: Metadata = buildMetadata({
  title: 'Book a Demo of Emily, the AI Receptionist | Setera',
  description:
    'Book a demo to hear Emily, the AI receptionist for contractors and home-service businesses across Canada, answer a call. Pricing is scoped to your call volume.',
  path: '/demo',
});

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
