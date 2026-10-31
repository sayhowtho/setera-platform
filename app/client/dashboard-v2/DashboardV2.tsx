'use client';

import { useRef, useState } from 'react';
import { Moon, AlertTriangle, PhoneCall, Clock, CheckCircle2, UserPlus, Phone, RotateCcw } from 'lucide-react';
import { PIPELINE_STAGES } from '@/lib/pipeline-stages';

export type AttentionType = 'urgent' | 'callback' | 'followup';
export type TranscriptLine = { role: string; text: string };

export type AttentionItem = {
  id: string;
  name: string;
  types: AttentionType[];
  title: string;
  description: string;
  date: Date;
  transcript?: TranscriptLine[];
};

export type LeadItem = {
  id: string;
  name: string;
  serviceType: string;
  city: string | null;
  stage: string | null;
  date: Date;
};

export type ActivityItem = {
  id: string;
  date: Date;
  title: string;
  description: string;
};

type DashboardV2Props = {
  businessName: string;
  minutesLimit: number;
  minutesUsed: number;
  // Defaults to the real clock; callers pass an override (e.g. Demo Roofing
  // Co's fixed "day after the seeded story" date via getEffectiveNow) so
  // relative labels below ("Today", "Yesterday") read correctly against
  // seeded data instead of the real current date.
  now?: Date;
  kpis: {
    callsThisWeek: number;
    callsLastWeek: number;
    opportunitiesThisWeek: number;
    afterHoursThisWeek: number;
  };
  needsAttention: AttentionItem[];
  recentLeads: LeadItem[];
  recentActivity: ActivityItem[];
  thisMonth: {
    callsHandled: number;
    opportunities: number;
    afterHoursCalls: number;
    estimatedPipelineValue: number;
  };
  onViewPipeline: () => void;
  onViewAnalytics: () => void;
};

const GREEN = '#00d4aa';
const DARK = '#0a1f13';
const DARKER = '#0f2318';
const MUTED = '#9ca3af';
const SUBTLE = '#6b7280';
const BORDER = '#e5e7eb';
const RED = '#ef4444';
const AMBER = '#f59e0b';
const BLUE = '#3b82f6';
const CARD_SHADOW = '0 2px 12px rgba(0,0,0,0.06)';
const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 18;

function getUsageColor(pct: number) {
  if (pct >= 90) return RED;
  if (pct >= 80) return AMBER;
  return GREEN;
}

function typeMeta(type: AttentionType) {
  if (type === 'urgent') return { label: 'URGENT', color: RED, Icon: AlertTriangle };
  if (type === 'callback') return { label: 'CALLBACK', color: BLUE, Icon: PhoneCall };
  return { label: 'FOLLOW-UP', color: AMBER, Icon: Clock };
}

function stageMeta(stage: string | null) {
  const found = PIPELINE_STAGES.find(s => s.id === (stage || 'new'));
  return found ? { label: found.label, color: found.color } : { label: stage || 'Call Captured', color: '#6b7280' };
}

function isAfterHours(date: Date): boolean {
  const h = date.getHours();
  return h < BUSINESS_HOURS_START || h >= BUSINESS_HOURS_END;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatSmartTime(date: Date, now: Date): string {
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Yesterday · ${time}`;
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateLabel} · ${time}`;
}

export default function DashboardV2({ businessName, minutesLimit, minutesUsed, now = new Date(), kpis, needsAttention, recentLeads, recentActivity, thisMonth, onViewPipeline, onViewAnalytics }: DashboardV2Props) {
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());
  const [undoId, setUndoId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeAttention = needsAttention.filter(i => !handledIds.has(i.id));
  const urgentCount = activeAttention.filter(i => i.types.includes('urgent')).length;
  const followUpCount = activeAttention.length - urgentCount;

  function markHandled(id: string) {
    setHandledIds(prev => new Set(prev).add(id));
    setUndoId(id);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoId(null), 6000);
  }

  function undoHandled(id: string) {
    setHandledIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoId(null);
  }

  const usagePct = minutesLimit > 0 ? Math.round((minutesUsed / minutesLimit) * 100) : 0;
  const usageColor = getUsageColor(usagePct);
  const weeklyChangePct = kpis.callsLastWeek > 0 ? Math.round(((kpis.callsThisWeek - kpis.callsLastWeek) / kpis.callsLastWeek) * 100) : 0;

  const kpiCards = [
    {
      label: 'Calls This Week',
      value: kpis.callsThisWeek,
      sub: kpis.callsLastWeek > 0 ? `↑ ${weeklyChangePct}% more than last week` : 'vs. last week',
      Icon: Phone,
      color: GREEN,
      tooltip: 'Total calls Emily answered in the last 7 days.',
    },
    {
      label: 'Opportunities',
      value: kpis.opportunitiesThisWeek,
      sub: 'This week',
      Icon: UserPlus,
      color: BLUE,
      tooltip: 'New opportunities Emily captured this week.',
    },
    {
      label: 'Needs Attention',
      value: activeAttention.length,
      sub: activeAttention.length === 0 ? 'All caught up' : `${urgentCount} urgent · ${followUpCount} follow-up${followUpCount === 1 ? '' : 's'}`,
      Icon: AlertTriangle,
      color: activeAttention.length > 0 ? RED : GREEN,
      tooltip: 'Open items where Emily needs a human to step in.',
    },
    {
      label: 'After Hours',
      value: kpis.afterHoursThisWeek,
      sub: 'This week',
      Icon: Moon,
      color: '#8b5cf6',
      tooltip: `Calls received outside ${businessName}'s configured business hours.`,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <h1 style={{ color: DARK, fontSize: '28px', fontWeight: 800, margin: 0 }}>Dashboard</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(0,212,170,0.12)', color: GREEN, fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: GREEN }} />
            Emily Active
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p style={{ color: SUBTLE, margin: 0, fontSize: '14px' }}>Here&apos;s what Emily has handled for {businessName}.</p>
          <span style={{ color: MUTED, fontSize: '12px' }}>· Updated moments ago</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {kpiCards.map(c => (
          <div key={c.label} title={c.tooltip} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px 22px', boxShadow: CARD_SHADOW, borderTop: `3px solid ${c.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <c.Icon size={13} color={MUTED} />
              <p style={{ color: MUTED, fontSize: '11px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{c.label}</p>
            </div>
            <p style={{ color: c.color, fontSize: '34px', fontWeight: 800, margin: '0 0 4px 0' }}>{c.value}</p>
            <p style={{ color: MUTED, fontSize: '11px', margin: 0 }}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: CARD_SHADOW, marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <p style={{ color: DARK, fontSize: '14px', fontWeight: 700, margin: '0 0 2px 0' }}>Emily Usage</p>
            <p style={{ color: MUTED, fontSize: '12px', margin: 0 }}>{Math.round(minutesUsed).toLocaleString()} of {minutesLimit.toLocaleString()} minutes used this month</p>
          </div>
          <span style={{ backgroundColor: usageColor + '18', color: usageColor, fontSize: '13px', fontWeight: 700, padding: '5px 14px', borderRadius: '20px' }}>{usagePct}%</span>
        </div>
        <div style={{ backgroundColor: '#f3f4f6', borderRadius: '99px', height: '10px', overflow: 'hidden' }}>
          <div style={{ backgroundColor: usageColor, height: '100%', width: `${usagePct}%`, borderRadius: '99px', transition: 'width 0.3s' }} />
        </div>
        <p style={{ color: MUTED, fontSize: '11px', margin: '10px 0 0 0' }}>{Math.max(0, Math.round(minutesLimit - minutesUsed)).toLocaleString()} minutes remaining</p>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: CARD_SHADOW, marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <p style={{ color: DARK, fontSize: '15px', fontWeight: 700, margin: 0 }}>Needs Attention</p>
          {activeAttention.length > 0 && (
            <span style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: RED, fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>{activeAttention.length} open</span>
          )}
        </div>

        {activeAttention.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px' }}>
            <CheckCircle2 size={26} color={GREEN} style={{ marginBottom: '10px' }} />
            <p style={{ color: DARK, fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0' }}>You&apos;re all caught up</p>
            <p style={{ color: MUTED, fontSize: '13px', margin: 0 }}>There are no calls currently requiring your team&apos;s attention. Emily will flag anything that needs your team.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeAttention.map(item => {
              const isExpanded = expandedId === item.id;
              const afterHours = isAfterHours(item.date);
              return (
                <div key={item.id} style={{ border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <p style={{ color: DARK, fontSize: '13px', fontWeight: 700, margin: 0 }}>{item.name}</p>
                        {item.types.map(t => {
                          const meta = typeMeta(t);
                          return (
                            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: meta.color + '18', color: meta.color, fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                              <meta.Icon size={10} />
                              {meta.label}
                            </span>
                          );
                        })}
                      </div>
                      <p style={{ color: '#374151', fontSize: '13px', fontWeight: 600, margin: '0 0 2px 0' }}>{item.title}</p>
                      <p style={{ color: MUTED, fontSize: '12px', margin: '0 0 6px 0', lineHeight: 1.5 }}>{item.description}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {afterHours && <Moon size={11} color="#8b5cf6" />}
                        <span style={{ color: MUTED, fontSize: '11px' }}>{afterHours ? 'After Hours · ' : ''}{formatSmartTime(item.date, now)}</span>
                      </div>
                      {isExpanded && item.transcript && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                          {item.transcript.length === 0 ? (
                            <p style={{ color: MUTED, fontSize: '12px', margin: 0 }}>No transcript available.</p>
                          ) : item.transcript.map((line, i) => (
                            <div key={i} style={{ padding: '8px 12px', backgroundColor: line.role === 'agent' ? '#f0f4f1' : '#fff', borderRadius: '8px', border: line.role === 'agent' ? 'none' : `1px solid ${BORDER}`, borderLeft: `3px solid ${line.role === 'agent' ? GREEN : BORDER}` }}>
                              <p style={{ color: line.role === 'agent' ? GREEN : MUTED, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 3px 0', letterSpacing: '0.05em' }}>{line.role === 'agent' ? 'Emily' : 'Caller'}</p>
                              <p style={{ color: '#374151', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>{line.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => setExpandedId(isExpanded ? null : item.id)} style={{ backgroundColor: 'transparent', border: `1px solid ${BORDER}`, color: SUBTLE, padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {isExpanded ? 'Hide' : 'View Call'}
                      </button>
                      <button onClick={() => markHandled(item.id)} style={{ backgroundColor: DARKER, border: 'none', color: GREEN, padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Mark Handled
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {undoId && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <span style={{ color: SUBTLE, fontSize: '12px' }}>Marked as handled.</span>
            <button onClick={() => undoHandled(undoId)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'transparent', border: 'none', color: GREEN, fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              <RotateCcw size={12} /> Undo
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: CARD_SHADOW }}>
          <p style={{ color: DARK, fontSize: '15px', fontWeight: 700, margin: '0 0 16px 0' }}>Recent Leads</p>
          {recentLeads.length === 0 ? (
            <p style={{ color: MUTED, fontSize: '13px', margin: 0 }}>No opportunities captured yet.</p>
          ) : (
            <div>
              {recentLeads.map(lead => {
                const stage = stageMeta(lead.stage);
                return (
                  <div key={lead.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <p style={{ color: DARK, fontSize: '13px', fontWeight: 700, margin: '0 0 2px 0' }}>{lead.name}</p>
                      <p style={{ color: MUTED, fontSize: '12px', margin: 0 }}>{lead.serviceType}{lead.city ? ` · ${lead.city}` : ''}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ backgroundColor: stage.color + '18', color: stage.color, fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', display: 'inline-block', marginBottom: '4px' }}>{stage.label}</span>
                      <p style={{ color: MUTED, fontSize: '11px', margin: 0 }}>{formatSmartTime(lead.date, now)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={onViewPipeline} style={{ marginTop: '14px', backgroundColor: 'transparent', border: 'none', color: DARKER, fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>View Pipeline →</button>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: CARD_SHADOW }}>
          <p style={{ color: DARK, fontSize: '15px', fontWeight: 700, margin: '0 0 16px 0' }}>Recent Activity</p>
          {recentActivity.length === 0 ? (
            <p style={{ color: MUTED, fontSize: '13px', margin: 0 }}>No activity yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {recentActivity.map(ev => {
                const afterHours = isAfterHours(ev.date);
                return (
                  <div key={ev.id} style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: GREEN, marginTop: '6px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                        <span style={{ color: MUTED, fontSize: '11px', fontWeight: 600 }}>{formatSmartTime(ev.date, now)}</span>
                        {afterHours && <Moon size={11} color="#8b5cf6" />}
                      </div>
                      <p style={{ color: DARK, fontSize: '13px', fontWeight: 700, margin: '0 0 2px 0' }}>{ev.title}</p>
                      <p style={{ color: MUTED, fontSize: '12px', margin: 0, lineHeight: 1.5 }}>{ev.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ backgroundColor: DARKER, borderRadius: '14px', padding: '24px 28px', boxShadow: CARD_SHADOW, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <p style={{ color: GREEN, fontSize: '12px', fontWeight: 700, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This Month</p>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {[
              { label: 'Calls Handled', value: thisMonth.callsHandled.toLocaleString() },
              { label: 'Opportunities', value: thisMonth.opportunities.toLocaleString() },
              { label: 'After-Hours Calls', value: thisMonth.afterHoursCalls.toLocaleString() },
              { label: 'Estimated Pipeline', value: `$${thisMonth.estimatedPipelineValue.toLocaleString()}` },
            ].map(s => (
              <div key={s.label}>
                <p style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 2px 0' }}>{s.value}</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onViewAnalytics} style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>View Full Analytics →</button>
      </div>
    </div>
  );
}
