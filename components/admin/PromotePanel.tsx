'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PROMOTION_PAID_CLIENTS } from '@/lib/compensation';
import { authedJson, overlay, card, title, primaryBtn, ghostBtn, smallGhost, errBox } from './allocation-shared';

// High Table → Rep Management → Promote. Manual, with an effective date
// (Alex's call; eligible once 6 paid clients, then it's the setter's choice).
// Changes profiles.role only, via /api/admin/change-role (role history in
// migrations/027). Comp track and commission rates are not touched here.

type Person = { id: string; full_name: string | null; email: string; role: string };
type Carry = { prospects: number; activities: number; demos: number; earnings: number };

export default function PromotePanel({ person, paidClients, compTrackLabel, onClose, onDone }: {
  person: Person; paidClients: number; compTrackLabel: string; onClose: () => void; onDone: (message: string) => void;
}) {
  const [today] = useState(() => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10)); // Regina date, fixed while open
  const [role, setRole] = useState<'rep' | 'vp_sales'>('rep');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [carry, setCarry] = useState<Carry | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const name = person.full_name || person.email;
  const eligible = paidClients >= PROMOTION_PAID_CLIENTS;

  useEffect(() => {
    (async () => {
      const head = { count: 'exact' as const, head: true };
      const [p, a, d, e] = await Promise.all([
        supabase.from('prospects').select('id', head).eq('rep_id', person.id),
        supabase.from('prospect_activities').select('id', head).eq('rep_id', person.id),
        supabase.from('appointments').select('id', head).eq('setter_id', person.id),
        supabase.from('commission_earnings').select('id', head).eq('rep_id', person.id),
      ]);
      setCarry({ prospects: p.count ?? 0, activities: a.count ?? 0, demos: d.count ?? 0, earnings: e.count ?? 0 });
    })();
  }, [person.id]);

  async function submit() {
    setSaving(true); setError('');
    const r = await authedJson<{ from: string; to: string }>('/api/admin/change-role', { method: 'POST', body: JSON.stringify({ userId: person.id, role, effectiveDate: date, note: note || undefined }) });
    setSaving(false);
    if (!r.ok) { setError(r.error); setConfirming(false); return; }
    onDone(`${name} is now a ${role === 'vp_sales' ? 'VP of Sales' : 'Sales Rep'} (effective ${date}). Their setter history stays with them.`);
  }

  const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <p style={title}>Promote {name}</p>
          <button onClick={onClose} style={smallGhost}>Cancel</button>
        </div>

        <div style={{ backgroundColor: eligible ? '#ecfdf5' : '#f9fafb', border: '1px solid ' + (eligible ? '#a7f3d0' : '#f3f4f6'), borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
          <p style={{ color: '#0a1f13', fontSize: '15px', fontWeight: 800, margin: 0 }}>{paidClients}/{PROMOTION_PAID_CLIENTS} paid clients</p>
          <p style={{ color: eligible ? '#065f46' : '#6b7280', fontSize: '12px', margin: '2px 0 0 0' }}>
            {eligible ? 'Eligible, their choice.' : `${PROMOTION_PAID_CLIENTS - paidClients} more before they're eligible. You can still promote manually.`}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div><label style={lbl}>New role</label>
            <select value={role} onChange={e => { setRole(e.target.value as 'rep' | 'vp_sales'); setConfirming(false); }} style={inp}>
              <option value="rep">Sales Rep</option>
              <option value="vp_sales">VP of Sales</option>
            </select>
          </div>
          <div><label style={lbl}>Effective date</label>
            <input type="date" value={date} max={today} onChange={e => { if (e.target.value) { setDate(e.target.value); setConfirming(false); } }} style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: '14px' }}><label style={lbl}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Hit 6 paid clients, chose to close" style={inp} maxLength={500} />
        </div>

        <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px' }}>
          <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: 700, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stays with them</p>
          <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>
            {carry ? `${carry.prospects} prospects · ${carry.activities} activities · ${carry.demos} demos booked · ${carry.earnings} commission record(s) · allocation history` : 'Counting…'}
          </p>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: '6px 0 0 0' }}>
            Setter-era numbers stay counted as setter (Setter Activity, Rep Activity). They keep the setter tools from /rep. Comp track stays {compTrackLabel}; change it in Manage Track if needed. Commission rates are unchanged.
          </p>
        </div>

        {error && <p style={errBox}>{error}</p>}
        {confirming ? (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #00d4aa', borderRadius: '10px', padding: '14px' }}>
            <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0' }}>Promote {name} to {role === 'vp_sales' ? 'VP of Sales' : 'Sales Rep'}, effective {date}?</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={submit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Promoting…' : 'Confirm'}</button>
              <button onClick={() => setConfirming(false)} disabled={saving} style={ghostBtn}>Back</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setConfirming(true)} style={primaryBtn}>Promote</button>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
