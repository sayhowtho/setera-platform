'use client';
import { useState } from 'react';
import type { CompensationProgress } from '@/lib/compensation';

// Monthly MRR sprint (Sales Compensation Structure): new MRR in the person's
// monthly performance period; highest tier only; awarded at period close,
// due 7 days later. Same component on /setter, /rep and Rep Management.

const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
const day = (dateStr: string) => new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayIso = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Regina' });

export default function SprintProgress({ sprint, dark = false, compact = false }: { sprint: NonNullable<CompensationProgress['sprint']>; dark?: boolean; compact?: boolean }) {
  const c = dark
    ? { text: '#fff', sub: 'rgba(255,255,255,0.45)', track: 'rgba(255,255,255,0.1)', box: 'rgba(255,255,255,0.06)', accent: '#00d4aa', warn: '#fbbf24' }
    : { text: '#0a1f13', sub: '#6b7280', track: '#f3f4f6', box: '#f9fafb', accent: '#10b981', warn: '#b45309' };
  const { current, tiers, history } = sprint;
  const top = tiers[tiers.length - 1].threshold;
  const reached = [...tiers].reverse().find(t => t.achieved);
  const [now] = useState(() => Date.now()); // for the overdue colour; fixed per render pass
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <p style={{ color: c.text, fontSize: compact ? '15px' : '20px', fontWeight: 800, margin: 0 }}>{fmt(current.newMRR)} <span style={{ color: c.sub, fontSize: '12px', fontWeight: 500 }}>new MRR</span></p>
        <p style={{ color: c.sub, fontSize: '11px', margin: 0 }}>Period {current.index + 1}: {day(current.startDate)} – {day(current.endDate)} · {sprint.daysRemaining} day{sprint.daysRemaining === 1 ? '' : 's'} left</p>
      </div>
      <div style={{ position: 'relative', height: '8px', backgroundColor: c.track, borderRadius: '99px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ height: '100%', width: Math.min(100, (current.newMRR / top) * 100) + '%', backgroundColor: c.accent, borderRadius: '99px' }} />
        {tiers.slice(0, -1).map(t => <div key={t.threshold} style={{ position: 'absolute', top: 0, bottom: 0, left: (t.threshold / top) * 100 + '%', width: '2px', backgroundColor: dark ? '#0f2318' : '#fff' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        {tiers.map(t => (
          <div key={t.threshold} style={{ backgroundColor: c.box, borderRadius: '8px', padding: '8px 10px', outline: reached?.threshold === t.threshold ? `2px solid ${c.accent}` : 'none' }}>
            <p style={{ color: c.sub, fontSize: '10px', fontWeight: 700, margin: 0 }}>{fmt(t.threshold)}+</p>
            <p style={{ color: t.achieved ? c.accent : c.text, fontSize: '13px', fontWeight: 700, margin: 0 }}>{fmt(t.amount)}</p>
            <p style={{ color: c.sub, fontSize: '11px', margin: 0 }}>{t.achieved ? 'reached' : fmt(t.threshold - current.newMRR) + ' to go'}</p>
          </div>
        ))}
      </div>
      <p style={{ color: c.sub, fontSize: '11px', margin: '6px 0 0 0' }}>Highest tier reached pays when the period closes, due within 7 days. Counts each new client&apos;s first plan once they&apos;ve paid their first month.</p>
      {history.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ color: c.text, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>Closed periods</p>
          {history.slice(0, compact ? 3 : 6).map(h => {
            const overdue = h.award && h.award.due_at && Date.parse(h.award.due_at) < now;
            return (
              <div key={h.index} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', padding: '4px 0', borderTop: `1px solid ${c.track}` }}>
                <span style={{ color: c.text }}>{day(h.startDate)} – {day(h.endDate)} · {fmt(h.newMRR)}</span>
                <span style={{ color: h.award ? (overdue ? c.warn : c.accent) : c.sub, fontWeight: h.award ? 700 : 400, textAlign: 'right' }}>
                  {h.award ? `${fmt(h.award.amount)} · due ${dayIso(h.award.due_at || h.dueAt)}` : h.tier ? `${fmt(h.tier.amount)} reached · not yet awarded` : 'no tier'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
