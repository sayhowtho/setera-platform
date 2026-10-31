import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import s from '@/components/marketing/sections.module.css';
import p from '../pages.module.css';
import MissedCallCalculator from '@/components/marketing/MissedCallCalculator';
import JsonLd from '@/components/marketing/JsonLd';
import TradeLinks from '@/components/marketing/TradeLinks';
import { buildMetadata, faqLd } from '@/lib/seo';
import { CTA, type Faq } from '@/lib/site-content';

export const metadata: Metadata = buildMetadata({
  title: 'Missed Call Revenue Calculator for Contractors & Home Services',
  description:
    'Estimate what missed calls may be worth to your business each week, from your own numbers. Free for contractors and home-service businesses in Canada.',
  path: '/missed-call-revenue-calculator',
});

const CALC_FAQ: Faq[] = [
  {
    q: 'How is the estimate calculated?',
    a: 'Missed calls per week × the share you think would have been real jobs × your average job value. Everything stays in the same weekly timeframe you entered, so the numbers always add up to what you typed.',
  },
  {
    q: 'Is this what Setera will recover for me?',
    a: 'No. It’s a rough estimate of the value of the opportunities in calls you’re missing, based only on your inputs. It isn’t a projection, a quote or a guarantee of results.',
  },
  {
    q: 'How do I know how many calls I miss?',
    a: 'Check your phone’s recent calls and voicemail for a normal week and count the ones nobody picked up. If you have a call-tracking number or office line, its call log will show missed and abandoned calls.',
  },
  {
    q: 'What should I use for average job value?',
    a: 'Use the typical value of the work you actually want more of, not your biggest job or your smallest service call. If your work varies a lot, run the calculator a couple of times with different values.',
  },
];

export default function CalculatorPage() {
  return (
    <main>
      <JsonLd data={faqLd(CALC_FAQ)} />
      <section className={`${s.section} ${s.pageTop}`} data-surface="dark">
        <div className={s.inner}>
          <div className={p.centerIntro}>
            <p className={s.eyebrow}>Free calculator</p>
            <h1 className={s.h1}>Missed call revenue calculator for contractors and home-service businesses.</h1>
            <p className={s.lede}>
              Every unanswered call is a job you never got the chance to quote. Enter your own numbers for a typical
              week to estimate what those missed opportunities might be worth.
            </p>
          </div>
          <MissedCallCalculator />
        </div>
      </section>

      <div className={s.toLight} data-surface="dark" aria-hidden="true" />

      <section className={s.section} data-surface="light">
        <div className={s.narrow}>
          <p className={s.eyebrow}>Reading the result</p>
          <h2 className={s.h2}>What the number means, and what it doesn’t.</h2>
          <p className={s.body}>
            The calculator multiplies three things you know better than anyone: how many calls go unanswered in a week,
            what share of those would have been real work, and what a typical job is worth. The result is the estimated
            value of the opportunities hiding in those missed calls.
          </p>
          <p className={s.body}>
            It doesn’t account for jobs you’d have lost anyway, work you’d have turned down, or how many quotes you
            usually close. That’s the second leak: even answered calls only turn into revenue if somebody follows up
            and closes. Treat the number as a reason to look at your call log, not as a forecast.
          </p>
          <p className={s.body}>
            Missed calls cluster in predictable places for trades: evenings and weekends, storm and cold-snap surges,
            lunch breaks, and any time the owner is on a roof, under a sink or in a crawlspace. Emily, Setera’s AI
            receptionist, is built to answer those calls and log every one into your pipeline.
          </p>
          <div className={s.actions}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <Link href="/how-it-works" className={s.link}>How Setera works <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>

          <TradeLinks lead="How missed calls play out in your trade:" />

          <h2 className={`${s.h2} ${p.faqHead}`}>Calculator FAQ</h2>
          <div className={s.faq}>
            {CALC_FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
