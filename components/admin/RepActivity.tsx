'use client';
import { useCallback, useEffect, useState } from 'react';
import { BlurField } from '@/components/BlurField';
import { authedJson, ROLE_LABEL } from './allocation-shared';
import { feedTime, fmtHours, isWorkingTime, quietFlag, reginaDateOf, reginaDayStartMs, WORK_END_HOUR, WORK_START_HOUR, type RepSummary } from '@/lib/rep-activity';

// High Table → Rep Activity (admin/owner, read-only). Builds on Setter
// Activity's pattern (Regina date range, 30s refresh while visible) but covers
// every rep, vp_sales and setter, with a live feed and per-rep summary.
// Data: /api/admin/rep-activity. Maths: lib/rep-activity.ts.

type Rep = { id: string; name: string; role: string; active: boolean; lastActivityAt: string | null; summary: RepSummary; byRole?: Record<string, { activities: number; calls: number; emails: number }> };
type FeedRow = { id: string; rep_id: string; prospect_id: string | null; company_name: string | null; type: string; outcome: string | null; notes: string | null; follow_up_date: string | null; created_at: string; role_at?: string };
type Data = { reps: Rep[]; feed: FeedRow[]; now: number };
type Preset = 'today' | '7d' | 'custom';

const QUIET_KEY = 'repActivity.quietHours';
const FEED_PAGE = 200;

const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' };
const th: React.CSSProperties = { color: '#9ca3af', fontSize: '11px', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' };
const num: React.CSSProperties = { color: '#0a1f13', fontSize: '15px', fontWeight: 700, margin: 0 };
const sub: React.CSSProperties = { color: '#9ca3af', fontSize: '11px', margin: 0 };
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff', minHeight: '40px' };
const pill = (active: boolean): React.CSSProperties => ({ padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (active ? '#00d4aa' : '#e5e7eb'), backgroundColor: active ? '#0f2318' : '#fff', color: active ? '#00d4aa' : '#374151' });
const hourLabel = (h: number) => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');
const firstLine = (s: string | null) => (s || '').split('\n').map(l => l.trim()).find(Boolean) || '';

export default function RepActivity({ onOpenProspect }: { onOpenProspect: (prospectId: string) => void }) {
  // Clock in state (not Date.now() during render): ticks every 30s so the
  // quiet badges and "today" labels stay current.
  const [now, setNow] = useState(() => Date.now());
  const today = reginaDateOf(now);
  const [preset, setPreset] = useState<Preset>('today');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [repFilter, setRepFilter] = useState('all');
  const [quietHours, setQuietHours] = useState(() => {
    try { const v = Number(localStorage.getItem(QUIET_KEY)); return v > 0 && v <= 12 ? v : 4; } catch { return 4; }
  });
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(FEED_PAGE);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (foreground: boolean) => {
    if (foreground) { setLoading(true); setError(''); }
    const r = await authedJson<Data>('/api/admin/rep-activity', { method: 'POST', body: JSON.stringify({ start, end }) });
    if (r.ok) { setUpdatedAt(Date.now()); setNow(Date.now()); setData(prev => (JSON.stringify(prev) === JSON.stringify(r.data) ? prev : r.data)); setError(''); }
    else if (foreground) setError('Could not load rep activity: ' + r.error);
    if (foreground) setLoading(false);
  }, [start, end]);

  useEffect(() => {
    // Fetching on open / range change, then a 30s refresh while the tab is visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
    const iv = setInterval(() => { if (document.visibilityState === 'visible') { load(false); setNow(Date.now()); } }, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  function choose(p: Preset) {
    setPreset(p); setShown(FEED_PAGE);
    if (p === 'today') { setStart(today); setEnd(today); }
    if (p === '7d') { setStart(reginaDateOf(reginaDayStartMs(today) - 6 * 86400000)); setEnd(today); }
  }
  function setHours(v: number) {
    setQuietHours(v);
    try { localStorage.setItem(QUIET_KEY, String(v)); } catch { /* private mode etc. */ }
  }

  const reps = data?.reps ?? [];
  const repName = new Map(reps.map(r => [r.id, r.name]));
  const repRole = new Map(reps.map(r => [r.id, r.role]));
  const visibleReps = reps.filter(r => repFilter === 'all' || r.id === repFilter);
  const feed = (data?.feed ?? []).filter(f => repFilter === 'all' || f.rep_id === repFilter);
  const working = isWorkingTime(now);

  return (
    <div style={{ contain: 'inline-size' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: 800, margin: '0 0 4px 0' }}>Rep Activity</h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Everything reps and setters logged, newest first, with a summary per rep. Read-only.</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <button onClick={() => choose('today')} style={pill(preset === 'today')}>Today</button>
        <button onClick={() => choose('7d')} style={pill(preset === '7d')}>Last 7 days</button>
        <button onClick={() => choose('custom')} style={pill(preset === 'custom')}>Custom</button>
        {preset === 'custom' && (<>
          <input type="date" value={start} max={end} onChange={e => e.target.value && setStart(e.target.value)} style={inp} aria-label="From" />
          <span style={{ color: '#9ca3af' }}>to</span>
          <input type="date" value={end} min={start} max={today} onChange={e => e.target.value && setEnd(e.target.value)} style={inp} aria-label="To" />
        </>)}
        <select value={repFilter} onChange={e => { setRepFilter(e.target.value); setShown(FEED_PAGE); }} style={inp} aria-label="Rep">
          <option value="all">All reps</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 16px 0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{start === end ? start : start + ' – ' + end}{loading ? ' · loading…' : ''}</span>
        {updatedAt && <><span>·</span><span>Updated {now - updatedAt < 60000 ? 'just now' : Math.round((now - updatedAt) / 60000) + 'm ago'}</span></>}
        <span>·</span>
        <span>Flag reps quiet for</span>
        <input type="number" min={1} max={12} step={1} value={quietHours} onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= 12) setHours(v); }} style={{ ...inp, width: '60px', minHeight: '28px', padding: '3px 8px' }} aria-label="Quiet hours" />
        <span>hours, Mon–Fri {hourLabel(WORK_START_HOUR)}–{hourLabel(WORK_END_HOUR)}{working ? '' : ' (outside working hours now, so no flags)'}</span>
      </p>
      {error && <div style={{ backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '10px', padding: '14px 20px', marginBottom: '16px', color: '#991b1b', fontSize: '14px', fontWeight: 600 }}>{error}</div>}

      {/* Per-rep summary: one card per rep, wraps to any width. Click a card to filter the feed. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {visibleReps.length === 0 ? <div style={{ ...card, padding: '32px', textAlign: 'center' }}><p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>{loading ? 'Loading…' : 'No reps.'}</p></div> : visibleReps.map(r => {
          const s = r.summary;
          const flag = r.active ? quietFlag(r.lastActivityAt, now, quietHours) : null;
          const pct = (n: number) => (s.activities ? Math.round(100 * n / s.activities) + '%' : '');
          const stat = (label: string, value: React.ReactNode, note?: React.ReactNode, warn = false) => (
            <div>
              <p style={th}>{label}</p>
              <p style={{ ...num, color: warn ? '#b45309' : '#0a1f13' }}>{value}</p>
              {note && <p style={sub}>{note}</p>}
            </div>
          );
          return (
            <div key={r.id} onClick={() => { setRepFilter(repFilter === r.id ? 'all' : r.id); setShown(FEED_PAGE); }}
              style={{ ...card, padding: '16px 18px', cursor: 'pointer', border: '2px solid ' + (repFilter === r.id ? '#00d4aa' : 'transparent') }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: 700, margin: 0 }}><BlurField>{r.name}</BlurField>{!r.active && <span style={{ color: '#991b1b', fontSize: '11px', marginLeft: '6px' }}>Deactivated</span>}</p>
                  <p style={sub}>{ROLE_LABEL[r.role] || r.role} · last activity {r.lastActivityAt ? feedTime(r.lastActivityAt, now) : 'never'}</p>
                </div>
                {flag && <span style={{ flexShrink: 0, backgroundColor: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap' }}>{flag}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px 10px' }}>
                {stat('Allocated', s.allocated)}
                {stat('Touched', s.touched, 'now')}
                {stat('Untouched', s.untouched, 'now')}
                {stat('Activities', s.activities, `${s.calls} calls · ${s.emails} emails${s.otherTypes ? ` · ${s.otherTypes} other` : ''}`)}
                {stat('Follow-ups', s.followUpsScheduled, 'scheduled')}
                {stat('Overdue', s.followUpsOverdue, 'now', s.followUpsOverdue > 0)}
                {stat('First touch', fmtHours(s.firstTouch.avgHours), s.firstTouch.allocations ? `${s.firstTouch.touched} of ${s.firstTouch.allocations} touched` : 'no allocations')}
                {Object.keys(r.byRole || {}).length > 1 && (
                  <div style={{ gridColumn: '1 / -1', backgroundColor: '#f5f3ff', borderRadius: '8px', padding: '6px 10px' }}>
                    <p style={{ color: '#5b21b6', fontSize: '12px', fontWeight: 600, margin: 0 }}>
                      {Object.entries(r.byRole!).map(([role, v]) => `As ${ROLE_LABEL[role] || role}: ${v.activities} activities (${v.calls} calls · ${v.emails} emails)`).join('  ·  ')}
                    </p>
                  </div>
                )}
                {stat('No outcome / notes', `${s.noOutcome} / ${s.noNotes}`, s.activities ? `${pct(s.noOutcome)} / ${pct(s.noNotes)}` : undefined, s.noOutcome + s.noNotes > 0)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live feed */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
          <p style={th}>Feed{repFilter !== 'all' ? ' · ' + (repName.get(repFilter) || '') : ''}</p>
          <p style={{ ...th, textTransform: 'none' }}>{feed.length} activit{feed.length === 1 ? 'y' : 'ies'}</p>
        </div>
        {feed.length === 0 ? <p style={{ color: '#9ca3af', fontSize: '14px', padding: '32px', textAlign: 'center', margin: 0 }}>{loading ? 'Loading…' : 'Nothing logged in this period.'}</p> : feed.slice(0, shown).map(f => {
          const note = firstLine(f.notes);
          return (
            <div key={f.id} onClick={() => f.prospect_id && onOpenProspect(f.prospect_id)} title={f.prospect_id ? 'Open prospect' : undefined}
              style={{ display: 'flex', gap: '14px', padding: '12px 24px', borderBottom: '1px solid #f9fafb', cursor: f.prospect_id ? 'pointer' : 'default', flexWrap: 'wrap', alignItems: 'flex-start' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <div style={{ width: '130px', flexShrink: 0 }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: 700, margin: 0 }}>{feedTime(f.created_at, now)}</p>
                <p style={sub}><BlurField>{repName.get(f.rep_id) || 'Unknown'}</BlurField>{f.role_at && f.role_at !== repRole.get(f.rep_id) && <span style={{ color: '#5b21b6' }}> · as {ROLE_LABEL[f.role_at] || f.role_at}</span>}</p>
              </div>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: 600, margin: '0 0 2px 0' }}>
                  <span style={{ backgroundColor: '#e5e7eb', color: '#374151', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', marginRight: '8px' }}>{f.type}</span>
                  <BlurField>{f.company_name || 'Unknown company'}</BlurField>
                </p>
                <p style={{ fontSize: '12px', margin: '0 0 2px 0', color: (f.outcome || '').trim() ? '#374151' : '#b45309', fontWeight: (f.outcome || '').trim() ? 400 : 600 }}>{(f.outcome || '').trim() || 'No outcome'}</p>
                <p style={{ fontSize: '12px', margin: 0, color: note ? '#6b7280' : '#b45309', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note ? <BlurField>{note}</BlurField> : 'No notes'}</p>
              </div>
            </div>
          );
        })}
        {feed.length > shown && <button onClick={() => setShown(n => n + FEED_PAGE)} style={{ width: '100%', padding: '12px', background: 'none', border: 'none', borderTop: '1px solid #f3f4f6', color: '#0f2318', fontWeight: 700, cursor: 'pointer' }}>Show more ({feed.length - shown} older)</button>}
      </div>
      <p style={{ color: '#9ca3af', fontSize: '11px', margin: '12px 0 0 0' }}>
        Allocated, activities, calls/emails, follow-ups scheduled and first touch cover the selected dates. Touched/untouched and overdue follow-ups are as of now.
        First touch = average time from an allocation to that rep&apos;s first logged activity on the prospect. Missing info counts activities in the period with no outcome or no notes.
      </p>
    </div>
  );
}
