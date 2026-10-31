'use client';
import { useRef, useSyncExternalStore } from 'react';
import { m, type Variants } from 'framer-motion';
import { PhoneIncoming, ListChecks, KanbanSquare, Check } from 'lucide-react';
import s from '../sections.module.css';
import c from '../SampleCall.module.css';
import a from './AnimatedSampleCall.module.css';
import MotionProvider from './MotionProvider';
import { useScrollReveal } from './useScrollReveal';
import type { SampleCallData } from '../SampleCall';

const EASE = [0.16, 1, 0.3, 1] as const;

// Each card has its own timeline, started when that card scrolls into view
// (so stacked mobile cards don't play off-screen). When the three cards sit
// side by side (≥960px) they come into view together, so cards 2 and 3 are
// offset to follow on: ring → transcript → captured fields → pipeline row.
const WIDE = '(min-width: 960px)';
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getWide = () => window.matchMedia(WIDE).matches;
const getWideServer = () => false;

function timeline(call: SampleCallData, wide: boolean) {
  const lineGap = 0.35, fieldGap = 0.22, escGap = 0.28;
  const card1 = 0.5 + call.lines.length * lineGap;
  const card2 = 0.2 + (call.captured.length + 1) * fieldGap;
  const o2 = wide ? card1 : 0;
  const o3 = wide ? card1 + card2 : 0;
  const row = o3 + 0.2;
  const esc0 = row + 0.45;
  return {
    line: (i: number) => 0.5 + i * lineGap,
    field: (i: number) => o2 + 0.2 + i * fieldGap,
    row,
    esc: (i: number) => esc0 + i * escGap,
    next: esc0 + (call.escalation?.length ?? 0) * escGap + 0.2,
  };
}

const item: Variants = {
  hidden: { opacity: 0, y: 8, transition: { duration: 0 } },
  visible: (delay: number) => ({ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay } }),
};
const landing: Variants = {
  hidden: { opacity: 0, y: -18, scale: 0.98, transition: { duration: 0 } },
  visible: (delay: number) => ({ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24, delay } }),
};
const ring: Variants = {
  hidden: { scale: 1, transition: { duration: 0 } },
  visible: { scale: [1, 1.18, 1, 1.18, 1], transition: { duration: 1.1, ease: 'easeInOut' } },
};

/** Illustrative only: invented caller, labelled as such by the section. */
export default function AnimatedSampleCall({ call, time }: { call: SampleCallData; time: string }) {
  const r1 = useRef<HTMLLIElement>(null);
  const r2 = useRef<HTMLLIElement>(null);
  const r3 = useRef<HTMLLIElement>(null);
  const s1 = useScrollReveal(r1, 0.3);
  const s2 = useScrollReveal(r2, 0.3);
  const s3 = useScrollReveal(r3, 0.3);
  const wide = useSyncExternalStore(subscribeWide, getWide, getWideServer);
  const t = timeline(call, wide);
  const fields = [...call.captured, { label: 'Pipeline', value: 'New opportunity' }];
  const mm = (st: string) => ({ initial: false as const, animate: st === 'armed' ? 'hidden' : 'visible' });

  return (
    <MotionProvider>
      <ol className={c.flow}>
        <li ref={r1} className={s.card}>
          <m.span className={`${s.cardIcon} ${a.ring}`} variants={ring} {...mm(s1)}>
            <PhoneIncoming size={20} aria-hidden="true" />
          </m.span>
          <h3 className={s.h3}>1. The call</h3>
          <p className={a.callMeta}>Incoming call · {time} · <span className={a.sample}>Illustration</span></p>
          <div className={c.transcript} aria-label="Sample transcript excerpt">
            {call.lines.map((l, i) => (
              <m.p key={i} custom={t.line(i)} variants={item} {...mm(s1)}><b>{l.who}</b> {l.text}</m.p>
            ))}
          </div>
        </li>
        <li ref={r2} className={s.card}>
          <span className={s.cardIcon}><ListChecks size={20} aria-hidden="true" /></span>
          <h3 className={s.h3}>2. What Emily captures</h3>
          <dl className={c.fields}>
            {fields.map((f, i) => (
              <m.div key={f.label} custom={t.field(i)} variants={item} {...mm(s2)}>
                <dt><Check size={12} aria-hidden="true" className={a.tick} /> {f.label}</dt>
                <dd>{f.value}</dd>
              </m.div>
            ))}
          </dl>
        </li>
        <li ref={r3} className={s.card}>
          <span className={s.cardIcon}><KanbanSquare size={20} aria-hidden="true" /></span>
          <h3 className={s.h3}>3. Your pipeline</h3>
          <div className={a.board}>
            <p className={a.boardHead}><span className={c.pipeStage}>Call Captured</span></p>
            <m.div className={c.pipeRow} custom={t.row} variants={landing} {...mm(s3)}>
              <p className={c.pipeTitle}>{call.entryTitle}</p>
              <p className={s.small}>{call.entryNote}</p>
              {call.escalation && (
                <div className={c.escalation}>
                  <p className={c.escalationLabel}>Emergency escalation (turned on)</p>
                  <ol>
                    {call.escalation.map((step, i) => (
                      <m.li key={step} custom={t.esc(i)} variants={item} {...mm(s3)}>{step}</m.li>
                    ))}
                  </ol>
                </div>
              )}
              <m.p className={c.pipeNext} custom={t.next} variants={item} {...mm(s3)}>{call.next}</m.p>
            </m.div>
            <div className={a.ghostRow} aria-hidden="true" />
            <div className={a.ghostRow} aria-hidden="true" />
          </div>
        </li>
      </ol>
    </MotionProvider>
  );
}
