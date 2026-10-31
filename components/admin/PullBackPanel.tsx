'use client';
import { useEffect, useState } from 'react';
import { type AllocRep, RepStats, ROLE_LABEL, authedJson, overlay, card, title, numInp, primaryBtn, ghostBtn, smallGhost, errBox } from './allocation-shared';

// High Table → Prospects → Pull back. Returns a rep's untouched prospects
// (Not Contacted, no logged activity) to the reserve, oldest allocation first
// (/api/admin/prospects/pull-back, migrations/023 + 025). By default only ones
// that came from an allocation move; prospects the rep added themselves (or
// got via a lead request) stay unless "Only pull back ones I allocated" is
// unticked. Deactivated reps are listed too — pulling leads back from
// someone who left is the main use.

export default function PullBackPanel({ reserveName, onClose, onDone }: { reserveName: string; onClose: () => void; onDone: (message: string) => void }) {
  const [reps, setReps] = useState<AllocRep[] | null>(null);
  const [repId, setRepId] = useState('');
  const [all, setAll] = useState(true);
  const [onlyAllocated, setOnlyAllocated] = useState(true);
  const [count, setCount] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await authedJson<{ reps: AllocRep[] }>('/api/admin/prospects/allocate');
      if (!r.ok) { setLoadError(r.error); return; }
      setReps(r.data.reps.filter(x => x.active || x.untouched > 0));
    })();
  }, []);

  const rep = reps?.find(r => r.id === repId) || null;
  const available = rep ? (onlyAllocated ? rep.untouchedAllocated : rep.untouched) : 0;
  const n = all ? available : Number(count);
  const scope = onlyAllocated ? ' from your allocations' : '';
  const blockMsg = !rep ? ''
    : available === 0 ? `${rep.name} has no untouched prospects${scope}.`
    : all || count.trim() === '' ? ''
    : !Number.isInteger(n) || n < 1 ? 'Enter a whole number of at least 1.'
    : n > available ? `${rep.name} only has ${available} untouched${scope}.` : '';
  const canSubmit = !!rep && available > 0 && !blockMsg && (all || count.trim() !== '');
  const resetConfirm = () => { setConfirming(false); setError(''); };

  async function submit() {
    if (!rep) return;
    setSaving(true); setError('');
    const res = await authedJson<{ pulled_back: number; remaining_untouched: number }>('/api/admin/prospects/pull-back', {
      method: 'POST', body: JSON.stringify({ repId: rep.id, count: all ? null : n, onlyAllocated }),
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); setConfirming(false); return; }
    onDone(`Pulled back ${res.data.pulled_back} from ${rep.name} to ${reserveName}. ${rep.name} has ${res.data.remaining_untouched} untouched${scope} left.`);
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <p style={title}>Pull back to {reserveName}</p>
          <button onClick={onClose} style={smallGhost}>Cancel</button>
        </div>
        <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.5', margin: '0 0 16px 0' }}>
          Only untouched prospects move (still Not Contacted, no logged activity), oldest allocation first. Anything a rep has worked stays with them.
        </p>

        {loadError ? <p style={errBox}>{loadError}</p> : !reps ? (
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: '24px 0', textAlign: 'center' }}>Loading reps…</p>
        ) : reps.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: '16px 0' }}>No reps to pull back from.</p>
        ) : (
          <>
            <div style={{ border: '1px solid #f3f4f6', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
              {reps.map(r => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', backgroundColor: repId === r.id ? '#f0fdf4' : 'transparent' }}>
                  <input type="radio" name="pullback-rep" checked={repId === r.id} onChange={() => { setRepId(r.id); setCount(''); resetConfirm(); }} style={{ accentColor: '#0f2318' }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '600', margin: 0 }}>{r.name}{!r.active && <span style={{ color: '#991b1b', fontSize: '11px', fontWeight: '600', marginLeft: '8px' }}>Deactivated</span>}<span style={{ color: '#6b7280', fontSize: '12px', fontWeight: '400', marginLeft: '8px' }}>{ROLE_LABEL[r.role] || r.role}</span></p>
                    <RepStats rep={r} />
                    <p style={{ color: '#6b7280', fontSize: '12px', margin: '2px 0 0 0' }}>
                      {r.untouched} untouched ({r.untouchedAllocated} from allocations, {r.untouched - r.untouchedAllocated} added by rep or other)
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {rep && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={onlyAllocated} onChange={e => { setOnlyAllocated(e.target.checked); resetConfirm(); }} style={{ accentColor: '#0f2318' }} />
                  Only pull back ones I allocated <span style={{ color: '#9ca3af' }}>({rep.untouchedAllocated} untouched)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={all} onChange={e => { setAll(e.target.checked); resetConfirm(); }} style={{ accentColor: '#0f2318' }} />
                  Pull back all untouched{scope} ({available})
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '24px' }}>
                  <input type="number" min={1} max={available} step={1} inputMode="numeric" placeholder="Number" disabled={all} value={all ? '' : count}
                    onChange={e => { setCount(e.target.value); resetConfirm(); }} style={{ ...numInp, opacity: all ? 0.5 : 1 }} aria-label="How many to pull back" />
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>{all ? 'Untick “all” to choose a number' : `up to ${available}`}</span>
                </div>
              </div>
            )}

            {blockMsg && <p style={errBox}>{blockMsg}</p>}
            {error && <p style={errBox}>{error}</p>}

            {confirming && rep ? (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #00d4aa', borderRadius: '10px', padding: '14px' }}>
                <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '600', margin: '0 0 4px 0' }}>Pull back {n} from {rep.name}?</p>
                <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 12px 0' }}>{onlyAllocated ? 'Only ones you allocated; prospects they added stay with them.' : 'Includes prospects they added themselves or got another way.'}</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={submit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Pulling back…' : 'Confirm'}</button>
                  <button onClick={() => setConfirming(false)} disabled={saving} style={ghostBtn}>Back</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setConfirming(true)} disabled={!canSubmit} style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>Pull back</button>
                <button onClick={onClose} style={ghostBtn}>Cancel</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
