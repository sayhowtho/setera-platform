'use client';
import { useRef, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Phone, Calendar, Bell, Eye } from 'lucide-react';
import styles from '@/app/(marketing)/home.module.css';
import { BRAND, CTA, HERO, MISS_LINE, logoSrc } from '@/lib/site-content';
import { useEmily, useHideEmilyWhileVisible } from './EmilyWidget';

// Icons pair with HERO.checklist (copy lives in lib/site-content.ts).
const checklistIcons = [Phone, Calendar, Bell, Eye];
const heroChecklist = HERO.checklist.map((text, i) => ({ icon: checklistIcons[i], text }));

// Decorative card positions (desktop only); copy lives in HERO.cards.
const cardPositions = [
  { top: '9%', right: '6%' },
  { top: '27%', right: '25%' },
  { top: '48%', right: '4%' },
  { top: '67%', right: '23%' },
  { top: '85%', right: '6%' },
];

/* ═══ ACT 1 — HERO ═══
   Real HTML/CSS content, no baked-in image text. Rendered immediately with
   no scroll-triggered animation (it's above the fold already), and no
   absolute/fixed positioning on any of the actual content — only the
   background image/overlay layers, and the purely decorative floating
   cards, use position: absolute. The cards' entrance + float loop are pure
   CSS (no Framer Motion, no JS dependency at all) — see .heroCard in
   home.module.css. The wordmark is the brand logo image; the page's real
   <h1> is the keyword line beneath it. */
export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { talkToEmily } = useEmily();
  // The Emily widget stays tucked away while the hero is on screen.
  useHideEmilyWhileVisible(ref);

  return (
    <section className={styles.heroSection} ref={ref} data-surface="dark">
      <div className={styles.heroBg}>
        <Image
          src="/hero-vancouver-v2.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.heroBgImg}
        />
      </div>
      <div className={styles.heroOverlay} />

      <div className={styles.heroCardsLayer} aria-hidden="true">
        {HERO.cards.map(({ title, sub }, i) => (
          <div
            key={title}
            className={styles.heroCard}
            style={{ ...cardPositions[i], '--stagger': `${i * 100}ms` } as unknown as CSSProperties}
          >
            <div className={styles.heroCardTitle}>{title}</div>
            <div className={styles.heroCardSub}>{sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.heroContent}>
        <Image
          src={logoSrc('dark')}
          alt={BRAND.name}
          width={BRAND.logo.width}
          height={BRAND.logo.height}
          priority
          sizes="(min-width: 900px) 520px, 90vw"
          className={styles.heroLogo}
        />
        <div className={styles.heroUnderline} />
        <h1 className={styles.heroH1}>{HERO.h1}</h1>
        <p className={styles.heroTagline}>{BRAND.tagline}</p>
        <p className={styles.heroMissLine}>{MISS_LINE}</p>
        <p className={styles.heroSubhead}>{HERO.subhead}</p>
        <p className={styles.heroBody}>{HERO.body}</p>

        <div className={styles.heroChecklist}>
          {heroChecklist.map(({ icon: Icon, text }) => (
            <div key={text} className={styles.heroChecklistItem}>
              <span className={styles.heroChecklistIcon}><Icon size={18} /></span>
              <span className={styles.heroChecklistText}>{text}</span>
            </div>
          ))}
        </div>

        <div className={styles.heroButtons}>
          <Link href={CTA.demoHref} className={styles.heroBtnPrimary}>{CTA.demo}</Link>
          <button type="button" onClick={talkToEmily} className={styles.heroBtnSecondary}>{CTA.talk}</button>
        </div>
      </div>
    </section>
  );
}
