'use client';
import type { MilestoneProgress as Progress } from '@/lib/compensation';

// 12-month MRR milestones (getMilestoneProgress / computeMilestoneProgress in
// lib/compensation.ts; the award logic uses the same numbers). Used in High Table → Rep
// Management (light) and the /rep dashboard (dark).

const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Regina' });
// windowEnd is exclusive (start of the day after the window); show the last day.
const lastDay = (iso: string) => day(new Date(Date.parse(iso) - 1).toISOString());

export default function MilestoneProgress({ progress, dark = false, showDiscrepancies = false }: { progress: Progress | null; dark?: boolean; showDiscrepancies?: boolean }) {
  const c = dark
    ? { text: '#fff', sub: 'rgba(255,255,255,0.45)', track: 'rgba(255,255,255,0.1)', box: 'rgba(255,255,255,0.06)', accent: '#00d4aa', warnBg: 'rgba(245,158,11,0.12)', warn: '#fbbf24' }
    : { text: '#0a1f13', sub: '#9ca3af', track: '#f3f4f6', box: '#f9fafb', accent: '#10b981', warnBg: '#fffbeb', warn: '#92400e' };
  if (!progress) return <p style={{ color: c.sub, fontSize: '12px', margin: 0 }}>12-month milestones start once compensation tracking is set up.</p>;
  const top = progress.thresholds[progress.thresholds.length - 1].threshold;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        <p style={{ color: c.text, fontSize: '20px', fontWeight: 800, margin: 0 }}>{fmt(progress.windowMRR)} <span style={{ color: c.sub, fontSize: '12px', fontWeight: 500 }}>MRR counted</span></p>
        <p style={{ color: c.sub, fontSize: '11px', margin: 0 }}>{day(progress.windowStart)} – {lastDay(progress.windowEnd)}{progress.windowOpen ? '' : ' (closed)'}</p>
      </div>
      <div style={{ position: 'relative', height: '8px', backgroundColor: c.track, borderRadius: '99px', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: Math.min(100, (progress.windowMRR / top) * 100) + '%', backgroundColor: c.accent, borderRadius: '99px' }} />
        {progress.thresholds.slice(0, -1).map(t => <div key={t.type} style={{ position: 'absolute', top: 0, bottom: 0, left: (t.threshold / top) * 100 + '%', width: '2px', backgroundColor: dark ? '#0f2318' : '#fff' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        {progress.thresholds.map((t, i) => (
          <div key={t.type} style={{ backgroundColor: c.box, borderRadius: '8px', padding: '8px 10px' }}>
            <p style={{ color: c.sub, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Milestone {i + 1}</p>
            <p style={{ color: t.reached ? c.accent : c.text, fontSize: '13px', fontWeight: 700, margin: 0 }}>{fmt(t.threshold)}</p>
            <p style={{ color: c.sub, fontSize: '11px', margin: 0 }}>{t.awarded ? 'awarded' : t.reached ? 'reached' : fmt(Math.max(0, t.threshold - progress.windowMRR)) + ' to go'}</p>
          </div>
        ))}
      </div>
      <p style={{ color: c.sub, fontSize: '11px', margin: '8px 0 0 0' }}>
        {progress.clients.filter(x => x.inWindow).length} client(s) in the window · initial plan of each, first 6 included
      </p>
      {showDiscrepancies && progress.notes.length > 0 && (
        <div style={{ backgroundColor: c.warnBg, borderRadius: '8px', padding: '8px 10px', marginTop: '8px' }}>
          {progress.notes.map(d => <p key={d} style={{ color: c.warn, fontSize: '11px', margin: '2px 0' }}>• {d}</p>)}
        </div>
      )}
    </div>
  );
}
