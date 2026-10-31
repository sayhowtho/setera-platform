'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Rep / setter quick-add to the Overflow Early Access list. Rep identity is
// never sent: the server derives it from the bearer token's session.

type Recent = { id: string; event_type: string; created_at: string; metadata: { submitted_email?: string; submitted_business?: string; suppressed?: boolean } | null };

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };
const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

export default function OverflowQuickAdd({ defaults, showRecent = true, compact = false, collapsible = false }: {
  collapsible?: boolean;
  defaults?: { email?: string; businessName?: string; contactName?: string; location?: string };
  showRecent?: boolean;
  compact?: boolean;
}) {
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [businessName, setBusinessName] = useState(defaults?.businessName ?? '');
  const [contactName, setContactName] = useState(defaults?.contactName ?? '');
  const [location, setLocation] = useState(defaults?.location ?? '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'info' | 'err'; text: string } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [open, setOpen] = useState(!collapsible);

  const loadRecent = useCallback(async () => {
    if (!showRecent) return;
    const { data } = await supabase.from('overflow_waitlist_events')
      .select('id, event_type, created_at, metadata')
      .in('event_type', ['rep_submitted', 'duplicate_submission'])
      .order('created_at', { ascending: false }).limit(10);   // RLS: only this user's own events
    if (data) setRecent(data as Recent[]);
  }, [showRecent]);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/overflow/rep-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
        body: JSON.stringify({ email, businessName, contactName, location, consent }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ kind: 'err', text: body.error || 'Something went wrong' });
      else if (body.status === 'added') {
        setMsg({ kind: 'ok', text: 'Added to Overflow Early Access' });
        setEmail(''); setBusinessName(''); setContactName(''); setLocation(''); setConsent(false);
      } else if (body.status === 'duplicate') setMsg({ kind: 'info', text: 'Already on Overflow Early Access, originally added ' + fmtDate(body.originallyAddedAt) + '.' });
      else if (body.status === 'cannot_add') setMsg({ kind: 'err', text: "Can't add this contact" });
      else setMsg({ kind: 'err', text: 'Please enter a valid email address.' });
      loadRecent();
    } catch { setMsg({ kind: 'err', text: 'Something went wrong' }); }
    setBusy(false);
  }

  const color = msg?.kind === 'ok' ? '#047857' : msg?.kind === 'info' ? '#1d4ed8' : '#b91c1c';
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ backgroundColor: '#fff', border: '1px solid #00d4aa', color: '#0a1f13', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
        Add to Overflow Waitlist
      </button>
    );
  }
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: compact ? '20px' : '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: '640px' }}>
      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add to Overflow Waitlist</p>
      <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 18px 0' }}>Contractors who want early access to Setera Overflow. Applications aren&apos;t open yet.</p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: '14px' }}><label style={lbl}>Email *</label>
          <input style={inp} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="owner@company.com" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div><label style={lbl}>Business name</label><input style={inp} value={businessName} onChange={e => setBusinessName(e.target.value)} /></div>
          <div><label style={lbl}>Contact name</label><input style={inp} value={contactName} onChange={e => setContactName(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: '14px' }}><label style={lbl}>City / area</label>
          <input style={inp} maxLength={120} value={location} onChange={e => setLocation(e.target.value)} placeholder="Optional" /></div>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', color: '#0a1f13', marginBottom: '16px', cursor: 'pointer' }}>
          <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: '2px' }} />
          <span>Prospect agreed to be emailed about Overflow.</span>
        </label>
        <button type="submit" disabled={busy || !consent || !email.trim()}
          style={{ backgroundColor: '#00d4aa', color: '#0a1f13', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '700', cursor: busy || !consent || !email.trim() ? 'not-allowed' : 'pointer', opacity: busy || !consent || !email.trim() ? 0.6 : 1 }}>
          {busy ? 'Adding…' : 'Add to Overflow Waitlist'}
        </button>
        {msg && <p role="status" style={{ color, fontSize: '13px', fontWeight: '600', margin: '14px 0 0 0' }}>{msg.text}</p>}
      </form>
      {showRecent && recent.length > 0 && (
        <div style={{ marginTop: '24px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
          <p style={{ ...lbl, marginBottom: '10px' }}>My recent submissions</p>
          {recent.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '7px 0', borderBottom: '1px solid #f9fafb', fontSize: '13px' }}>
              <span style={{ color: '#0a1f13' }}>{r.metadata?.submitted_email}{r.metadata?.submitted_business ? ' · ' + r.metadata.submitted_business : ''}</span>
              <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>
                {r.metadata?.suppressed ? 'Not added' : r.event_type === 'rep_submitted' ? 'Added' : 'Already listed'} · {fmtDate(r.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
