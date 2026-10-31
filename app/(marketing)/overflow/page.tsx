import type { Metadata } from 'next';
import OverflowForm from './OverflowForm';
import { buildMetadata } from '@/lib/seo';
import styles from './overflow.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'Overflow Network Early Access for Contractors | Setera',
  description: 'Setera is building a verified contractor network across Canada. Join the free early-access list to hear when contractor applications open.',
  path: '/overflow',
});

export default function OverflowPage() {
  return (
    <div className={styles.root}>
      <main className={styles.main}>
        <p className={styles.eyebrow}>SETERA OVERFLOW</p>
        <h1 className={styles.headline}>Good work shouldn&apos;t disappear just because one contractor can&apos;t take it.</h1>
        <p className={styles.lede}>
          Setera is building a verified contractor network. When a Setera client gets a legitimate opportunity they
          can&apos;t or don&apos;t want to take, they may choose to pass it. With the customer&apos;s permission, Setera
          can then try to connect that customer with another verified contractor.
        </p>
        <div className={styles.notice}>
          <p><strong>Overflow is currently being built.</strong> Contractor applications are not open yet.</p>
          <p>Joining the early-access list is free. Joining does not guarantee jobs or job volume. We will email you when contractor applications open.</p>
        </div>
        <OverflowForm />
      </main>
    </div>
  );
}
