import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import s from '@/components/marketing/sections.module.css';
import p from '../pages.module.css';
import { TalkToEmilyButton } from '@/components/marketing/EmilyWidget';
import JsonLd from '@/components/marketing/JsonLd';
import TradeLinks from '@/components/marketing/TradeLinks';
import { buildMetadata, faqLd } from '@/lib/seo';
import { AUDIENCE, CANADA, CONTRACT_TERMS, CTA, FAQ_GENERAL, LOCAL_SEO, PLAN_FITS, PRICING_ANSWER } from '@/lib/site-content';

export const metadata: Metadata = buildMetadata({
  title: 'How It Works & Plans for Contractors & Home Services | Setera',
  description: `Plans for Emily, an AI receptionist for contractors and home services. ${CONTRACT_TERMS}`,
  path: '/how-it-works',
});

const STEPS = [
  {
    title: 'Book a demo',
    body: 'A short call where you hear Emily handle a call for a business like yours and see the pipeline behind her. We ask about your trade and how many calls you get, so the plan fits.',
  },
  {
    title: 'Set Emily up for your business',
    body: 'Emily is customized around your business, your customers and the voice you want your company to have, including what counts as urgent for you. A burst pipe and a quote request should never be handled the same way.',
  },
  {
    title: 'Forward your calls',
    body: 'Your business calls are forwarded to Emily. From then on, every call gets answered, 24/7.',
  },
  {
    title: 'Work the pipeline',
    body: 'Every opportunity goes straight into your Setera pipeline with a transcript and summary. Urgent calls get routed when it matters most. You move leads from Call Captured to Called Back, Estimate Booked and Job Signed.',
  },
];

const FAQ_KEYS = [
  'How much does it cost?',
  'Is there a long-term contract?',
  'What happens with urgent calls?',
  'Are calls recorded?',
  'What is the Local SEO add-on?',
  'Do you serve my province?',
];

export default function HowItWorksPage() {
  const faqs = FAQ_GENERAL.filter((f) => FAQ_KEYS.includes(f.q));
  return (
    <main>
      <JsonLd data={faqLd(faqs)} />
      <section className={`${s.section} ${s.pageTop}`} data-surface="dark">
        <div className={s.inner}>
          <p className={s.eyebrow}>How it works</p>
          <h1 className={s.h1}>How Setera works, and which plan fits your call volume.</h1>
          <p className={s.lede}>
            Setera sets up Emily, an AI receptionist for {AUDIENCE.name} {CANADA.short}, around how your business already
            runs, with no software to learn on day one. Plans are scoped to how many calls you get, so the first step is
            a quick demo. {CONTRACT_TERMS}
          </p>
          <div className={s.actions}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <TalkToEmilyButton className={s.link}>{CTA.talk} first <ArrowRight size={16} aria-hidden="true" /></TalkToEmilyButton>
          </div>
        </div>
      </section>

      <div className={s.toLight} data-surface="dark" aria-hidden="true" />

      <section className={s.section} data-surface="light" id="steps">
        <div className={s.inner}>
          <p className={s.eyebrow}>Getting started</p>
          <h2 className={s.h2}>From first call to fully set up.</h2>
          <ol className={`${s.grid4} ${p.stepGrid}`}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.card}>
                <span className={p.stepNumBig}>{String(i + 1).padStart(2, '0')}</span>
                <h3 className={s.h3}>{st.title}</h3>
                <p className={s.small}>{st.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={s.section} data-surface="light" data-tone="white" id="plans">
        <div className={s.inner}>
          <p className={s.eyebrow}>Plans</p>
          <h2 className={s.h2}>Plans fit to your call volume.</h2>
          <p className={s.lede}>{PRICING_ANSWER} {CONTRACT_TERMS}</p>
          <div className={`${s.grid2} ${p.planGrid}`}>
            {PLAN_FITS.map((plan) => (
              <article key={plan.name} className={s.card}>
                <h3 className={s.h3}>{plan.name}</h3>
                <p className={s.small}>{plan.who}</p>
                <p className={p.planLabel}>What’s included</p>
                <ul className={s.list}>
                  {plan.includes.map((it) => <li key={it}>{it}</li>)}
                </ul>
                <p className={p.planLabel}>Available add-ons</p>
                <p className={s.small}>{plan.addOns.join(' · ')}</p>
                <div className={s.actions}>
                  <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
                </div>
              </article>
            ))}
          </div>
          <div className={`${s.note} ${p.seoBox}`}>
            <h3 className={s.h3}>{LOCAL_SEO.name}</h3>
            <p className={s.small}>{LOCAL_SEO.description}</p>
            <p className={`${s.small} ${p.ruleLine}`}><strong>{LOCAL_SEO.rule}</strong></p>
          </div>
        </div>
      </section>

      <section className={s.section} data-surface="light" id="faq">
        <div className={s.narrow}>
          <p className={s.eyebrow}>FAQ</p>
          <h2 className={s.h2}>Plans and setup questions.</h2>
          <div className={s.faq}>
            {faqs.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className={`${s.small} ${p.ruleLine}`}>
            Curious what missed calls cost you today? <Link href={CTA.calculatorHref} className={s.link}>Run the missed call calculator</Link>
          </p>
        </div>
      </section>

      <section className={s.section} data-surface="dark">
        <div className={s.narrow}>
          <h2 className={s.h2}>Find out which plan fits on a quick call.</h2>
          <p className={s.body}>Hear Emily, see the pipeline, and get a plan scoped to your call volume. {CONTRACT_TERMS}</p>
          <div className={s.actions}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <Link href="/what-we-do" className={s.link}>What Setera does <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <TradeLinks />
        </div>
      </section>
    </main>
  );
}
