'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { isDashboardV2Enabled, getEffectiveNow } from '@/lib/demo-account';
import { normalizePhoneNumber } from '@/lib/phone';
import { estimatePipelineValue } from '@/lib/pipeline';
import { getStatusColor, getStatusLabel } from '@/lib/call-status';
import { PIPELINE_STAGES } from '@/lib/pipeline-stages';
import { parseTranscript } from '@/lib/transcript';
import { CallTranscript } from '@/components/CallTranscript';
import { CONTACT } from '@/lib/site-content';
import DashboardV2, { type AttentionType, type AttentionItem, type LeadItem, type ActivityItem } from './dashboard-v2/DashboardV2';

type Business = {
  id: string;
  name: string;
  phone: string;
  email: string;
  industry: string;
  plan: string;
  status: string;
  created_at: string;
  tier: string | null;
  term: string | null;
  upfront_paid_usd: number | null;
  performance_goal_cad: number | null;
  goal_a_target: number | null;
  minutes_limit: number | null;
  sms_contact_1: string | null;
  sms_contact_2: string | null;
  widget_enabled: boolean;
  avg_job_value: number | null;
  currency: string | null;
  business_hours: string | null;
  services: string | null;
  urgent_triggers: string | null;
  call_forwarding_number: string | null;
  go_live_date: string | null;
};

type Call = {
  id: string;
  caller_name: string;
  caller_number: string;
  reason: string;
  urgency: string | null;
  callback_time: string | null;
  status: string;
  created_at: string;
  summary: string | null;
  transcript: any;
  mood: string | null;
  city: string | null;
  property_address: string | null;
  duration: number | null;
  pipeline_stage: string | null;
  install_date: string | null;
  install_completed: string | null;
  income_collected: number | null;
  pipeline_notes: string | null;
  channel: string;
  email: string | null;
  estimate_datetime: string | null;
  classification: string | null;
  classification_source: string | null;
  classification_confidence: number | null;
};

const CLASSIFICATIONS = [
  { id: 'opportunity', label: 'Opportunity', color: '#00d4aa' },
  { id: 'out_of_scope', label: 'Out of Scope', color: '#8b5cf6' },
  { id: 'customer', label: 'Customer', color: '#3b82f6' },
  { id: 'trade_partner', label: 'Trade / Partner', color: '#f59e0b' },
  { id: 'other', label: 'Other', color: '#6b7280' },
] as const;

function getClassificationMeta(classification: string | null) {
  return CLASSIFICATIONS.find(c => c.id === classification) || { id: 'unclassified', label: 'Unclassified', color: '#9ca3af' };
}

const AI_BACKFILL_REVIEW_THRESHOLD = 0.70;

function needsReview(call: Call): boolean {
  const isAiClassified = call.classification_source === 'ai_backfill' || call.classification_source === 'ai_auto';
  return isAiClassified && (call.classification_confidence ?? 1) < AI_BACKFILL_REVIEW_THRESHOLD;
}

const TIER_MINUTES: Record<string, number> = {
  starter: 3000,
  pro: 8000,
  regional: 20000,
  enterprise: 50000,
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  return diff + 'd ago';
}

function getUsageColor(pct: number) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 80) return '#f59e0b';
  return '#00d4aa';
}

function daysInStage(call: Call) {
  const d = Math.floor((Date.now() - new Date(call.created_at).getTime()) / 86400000);
  return d === 0 ? 'Today' : d + 'd';
}

export default function ClientPortal() {
  const [tab, setTab] = useState('dashboard');
  const [business, setBusiness] = useState<Business | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [expandedWebLead, setExpandedWebLead] = useState<string | null>(null);
  const [selectedPipelineCall, setSelectedPipelineCall] = useState<Call | null>(null);
  const [pipelineView, setPipelineView] = useState<'board' | 'list'>('board');
  const [pipelineForm, setPipelineForm] = useState({ stage: '', install_date: '', install_completed: '', income_collected: '', pipeline_notes: '' });
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [addLeadForm, setAddLeadForm] = useState({ caller_name: '', caller_number: '', email: '', service_type: '', estimate_datetime: '', pipeline_stage: 'new', notes: '' });
  const [savingAddLead, setSavingAddLead] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ business_hours: '', services: '', urgent_triggers: '', sms_contact_1: '', sms_contact_2: '', avg_job_value: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [draggedCallId, setDraggedCallId] = useState<string | null>(null);
  const [draggedGroupKey, setDraggedGroupKey] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [pendingGroupMove, setPendingGroupMove] = useState<{ calls: Call[]; targetStageId: string; targetLabel: string; name: string } | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [analyticsPeriod, setAnalyticsPeriod] = useState<1|7|30|90>(7);
  const [callFilter, setCallFilter] = useState<'all' | 'opportunity' | 'out_of_scope' | 'customer' | 'trade_partner' | 'other' | 'needs_review'>('all');
  const [retroactivePrompt, setRetroactivePrompt] = useState<{ normalized: string; classification: string; count: number } | null>(null);
  const [callSearch, setCallSearch] = useState('');
  const router = useRouter();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/auth/login'); return; }
    const { data: profile } = await supabase.from('profiles').select('role, business_id').eq('id', user.id).single();
    if (!profile || profile.role !== 'client') { router.push('/auth/login'); return; }
    if (profile.business_id) {
      const { data: clientRow } = await supabase.from('clients').select('status').eq('business_id', profile.business_id).maybeSingle();
      if (clientRow?.status === 'Paused') { await supabase.auth.signOut({ scope: 'local' }); router.push('/auth/login'); return; }
      const { data: biz } = await supabase.from('businesses').select('*').eq('id', profile.business_id).single();
      if (biz?.status === 'locked') { await supabase.auth.signOut({ scope: 'local' }); router.push('/service-ended'); return; }
      if (biz) {
        setBusiness(biz);
        setSettingsForm({ business_hours: biz.business_hours || '', services: biz.services || '', urgent_triggers: biz.urgent_triggers || '', sms_contact_1: biz.sms_contact_1 || '', sms_contact_2: biz.sms_contact_2 || '', avg_job_value: biz.avg_job_value ? String(biz.avg_job_value) : '' });
      }
      const { data: callData } = await supabase.from('calls').select('*').eq('business_id', profile.business_id).order('created_at', { ascending: false });
      if (callData) {
        // Phone-number classification memory: gated to Demo Roofing for now,
        // same as the rest of the V2 classification work. Resolves any
        // unclassified call whose normalized number matches a previously
        // manually-classified number, tagging it 'remembered' (never
        // 'manual') so it stays visibly distinct and one click from
        // being overridden.
        setCalls(await applyRememberedClassifications(profile.business_id, callData));
      }
    }
    setLoading(false);
  }

  async function applyRememberedClassifications(businessId: string, callsList: Call[]): Promise<Call[]> {
    const unclassified = callsList.filter(c => c.classification == null && c.caller_number);
    if (unclassified.length === 0) return callsList;
    const { data: memory } = await supabase.from('caller_classifications').select('phone_number_normalized, classification').eq('business_id', businessId);
    if (!memory || memory.length === 0) return callsList;
    const memoryMap = new Map(memory.map(m => [m.phone_number_normalized, m.classification]));
    const toUpdate: { id: string; classification: string }[] = [];
    const merged = callsList.map(c => {
      if (c.classification != null) return c;
      const normalized = normalizePhoneNumber(c.caller_number);
      const remembered = normalized ? memoryMap.get(normalized) : undefined;
      if (!remembered) return c;
      toUpdate.push({ id: c.id, classification: remembered });
      return { ...c, classification: remembered, classification_source: 'remembered' };
    });
    for (const u of toUpdate) {
      await supabase.from('calls').update({ classification: u.classification, classification_source: 'remembered' }).eq('id', u.id);
    }
    return merged;
  }

  async function updateCallStatus(callId: string, status: string) {
    await supabase.from('calls').update({ status }).eq('id', callId);
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, status } : c));
  }

  async function moveToStage(callId: string, stage: string) {
    await supabase.from('calls').update({ pipeline_stage: stage }).eq('id', callId);
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, pipeline_stage: stage } : c));
  }

  async function updateCallClassification(callId: string, classification: string) {
    await supabase.from('calls').update({ classification, classification_source: 'manual' }).eq('id', callId);
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, classification, classification_source: 'manual' } : c));
    if (!business) return;
    const call = calls.find(c => c.id === callId);
    const normalized = normalizePhoneNumber(call?.caller_number);
    if (!normalized) return;
    const { error: memoryError } = await supabase.from('caller_classifications').upsert(
      { business_id: business.id, phone_number_normalized: normalized, phone_number_raw: call?.caller_number || null, classification, updated_at: new Date().toISOString() },
      { onConflict: 'business_id,phone_number_normalized' }
    );
    if (memoryError) { console.error('caller_classifications upsert failed:', memoryError); return; }
    // Forward-only by default: other past calls from this number are NOT
    // rewritten automatically. Surface them as an explicit, opt-in prompt
    // instead of silently changing pipeline/history for the client.
    const otherCalls = calls.filter(c => c.id !== callId && c.classification !== classification && normalizePhoneNumber(c.caller_number) === normalized);
    if (otherCalls.length > 0) setRetroactivePrompt({ normalized, classification, count: otherCalls.length });
  }

  async function applyClassificationToPastCalls() {
    if (!retroactivePrompt) return;
    const { normalized, classification } = retroactivePrompt;
    const matchingIds = calls.filter(c => normalizePhoneNumber(c.caller_number) === normalized && c.classification !== classification).map(c => c.id);
    if (matchingIds.length > 0) {
      await supabase.from('calls').update({ classification, classification_source: 'manual' }).in('id', matchingIds);
      setCalls(prev => prev.map(c => matchingIds.includes(c.id) ? { ...c, classification, classification_source: 'manual' } : c));
    }
    setRetroactivePrompt(null);
  }

  async function addManualLead() {
    if (!business || !addLeadForm.caller_name || !addLeadForm.caller_number) return;
    setSavingAddLead(true);
    const insert = {
      business_id: business.id,
      caller_name: addLeadForm.caller_name,
      caller_number: addLeadForm.caller_number,
      email: addLeadForm.email || null,
      reason: addLeadForm.service_type || 'Manual entry',
      estimate_datetime: addLeadForm.estimate_datetime ? new Date(addLeadForm.estimate_datetime).toISOString() : null,
      pipeline_stage: addLeadForm.pipeline_stage,
      pipeline_notes: addLeadForm.notes ? '[Manual Entry] ' + addLeadForm.notes : '[Manual Entry]',
      status: 'green',
      duration: 0,
      classification: 'opportunity',
      classification_source: 'manual',
    };
    const { data: newCall } = await supabase.from('calls').insert(insert).select().single();
    if (newCall) setCalls(prev => [newCall, ...prev]);
    setShowAddLeadModal(false);
    setAddLeadForm({ caller_name: '', caller_number: '', email: '', service_type: '', estimate_datetime: '', pipeline_stage: 'new', notes: '' });
    setSavingAddLead(false);
  }

  async function savePipelineUpdate() {
    if (!selectedPipelineCall) return;
    setSavingPipeline(true);
    const update: any = { pipeline_stage: pipelineForm.stage };
    if (pipelineForm.install_date) update.install_date = pipelineForm.install_date;
    if (pipelineForm.install_completed) update.install_completed = pipelineForm.install_completed;
    if (pipelineForm.income_collected) update.income_collected = parseFloat(pipelineForm.income_collected);
    if (pipelineForm.pipeline_notes) update.pipeline_notes = pipelineForm.pipeline_notes;
    await supabase.from('calls').update(update).eq('id', selectedPipelineCall.id);
    setCalls(prev => prev.map(c => c.id === selectedPipelineCall.id ? { ...c, ...update } : c));
    setSelectedPipelineCall(null);
    setSavingPipeline(false);
  }

  async function saveSettings() {
    if (!business) return;
    setSavingSettings(true);
    setSettingsError('');
    const update = { business_hours: settingsForm.business_hours, services: settingsForm.services, urgent_triggers: settingsForm.urgent_triggers, sms_contact_1: settingsForm.sms_contact_1, sms_contact_2: settingsForm.sms_contact_2, avg_job_value: settingsForm.avg_job_value ? parseFloat(settingsForm.avg_job_value) : null };
    // Clients have no UPDATE policy on businesses (it would expose every
    // column, incl. status) — this RPC writes only these six fields.
    const { error } = await supabase.rpc('update_my_business_settings', {
      p_business_hours: update.business_hours, p_services: update.services, p_urgent_triggers: update.urgent_triggers,
      p_sms_contact_1: update.sms_contact_1, p_sms_contact_2: update.sms_contact_2, p_avg_job_value: update.avg_job_value,
    });
    setSavingSettings(false);
    if (error) { setSettingsError('Settings could not be saved. Please try again, or contact Setera if it keeps happening.'); return; }
    setBusiness(prev => prev ? { ...prev, ...update } : prev);
    setSettingsSuccess('Settings saved.');
    setTimeout(() => setSettingsSuccess(''), 3000);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: '#6b7280' }}>Loading...</p>
    </div>
  );

  const now = getEffectiveNow(business);
  const minutesUsed = calls
    .filter(c => { const d = new Date(c.created_at); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
    .reduce((sum, c) => sum + (c.duration || 0), 0) / 60;
  const minutesLimit = business?.minutes_limit || TIER_MINUTES[business?.tier || 'starter'] || 3000;
  const usagePct = Math.round((minutesUsed / minutesLimit) * 100);
  const usageColor = getUsageColor(usagePct);
  const phoneCalls = calls.filter(c => c.channel === 'phone' || !c.channel);
  const urgentCalls = phoneCalls.filter(c => c.status === 'red');
  const afterHoursCalls = phoneCalls.filter(c => { const h = new Date(c.created_at).getHours(); return h < 8 || h >= 18; });
  const thisWeek = phoneCalls.filter(c => now.getTime() - new Date(c.created_at).getTime() < 7 * 86400000);
  const lastWeek = phoneCalls.filter(c => { const d = now.getTime() - new Date(c.created_at).getTime(); return d >= 7 * 86400000 && d < 14 * 86400000; });

  // Real data for DashboardV2 (KPIs, Needs Attention, Recent Leads, Recent
  // Activity, Estimated Pipeline) — all derived from the same business_id-
  // scoped `calls` state everything else on this page already uses. No new
  // query, no new client-side filter — same security posture as the rest
  // of this file.
  const thisMonthCalls = phoneCalls.filter(c => { const d = new Date(c.created_at); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
  const dashboardKpis = {
    callsThisWeek: thisWeek.length,
    callsLastWeek: lastWeek.length,
    opportunitiesThisWeek: thisWeek.filter(c => c.classification === 'opportunity').length,
    afterHoursThisWeek: thisWeek.filter(c => { const h = new Date(c.created_at).getHours(); return h < 8 || h >= 18; }).length,
  };
  const dashboardNeedsAttention: AttentionItem[] = phoneCalls
    .filter(c => c.status === 'red' || c.status === 'yellow')
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map(c => {
      const types: AttentionType[] = [];
      if (c.status === 'red') types.push('urgent');
      if (c.status === 'yellow') types.push('followup');
      if (c.callback_time) types.push('callback');
      return {
        id: c.id,
        name: c.caller_name || 'Unknown caller',
        types,
        title: c.reason || 'Call requires attention',
        description: c.summary || 'No additional details captured.',
        date: new Date(c.created_at),
        transcript: parseTranscript(c.transcript).map(l => ({ role: l.role, text: l.message || l.text || '' })),
      };
    });
  const dashboardRecentLeads: LeadItem[] = phoneCalls
    .filter(c => c.classification === 'opportunity')
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      name: c.caller_name || 'Unknown caller',
      serviceType: c.reason || 'Not specified',
      city: c.city,
      stage: c.pipeline_stage,
      date: new Date(c.created_at),
    }));
  function dashboardActivityTitle(c: Call): string {
    if (c.status === 'red') return 'Urgent call flagged';
    if (c.status === 'yellow') return 'Follow-up requested';
    if (c.classification === 'opportunity') return 'New opportunity captured';
    if (c.classification === 'out_of_scope') return 'Out-of-scope request';
    if (c.classification === 'customer') return 'Existing customer inquiry';
    if (c.classification === 'trade_partner') return 'Trade/partner call logged';
    return 'Call handled';
  }
  function dashboardActivityDescription(c: Call): string {
    const detail = [c.reason, c.city].filter(Boolean).join(' · ') || c.summary || 'No additional details captured.';
    return `${c.caller_name || 'Unknown caller'} — ${detail}`;
  }
  const dashboardRecentActivity: ActivityItem[] = phoneCalls
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 7)
    .map(c => ({ id: c.id, date: new Date(c.created_at), title: dashboardActivityTitle(c), description: dashboardActivityDescription(c) }));
  const dashboardThisMonthOpportunities = thisMonthCalls.filter(c => c.classification === 'opportunity');
  const dashboardThisMonth = {
    callsHandled: thisMonthCalls.length,
    opportunities: dashboardThisMonthOpportunities.length,
    afterHoursCalls: thisMonthCalls.filter(c => { const h = new Date(c.created_at).getHours(); return h < 8 || h >= 18; }).length,
    estimatedPipelineValue: estimatePipelineValue(dashboardThisMonthOpportunities, business?.avg_job_value),
  };
  // Pipeline shows unclassified calls too (treated as opportunities by default)
  // until something actively reclassifies them away — classification can
  // still be null (auto-classification is best-effort and can fail), so
  // this keeps existing pipeline records visible instead of the board
  // silently going empty.
  // Null classification means "unclassified," not "opportunity" — only an
  // explicit 'opportunity' tag qualifies for Pipeline.
  const opportunityCalls = phoneCalls.filter(c => c.classification === 'opportunity');
  // Group Pipeline display by normalized phone number so one person never
  // appears in multiple columns — display-only, calls table untouched.
  // Furthest-along stage wins (not most recent call) so an unrelated later
  // call with no stage can never make an already-signed deal look "new"
  // again; ties broken by most recent call, which is safe once the stage
  // is already equal.
  const pipelineGroups = (() => {
    const stageIndex = (stageId: string | null) => {
      const idx = PIPELINE_STAGES.findIndex(s => s.id === (stageId || 'new'));
      return idx === -1 ? 0 : idx;
    };
    const groups = new Map<string, Call[]>();
    for (const c of opportunityCalls) {
      const key = normalizePhoneNumber(c.caller_number) || c.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return Array.from(groups.entries()).map(([key, groupCalls]) => {
      const leadCall = groupCalls.reduce((best, c) => {
        const bi = stageIndex(best.pipeline_stage), ci = stageIndex(c.pipeline_stage);
        if (ci > bi) return c;
        if (ci === bi && new Date(c.created_at) > new Date(best.created_at)) return c;
        return best;
      });
      return { key, calls: groupCalls, leadCall, displayStage: leadCall.pipeline_stage || 'new' };
    });
  })();

  function openPipelineDetail(call: Call) {
    setSelectedPipelineCall(call);
    setPipelineForm({ stage: call.pipeline_stage || 'new', install_date: call.install_date || '', install_completed: call.install_completed || '', income_collected: call.income_collected ? String(call.income_collected) : '', pipeline_notes: call.pipeline_notes || '' });
  }

  async function confirmGroupMove() {
    if (!pendingGroupMove) return;
    const changingIds = pendingGroupMove.calls.filter(c => c.pipeline_stage !== pendingGroupMove.targetStageId).map(c => c.id);
    if (changingIds.length > 0) {
      await supabase.from('calls').update({ pipeline_stage: pendingGroupMove.targetStageId }).in('id', changingIds);
      setCalls(prev => prev.map(c => changingIds.includes(c.id) ? { ...c, pipeline_stage: pendingGroupMove.targetStageId } : c));
    }
    setPendingGroupMove(null);
  }

  const filteredCalls = phoneCalls
    .filter(c => callFilter === 'all' || (callFilter === 'needs_review' ? needsReview(c) : c.classification === callFilter))
    .filter(c => {
      if (!callSearch.trim()) return true;
      const q = callSearch.trim().toLowerCase();
      return (c.caller_name || '').toLowerCase().includes(q) || (c.caller_number || '').toLowerCase().includes(q) || (c.reason || '').toLowerCase().includes(q);
    });
  const totalIncomeCollected = calls.reduce((sum, c) => sum + (c.income_collected || 0), 0);

  // Calendar events
  const calendarEvents: Record<string, { label: string; color: string }[]> = {};
  calls.forEach(c => {
    if (c.install_date) {
      const d = c.install_date;
      if (!calendarEvents[d]) calendarEvents[d] = [];
      calendarEvents[d].push({ label: (c.caller_name || 'Job') + ' — Install Start', color: '#06b6d4' });
    }
    if (c.install_completed) {
      const d = c.install_completed;
      if (!calendarEvents[d]) calendarEvents[d] = [];
      calendarEvents[d].push({ label: (c.caller_name || 'Job') + ' — Install Done', color: '#10b981' });
    }
    if (c.pipeline_stage === 'estimate_booked') {
      const d = c.created_at.split('T')[0];
      if (!calendarEvents[d]) calendarEvents[d] = [];
      calendarEvents[d].push({ label: (c.caller_name || 'Lead') + ' — Estimate Booked', color: '#8b5cf6' });
    }
  });

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };
  const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'calls', label: 'Call Log' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'settings', label: 'Emily Settings' },
    { id: 'account', label: 'Account' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'webleads', label: 'Web Leads' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>

      {/* Sidebar */}
      <div style={{ width: '160px', minWidth: '160px', backgroundColor: '#0f2318', display: 'flex', flexDirection: 'column', padding: '28px 16px', position: 'fixed', height: '100vh', boxShadow: '4px 0 24px rgba(0,0,0,0.15)', zIndex: 100 }}>
        <div style={{ marginBottom: '40px', padding: '0 8px' }}>
          <h2 style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 3px 0' }}>Setera</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{business?.name || 'Client Portal'}</p>
        </div>
        {navItems.map(item => (
          <div key={item.id} onClick={() => setTab(item.id)}
            style={{ padding: '11px 12px', borderRadius: '10px', marginBottom: '4px', color: tab === item.id ? '#fff' : 'rgba(255,255,255,0.45)', backgroundColor: tab === item.id ? 'rgba(0,212,170,0.18)' : 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: tab === item.id ? '600' : '400', borderLeft: tab === item.id ? '3px solid #00d4aa' : '3px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {item.label}
            {item.id === 'calls' && urgentCalls.length > 0 && tab !== 'calls' && (
              <span style={{ backgroundColor: 'rgba(239,68,68,0.25)', color: '#ef4444', fontSize: '11px', padding: '1px 7px', borderRadius: '20px', fontWeight: '700' }}>{urgentCalls.length}</span>
            )}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: '14px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{business?.name}</p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', margin: '0 0 12px 0', textTransform: 'uppercase' }}>{business?.tier || 'Starter'}</p>
          <button onClick={async () => { await supabase.auth.signOut({ scope: 'local' }); router.push('/auth/login'); }} style={{ width: '100%', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Sign out</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px', overflowX: 'hidden' }}>

        {/* DASHBOARD */}
        {tab === 'dashboard' && isDashboardV2Enabled(business) && (
          <DashboardV2
            businessName={business?.name || 'your business'}
            minutesLimit={minutesLimit}
            minutesUsed={minutesUsed}
            now={now}
            kpis={dashboardKpis}
            needsAttention={dashboardNeedsAttention}
            recentLeads={dashboardRecentLeads}
            recentActivity={dashboardRecentActivity}
            thisMonth={dashboardThisMonth}
            onViewPipeline={() => setTab('pipeline')}
            onViewAnalytics={() => setTab('analytics')}
          />
        )}

        {tab === 'dashboard' && !isDashboardV2Enabled(business) && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Dashboard</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Here is what Emily has captured for your business.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              {[
                { label: 'This Week', value: thisWeek.length, sub: 'vs ' + lastWeek.length + ' last week', color: '#00d4aa' },
                { label: 'Urgent', value: urgentCalls.length, sub: 'SMS sent to contacts', color: '#ef4444' },
                { label: 'After Hours', value: afterHoursCalls.length, sub: 'captured outside hours', color: '#8b5cf6' },
                { label: 'Total Captured', value: phoneCalls.length, sub: 'all time', color: '#0f2318' },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '3px solid ' + s.color }}>
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{s.label}</p>
                  <p style={{ color: s.color, fontSize: '34px', fontWeight: '800', margin: '0 0 4px 0' }}>{s.value}</p>
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{s.sub}</p>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700', margin: '0 0 2px 0' }}>Emily Usage</p>
                  <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{Math.round(minutesUsed).toLocaleString()} of {minutesLimit.toLocaleString()} minutes used this month</p>
                </div>
                <span style={{ backgroundColor: usageColor + '18', color: usageColor, fontSize: '13px', fontWeight: '700', padding: '5px 14px', borderRadius: '20px' }}>{usagePct}%</span>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', borderRadius: '99px', height: '10px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: usageColor, height: '100%', width: usagePct + '%', borderRadius: '99px', transition: 'width 0.3s' }} />
              </div>
              {usagePct >= 80 && <p style={{ color: usageColor, fontSize: '12px', fontWeight: '600', margin: '10px 0 0 0' }}>{usagePct >= 90 ? '⚠️ You are near your limit. Contact your Setera rep to top up.' : '📊 You are approaching your monthly limit. Your rep has been notified.'}</p>}
            </div>
            {urgentCalls.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Urgent — Needs Callback</p>
                {urgentCalls.slice(0, 5).map(c => (
                  <div key={c.id} onClick={() => { setTab('calls'); setExpandedCall(c.id); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{c.caller_name || 'Unknown'}</p>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{c.reason || 'No reason'}</p>
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>{daysAgo(c.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CALL LOG */}
        {tab === 'calls' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Call Log</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{filteredCalls.length === phoneCalls.length ? `${phoneCalls.length} calls captured by Emily` : `${filteredCalls.length} of ${phoneCalls.length} calls`}</p>
            </div>
            {retroactivePrompt && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>
                  Found {retroactivePrompt.count} other call{retroactivePrompt.count === 1 ? '' : 's'} from this number — apply <strong>{getClassificationMeta(retroactivePrompt.classification).label}</strong> to those too?
                </p>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => setRetroactivePrompt(null)} style={{ backgroundColor: 'transparent', border: '1px solid #fde68a', color: '#92400e', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Not now</button>
                  <button onClick={applyClassificationToPastCalls} style={{ backgroundColor: '#92400e', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Apply to all</button>
                </div>
              </div>
            )}
            {(
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[{ id: 'all' as const, label: 'All', color: '#0f2318' }, ...CLASSIFICATIONS, { id: 'needs_review' as const, label: 'Needs Review', color: '#f59e0b' }].map(f => (
                    <button key={f.id} onClick={() => setCallFilter(f.id as typeof callFilter)}
                      style={{ border: '1px solid ' + (callFilter === f.id ? f.color : '#e5e7eb'), borderRadius: '20px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', backgroundColor: callFilter === f.id ? f.color : '#fff', color: callFilter === f.id ? '#fff' : '#6b7280' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <input value={callSearch} onChange={e => setCallSearch(e.target.value)} placeholder="Search name, number, or reason..."
                  style={{ marginLeft: 'auto', minWidth: '220px', padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: '20px', fontSize: '13px', color: '#0a1f13', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
              </div>
            )}
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              {phoneCalls.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center' }}>
                  <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '700', margin: '0 0 8px 0' }}>No calls yet</p>
                  <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Emily is live and ready. Calls will appear here the moment they come in.</p>
                </div>
              ) : filteredCalls.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center' }}>
                  <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '700', margin: '0 0 8px 0' }}>No calls match</p>
                  <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Try a different filter or search term.</p>
                </div>
              ) : filteredCalls.map(call => {
                const classMeta = getClassificationMeta(call.classification);
                return (
                <div key={call.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <div onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                    style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: getStatusColor(call.status), flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: 0 }}>{call.caller_name || 'Unknown caller'}</p>
                        {(() => {
                          const review = needsReview(call);
                          const isRemembered = call.classification_source === 'remembered';
                          const isAI = call.classification_source === 'ai_backfill' || call.classification_source === 'ai_auto';
                          const badgeColor = review ? '#f59e0b' : classMeta.color;
                          const suffix = review ? ' · needs review' : isRemembered ? ' · auto' : isAI ? ' · AI' : '';
                          return (
                            <span style={{ backgroundColor: badgeColor + '18', color: badgeColor, fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.03em', border: (isRemembered || isAI) ? '1px dashed ' + badgeColor + '88' : 'none' }}>{classMeta.label}{suffix}</span>
                          );
                        })()}
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{call.caller_number} · {call.reason || 'No reason'}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ backgroundColor: getStatusColor(call.status) + '18', color: getStatusColor(call.status), fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>{getStatusLabel(call.status)}</span>
                      <p style={{ color: '#9ca3af', fontSize: '11px', margin: '4px 0 0' }}>{formatDate(call.created_at)}</p>
                    </div>
                  </div>
                  {expandedCall === call.id && (
                    <div style={{ padding: '20px 24px', backgroundColor: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div>
                          <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>Call Details</p>
                          {[['Caller', call.caller_name], ['Phone', call.caller_number], ['Reason', call.reason], ['Urgency', call.urgency], ['Callback Time', call.callback_time], ['Mood', call.mood], ['Duration', call.duration ? Math.round(call.duration / 60) + ' min' : null]].filter(([, v]) => v).map(([l, v]) => (
                            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                              <span style={{ color: '#9ca3af', fontSize: '12px' }}>{l}</span>
                              <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500' }}>{v}</span>
                            </div>
                          ))}
                          {(
                            <>
                              <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px 0' }}>Classification</p>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {CLASSIFICATIONS.map(c => (
                                  <div key={c.id} onClick={() => updateCallClassification(call.id, c.id)}
                                    style={{ backgroundColor: call.classification === c.id ? c.color : c.color + '18', border: '1px solid ' + c.color + '44', borderRadius: '8px', padding: '8px', textAlign: 'center', cursor: 'pointer', color: call.classification === c.id ? '#fff' : c.color, fontSize: '12px', fontWeight: '600' }}>
                                    {c.label}
                                  </div>
                                ))}
                              </div>
                              {call.classification_source === 'manual' && (
                                <p style={{ color: '#9ca3af', fontSize: '11px', margin: '8px 0 0 0' }}>Manually classified</p>
                              )}
                              {call.classification_source === 'remembered' && (
                                <p style={{ color: '#9ca3af', fontSize: '11px', margin: '8px 0 0 0' }}>Auto-recognized from a previous call on this number — click a category to confirm or change it</p>
                              )}
                              {(call.classification_source === 'ai_backfill' || call.classification_source === 'ai_auto') && !needsReview(call) && (
                                <p style={{ color: '#9ca3af', fontSize: '11px', margin: '8px 0 0 0' }}>AI-classified from call content ({Math.round((call.classification_confidence || 0) * 100)}% confidence) — click a category to confirm or correct it</p>
                              )}
                              {(call.classification_source === 'ai_backfill' || call.classification_source === 'ai_auto') && needsReview(call) && (
                                <p style={{ color: '#b45309', fontSize: '11px', fontWeight: '600', margin: '8px 0 0 0' }}>⚠ Low-confidence AI guess ({Math.round((call.classification_confidence || 0) * 100)}% confidence) — please review and confirm the correct category</p>
                              )}
                            </>
                          )}
                        </div>
                        <div>
                          <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>AI Summary</p>
                          <p style={{ color: '#374151', fontSize: '13px', lineHeight: '1.6', margin: '0 0 16px 0' }}>{call.summary || 'No summary available.'}</p>
                          <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Update Status</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                            {[{ s: 'red', l: 'Urgent' }, { s: 'yellow', l: 'Follow Up' }, { s: 'green', l: 'Captured' }, { s: 'blue', l: 'In Progress' }].map(({ s, l }) => (
                              <div key={s} onClick={() => updateCallStatus(call.id, s)}
                                style={{ backgroundColor: call.status === s ? getStatusColor(s) : getStatusColor(s) + '18', border: '1px solid ' + getStatusColor(s) + '44', borderRadius: '8px', padding: '8px', textAlign: 'center', cursor: 'pointer', color: call.status === s ? '#fff' : getStatusColor(s), fontSize: '12px', fontWeight: '600' }}>
                                {l}
                              </div>
                            ))}
                          </div>
                          {call.classification === 'opportunity' && (
                            <button onClick={() => { openPipelineDetail(call); setTab('pipeline'); }}
                              style={{ backgroundColor: '#0f2318', color: '#00d4aa', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', width: '100%' }}>
                              {call.pipeline_stage ? 'View Pipeline →' : 'Move to Pipeline →'}
                            </button>
                          )}
                        </div>
                      </div>
                      {parseTranscript(call.transcript).length > 0 && (
                        <div>
                          <CallTranscript transcript={call.transcript} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );})}
            </div>
          </div>
        )}

        {/* PIPELINE */}
        {tab === 'pipeline' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
              <div>
                <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Pipeline</h1>
                <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Track every real opportunity from first contact to income collected.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setShowAddLeadModal(true)} style={{ backgroundColor: '#0f2318', color: '#00d4aa', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>+ Add Opportunity</button>
                <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                  <button onClick={() => setPipelineView('board')} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', backgroundColor: pipelineView === 'board' ? '#0f2318' : '#fff', color: pipelineView === 'board' ? '#00d4aa' : '#6b7280' }}>Board</button>
                  <button onClick={() => setPipelineView('list')} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', backgroundColor: pipelineView === 'list' ? '#0f2318' : '#fff', color: pipelineView === 'list' ? '#00d4aa' : '#6b7280', borderLeft: '1px solid #e5e7eb' }}>List</button>
                </div>
              </div>

            {showAddLeadModal && (
              <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '18px', fontWeight: '800', margin: '0 0 4px 0' }}>Add Opportunity Manually</p>
                      <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Walk-ins, referrals, anything outside Emily.</p>
                    </div>
                    <button onClick={() => setShowAddLeadModal(false)} style={{ backgroundColor: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>Cancel</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label style={lbl}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                      <input style={inp} placeholder="e.g. John Smith" value={addLeadForm.caller_name} onChange={e => setAddLeadForm({ ...addLeadForm, caller_name: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Phone Number <span style={{ color: '#ef4444' }}>*</span></label>
                      <input style={inp} placeholder="(306) 555-0100" value={addLeadForm.caller_number} onChange={e => setAddLeadForm({ ...addLeadForm, caller_number: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Email</label>
                      <input style={inp} type="email" placeholder="e.g. john@example.com" value={addLeadForm.email} onChange={e => setAddLeadForm({ ...addLeadForm, email: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Service / Reason</label>
                      <input style={inp} placeholder="e.g. Roof repair estimate" value={addLeadForm.service_type} onChange={e => setAddLeadForm({ ...addLeadForm, service_type: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Estimate Date &amp; Time</label>
                      <input style={inp} type="datetime-local" value={addLeadForm.estimate_datetime} onChange={e => setAddLeadForm({ ...addLeadForm, estimate_datetime: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Pipeline Stage</label>
                      <select style={inp} value={addLeadForm.pipeline_stage} onChange={e => setAddLeadForm({ ...addLeadForm, pipeline_stage: e.target.value })}>
                        {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Notes</label>
                      <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' }} placeholder="Any context on this lead..." value={addLeadForm.notes} onChange={e => setAddLeadForm({ ...addLeadForm, notes: e.target.value })} />
                    </div>
                  </div>
                  <button onClick={addManualLead} disabled={savingAddLead || !addLeadForm.caller_name || !addLeadForm.caller_number}
                    style={{ backgroundColor: '#0f2318', color: '#fff', border: 'none', padding: '13px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', width: '100%', opacity: (savingAddLead || !addLeadForm.caller_name || !addLeadForm.caller_number) ? 0.5 : 1 }}>
                    {savingAddLead ? 'Adding...' : 'Add to Pipeline'}
                  </button>
                </div>
              </div>
            )}
            </div>

            {pendingGroupMove && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>
                  Move all {pendingGroupMove.calls.length} call{pendingGroupMove.calls.length === 1 ? '' : 's'} for <strong>{pendingGroupMove.name}</strong> to <strong>{pendingGroupMove.targetLabel}</strong>?
                </p>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => setPendingGroupMove(null)} style={{ backgroundColor: 'transparent', border: '1px solid #fde68a', color: '#92400e', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={confirmGroupMove} style={{ backgroundColor: '#92400e', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Move all</button>
                </div>
              </div>
            )}

            {selectedPipelineCall && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px', border: '2px solid #00d4aa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '700', margin: '0 0 4px 0' }}>{selectedPipelineCall.caller_name || 'Unknown'}</p>
                    <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>{selectedPipelineCall.reason}</p>
                  </div>
                  <button onClick={() => setSelectedPipelineCall(null)} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div>
                    <label style={lbl}>Pipeline Stage</label>
                    <select style={inp} value={pipelineForm.stage} onChange={e => setPipelineForm({ ...pipelineForm, stage: e.target.value })}>
                      {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Income Collected ({business?.currency || 'CAD'})</label>
                    <input style={inp} type="number" placeholder="e.g. 8500" value={pipelineForm.income_collected} onChange={e => setPipelineForm({ ...pipelineForm, income_collected: e.target.value })} />
                  </div>
                  <div>
                    <label style={lbl}>Install Start Date</label>
                    <input style={inp} type="date" value={pipelineForm.install_date} onChange={e => setPipelineForm({ ...pipelineForm, install_date: e.target.value })} />
                  </div>
                  <div>
                    <label style={lbl}>Install Completed Date</label>
                    <input style={inp} type="date" value={pipelineForm.install_completed} onChange={e => setPipelineForm({ ...pipelineForm, install_completed: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={lbl}>Notes</label>
                  <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical' }} placeholder="Any notes on this job..." value={pipelineForm.pipeline_notes} onChange={e => setPipelineForm({ ...pipelineForm, pipeline_notes: e.target.value })} />
                </div>
                <button onClick={savePipelineUpdate} disabled={savingPipeline} style={{ backgroundColor: '#0f2318', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', opacity: savingPipeline ? 0.6 : 1 }}>
                  {savingPipeline ? 'Saving...' : 'Save Update'}
                </button>
              </div>
            )}

            {/* BOARD VIEW */}
            {pipelineView === 'board' && (
              <div style={{ overflowX: 'scroll', paddingBottom: '20px', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ display: 'flex', gap: '12px', minWidth: 'max-content' }}>
                  {PIPELINE_STAGES.map(stage => {
                    const stageGroups = pipelineGroups.filter(g => g.displayStage === stage.id);
                    const stageIncome = stageGroups.reduce((sum, g) => sum + (g.leadCall.income_collected || 0), 0);
                    return (
                      <div key={stage.id}
                        onDragOver={e => { e.preventDefault(); setDragOverStage(stage.id); }}
                        onDragLeave={() => setDragOverStage(null)}
                        onDrop={e => {
                          e.preventDefault();
                          if (draggedGroupKey) {
                            const group = pipelineGroups.find(g => g.key === draggedGroupKey);
                            if (group && group.displayStage !== stage.id) {
                              setPendingGroupMove({ calls: group.calls, targetStageId: stage.id, targetLabel: stage.label, name: group.leadCall.caller_name || 'Unknown' });
                            }
                            setDraggedGroupKey(null); setDragOverStage(null);
                          } else if (draggedCallId) {
                            moveToStage(draggedCallId, stage.id); setDraggedCallId(null); setDragOverStage(null);
                          }
                        }}
                        style={{ width: '160px', minWidth: '160px', backgroundColor: dragOverStage === stage.id ? stage.accent : '#f9fafb', borderRadius: '12px', padding: '14px', border: '2px dashed ' + (dragOverStage === stage.id ? stage.color : 'transparent'), minHeight: '400px', transition: 'all 0.15s', flexShrink: 0 }}>
                        <div style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid ' + stage.color + '30' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0a1f13' }}>{stage.label}</span>
                            <span style={{ backgroundColor: stage.accent, color: stage.color, fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '700', border: '1px solid ' + stage.color + '40' }}>{stageGroups.length}</span>
                          </div>
                          {stageIncome > 0 && <p style={{ color: stage.color, fontSize: '11px', fontWeight: '600', margin: 0 }}>${stageIncome.toLocaleString()} collected</p>}
                        </div>
                        {stageGroups.map(group => {
                          const call = group.leadCall;
                          const isMerged = group.calls.length > 1;
                          const isDragging = draggedCallId === call.id || draggedGroupKey === group.key;
                          return (
                          <div key={group.key} style={{ marginBottom: '8px' }}>
                            <div
                              draggable
                              onDragStart={() => { if (isMerged) setDraggedGroupKey(group.key); else setDraggedCallId(call.id); }}
                              onDragEnd={() => { setDraggedCallId(null); setDraggedGroupKey(null); setDragOverStage(null); }}
                              onClick={() => { if (isMerged) setExpandedGroupKey(expandedGroupKey === group.key ? null : group.key); else openPipelineDetail(call); }}
                              style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: isMerged ? 'pointer' : 'grab', opacity: isDragging ? 0.4 : 1, border: '0.5px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: getStatusColor(call.status), flexShrink: 0 }} />
                                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, flex: 1 }}>{call.caller_name || 'Unknown'}</p>
                                {isMerged && <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '20px', flexShrink: 0 }}>+{group.calls.length - 1} more</span>}
                              </div>
                              <p style={{ color: '#6b7280', fontSize: '11px', margin: '0 0 6px 0', lineHeight: '1.4' }}>{call.reason || 'No reason'}</p>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#9ca3af', fontSize: '10px' }}>{daysInStage(call)}</span>
                                {call.income_collected && <span style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700' }}>${call.income_collected.toLocaleString()}</span>}
                              </div>
                            </div>
                            {isMerged && expandedGroupKey === group.key && (
                              <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '6px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {group.calls.map(c => {
                                  const cStage = PIPELINE_STAGES.find(s => s.id === (c.pipeline_stage || 'new'));
                                  return (
                                    <div key={c.id} onClick={e => { e.stopPropagation(); openPipelineDetail(c); }}
                                      style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '6px 8px', cursor: 'pointer', border: '0.5px solid #e5e7eb' }}>
                                      <p style={{ color: '#374151', fontSize: '10px', margin: '0 0 2px 0' }}>{formatDate(c.created_at)} · {cStage?.label || c.pipeline_stage}</p>
                                      <p style={{ color: '#9ca3af', fontSize: '10px', margin: 0 }}>{c.reason || 'No reason'}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          );
                        })}
                        {stageGroups.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#9ca3af', fontSize: '12px', border: '1.5px dashed #e5e7eb', borderRadius: '8px' }}>Drop here</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIST VIEW */}
            {pipelineView === 'list' && (() => {
              const listGroups = pipelineGroups.filter(g => g.displayStage && g.displayStage !== 'new');
              return listGroups.length === 0 ? (
                <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '60px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '700', margin: '0 0 8px 0' }}>No jobs in pipeline yet</p>
                  <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Open a call in the Call Log and tap Move to Pipeline to start tracking.</p>
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '14px 24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                    {['Caller', 'Stage', 'Install Start', 'Install Done', 'Income', 'Actions'].map(col => (
                      <p key={col} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col}</p>
                    ))}
                  </div>
                  {listGroups.map(group => {
                    const call = group.leadCall;
                    const isMerged = group.calls.length > 1;
                    const stage = PIPELINE_STAGES.find(s => s.id === call.pipeline_stage);
                    return (
                      <div key={group.key}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '16px 24px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{call.caller_name || 'Unknown'}</p>
                              {isMerged && <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '20px' }}>+{group.calls.length - 1} more</span>}
                            </div>
                            <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{formatDate(call.created_at)}</p>
                          </div>
                          <span style={{ backgroundColor: stage ? stage.accent : '#f3f4f6', color: stage ? stage.color : '#6b7280', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600', display: 'inline-block' }}>{stage?.label || call.pipeline_stage}</span>
                          <p style={{ color: '#374151', fontSize: '12px', margin: 0 }}>{call.install_date ? formatDate(call.install_date) : '—'}</p>
                          <p style={{ color: '#374151', fontSize: '12px', margin: 0 }}>{call.install_completed ? formatDate(call.install_completed) : '—'}</p>
                          <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: 0 }}>{call.income_collected ? '$' + call.income_collected.toLocaleString() : '—'}</p>
                          <button onClick={() => { if (isMerged) setExpandedGroupKey(expandedGroupKey === group.key ? null : group.key); else openPipelineDetail(call); }}
                            style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{isMerged ? (expandedGroupKey === group.key ? 'Hide calls' : 'View calls') : 'Update'}</button>
                        </div>
                        {isMerged && expandedGroupKey === group.key && (
                          <div style={{ padding: '10px 24px 14px 24px', backgroundColor: '#f9fafb', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {group.calls.map(c => {
                              const cStage = PIPELINE_STAGES.find(s => s.id === (c.pipeline_stage || 'new'));
                              return (
                                <div key={c.id} onClick={() => openPipelineDetail(c)}
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', border: '0.5px solid #e5e7eb' }}>
                                  <div>
                                    <p style={{ color: '#374151', fontSize: '12px', margin: '0 0 2px 0' }}>{formatDate(c.created_at)}</p>
                                    <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{c.reason || 'No reason'}</p>
                                  </div>
                                  <span style={{ backgroundColor: cStage ? cStage.accent : '#f3f4f6', color: cStage ? cStage.color : '#6b7280', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{cStage?.label || c.pipeline_stage}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Total income collected from Emily-captured jobs</p>
                    <p style={{ color: '#00d4aa', fontSize: '20px', fontWeight: '800', margin: 0 }}>${totalIncomeCollected.toLocaleString()} {business?.currency || 'CAD'}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* CALENDAR */}
        {tab === 'calendar' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Calendar</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Your upcoming installs, estimates, and jobs from the pipeline.</p>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); }} style={{ backgroundColor: '#f3f4f6', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '700', color: '#0a1f13' }}>‹</button>
                <p style={{ color: '#0a1f13', fontSize: '18px', fontWeight: '700', margin: 0 }}>{MONTHS[calendarMonth]} {calendarYear}</p>
                <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }} style={{ backgroundColor: '#f3f4f6', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '700', color: '#0a1f13' }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: '#e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                {DAYS.map(d => (
                  <div key={d} style={{ backgroundColor: '#f9fafb', padding: '10px', textAlign: 'center' }}>
                    <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</p>
                  </div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={'empty-' + i} style={{ backgroundColor: '#fff', padding: '10px', minHeight: '80px' }} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                  const events = calendarEvents[dateStr] || [];
                  const isToday = dateStr === todayStr;
                  return (
                    <div key={day} style={{ backgroundColor: '#fff', padding: '8px', minHeight: '80px', position: 'relative' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: isToday ? '#0f2318' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                        <p style={{ color: isToday ? '#00d4aa' : '#374151', fontSize: '13px', fontWeight: isToday ? '800' : '500', margin: 0 }}>{day}</p>
                      </div>
                      {events.map((ev, j) => (
                        <div key={j} style={{ backgroundColor: ev.color + '18', borderLeft: '2px solid ' + ev.color, padding: '2px 6px', borderRadius: '3px', marginBottom: '2px' }}>
                          <p style={{ color: ev.color, fontSize: '10px', fontWeight: '600', margin: 0, lineHeight: '1.3' }}>{ev.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
                {[{ color: '#8b5cf6', label: 'Estimate Booked' }, { color: '#06b6d4', label: 'Install Start' }, { color: '#10b981', label: 'Install Complete' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: l.color }} />
                    <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>{l.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* EMILY SETTINGS */}
        {tab === 'settings' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Emily Settings</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Configure how Emily works for your business.</p>
            </div>
            {settingsSuccess && <div style={{ backgroundColor: '#d1fae5', border: '1px solid #10b981', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', color: '#065f46', fontSize: '14px', fontWeight: '600' }}>✓ {settingsSuccess}</div>}
            {settingsError && <div style={{ backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', color: '#991b1b', fontSize: '14px', fontWeight: '600' }}>{settingsError}</div>}
            <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🎙️</div>
              <div>
                <p style={{ color: '#fff', fontSize: '15px', fontWeight: '700', margin: '0 0 2px 0' }}>Emily — Your AI Receptionist</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>Emily answers every call, captures every lead, and notifies you instantly. She is always on.</p>
              </div>
              <span style={{ backgroundColor: '#00d4aa', color: '#000', fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', marginLeft: 'auto', flexShrink: 0 }}>Active</span>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: '760px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Business Hours</label>
                  <input style={inp} placeholder="e.g. Mon–Fri 8am–5pm, Sat 9am–1pm" value={settingsForm.business_hours} onChange={e => setSettingsForm({ ...settingsForm, business_hours: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Services Emily Knows About</label>
                  <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical' }} placeholder="e.g. Roof repairs, storm damage inspections, full replacements, gutters..." value={settingsForm.services} onChange={e => setSettingsForm({ ...settingsForm, services: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>What Makes a Call Urgent</label>
                  <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical' }} placeholder="e.g. Active leaks, water damage, storm damage, no heat in winter..." value={settingsForm.urgent_triggers} onChange={e => setSettingsForm({ ...settingsForm, urgent_triggers: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>Primary SMS Contact</label>
                  <input style={inp} placeholder="(306) 555-0100" value={settingsForm.sms_contact_1} onChange={e => setSettingsForm({ ...settingsForm, sms_contact_1: e.target.value })} />
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: '6px 0 0 0' }}>Gets an SMS recap for every urgent call</p>
                </div>
                <div>
                  <label style={lbl}>Backup SMS Contact</label>
                  <input style={inp} placeholder="(306) 555-0101" value={settingsForm.sms_contact_2} onChange={e => setSettingsForm({ ...settingsForm, sms_contact_2: e.target.value })} />
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: '6px 0 0 0' }}>Gets the same SMS if primary is unavailable</p>
                </div>
                <div>
                  <label style={lbl}>Average Job Value ({business?.currency || 'CAD'})</label>
                  <input style={inp} type="number" placeholder="e.g. 8500" value={settingsForm.avg_job_value} onChange={e => setSettingsForm({ ...settingsForm, avg_job_value: e.target.value })} />
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: '6px 0 0 0' }}>Used to estimate revenue captured on your dashboard</p>
                </div>
              </div>
              <button onClick={saveSettings} disabled={savingSettings} style={{ backgroundColor: '#0f2318', color: '#fff', border: 'none', padding: '13px 36px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', opacity: savingSettings ? 0.6 : 1 }}>
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* ACCOUNT */}
        {tab === 'account' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Account</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Your plan, status, and call forwarding setup.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Plan Details</p>
                {[
                  ['Business', business?.name],
                  ['Tier', business?.tier ? business.tier.charAt(0).toUpperCase() + business.tier.slice(1) : 'Starter'],
                  ['Term', business?.term || 'Monthly'],
                  ['Status', business?.status || 'Active'],
                  ['Go Live', business?.go_live_date ? formatDate(business.go_live_date) : '—'],
                  ['Days Active', business?.go_live_date ? String(Math.floor((Date.now() - new Date(business.go_live_date).getTime()) / 86400000)) : '—'],
                  ['Minutes Limit', (business?.minutes_limit || 3000).toLocaleString() + '/month'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>{l}</span>
                    <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '24px' }}>
                <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Call Forwarding Setup</p>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', lineHeight: '1.7', margin: '0 0 16px 0' }}>Emily answers when your phone goes unanswered. Set up call forwarding on your business phone to forward to Emily after a set number of rings.</p>
                <div style={{ backgroundColor: 'rgba(0,212,170,0.1)', borderRadius: '10px', padding: '16px', border: '1px solid rgba(0,212,170,0.2)', marginBottom: '16px' }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Your Emily Number</p>
                  <p style={{ color: '#00d4aa', fontSize: '20px', fontWeight: '800', margin: 0 }}>{business?.call_forwarding_number || 'Contact Setera to activate'}</p>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>Forward after 2–3 rings so your team always gets first chance to answer.</p>
              </div>
            </div>
            <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '16px 20px' }}>
              <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>Need to make changes to your plan?</p>
              <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Contact your Setera rep or email {CONTACT.email} — we will take care of it.</p>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab === 'analytics' && (() => {
          const now = getEffectiveNow(business).getTime();
          const periodMs = analyticsPeriod === 1 ? 86400000 : analyticsPeriod * 86400000;
          const filtered = calls.filter(c => now - new Date(c.created_at).getTime() < periodMs);
          const prev = calls.filter(c => { const d = now - new Date(c.created_at).getTime(); return d >= periodMs && d < periodMs * 2; });
          const hourCounts: Record<number, number> = {};
          filtered.forEach(c => { const h = new Date(c.created_at).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
          const peakHours = Array.from({length: 12}, (_, i) => i + 8).map(h => ({ h, count: hourCounts[h] || 0 }));
          const maxHour = Math.max(...peakHours.map(p => p.count), 1);
          const reasonCounts: Record<string, number> = {};
          filtered.forEach(c => { if (c.reason) reasonCounts[c.reason] = (reasonCounts[c.reason] || 0) + 1; });
          const topReasons = Object.entries(reasonCounts).sort(([,a],[,b]) => b-a).slice(0, 5);
          const urgent = filtered.filter(c => c.status === 'red').length;
          const followUp = filtered.filter(c => c.status === 'yellow').length;
          const captured = filtered.filter(c => c.status === 'green').length;
          const inProgress = filtered.filter(c => c.status === 'blue').length;
          const openLeads = filtered.filter(c => c.status === 'green' || c.status === 'blue');
          const prevOpenLeads = prev.filter(c => c.status === 'green' || c.status === 'blue');
          const maxStatus = Math.max(urgent, followUp, captured, inProgress, 1);
          const dayCounts: {label: string; count: number}[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(now - i * 86400000);
            const dStr = d.toISOString().split('T')[0];
            dayCounts.push({ label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], count: calls.filter(c => c.created_at.startsWith(dStr)).length });
          }
          const maxDay = Math.max(...dayCounts.map(d => d.count), 1);
          const reasonColors = ['#ef4444','#00d4aa','#3b82f6','#f59e0b','#8b5cf6'];
          return (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'28px'}}>
                <div><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Analytics</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Performance overview and call trends</p></div>
                <div style={{display:'flex',gap:'8px'}}>
                  {([1,7,30,90] as const).map(p => (
                    <button key={p} onClick={() => setAnalyticsPeriod(p)} style={{padding:'8px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer',border:'1px solid '+(analyticsPeriod===p?'#0f2318':'#e5e7eb'),backgroundColor:analyticsPeriod===p?'#0f2318':'#fff',color:analyticsPeriod===p?'#fff':'#6b7280'}}>
                      {p===1?'Today':p+' Days'}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const revenueRecovered = filtered.reduce((sum, c) => sum + (c.income_collected || 0), 0);
                const prevRevenue = prev.reduce((sum, c) => sum + (c.income_collected || 0), 0);
                const conversionRate = filtered.length > 0 ? Math.round(((captured + inProgress) / filtered.length) * 100) : 0;
                const prevConversion = prev.length > 0 ? Math.round(((prev.filter(c=>c.status==='green'||c.status==='blue').length) / prev.length) * 100) : 0;
                const estimatedPipeline = estimatePipelineValue(openLeads, business?.avg_job_value);
                if (revenueRecovered > 0 || estimatedPipeline > 0) {
                  return (
                    <div style={{backgroundColor:'#0f2318',borderRadius:'14px',padding:'20px 28px',marginBottom:'24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                        <span style={{fontSize:'24px'}}>💰</span>
                        <div>
                          <p style={{color:'rgba(255,255,255,0.5)',fontSize:'12px',fontWeight:'600',margin:'0 0 4px 0',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Emily's Impact This Period</p>
                          <p style={{color:'#fff',fontSize:'15px',fontWeight:'700',margin:0}}>
                            {revenueRecovered > 0
                              ? `Emily recovered $${revenueRecovered.toLocaleString()} ${business?.currency || 'CAD'} in collected income`
                              : estimatedPipeline > 0
                              ? `Emily captured ${captured + inProgress} leads worth an estimated $${estimatedPipeline.toLocaleString()} ${business?.currency || 'CAD'} in potential jobs`
                              : ''}
                            {revenueRecovered > 0 && estimatedPipeline > 0 && ` and $${estimatedPipeline.toLocaleString()} ${business?.currency || 'CAD'} more in the pipeline`}
                          </p>
                        </div>
                      </div>
                      <span style={{backgroundColor:'rgba(0,212,170,0.15)',color:'#00d4aa',fontSize:'12px',fontWeight:'700',padding:'6px 16px',borderRadius:'20px',border:'1px solid rgba(0,212,170,0.3)',whiteSpace:'nowrap' as const}}>
                        {conversionRate}% conversion
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'16px'}}>
                {[
                  {label:'Total Calls',value:filtered.length,prev:prev.length,color:'#0f2318',format:'number'},
                  {label:'Leads Captured',value:captured+inProgress,prev:prev.filter(c=>c.status==='green'||c.status==='blue').length,color:'#00d4aa',format:'number'},
                  {label:'Urgent',value:urgent,prev:prev.filter(c=>c.status==='red').length,color:'#ef4444',format:'number'},
                  {label:'Follow Up',value:followUp,prev:prev.filter(c=>c.status==='yellow').length,color:'#f59e0b',format:'number'},
                ].map(s => {
                  const diff = s.prev > 0 ? Math.round(((s.value - s.prev) / s.prev) * 100) : null;
                  return (
                    <div key={s.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+s.color}}>
                      <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 10px',textTransform:'uppercase' as const,letterSpacing:'0.5px',fontWeight:'600'}}>{s.label}</p>
                      <p style={{color:s.color,fontSize:'34px',fontWeight:'800',margin:'0 0 4px 0'}}>{s.value.toLocaleString()}</p>
                      {diff !== null && <p style={{color:diff>=0?'#00d4aa':'#ef4444',fontSize:'12px',fontWeight:'600',margin:0}}>{diff>=0?'↑':'↓'} {Math.abs(diff)}% vs last period</p>}
                    </div>
                  );
                })}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginBottom:'24px'}}>
                {(() => {
                  const revenueRecovered = filtered.reduce((sum, c) => sum + (c.income_collected || 0), 0);
                  const prevRevenue = prev.reduce((sum, c) => sum + (c.income_collected || 0), 0);
                  const conversionRate = filtered.length > 0 ? Math.round(((captured + inProgress) / filtered.length) * 100) : 0;
                  const prevConversion = prev.length > 0 ? Math.round(((prev.filter(c=>c.status==='green'||c.status==='blue').length) / prev.length) * 100) : 0;
                  const estimatedPipeline = estimatePipelineValue(openLeads, business?.avg_job_value);
                  const prevEstimated = estimatePipelineValue(prevOpenLeads, business?.avg_job_value);
                  return [
                    {label:'Revenue Recovered',value:'$'+revenueRecovered.toLocaleString(),prev:prevRevenue,color:'#00d4aa',sub:business?.currency||'CAD'},
                    {label:'Conversion Rate',value:conversionRate+'%',prev:prevConversion,color:'#8b5cf6',sub:'calls → leads'},
                    {label:'Est. Pipeline Value',value:'$'+estimatedPipeline.toLocaleString(),prev:prevEstimated,color:'#f59e0b',sub:(business?.currency||'CAD')+' potential'},
                  ].map(s => {
                    const diff = s.prev > 0 ? Math.round(((parseFloat(s.value.replace(/[$%,]/g,'')) - s.prev) / s.prev) * 100) : null;
                    return (
                      <div key={s.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+s.color}}>
                        <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 10px',textTransform:'uppercase' as const,letterSpacing:'0.5px',fontWeight:'600'}}>{s.label}</p>
                        <p style={{color:s.color,fontSize:'28px',fontWeight:'800',margin:'0 0 2px 0'}}>{s.value}</p>
                        <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 4px 0'}}>{s.sub}</p>
                        {diff !== null && <p style={{color:diff>=0?'#00d4aa':'#ef4444',fontSize:'12px',fontWeight:'600',margin:0}}>{diff>=0?'↑':'↓'} {Math.abs(diff)}% vs last period</p>}
                      </div>
                    );
                  });
                })()}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'24px'}}>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                  <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:'0 0 20px 0'}}>Call Volume — Last 7 Days</p>
                  <div style={{display:'flex',alignItems:'flex-end',gap:'8px',height:'120px'}}>
                    {dayCounts.map((d,i) => (
                      <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',height:'100%',justifyContent:'flex-end'}}>
                        <div style={{width:'100%',backgroundColor:'#00d4aa',borderRadius:'4px 4px 0 0',height:Math.max(4,(d.count/maxDay)*100)+'%',minHeight:'4px'}}/>
                        <p style={{color:'#9ca3af',fontSize:'10px',margin:0,fontWeight:'600'}}>{d.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                  <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:'0 0 20px 0'}}>Calls by Status</p>
                  {[{label:'Urgent',count:urgent,color:'#ef4444'},{label:'Follow Up',count:followUp,color:'#f59e0b'},{label:'Captured',count:captured,color:'#00d4aa'},{label:'In Progress',count:inProgress,color:'#3b82f6'}].map(s => (
                    <div key={s.label} style={{marginBottom:'14px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}><span style={{color:'#374151',fontSize:'13px',fontWeight:'600'}}>{s.label}</span><span style={{color:'#9ca3af',fontSize:'13px'}}>{s.count} calls</span></div>
                      <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'8px',overflow:'hidden'}}><div style={{backgroundColor:s.color,height:'100%',width:Math.round((s.count/maxStatus)*100)+'%',borderRadius:'99px'}}/></div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                  <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:'0 0 20px 0'}}>Pipeline Progress</p>
                  {PIPELINE_STAGES.slice(1).map(stage => {
                    const count = filtered.filter(c => c.pipeline_stage === stage.id).length;
                    const max = Math.max(...PIPELINE_STAGES.slice(1).map(s => filtered.filter(c => c.pipeline_stage === s.id).length), 1);
                    return (
                      <div key={stage.id} style={{marginBottom:'10px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}><span style={{color:'#374151',fontSize:'12px',fontWeight:'600'}}>{stage.label}</span><span style={{color:'#9ca3af',fontSize:'12px'}}>{count}</span></div>
                        <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'6px',overflow:'hidden'}}><div style={{backgroundColor:stage.color,height:'100%',width:Math.round((count/max)*100)+'%',borderRadius:'99px'}}/></div>
                      </div>
                    );
                  })}
                </div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                  <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:'0 0 20px 0'}}>Top Call Reasons</p>
                  {topReasons.length === 0 ? <p style={{color:'#9ca3af',fontSize:'13px',margin:0}}>No calls in this period.</p> : topReasons.map(([reason,count],i) => (
                    <div key={reason} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f3f4f6'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                        <div style={{width:'10px',height:'10px',borderRadius:'50%',backgroundColor:reasonColors[i],flexShrink:0}}/>
                        <span style={{color:'#374151',fontSize:'13px'}}>{reason}</span>
                      </div>
                      <span style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700'}}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* WEB LEADS */}
        {tab === 'webleads' && (() => {
          const webLeadCalls = calls.filter(c => c.channel === 'widget');
          return (
            <div>
              <div style={{ marginBottom: '32px' }}>
                <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Web Leads</h1>
                <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Conversations Emily captured from your website.</p>
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {webLeadCalls.length === 0 ? (
                  <div style={{ padding: '60px', textAlign: 'center' }}>
                    <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '700', margin: '0 0 8px 0' }}>No web leads yet</p>
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Your website widget will show conversations here as they come in.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr', padding: '14px 24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                      {['Name', 'Phone', 'Reason', 'Status', 'Date'].map(col => <p key={col} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col}</p>)}
                    </div>
                    {webLeadCalls.map(call => (
                      <div key={call.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <div onClick={() => setExpandedWebLead(expandedWebLead === call.id ? null : call.id)}
                          style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr', padding: '16px 24px', alignItems: 'center', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: 0 }}>{call.caller_name || 'Unknown'}</p>
                          <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>{call.caller_number || '—'}</p>
                          <p style={{ color: '#374151', fontSize: '12px', margin: 0 }}>{call.reason || '—'}</p>
                          <span style={{ backgroundColor: getStatusColor(call.status) + '18', color: getStatusColor(call.status), fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600', display: 'inline-block', width: 'fit-content' }}>{getStatusLabel(call.status)}</span>
                          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{formatDate(call.created_at)}</p>
                        </div>
                        {expandedWebLead === call.id && parseTranscript(call.transcript).length > 0 && (
                          <div style={{ padding: '20px 24px', backgroundColor: '#fafafa', borderTop: '1px solid #f3f4f6' }}>
                            <CallTranscript transcript={call.transcript} otherLabel="Visitor" />
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}