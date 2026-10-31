'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { m, type Variants } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import s from '../sections.module.css';
import f from './PillarFlow.module.css';
import MotionProvider from './MotionProvider';
import { useScrollReveal } from './useScrollReveal';
import { CTA, PILLARS } from '@/lib/site-content';

const EASE = [0.16, 1, 0.3, 1] as const;
const LINE_S = 1.1;

const line: Variants = {
  hidden: { scaleX: 0, scaleY: 0, transition: { duration: 0 } },
  visible: { scaleX: 1, scaleY: 1, transition: { duration: LINE_S, ease: EASE } },
};
const card: Variants = {
  hidden: { opacity: 0, y: 12, transition: { duration: 0 } },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay: 0.15 + i * (LINE_S / 2.4) } }),
};
const node: Variants = {
  hidden: { scale: 0.4, transition: { duration: 0 } },
  visible: (i: number) => ({ scale: 1, transition: { type: 'spring', stiffness: 380, damping: 22, delay: 0.1 + i * (LINE_S / 2.4) } }),
};

/** Capture → Convert → Fulfill: the line draws, then each stage appears in turn. */
export default function PillarFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useScrollReveal(ref);
  const animate = state === 'armed' ? 'hidden' : 'visible';

  return (
    <MotionProvider>
      <div ref={ref} className={f.flow}>
        <m.span className={f.lineH} aria-hidden="true" variants={line} initial={false} animate={animate} />
        <m.span className={f.lineV} aria-hidden="true" variants={line} initial={false} animate={animate} />
        {PILLARS.map((p, i) => (
          <m.article key={p.id} data-motion className={`${s.card} ${f.stage}`} custom={i} variants={card} initial={false} animate={animate}>
            <m.span className={f.node} aria-hidden="true" custom={i} variants={node} initial={false} animate={animate}>
              {i + 1}
            </m.span>
            <p className={s.eyebrow}>{p.stage}</p>
            <h3 className={s.h3}>{p.name}</h3>
            <p className={f.kind}>{p.kind}</p>
            <p className={s.small}>{p.summary}</p>
            {p.points.length > 0 && (
              <ul className={s.list}>
                {p.points.map((pt) => <li key={pt}>{pt}</li>)}
              </ul>
            )}
            {p.id === 'overflow' && (
              <Link href={CTA.overflowHref} className={`${s.link} ${f.stageLink}`}>
                {CTA.overflowJoin} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </m.article>
        ))}
      </div>
    </MotionProvider>
  );
}
