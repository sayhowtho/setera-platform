import Image from 'next/image';
import Link from 'next/link';
import styles from './Footer.module.css';
import { AUDIENCE_LINE, BRAND, FOOTER_LINKS, logoSrc } from '../../lib/site-content';

export default function Footer() {
  return (
    <footer className={styles.footer} data-surface="dark">
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Image
            src={logoSrc('dark')}
            alt={BRAND.name}
            width={BRAND.logo.width}
            height={BRAND.logo.height}
            sizes="160px"
            className={styles.logo}
          />
          <p className={styles.tagline}>{BRAND.tagline}</p>
          <p className={styles.blurb}>{AUDIENCE_LINE}</p>
        </div>

        <nav className={styles.cols} aria-label="Footer">
          <div>
            <p className={styles.colTitle}>Setera</p>
            <ul>
              {FOOTER_LINKS.product.map(({ href, label }) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className={styles.colTitle}>Trades</p>
            <ul>
              {FOOTER_LINKS.trades.map(({ href, label }) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className={styles.colTitle}>Legal</p>
            <ul>
              {FOOTER_LINKS.legal.map(({ href, label }) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
      <p className={styles.copy}>© {new Date().getFullYear()} Setera. All rights reserved.</p>
    </footer>
  );
}
