import Link from 'next/link';
import { ArrowRight, AlertTriangle, CalendarCheck, Phone, MapPin } from 'lucide-react';
import s from './sections.module.css';
import t from './TradePage.module.css';
import SampleCall from './SampleCall';
import JsonLd from './JsonLd';
import { faqLd, serviceLd } from '@/lib/seo';
import { TalkToEmilyButton } from './EmilyWidget';
import { CONTRACT_TERMS, CTA, FAQ_GENERAL, LOCAL_SEO, SAFETY_NOTE, SALES_TRAINING_COPY, type Faq } from '@/lib/site-content';
import { TRADE_LIST, type Trade } from '@/lib/trades';

const SHARED_FAQ_KEYS = ['How much does it cost?', 'Is there a long-term contract?'];
const EMERGENCY_FAQ_KEY = 'Can Emily handle an emergency call?';

/** One template for every trade page; all substance comes from lib/trades.ts. */
export default function TradePage({ trade }: { trade: Trade }) {
  const sharedKeys = trade.emergency ? [EMERGENCY_FAQ_KEY, ...SHARED_FAQ_KEYS] : SHARED_FAQ_KEYS;
  const faqs: Faq[] = [
    ...trade.faq,
    ...sharedKeys.map((k) => FAQ_GENERAL.find((f) => f.q === k)).filter((f): f is Faq => Boolean(f)),
  ];
  const others = TRADE_LIST.filter((o) => o.slug !== trade.slug);

  return (
    <main>
      <JsonLd
        data={[
          serviceLd({ name: `Setera for ${trade.audience}`, serviceType: trade.keyword, description: trade.intro, path: `/${trade.slug}` }),
          faqLd(faqs),
        ]}
      />
      {/* ── Hero ── */}
      <section className={`${s.section} ${s.pageTop}`} data-surface="dark">
        <div className={s.inner}>
          <p className={s.eyebrow}>Setera for {trade.audience}</p>
          <h1 className={s.h1}>{trade.h1}</h1>
          <p className={s.lede}>{trade.intro}</p>
          <div className={s.actions}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <TalkToEmilyButton className={s.btnGhost}>{CTA.talk}</TalkToEmilyButton>
          </div>
        </div>
      </section>

      <div className={s.toLight} data-surface="dark" aria-hidden="true" />

      {/* ── The calls you can't get to ── */}
      <section className={s.section} data-surface="light">
        <div className={s.inner}>
          <p className={s.eyebrow}>The problem</p>
          <h2 className={s.h2}>Why {trade.audience} miss calls they can’t afford to miss.</h2>
          <div className={s.grid3}>
            {trade.pains.map((p) => (
              <article key={p.title} className={s.card}>
                <h3 className={s.h3}>{p.title}</h3>
                <p className={s.small}>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sample call ── */}
      <section className={s.section} data-surface="light" data-tone="white">
        <div className={s.inner}>
          <p className={s.eyebrow}>Sample call</p>
          <h2 className={s.h2}>A {trade.sample.time} call to {trade.sample.business}.</h2>
          <p className={s.lede}>
            {trade.sample.business} and the caller are invented. This shows how a call becomes an entry in your pipeline.
            {trade.sample.escalation && ' Emergency escalation is optional for each business and only active if you turn it on.'}
          </p>
          <SampleCall call={trade.sample} />
        </div>
      </section>

      {/* ── Urgent vs routine ── */}
      <section className={s.section} data-surface="light">
        <div className={s.inner}>
          <p className={s.eyebrow}>Urgent or routine</p>
          <h2 className={s.h2}>You decide what counts as urgent.</h2>
          <p className={s.lede}>
            Emily captures how urgent every call is. Urgent calls get routed to you right away. Everything else goes
            straight into your pipeline or gets booked on your terms.
          </p>
          {trade.emergency && (
            <div className={`${s.note} ${t.emergencyNote}`}>
              <h3 className={s.h3}>Optional: emergency escalation</h3>
              <p className={s.small}>{trade.emergency.note}</p>
            </div>
          )}
          <div className={s.grid2}>
            <div className={`${s.card} ${t.urgentCard}`}>
              <span className={t.urgentIcon}><AlertTriangle size={20} aria-hidden="true" /></span>
              <h3 className={s.h3}>Typically routed right away</h3>
              <ul className={s.list}>{trade.urgent.map((u) => <li key={u}>{u}</li>)}</ul>
            </div>
            <div className={s.card}>
              <span className={s.cardIcon}><CalendarCheck size={20} aria-hidden="true" /></span>
              <h3 className={s.h3}>Into your pipeline or booked on your terms</h3>
              <ul className={s.list}>{trade.routine.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          </div>
          <p className={`${s.small} ${t.safety}`}>{SAFETY_NOTE}</p>
        </div>
      </section>

      {/* ── Seasonality ── */}
      <section className={s.section} data-surface="dark">
        <div className={s.narrow}>
          <p className={s.eyebrow}>{trade.season.eyebrow}</p>
          <h2 className={s.h2}>{trade.season.heading}</h2>
          {trade.season.paragraphs.map((p) => <p key={p} className={s.body}>{p}</p>)}
        </div>
      </section>

      {/* ── Two leaks for this trade ── */}
      <section className={s.section} data-surface="light">
        <div className={s.inner}>
          <p className={s.eyebrow}>Both ends of the funnel</p>
          <h2 className={s.h2}>Missed calls shrink the top. Weak follow-up shrinks the bottom.</h2>
          <div className={s.grid2}>
            <div className={s.card}>
              <span className={s.cardIcon}><Phone size={20} aria-hidden="true" /></span>
              <h3 className={s.h3}>The top leak</h3>
              <p className={s.small}>{trade.leaks.top} Emily answers every call, 24/7.</p>
            </div>
            <div className={s.card}>
              <span className={s.cardIcon}><CalendarCheck size={20} aria-hidden="true" /></span>
              <h3 className={s.h3}>The bottom leak</h3>
              <p className={s.small}>
                {trade.leaks.bottom} {SALES_TRAINING_COPY.hook} {SALES_TRAINING_COPY.body} {SALES_TRAINING_COPY.trainer}
              </p>
            </div>
          </div>
          <p className={`${s.small} ${t.calcLink}`}>
            Curious what missed calls are worth to you? <Link href={CTA.calculatorHref} className={s.link}>Run the missed call calculator</Link>
          </p>
        </div>
      </section>

      {/* ── Local SEO add-on ── */}
      <section className={s.section} data-surface="light" data-tone="white">
        <div className={s.narrow}>
          <p className={s.eyebrow}><MapPin size={14} aria-hidden="true" /> Add-on</p>
          <h2 className={s.h2}>{LOCAL_SEO.name}</h2>
          <p className={s.lede}>{trade.seoAngle}</p>
          <p className={s.body}>{LOCAL_SEO.description}</p>
          <p className={s.body}><strong>{LOCAL_SEO.rule}</strong></p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={s.section} data-surface="light">
        <div className={s.narrow}>
          <p className={s.eyebrow}>FAQ</p>
          <h2 className={s.h2}>Questions from {trade.audience}.</h2>
          <div className={s.faq}>
            {faqs.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA + internal links ── */}
      <section className={s.section} data-surface="dark">
        <div className={s.narrow}>
          <h2 className={s.h2}>Hear Emily answer a call for a business like yours.</h2>
          <p className={s.body}>Book a demo and we’ll scope a plan to your call volume. {CONTRACT_TERMS}</p>
          <div className={s.actions}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <Link href="/how-it-works" className={s.link}>How it works <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <nav className={t.otherTrades} aria-label="Other trades">
            <p className={s.small}>Setera for other trades:</p>
            <ul>
              {others.map((o) => (
                <li key={o.slug}><Link href={`/${o.slug}`} className={s.link}>{o.label}</Link></li>
              ))}
              <li><Link href="/what-we-do" className={s.link}>What Setera does</Link></li>
            </ul>
          </nav>
        </div>
      </section>
    </main>
  );
}
