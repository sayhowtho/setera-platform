import type { Metadata } from 'next';
import styles from './privacy.module.css';
import { CONTACT } from '@/lib/site-content';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy | Setera',
  description: 'How Setera collects, uses, stores and discloses personal information, including call recordings and transcripts, under Canadian privacy law (PIPEDA).',
  path: '/privacy',
});

const sections = [
  { id: 'who-we-are', title: 'Who We Are' },
  { id: 'information-we-collect', title: 'Information We Collect' },
  { id: 'how-we-collect-information', title: 'How We Collect Information' },
  { id: 'how-we-use-information', title: 'How We Use Information' },
  { id: 'how-we-store-information', title: 'How We Store Information' },
  { id: 'data-retention', title: 'Data Retention' },
  { id: 'third-party-service-providers', title: 'Third-Party Service Providers' },
  { id: 'cross-border-data-transfer', title: 'Cross-Border Data Transfer' },
  { id: 'your-rights-under-pipeda', title: 'Your Rights Under PIPEDA' },
  { id: 'data-breach-notification', title: 'Data Breach Notification' },
  { id: 'security', title: 'Security' },
  { id: 'complaint-process', title: 'Complaint Process' },
  { id: 'cookies-and-website-data', title: 'Cookies and Website Data' },
  { id: 'children', title: 'Children' },
  { id: 'changes-to-this-policy', title: 'Changes to This Policy' },
];

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.root}>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Privacy Policy</h1>

        <p className={styles.lead}>
          This Privacy Policy explains how Alex Rivera, operating as Setera (&ldquo;Setera,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), collects, uses, stores, and discloses personal information in connection with the Setera AI call capture platform and the website heysetera.com. This policy applies to two groups: our clients, meaning businesses that subscribe to Setera, and callers, meaning individuals who call a business using the Setera platform and speak with Emily.
        </p>

        <nav className={styles.toc} aria-label="Table of contents">
          <div className={styles.tocLabel}>On this page</div>
          <ol className={styles.tocList}>
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className={styles.tocLink}>{title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <section id="who-we-are" className={styles.section}>
          <h2 className={styles.sectionHeading}>Who We Are</h2>
          <ul className={styles.list}>
            <li>Setera is operated by Alex Rivera, based in Canada.</li>
            <li>We provide an AI-powered inbound call capture service for trade and home-service businesses.</li>
            <li>Privacy inquiries: <a href={`mailto:${CONTACT.email}`} className={styles.inlineLink}>{CONTACT.email}</a></li>
          </ul>
        </section>

        <section id="information-we-collect" className={styles.section}>
          <h2 className={styles.sectionHeading}>Information We Collect</h2>
          <p className={styles.subheading}>From clients:</p>
          <ul className={styles.list}>
            <li>Business name, address, and contact information</li>
            <li>Billing and payment information processed by Stripe</li>
            <li>Login credentials for dashboard access</li>
            <li>SMS notification preferences</li>
            <li>Business hours, service areas, and call handling preferences</li>
          </ul>
          <p className={styles.subheading}>From callers:</p>
          <ul className={styles.list}>
            <li>Name</li>
            <li>Phone number</li>
            <li>Reason for calling</li>
            <li>Urgency level</li>
            <li>Preferred callback time</li>
            <li>Address, if provided naturally during the call</li>
            <li>Call transcript</li>
            <li>Call audio recording</li>
          </ul>
        </section>

        <section id="how-we-collect-information" className={styles.section}>
          <h2 className={styles.sectionHeading}>How We Collect Information</h2>
          <ul className={styles.list}>
            <li>Client information is collected during onboarding.</li>
            <li>Caller information is captured by Emily during inbound calls.</li>
            <li>Emily identifies herself as an AI virtual receptionist at the start of every call.</li>
            <li>Callers who remain on the line after this disclosure are understood to have provided implied consent to the call being handled and recorded by an AI system.</li>
            <li>Callers are not required to provide personal information, but the service cannot function properly without basic contact details.</li>
          </ul>
        </section>

        <section id="how-we-use-information" className={styles.section}>
          <h2 className={styles.sectionHeading}>How We Use Information</h2>
          <p className={styles.body}>We use the information we collect to:</p>
          <ul className={styles.list}>
            <li>Provide the Setera call capture service to clients</li>
            <li>Log and categorize inbound calls in the client dashboard</li>
            <li>Send SMS notifications to designated client personnel</li>
            <li>Process payments and manage subscriptions</li>
            <li>Communicate with clients about their account</li>
            <li>Configure Emily for each client&apos;s business</li>
            <li>Improve the performance and reliability of the Service</li>
          </ul>
          <p className={styles.body}>We do not use caller information for marketing purposes.</p>
          <p className={styles.body}>We do not sell personal information to any third party under any circumstances.</p>
        </section>

        <section id="how-we-store-information" className={styles.section}>
          <h2 className={styles.sectionHeading}>How We Store Information</h2>
          <ul className={styles.list}>
            <li>Structured call data, including caller name, phone number, reason for calling, urgency level, and related call details, is stored in Supabase infrastructure located in Canada Central.</li>
            <li>Call audio recordings and conversation transcripts are processed and stored by ElevenLabs, whose infrastructure may be located in the United States.</li>
            <li>SMS notification records are processed by Twilio and/or SignalWire, depending on which telephony provider is used for a given client, whose infrastructure may be located in the United States.</li>
            <li>Payment information is processed by Stripe and is not stored on Setera&apos;s systems.</li>
          </ul>
        </section>

        <section id="data-retention" className={styles.section}>
          <h2 className={styles.sectionHeading}>Data Retention</h2>
          <ul className={styles.list}>
            <li>Call audio recordings and transcripts are retained for 365 days and then automatically deleted.</li>
            <li>SMS and call records are retained by our telephony provider (Twilio and/or SignalWire) according to that provider&apos;s standard retention settings.</li>
            <li>Structured call data stored in Supabase is retained for the duration of the client subscription plus 90 days following expiration or cancellation, unless a longer retention period is required for legal, billing, or operational reasons.</li>
            <li>Upon expiration or cancellation, clients may request an export of their call records within 30 days of the expiration or cancellation date.</li>
          </ul>
          <p className={styles.body}>
            Callers or clients may request deletion of their personal information at any time by contacting <a href={`mailto:${CONTACT.email}`} className={styles.inlineLink}>{CONTACT.email}</a>. Deletion requests will be reviewed and processed within 30 days.
          </p>
        </section>

        <section id="third-party-service-providers" className={styles.section}>
          <h2 className={styles.sectionHeading}>Third-Party Service Providers</h2>
          <p className={styles.body}>Setera uses the following third-party providers to deliver the Service:</p>
          <ul className={styles.list}>
            <li>ElevenLabs for voice AI, call audio, and transcription</li>
            <li>Twilio and/or SignalWire for telephony and SMS notifications, depending on client configuration</li>
            <li>Supabase for database and structured data storage</li>
            <li>Stripe for payment processing</li>
            <li>Vercel for website and application hosting</li>
          </ul>
          <p className={styles.body}>
            Setera remains accountable for personal information transferred to these providers in accordance with PIPEDA. Each third-party provider maintains its own privacy policy, security practices, and data retention rules.
          </p>
        </section>

        <section id="cross-border-data-transfer" className={styles.section}>
          <h2 className={styles.sectionHeading}>Cross-Border Data Transfer</h2>
          <ul className={styles.list}>
            <li>Some personal information collected by Setera may be transferred to and processed in the United States by third-party service providers.</li>
            <li>By using the Setera platform, subscribing to the Service, or calling a business that uses the Setera platform, you acknowledge that your information may be transferred outside Canada.</li>
            <li>Setera takes reasonable steps to ensure third-party providers maintain appropriate data protection standards.</li>
          </ul>
        </section>

        <section id="your-rights-under-pipeda" className={styles.section}>
          <h2 className={styles.sectionHeading}>Your Rights Under PIPEDA</h2>
          <p className={styles.body}>In accordance with the Personal Information Protection and Electronic Documents Act, individuals have the right to:</p>
          <ul className={styles.list}>
            <li>Know what personal information Setera holds about them</li>
            <li>Request access to their personal information</li>
            <li>Request correction of inaccurate personal information</li>
            <li>Request deletion of their personal information</li>
            <li>Withdraw consent to the collection and use of their personal information, subject to legal or contractual limitations</li>
            <li>File a complaint with the Office of the Privacy Commissioner of Canada</li>
          </ul>
          <p className={styles.body}>
            To exercise any of these rights, contact us at <a href={`mailto:${CONTACT.email}`} className={styles.inlineLink}>{CONTACT.email}</a>. We will respond within 30 days.
          </p>
        </section>

        <section id="data-breach-notification" className={styles.section}>
          <h2 className={styles.sectionHeading}>Data Breach Notification</h2>
          <p className={styles.body}>
            In the event of a data breach that poses a real risk of significant harm to individuals, Setera will notify affected individuals and the Office of the Privacy Commissioner of Canada as required under PIPEDA. Notification will be made as soon as reasonably possible following discovery of the breach.
          </p>
        </section>

        <section id="security" className={styles.section}>
          <h2 className={styles.sectionHeading}>Security</h2>
          <p className={styles.body}>
            Setera implements reasonable technical and organizational measures to protect personal information against unauthorized access, disclosure, loss, misuse, or alteration.
          </p>
          <p className={styles.body}>
            These measures may include encrypted data transmission, access controls, secure cloud infrastructure, and limiting access to personal information to individuals who require it to provide the Service.
          </p>
          <p className={styles.body}>
            No system is completely secure, and Setera cannot guarantee absolute security of personal information.
          </p>
        </section>

        <section id="complaint-process" className={styles.section}>
          <h2 className={styles.sectionHeading}>Complaint Process</h2>
          <p className={styles.body}>
            If you have a privacy concern or complaint, contact us at <a href={`mailto:${CONTACT.email}`} className={styles.inlineLink}>{CONTACT.email}</a>.
          </p>
          <p className={styles.body}>
            We will acknowledge your complaint within 5 business days and provide a full response within 30 days.
          </p>
          <p className={styles.body}>
            If you are not satisfied with our response, you may escalate your complaint to the Office of the Privacy Commissioner of Canada.
          </p>
        </section>

        <section id="cookies-and-website-data" className={styles.section}>
          <h2 className={styles.sectionHeading}>Cookies and Website Data</h2>
          <p className={styles.body}>
            The heysetera.com website may collect standard web analytics data, including IP addresses, browser type, device information, pages visited, and general usage information.
          </p>
          <p className={styles.body}>
            This information is used to improve the website and is not used to personally identify callers or clients unless voluntarily provided.
          </p>
        </section>

        <section id="children" className={styles.section}>
          <h2 className={styles.sectionHeading}>Children</h2>
          <p className={styles.body}>
            The Setera platform is not intended for use by or directed at individuals under the age of 18.
          </p>
          <p className={styles.body}>
            We do not knowingly collect personal information from minors.
          </p>
        </section>

        <section id="changes-to-this-policy" className={styles.section}>
          <h2 className={styles.sectionHeading}>Changes to This Policy</h2>
          <p className={styles.body}>
            We may update this Privacy Policy from time to time. When we do, we will update the effective date at the top of this page and notify active clients by email where appropriate.
          </p>
          <p className={styles.body}>
            Continued use of the Service after any update constitutes acceptance of the revised policy.
          </p>
        </section>
      </main>

    </div>
  );
}
