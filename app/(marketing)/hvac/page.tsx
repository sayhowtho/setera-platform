import type { Metadata } from 'next';
import TradePage from '@/components/marketing/TradePage';
import { TRADES } from '@/lib/trades';
import { buildMetadata } from '@/lib/seo';

const trade = TRADES['hvac'];

export const metadata: Metadata = buildMetadata({
  title: trade.metaTitle,
  description: trade.metaDescription,
  path: `/${trade.slug}`,
});

export default function Page() {
  return <TradePage trade={trade} />;
}
