import type { Metadata } from 'next';
import Link from 'next/link';
import s from '@/components/marketing/sections.module.css';
import p from '../pages.module.css';
import { CANCELLATION, CONTACT } from '@/lib/site-content';
import { buildMetadata } from '@/lib/seo';

// Operator matches the Privacy Policy (Alex Rivera, operating as Setera).
// Governing province: Saskatchewan. Contact email comes from CONTACT.
export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service | Setera',
  description: 'The terms that govern use of the Setera website and the Setera AI receptionist service for contractors and home-service businesses across Canada.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <main>
      <section className={`${s.section} ${s.pageTop}`} data-surface="light">
        <div className={s.narrow}>
          <h1 className={s.h1}>Terms of Service</h1>
          <div className={p.prose}>
            <p>
              These Terms of Service (“Terms”) govern your use of the Setera website at heysetera.com and the Setera
              service, including Emily, Setera’s AI receptionist, the Setera pipeline and dashboard, and any add-ons
              (together, the “Service”). By using the Service you agree to these Terms. If you’re using the Service for
              a business, you confirm you’re authorized to accept these Terms on its behalf.
            </p>

            <h2>1. Who we are</h2>
            <p>
              The Service is provided by Alex Rivera, operating as Setera (“Setera”, “we”, “us”).
              Questions about these Terms can be sent to <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
            </p>

            <h2>2. The Service</h2>
            <p>
              Setera answers and records calls to your business line using an AI receptionist, transcribes and
              summarizes those calls, routes calls you mark as urgent, and logs them into a pipeline you can access.
              Optional add-ons may include sales training and, for eligible plans, local search (SEO) services, which
              are only offered together with Emily. The Overflow Network is in early access and is not part of the
              Service unless and until we tell you otherwise in writing.
            </p>
            <p>
              The specific plan, add-ons and fees for your business are set out in your order, proposal or account
              (your “Plan”).
            </p>

            <h2>3. Your responsibilities</h2>
            <ul>
              <li>Give us accurate information about your business, services, service area and how calls should be handled.</li>
              <li>Keep your account login secure and tell us promptly about any unauthorized access.</li>
              <li>Use the Service lawfully, including laws that apply to recording calls and handling callers’ personal information in your province.</li>
              <li>Review urgent-call notifications and your pipeline. The Service supports your business; it does not replace your judgment, emergency services or your obligations to your customers.</li>
            </ul>

            <h2>4. Calls, recordings and data</h2>
            <p>
              Calls handled by Emily may be recorded, transcribed and summarized so the Service can work. How we
              collect, use and protect personal information is described in our <Link href="/privacy">Privacy Policy</Link>.
            </p>

            <h2>5. AI limitations</h2>
            <p>
              Emily is an AI system. She may occasionally misunderstand a caller, misclassify a call or produce an
              inaccurate summary. Setera does not guarantee that every call will be classified or routed correctly, and
              does not guarantee any particular business outcome, number of leads, jobs or revenue.
            </p>

            <h2>6. Term and cancellation</h2>
            <p>
              There is no long-term contract. Your Plan continues on its billing cycle until you or we cancel it. You
              can cancel anytime by giving {CANCELLATION.noticeDays} days’ written notice to {CONTACT.email}. Your Plan
              and its fees continue through the end of the {CANCELLATION.noticeDays}-day notice period. There are no
              termination fees. We may suspend or end the Service if fees go unpaid
              or the Service is misused.
            </p>

            <h2>7. Fees</h2>
            <p>
              Fees are as set out in your Plan. Fees already paid are non-refundable, including for any partial billing
              period.
              Applicable Canadian taxes are added where required.
            </p>

            <h2>8. Disclaimers and limitation of liability</h2>
            <p>
              To the extent permitted by law, the Service is provided “as is”, and Setera is not liable for indirect or
              consequential losses, including lost profits or lost business opportunities, arising from use of or
              inability to use the Service.
            </p>

            <h2>9. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. If we make material changes we’ll update the date on this
              page and let active clients know by email where appropriate.
            </p>

            <h2>10. Governing law</h2>
            <p>
              These Terms are governed by the laws of the Province of Saskatchewan and the federal laws of Canada that
              apply there.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
