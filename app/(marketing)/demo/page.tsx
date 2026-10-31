'use client';
import { useState } from 'react';
import styles from '../home.module.css';
import { CONTACT } from '@/lib/site-content';

const industries = [
  'Roofing', 'HVAC', 'Plumbing', 'Electrical', 'Restoration',
  'Landscaping', 'General Contractors', 'Cleaning', 'Automotive', 'Other',
];

export default function DemoPage() {
  const [form, setForm] = useState({
    name: '', businessName: '', industry: '', location: '', phone: '', email: '', notes: '', company_website: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Request failed');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className={styles.root}>

      <section className={styles.section} style={{ paddingTop: '160px', maxWidth: '640px' }}>
        <div className={styles.sectionLabel}>Book a Demo</div>
        <h1 className={styles.h2}>Let&apos;s see if it&apos;s a fit.</h1>

        {status === 'success' ? (
          <div className={styles.demoConfirm}>
            <p>Thanks — we&apos;ll be in touch soon.</p>
          </div>
        ) : (
          <>
            <p className={styles.demoIntro}>
              We work with a limited number of businesses in each region and industry, so every client gets the attention their build deserves. Tell us about your business — we&apos;ll be in touch to see if it&apos;s the right fit.
            </p>

            <form onSubmit={handleSubmit} className={styles.demoForm}>
              <div className={styles.demoField}>
                <label className={styles.demoLabel}>Name</label>
                <input
                  className={styles.demoInput}
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </div>

              <div className={styles.demoField}>
                <label className={styles.demoLabel}>Business Name</label>
                <input
                  className={styles.demoInput}
                  type="text"
                  required
                  value={form.businessName}
                  onChange={(e) => update('businessName', e.target.value)}
                />
              </div>

              <div className={styles.demoField}>
                <label className={styles.demoLabel}>Industry</label>
                <select
                  className={styles.demoSelect}
                  required
                  value={form.industry}
                  onChange={(e) => update('industry', e.target.value)}
                >
                  <option value="" disabled>Select your industry</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              <div className={styles.demoField}>
                <label className={styles.demoLabel}>Location</label>
                <input
                  className={styles.demoInput}
                  type="text"
                  placeholder="City, Province"
                  required
                  value={form.location}
                  onChange={(e) => update('location', e.target.value)}
                />
              </div>

              <div className={styles.demoField}>
                <label className={styles.demoLabel}>Phone</label>
                <input
                  className={styles.demoInput}
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </div>

              <div className={styles.demoField}>
                <label className={styles.demoLabel}>Email</label>
                <input
                  className={styles.demoInput}
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>

              <div className={styles.demoField}>
                <label className={styles.demoLabel}>
                  What&apos;s your phone actually like day to day?
                </label>
                <textarea
                  className={styles.demoTextarea}
                  rows={4}
                  placeholder="Slow days, busy days, how often it rings, whether it ever feels like a burden — whatever's true for you."
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                />
              </div>

              {/* Honeypot: hidden from people and assistive tech; bots fill it.
                  Off-screen positioning (not display:none) — some bots skip
                  filling display:none fields specifically. Matches the same
                  technique used in app/overflow/OverflowForm.tsx. */}
              <div style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
                <label>
                  Company website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.company_website}
                    onChange={(e) => update('company_website', e.target.value)}
                  />
                </label>
              </div>

              {status === 'error' && (
                <p className={styles.demoError}>
                  Something went wrong submitting your request. Please try again or email {CONTACT.email} directly.
                </p>
              )}

              <button type="submit" className={styles.heroCta} disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </>
        )}
      </section>

    </div>
  );
}
