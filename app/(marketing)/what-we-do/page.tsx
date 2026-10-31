import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, PhoneIncoming, Handshake, Share2, MapPin } from 'lucide-react';
import s from '@/components/marketing/sections.module.css';
import p from '../pages.module.css';
import DashboardMock from '@/components/marketing/DashboardMock';
import JsonLd from '@/components/marketing/JsonLd';
import TradeLinks from '@/components/marketing/TradeLinks';
import { buildMetadata, serviceLd } from '@/lib/seo';
import { TalkToEmilyButton } from '@/components/marketing/EmilyWidget';
import { AUDIENCE, CANADA, CONTRACT_TERMS, CTA, EMILY_COPY, EMILY_FULL, LOCAL_SEO, PILLARS, SALES_TRAINING_COPY, SALES_TRAINING_FULL } from '@/lib/site-content';

export const metadata: Metadata = buildMetadata({
  title: 'What We Do: AI Receptionist & Sales Training | Setera',
  description:
    'Setera helps contractors and home-service businesses across Canada capture every call with Emily, close more with sales training, and route overflow work.',
  path: '/what-we-do',
});

const [emily, training, overflow] = PILLARS;

export default function WhatWeDoPage() {
  return (
    <main>
      <JsonLd
        data={[
          serviceLd({ name: `Emily, AI receptionist for ${AUDIENCE.name}`, serviceType: 'AI receptionist', description: EMILY_FULL, path: '/what-we-do' }),
          serviceLd({ name: `Sales training for ${AUDIENCE.name}`, serviceType: 'Sales training', description: SALES_TRAINING_FULL, path: '/what-we-do' }),
        ]}
      />
      <section className={`${s.section} ${s.pageTop}`} data-surface="dark">
        <div className={s.inner}>
          <p className={s.eyebrow}>What we do</p>
          <h1 className={s.h1}>Capture every call. Convert more of them. Fulfill what you can’t take.</h1>
          <p className={s.lede}>
            Setera is built for {AUDIENCE.name} {CANADA.short}, {AUDIENCE.examples}. {AUDIENCE.adapts} It covers the
            whole path from the phone ringing to the job getting done, so nothing slips in between.
          </p>
          <ol className={p.steps}>
            {PILLARS.map((pl, i) => (
              <li key={pl.id}>
                <a href={`#${pl.id}`} className={p.stepLink}>
                  <span className={p.stepNum}>0{i + 1}</span>
                  <span><b>{pl.stage}</b> {pl.name}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className={s.toLight} data-surface="dark" aria-hidden="true" />

      {/* ── CAPTURE: Emily ── */}
      <section className={s.section} data-surface="light" id={emily.id}>
        <div className={`${s.inner} ${s.split}`}>
          <div>
            <p className={s.eyebrow}><PhoneIncoming size={14} aria-hidden="true" /> 01 · {emily.stage}</p>
            <h2 className={s.h2}>Emily, your AI receptionist.</h2>
            <p className={s.lede}>{EMILY_COPY.lede}</p>
            <p className={s.body}>{EMILY_COPY.capture} {EMILY_COPY.close}</p>
            <p className={s.body}>
              Most missed calls aren’t ignored. They come in while you’re doing the work that made the phone ring in the
              first place. Urgent calls get routed to you when it matters most, routine work can be booked on your terms,
              and every call comes with a transcript and summary, so you always know what happened.
            </p>
            <ul className={s.list}>
              {emily.points.map((pt) => <li key={pt}>{pt}</li>)}
            </ul>
            <div className={s.actions}>
              <TalkToEmilyButton className={s.btn}>{CTA.talk}</TalkToEmilyButton>
              <Link href="/how-it-works" className={s.link}>How setup works <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
          <DashboardMock />
        </div>
      </section>

      {/* ── CONVERT: Sales training ── */}
      <section className={s.section} data-surface="light" data-tone="white" id={training.id}>
        <div className={s.narrow}>
          <p className={s.eyebrow}><Handshake size={14} aria-hidden="true" /> 02 · {training.stage}</p>
          <h2 className={s.h2}>Sales training for owners and their teams.</h2>
          <p className={s.lede}>{SALES_TRAINING_COPY.hook}</p>
          <p className={s.body}>{SALES_TRAINING_COPY.body} {SALES_TRAINING_COPY.trainer}</p>
          <p className={`${s.small} ${p.cardFoot}`}>An add-on to Emily. Ask about it on your demo call.</p>
        </div>
      </section>

      {/* ── FULFILL: Overflow (early access; status changes need sign-off) ── */}
      <section className={s.section} data-surface="light" id={overflow.id}>
        <div className={`${s.inner} ${s.split}`}>
          <div>
            <p className={s.eyebrow}><Share2 size={14} aria-hidden="true" /> 03 · {overflow.stage}</p>
            <h2 className={s.h2}>The Overflow Network.</h2>
            <span className={s.badge}>Early access · applications not open yet</span>
            <p className={`${s.lede} ${p.afterBadge}`}>{overflow.summary}</p>
            <p className={s.body}>
              Some calls are real jobs you can’t take: you’re booked out for six weeks, it’s outside your service area,
              or it’s work you don’t do or don’t want. Today those jobs just disappear. Overflow is being built so that,
              with the customer’s permission, Setera can try to connect them with another verified contractor instead.
            </p>
            <p className={s.body}>
              Nothing is passed along without the customer saying yes. Joining the early-access list is free and
              doesn’t guarantee jobs or job volume. You’ll get an email when contractor applications open.
            </p>
            <div className={s.actions}>
              <Link href={CTA.overflowHref} className={s.btnGhost}>{CTA.overflowJoin}</Link>
            </div>
          </div>
          <div className={s.card}>
            <h3 className={s.h3}>How Overflow is designed to work</h3>
            <ul className={s.list}>
              {overflow.points.map((pt) => <li key={pt}>{pt}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Local SEO add-on ── */}
      <section className={s.section} data-surface="light" data-tone="white" id="local-seo">
        <div className={s.narrow}>
          <p className={s.eyebrow}><MapPin size={14} aria-hidden="true" /> Add-on</p>
          <h2 className={s.h2}>{LOCAL_SEO.name}</h2>
          <p className={s.lede}>{LOCAL_SEO.description}</p>
          <ul className={s.list}>
            {LOCAL_SEO.points.map((pt) => <li key={pt}>{pt}</li>)}
          </ul>
          <p className={`${s.body} ${p.ruleLine}`}><strong>{LOCAL_SEO.rule}</strong></p>
        </div>
      </section>

      {/* ── How it connects ── */}
      <section className={s.section} data-surface="dark">
        <div className={s.narrow}>
          <p className={s.eyebrow}>How the pieces connect</p>
          <h2 className={s.h2}>One pipeline from the first ring to the finished job.</h2>
          <p className={s.body}>
            Emily captures the call and puts it straight into your pipeline. Your team (with sales training, if you add
            it) works it from Call Captured through Called Back, Estimate Booked and Job Signed. If it’s a job you can’t or
            don’t want to take, Overflow is being built to give it somewhere to go, with the customer’s permission,
            instead of letting it die. And for higher-volume shops, Local SEO works to get you found when homeowners
            search, with Emily there to answer every call it brings in.
          </p>
          <p className={s.body}>{CONTRACT_TERMS} Pricing depends on your call volume, so it’s scoped on a quick demo call.</p>
          <div className={s.actions}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <Link href="/how-it-works" className={s.link}>See how it works <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <TradeLinks />
        </div>
      </section>
    </main>
  );
}
