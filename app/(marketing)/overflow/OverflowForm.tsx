'use client';
import { useState } from 'react';
import styles from './overflow.module.css';

export default function OverflowForm() {
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [location, setLocation] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/overflow/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, businessName, firstName, location, company_website: trap }),
      });
      if (res.ok) setDone(true);
      else setError((await res.json().catch(() => ({}))).error || 'Something went wrong. Please try again.');
    } catch { setError('Something went wrong. Please try again.'); }
    setBusy(false);
  }

  if (done) {
    return (
      <div className={styles.card} role="status">
        <h2 className={styles.success}>You&apos;re on the list</h2>
        <p className={styles.fine}>We&apos;ll email you when contractor applications open.</p>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <label className={styles.label} htmlFor="ov-email">Email *</label>
      <input id="ov-email" className={styles.input} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <div className={styles.row}>
        <div>
          <label className={styles.label} htmlFor="ov-biz">Business name</label>
          <input id="ov-biz" className={styles.input} autoComplete="organization" value={businessName} onChange={e => setBusinessName(e.target.value)} />
        </div>
        <div>
          <label className={styles.label} htmlFor="ov-first">First name</label>
          <input id="ov-first" className={styles.input} autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} />
        </div>
      </div>
      <label className={styles.label} htmlFor="ov-loc">City / area</label>
      <input id="ov-loc" className={styles.input} maxLength={120} autoComplete="address-level2" value={location} onChange={e => setLocation(e.target.value)} />
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div className={styles.trap} aria-hidden="true">
        <label>Company website<input tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} /></label>
      </div>
      <button className={styles.cta} type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join the Early Access List'}</button>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.fine}>We&apos;ll email you when applications open. You can unsubscribe anytime.</p>
    </form>
  );
}
