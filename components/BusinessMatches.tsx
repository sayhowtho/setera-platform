'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BusinessMatch } from '@/lib/lead-requests';
import { normalizeBusinessName, parseBusinessPhone } from '@/lib/business-normalize';

// Duplicate-prevention UI for the Setter Portal: the live match hook (used by
// Add Prospect) and the "Check a business" box (Call Log). Both hit
// /api/business-search, which only ever returns the setter-safe BusinessMatch
// shape — no owner names, notes or contact details.
//
// Phone is the key: a phone match (matchedOn 'phone') is a hard block.
// A name-only match is a soft "Possible match" — shown, but not blocking.

const DEBOUNCE_MS = 350;

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined), Authorization: 'Bearer ' + (session?.access_token ?? '') } });
}

type Query = { name: string; phone?: string; contactPhone?: string; city?: string; trade?: string; mode?: 'add' | 'lookup' };

// Same thresholds find_business_matches applies: a name that's still 3+
// characters after normalizing, or a phone that normalizes to E.164.
function isSearchable(q: { name: string; phone?: string; contactPhone?: string }) {
  return (normalizeBusinessName(q.name)?.length ?? 0) >= 3
    || parseBusinessPhone(q.phone).status === 'ok'
    || parseBusinessPhone(q.contactPhone).status === 'ok';
}

export function useBusinessMatches(q: Query) {
  const key = JSON.stringify([q.name.trim(), (q.phone || '').trim(), (q.contactPhone || '').trim(), (q.city || '').trim(), (q.trade || '').trim(), q.mode || 'add']);
  const [name, phone, contactPhone] = JSON.parse(key) as string[];
  const searchable = isSearchable({ name, phone, contactPhone });
  // Result is tagged with the query it answers, so "checking" is derived:
  // true from the first keystroke until that exact query's answer lands —
  // a save can't slip in during the debounce.
  const [result, setResult] = useState<{ key: string; matches: BusinessMatch[]; error: string }>({ key: '', matches: [], error: '' });
  const seq = useRef(0);

  const run = useCallback(async () => {
    const [n, p, cp, city, trade, mode] = JSON.parse(key) as string[];
    if (!isSearchable({ name: n, phone: p, contactPhone: cp })) return;
    const id = ++seq.current;
    try {
      const body = {
        name: n,
        phone: parseBusinessPhone(p).status === 'ok' ? p : '',
        contactPhone: parseBusinessPhone(cp).status === 'ok' ? cp : '',
        city, trade, mode,
      };
      const r = await authedFetch('/api/business-search', { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json();
      if (id !== seq.current) return; // a newer keystroke's search owns the result
      setResult(r.ok ? { key, matches: j.matches || [], error: '' } : { key, matches: [], error: j.error || 'Search failed' });
    } catch {
      if (id === seq.current) setResult({ key, matches: [], error: 'Search failed' });
    }
  }, [key]);

  useEffect(() => {
    const t = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [run]);

  const matches = searchable ? result.matches : [];
  return {
    matches,
    phoneMatches: matches.filter(m => m.matchedOn === 'phone'),
    nameMatches: matches.filter(m => m.matchedOn === 'name'),
    checking: searchable && result.key !== key,
    error: searchable && result.key === key ? result.error : '',
    refresh: run,
    setMatches: (next: BusinessMatch[]) => setResult({ key, matches: next, error: '' }),
  };
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const pill = (bg: string, color: string): React.CSSProperties => ({ backgroundColor: bg, color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700, whiteSpace: 'nowrap' });

function MatchRow({ m, onRequested }: { m: BusinessMatch; onRequested?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!m.prospectId) return;
    setSending(true); setMsg(null);
    try {
      const r = await authedFetch('/api/lead-requests', { method: 'POST', body: JSON.stringify({ prospectId: m.prospectId, note }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setSent(true); setOpen(false); setMsg({ ok: true, text: 'Request sent — Alex will approve or deny it.' }); onRequested?.(); }
      else setMsg({ ok: false, text: j.error || 'Could not send request' });
    } catch { setMsg({ ok: false, text: 'Could not send request' }); }
    setSending(false);
  }

  let action: React.ReactNode;
  if (m.ownerLabel === 'Client') action = <span style={pill('#ccfbf1', '#065f46')}>Existing client</span>;
  else if (m.ownerLabel === 'You') action = <span style={pill('#dbeafe', '#1e40af')}>Already yours</span>;
  else if (m.myRequest === 'pending' || sent) action = <span style={pill('#ede9fe', '#5b21b6')}>Request pending</span>;
  else if (m.prospectId) action = (
    <button onClick={() => setOpen(o => !o)} style={{ backgroundColor: '#0f2318', color: '#00d4aa', border: 'none', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Request this lead</button>
  );
  else action = <span style={pill('#fef3c7', '#92400e')}>Being worked</span>;

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: 700, margin: '0 0 2px 0' }}>{m.businessName}</p>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
            {[m.trade, m.city].filter(Boolean).join(' · ') || '—'}
            {' · '}{m.status || 'No status'}
            {' · '}Owner: <strong style={{ color: '#374151' }}>{m.ownerLabel}</strong>
            {' · '}Last activity {fmtDate(m.lastActivity)}{m.stale ? ' (stale)' : ''}
            {' · '}{m.matchedOn === 'phone' ? 'same phone number' : 'similar name'}
          </p>
        </div>
        {action}
      </div>
      {open && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Optional note for Alex (why you want it, context from a call...)"
            style={{ flex: 1, minHeight: '56px', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical', boxSizing: 'border-box' }} />
          <button onClick={send} disabled={sending} style={{ backgroundColor: '#0f2318', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>{sending ? 'Sending...' : 'Send request'}</button>
        </div>
      )}
      {msg && <p style={{ color: msg.ok ? '#065f46' : '#991b1b', fontSize: '12px', fontWeight: 600, margin: '8px 0 0 0' }}>{msg.text}</p>}
    </div>
  );
}

// variant 'block' = phone matches (red, hard stop); 'warn' = name-only
// "Possible match" (amber, setter may continue).
export function BusinessMatchList({ matches, title, variant, onRequested }: { matches: BusinessMatch[]; title: React.ReactNode; variant: 'block' | 'warn'; onRequested?: () => void }) {
  if (matches.length === 0) return null;
  const c = variant === 'block' ? { border: '#fca5a5', head: '#fef2f2', text: '#991b1b' } : { border: '#fcd34d', head: '#fffbeb', text: '#92400e' };
  return (
    <div style={{ border: '1px solid ' + c.border, backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
      <div style={{ backgroundColor: c.head, padding: '10px 16px' }}>
        <p style={{ color: c.text, fontSize: '13px', fontWeight: 700, margin: 0 }}>{title}</p>
      </div>
      {matches.map(m => <MatchRow key={m.key} m={m} onRequested={onRequested} />)}
    </div>
  );
}

// Call Log's "Check a business" box — type a name or phone before dialing.
export function BusinessCheck({ onRequested }: { onRequested?: () => void }) {
  const [text, setText] = useState('');
  // Mostly digits = a phone number; otherwise a (partial) company name.
  const looksLikePhone = /^[\s\d()+.\-]*\d[\s\d()+.\-]*(\s*(ext\.?|x|#)\s*\d+)?$/i.test(text.trim()) && text.replace(/\D/g, '').length >= 3;
  const { phoneMatches, nameMatches, checking, error } = useBusinessMatches(looksLikePhone ? { name: '', phone: text, mode: 'lookup' } : { name: text, mode: 'lookup' });
  const phoneState = looksLikePhone ? parseBusinessPhone(text).status : 'empty';
  const searchable = looksLikePhone ? phoneState === 'ok' : (normalizeBusinessName(text)?.length ?? 0) >= 3;

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '18px 20px', marginBottom: '24px' }}>
      <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check a business</label>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Company name or phone number — check before you dial"
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
      {looksLikePhone && phoneState === 'invalid' && text.replace(/\D/g, '').length >= 10 && (
        <p style={{ color: '#991b1b', fontSize: '13px', margin: '10px 0 0 0' }}>That isn&apos;t a valid 10-digit CA/US number.</p>
      )}
      {searchable && (
        <div style={{ marginTop: '12px' }}>
          {checking ? <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Checking...</p>
            : error ? <p style={{ color: '#991b1b', fontSize: '13px', margin: 0 }}>{error}</p>
            : phoneMatches.length + nameMatches.length === 0 ? <p style={{ color: '#065f46', fontSize: '13px', fontWeight: 600, margin: 0 }}>✓ Not in Setera — clear to call.</p>
            : <>
                <BusinessMatchList variant="block" matches={phoneMatches} onRequested={onRequested} title="This number is already in Setera. Don't dial." />
                <BusinessMatchList variant="warn" matches={nameMatches} onRequested={onRequested} title={`Possible match${nameMatches.length > 1 ? 'es' : ''} by name — check it's not the same business before dialing.`} />
              </>}
        </div>
      )}
    </div>
  );
}
