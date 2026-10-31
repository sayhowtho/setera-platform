'use client';
import { useEffect, useMemo, useState } from 'react';
import { type AllocRep, RepStats, ROLE_LABEL, authedJson, overlay, card, title, numInp, primaryBtn, ghostBtn, smallGhost, errBox } from './allocation-shared';

// High Table → Prospects → Allocate. Hands a chunk of the selected reserve
// prospects to active reps (/api/admin/prospects/allocate, migrations/023).
// The selection is sent in table order; the first N eligible go to the first
// rep with a number, and so on. Anything not allocated stays with the reserve.

type Skipped = { not_reserve: number; dnc: number; has_activity: number; not_new: number; not_found: number };
type Preview = { selected: number; eligible: number; skipped: Skipped };
type Result = Preview & { batch_id: string; assigned: { rep_id: string; count: number }[]; reserve_kept: number };

const SKIP_LABEL: Record<keyof Skipped, string> = {
  not_reserve: 'owned by someone other than Alex Rivera',
  dnc: 'Do Not Contact',
  has_activity: 'have logged activity',
  not_new: 'status isn’t Not Contacted',
  not_found: 'no longer exist',
};

export function skippedSummary(s: Skipped): string[] {
  return (Object.keys(SKIP_LABEL) as (keyof Skipped)[]).filter(k => s[k] > 0).map(k => s[k] + ' ' + SKIP_LABEL[k]);
}

export default function AllocatePanel({ prospectIds, reserveName, onClose, onDone }: {
  prospectIds: string[]; reserveName: string; onClose: () => void; onDone: (message: string) => void;
}) {
  const [reps, setReps] = useState<AllocRep[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [r, p] = await Promise.all([
        authedJson<{ reps: AllocRep[] }>('/api/admin/prospects/allocate'),
        authedJson<Preview>('/api/admin/prospects/allocate', { method: 'POST', body: JSON.stringify({ prospectIds, dryRun: true }) }),
      ]);
      if (!r.ok) { setLoadError(r.error); return; }
      if (!p.ok) { setLoadError(p.error); return; }
      setReps(r.data.reps.filter(x => x.active));
      setPreview(p.data);
    })();
  }, [prospectIds]);

  const parsed = useMemo(() => {
    const out: { rep: AllocRep; count: number }[] = [];
    let invalid = false;
    for (const rep of reps || []) {
      const raw = (counts[rep.id] || '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) { invalid = true; continue; }
      if (n > 0) out.push({ rep, count: n });
    }
    return { rows: out, invalid, total: out.reduce((s, x) => s + x.count, 0) };
  }, [counts, reps]);

  const eligible = preview?.eligible ?? 0;
  const reserveLeft = eligible - parsed.total;
  const blockMsg = parsed.invalid ? 'Use whole numbers only.'
    : parsed.total > prospectIds.length ? `You asked for ${parsed.total} but only selected ${prospectIds.length}.`
    : parsed.total > eligible ? `You asked for ${parsed.total} but only ${eligible} of the ${prospectIds.length} selected can be allocated.`
    : '';
  const canSubmit = !!preview && parsed.total > 0 && !blockMsg;

  function evenSplit() {
    if (!reps || reps.length === 0) return;
    const base = Math.floor(eligible / reps.length);
    const extra = eligible % reps.length;
    setCounts(Object.fromEntries(reps.map((r, i) => [r.id, String(base + (i < extra ? 1 : 0))])));
    setConfirming(false);
  }

  const confirmText = parsed.rows.map(x => `${x.count} to ${x.rep.name}`).join(', ');

  async function submit() {
    setSaving(true); setError('');
    const res = await authedJson<Result>('/api/admin/prospects/allocate', {
      method: 'POST',
      body: JSON.stringify({ prospectIds, allocations: parsed.rows.map(x => ({ rep_id: x.rep.id, count: x.count })) }),
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); setConfirming(false); return; }
    const d = res.data;
    const nameOf = (id: string) => reps?.find(r => r.id === id)?.name || 'rep';
    const skipped = skippedSummary(d.skipped);
    const skippedCount = d.selected - d.eligible;
    onDone('Assigned ' + d.assigned.map(a => `${a.count} to ${nameOf(a.rep_id)}`).join(', ')
      + `; ${d.reserve_kept} kept in reserve.`
      + (skippedCount > 0 ? ` Skipped ${skippedCount}: ${skipped.join(', ')}.` : ''));
  }

  const skipped = preview ? skippedSummary(preview.skipped) : [];
  const skippedCount = preview ? preview.selected - preview.eligible : 0;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <p style={title}>Allocate {prospectIds.length} prospect{prospectIds.length === 1 ? '' : 's'}</p>
          <button onClick={onClose} style={smallGhost}>Cancel</button>
        </div>

        {loadError ? <p style={errBox}>{loadError}</p> : !reps || !preview ? (
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: '24px 0', textAlign: 'center' }}>Checking the selection…</p>
        ) : (
          <>
            {skippedCount > 0 && (
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 14px', margin: '0 0 14px 0' }}>
                <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 2px 0' }}>{skippedCount} will be skipped — {eligible} can be allocated</p>
                {skipped.map(s => <p key={s} style={{ color: '#92400e', fontSize: '12px', margin: 0 }}>• {s}</p>)}
              </div>
            )}

            {reps.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '14px', margin: '16px 0' }}>No active reps to allocate to.</p>
            ) : (
              <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
                {reps.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '600', margin: 0 }}>{r.name}</p>
                      <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>{ROLE_LABEL[r.role] || r.role}</p>
                      <RepStats rep={r} />
                    </div>
                    <input type="number" min={0} step={1} inputMode="numeric" placeholder="0" value={counts[r.id] || ''}
                      onChange={e => { setCounts(c => ({ ...c, [r.id]: e.target.value })); setConfirming(false); }} style={numInp} aria-label={'Prospects for ' + r.name} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p style={{ color: reserveLeft < 0 ? '#991b1b' : '#374151', fontSize: '14px', fontWeight: '600', margin: 0 }}>
                Staying with {reserveName} (reserve): {Math.max(reserveLeft, 0)}
              </p>
              <button onClick={evenSplit} disabled={reps.length === 0 || eligible === 0} style={smallGhost}>Even split</button>
            </div>

            {blockMsg && <p style={errBox}>{blockMsg}</p>}
            {error && <p style={errBox}>{error}</p>}

            {confirming ? (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #00d4aa', borderRadius: '10px', padding: '14px' }}>
                <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '600', margin: '0 0 12px 0' }}>Assign {confirmText}, keep {reserveLeft} in reserve?</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={submit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Assigning…' : 'Confirm'}</button>
                  <button onClick={() => setConfirming(false)} disabled={saving} style={ghostBtn}>Back</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setConfirming(true)} disabled={!canSubmit} style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>Allocate</button>
                <button onClick={onClose} style={ghostBtn}>Cancel</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
