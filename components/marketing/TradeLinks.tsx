import Link from 'next/link';
import s from './sections.module.css';
import { TRADE_LIST } from '@/lib/trades';

/** Internal links to every trade page (pillar pages ↔ trade pages). */
export default function TradeLinks({ lead = 'Built for your trade:' }: { lead?: string }) {
  return (
    <nav aria-label="Trade pages" className={s.tradeLinks}>
      <p className={s.small}>
        {lead}{' '}
        {TRADE_LIST.map((t, i) => (
          <span key={t.slug}>
            <Link href={`/${t.slug}`} className={s.link}>{t.audience === 'HVAC companies' ? 'HVAC' : t.audience}</Link>
            {i < TRADE_LIST.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>
    </nav>
  );
}
