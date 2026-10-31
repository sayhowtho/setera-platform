import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Phone, CalendarCheck, AlertTriangle, ArrowRight, Home as HomeIcon, Droplet, Wind, Zap } from 'lucide-react';
import s from '@/components/marketing/sections.module.css';
import h from './homepage.module.css';
import Hero from '@/components/marketing/Hero';
import JsonLd from '@/components/marketing/JsonLd';
import { buildMetadata, faqLd, serviceLd } from '@/lib/seo';
import type { SampleCallData } from '@/components/marketing/SampleCall';
import AnimatedSampleCall from '@/components/marketing/motion/AnimatedSampleCall';
import PillarFlow from '@/components/marketing/motion/PillarFlow';
import DashboardMock from '@/components/marketing/DashboardMock';
import MissedCallCalculator from '@/components/marketing/MissedCallCalculator';
import { TalkToEmilyButton } from '@/components/marketing/EmilyWidget';
import { AUDIENCE, CANADA, CONTRACT_TERMS, MISS_LINE, CTA, EMILY_COPY, EMILY_FULL, FAQ_GENERAL, LOCAL_SEO, SAFETY_CHECK_QUESTION, SHUTOFF_HELP } from '@/lib/site-content';

const TRADES = [
  {
    icon: HomeIcon,
    href: '/roofers',
    trade: 'Roofing',
    scenario: 'A hailstorm rolls through Calgary on Saturday. By Sunday night you’ve had more calls than you can return, and you’re on a roof for most of them.',
    emily: 'Emily answers every one, captures who’s calling, what the damage is and whether it’s an active leak, and puts each one straight into your pipeline.',
  },
  {
    icon: Droplet,
    href: '/plumbers',
    trade: 'Plumbing',
    scenario: 'It’s 11 PM in January and a pipe has burst in a basement in Winnipeg. The homeowner is calling every plumber on the first page of Google.',
    emily: `Emily answers and captures that it’s an emergency, and the call gets routed to you right away. If you turn on emergency escalation, she can ${SHUTOFF_HELP} and call and text your on-call plumber until they pick up.`,
  },
  {
    icon: Wind,
    href: '/hvac',
    trade: 'HVAC',
    scenario: 'The first real cold snap hits Ottawa and every furnace that skipped its tune-up quits on the same night. No heat calls stack up behind maintenance bookings.',
    emily: 'Emily captures how urgent each call is. No-heat calls get routed right away; routine tune-ups get booked on your terms.',
  },
  {
    icon: Zap,
    href: '/electricians',
    trade: 'Electrical',
    scenario: 'One caller smells burning near the panel. The next wants a quote on an EV charger. Both call while you’re mid rough-in at a reno in Halifax.',
    emily: 'Emily captures both. The possible hazard is flagged urgent and routed right away; the EV charger quote goes straight into your pipeline.',
  },
];

const HOME_SAMPLE_CALL: SampleCallData = {
  lines: [
    { who: 'Emily', text: 'Thanks for calling Northline Plumbing & Heating, this is Emily. How can I help?' },
    { who: 'Caller', text: 'Our water heater just burst. There’s water spreading across the utility room floor.' },
    { who: 'Emily', text: `I’m sorry, let’s get you some help. First: ${SAFETY_CHECK_QUESTION}` },
    { who: 'Caller', text: 'No one’s hurt. The panel is on the other wall and that side is dry.' },
    { who: 'Emily', text: 'Okay. Can you reach your main water shut-off without walking through any water?' },
    { who: 'Caller', text: 'Yes, it’s by the stairs.' },
    { who: 'Emily', text: 'Then I’ll talk you through turning it off. Stay out of the water, and once it’s off I’ll reach our on-call plumber. Please stay on the line.' },
  ],
  captured: [
    { label: 'Caller', value: 'Jordan P.' },
    { label: 'Address (if given)', value: '123 Sample St.' },
    { label: 'Need', value: 'Water heater burst, water on the utility room floor' },
    { label: 'Safety check', value: 'No one hurt, no water near electrical' },
    { label: 'Urgency', value: 'Active flooding: flagged urgent' },
  ],
  entryTitle: 'Jordan P. · water heater burst',
  entryNote: 'Full transcript and summary attached. Safety check clear; caller closed the main shut-off from a dry spot.',
  escalation: [
    'Called and texted the on-call contact at 9:04 PM',
    'Stayed on the line until they picked up, then hung up',
    'Call recorded and logged',
  ],
  next: 'Connected to on-call. Next: book the repair.',
};

export const metadata: Metadata = buildMetadata({
  title: 'AI Receptionist for Contractors & Home Services in Canada | Setera',
  description:
    'Emily, Setera’s AI receptionist for contractors and home-service businesses across Canada, answers every call 24/7 and fills your pipeline. Book a demo.',
  path: '/',
});

export default function HomePage() {
  return (
    <main>
      <JsonLd
        data={[
          serviceLd({
            name: `Emily, AI receptionist for ${AUDIENCE.name}`,
            serviceType: 'AI receptionist',
            description: EMILY_FULL,
            path: '/',
          }),
          faqLd(FAQ_GENERAL),
        ]}
      />
      <Hero />

      {/* Dark → light hand-off into the first light section. */}
      <div className={s.toLight} data-surface="dark" aria-hidden="true" />

      {/* ═══ MEET EMILY (Capture) ═══ */}
      <section className={s.section} data-surface="light" id="emily">
        <div className={`${s.inner} ${s.split}`}>
          <div>
            <p className={s.eyebrow}>Capture</p>
            <h2 className={s.h2}>Meet Emily, the receptionist who picks up when you can’t.</h2>
            <p className={s.lede}>{EMILY_COPY.lede}</p>
            <p className={s.body}>{EMILY_COPY.capture} {EMILY_COPY.close}</p>
            <ul className={s.list}>
              <li>Urgent calls routed when it matters most</li>
              <li>A transcript and summary for every call</li>
              <li>Appointments set on your terms</li>
            </ul>
            <div className={s.actions}>
              <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
              <TalkToEmilyButton className={s.link}>{CTA.talk} <ArrowRight size={16} aria-hidden="true" /></TalkToEmilyButton>
            </div>
          </div>
          <DashboardMock />
        </div>
      </section>

      {/* ═══ THE TWO LEAKS ═══ */}
      <section className={s.section} data-surface="light" data-tone="white" id="two-leaks">
        <div className={s.inner}>
          <p className={s.eyebrow}>Why jobs slip away</p>
          <h2 className={s.h2}>Revenue leaks at the top and at the bottom.</h2>
          <p className={s.lede}>
            Most contractors and home-service businesses don’t lose work because they said no. They lose it in two places, and the two
            multiply each other.
          </p>
          <div className={h.leakLayout}>
            <div className={s.grid2}>
              <div className={s.card}>
                <span className={s.cardIcon}><Phone size={20} aria-hidden="true" /></span>
                <h3 className={s.h3}>Top leak: calls nobody answers</h3>
                <p className={s.small}>
                  You’re on a ladder, in a crawlspace or with another customer. The caller hears voicemail and dials the
                  next contractor on Google. You never find out the job existed. Every missed call shrinks the top of
                  your funnel before you get a chance to quote.
                </p>
              </div>
              <div className={s.card}>
                <span className={s.cardIcon}><CalendarCheck size={20} aria-hidden="true" /></span>
                <h3 className={s.h3}>Bottom leak: leads that never close</h3>
                <p className={s.small}>
                  The call got answered, but the callback came two days late, the estimate never got followed up, or
                  the price conversation went sideways. Weak follow-up and closing shrink the bottom of the funnel, no
                  matter how many calls come in.
                </p>
              </div>
            </div>
            <figure className={h.leakPhoto}>
              <Image
                src="/act1-phone-buzzing.png"
                alt="A contractor talking with a homeowner on site while an incoming call buzzes unanswered in his pocket"
                width={1536}
                height={1024}
                sizes="(min-width: 960px) 360px, 100vw"
                className={h.photo}
              />
            </figure>
          </div>

          <div className={`${s.note} ${h.example}`}>
            <p className={h.exampleLabel}><AlertTriangle size={14} aria-hidden="true" /> Illustrative example, not a projection</p>
            <p className={h.exampleIntro}>Picture one month of calls for a small shop. The numbers are made up to show how the two leaks interact.</p>
            <div className={h.exampleRows}>
              <p><span>Both leaks open</span> 50 calls × 75% answered × 1 in 2 real jobs × 1 in 3 closed ≈ <strong>6 jobs</strong></p>
              <p><span>Top leak closed</span> 50 calls × 100% answered × 1 in 2 real jobs × 1 in 3 closed ≈ <strong>8 jobs</strong></p>
              <p><span>Both leaks closed</span> 50 calls × 100% answered × 1 in 2 real jobs × 1 in 2 closed ≈ <strong>12 jobs</strong></p>
            </div>
            <p className={s.small}>
              Same phone, same market. Your numbers will be different. The point is that answering more calls and
              closing more of them compound, which is why Setera works on both: Emily for the top, sales training for
              the bottom.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ A CALL BECOMES A PIPELINE ENTRY ═══ */}
      <section className={s.section} data-surface="light" id="how-a-call-works">
        <div className={s.inner}>
          <p className={s.eyebrow}>From ring to pipeline</p>
          <h2 className={s.h2}>What happens when a homeowner calls at 9 PM.</h2>
          <p className={s.lede}>
            Here’s a sample call, start to finish. The caller and details are invented to show how a call becomes a
            pipeline entry.
          </p>
          <AnimatedSampleCall call={HOME_SAMPLE_CALL} time="9:04 PM" />
          <p className={s.small}>
            Sample call for illustration. Emergency escalation is optional for each business and only active if you
            turn it on. Emily is customized around your business.
          </p>
        </div>
      </section>

      {/* ═══ CAPTURE → CONVERT → FULFILL ═══ */}
      <section className={s.section} data-surface="dark" id="capture-convert-fulfill">
        <div className={s.inner}>
          <p className={s.eyebrow}>How Setera fits together</p>
          <h2 className={s.h2}>Capture. Convert. Fulfill.</h2>
          <p className={s.lede}>
            Three pieces, one job: make sure nothing slips between the phone ringing and the work getting done.
          </p>
          <PillarFlow />
          <div className={`${s.note} ${h.seoNote}`}>
            <h3 className={s.h3}>{LOCAL_SEO.name}</h3>
            <p className={s.small}>{LOCAL_SEO.description} {LOCAL_SEO.rule}</p>
          </div>
          <div className={s.actions}>
            <Link href="/what-we-do" className={s.btnGhost}>See what Setera does</Link>
            <Link href="/how-it-works" className={s.link}>How it works <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      {/* ═══ TRADE SCENARIOS ═══ */}
      <section className={s.section} data-surface="light" id="trades">
        <div className={s.inner}>
          <p className={s.eyebrow}>Built for the trades</p>
          <h2 className={s.h2}>Different trades, different calls.</h2>
          <p className={s.lede}>
            Setera works with {AUDIENCE.name} {CANADA.short}, {AUDIENCE.examples}. Emily is customized around your
            business, including what counts as urgent for you.
          </p>
          <div className={s.grid2}>
            {TRADES.map(({ icon: Icon, href, trade, scenario, emily }) => (
              <article key={trade} className={s.card}>
                <span className={s.cardIcon}><Icon size={20} aria-hidden="true" /></span>
                <h3 className={s.h3}>{trade}</h3>
                <p className={s.small}>{scenario}</p>
                <p className={`${s.small} ${h.emilyLine}`}><b>With Emily:</b> {emily}</p>
                <Link href={href} className={`${s.link} ${h.tradeLink}`}>Setera for {trade.toLowerCase() === 'hvac' ? 'HVAC' : trade.toLowerCase()} <ArrowRight size={16} aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
          <p className={`${s.small} ${h.alsoServe}`}>{AUDIENCE.adapts}</p>
        </div>
      </section>

      {/* ═══ CALCULATOR ═══ */}
      <section className={s.section} data-surface="dark" id="calculator">
        <div className={s.inner}>
          <div className={h.calcIntro}>
            <p className={s.eyebrow}>The math</p>
            <h2 className={s.h2}>What are missed calls worth to your business?</h2>
            <p className={s.body}>
              Plug in your own numbers for a typical week. The result is a rough estimate based only on what you enter.
            </p>
          </div>
          <MissedCallCalculator />
          <p className={`${s.small} ${h.calcMore}`}>
            Want the longer version? <Link href={CTA.calculatorHref} className={s.link}>Open the missed call revenue calculator</Link>
          </p>
        </div>
      </section>

      {/* ═══ NO TESTIMONIALS ═══ */}
      <section className={s.section} data-surface="dark" data-tone="raised" id="talk-to-emily">
        <div className={`${s.inner} ${s.split}`}>
          <div>
            <p className={s.eyebrow}>No testimonials</p>
            <h2 className={s.h2}>Don’t take our word for it. Talk to Emily.</h2>
            <p className={s.lede}>
              Anyone can say their AI is amazing. Rather than lead with testimonials, Setera lets you hear the product.
            </p>
            <p className={s.body}>
              Emily is live on every page of this site. Ask her what Setera does. Pretend you’re a homeowner with a leak.
              Interrupt her, ask something awkward, and decide for yourself. The Emily who answers your phone is set up
              around your business, your workflows, your customers and the voice you want your company to have.
            </p>
            <div className={s.actions}>
              <TalkToEmilyButton className={s.btn}>{CTA.talk}</TalkToEmilyButton>
              <Link href={CTA.demoHref} className={s.link}>{CTA.demo} <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
          <figure className={h.photoFrame}>
            <Image
              src="/act6-tailgate-laptop.png"
              alt="A contractor checking his Setera dashboard on a laptop on his truck tailgate outside a job site"
              width={1535}
              height={1024}
              sizes="(min-width: 960px) 560px, 100vw"
              className={h.photo}
            />
          </figure>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className={s.section} data-surface="light" id="faq">
        <div className={s.narrow}>
          <p className={s.eyebrow}>FAQ</p>
          <h2 className={s.h2}>Questions contractors ask.</h2>
          <div className={s.faq}>
            {FAQ_GENERAL.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CLOSE ═══ */}
      <section className={`${s.section} ${h.close}`} data-surface="dark">
        <div className={s.narrow}>
          <h2 className={s.h2}>{MISS_LINE}</h2>
          <p className={s.body}>
            See Emily answer a call for a business like yours and how the pipeline works behind her. {CONTRACT_TERMS}
          </p>
          <div className={`${s.actions} ${h.closeActions}`}>
            <Link href={CTA.demoHref} className={s.btn}>{CTA.demo}</Link>
            <TalkToEmilyButton className={s.btnGhost}>{CTA.talk}</TalkToEmilyButton>
          </div>
        </div>
      </section>
    </main>
  );
}
