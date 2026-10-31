'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import BookNowModal from '@/components/BookNowModal';
import AddProspectForm, { EMPTY_PROSPECT_FORM, type ProspectFormValue } from '@/components/AddProspectForm';
import { TRADE_OPTIONS, normalizeTrade } from '@/lib/trade-options';
import { BlurField, BlurBlock } from '@/components/BlurField';
import { PaymentPackageLinks } from '@/components/PaymentPackageLinks';
import { DemoModeToggle } from '@/components/DemoModeToggle';
import { clientMonthlyRevenue } from '@/lib/client-revenue';
import { changedFields } from '@/lib/client-edit';
import { sortSlots, newSlotsOnly, claimSlot, releaseSlot, generationDates, slotState, SLOT_TAKEN_MESSAGE, type SlotLike } from '@/lib/slots';
import { recordSale, checkAndAwardBonuses, getCompensationProgress, getMilestoneProgress, getPaidClientCounts, PROMOTION_PAID_CLIENTS, type Plan, type Sale, type CompensationProgress, type MilestoneProgress as MilestoneProgressData } from '@/lib/compensation';
import OverflowEarlyAccess from '@/components/admin/OverflowEarlyAccess';
import CalendarSlotPopover, { CancelDemo, type PopoverResult } from '@/components/admin/CalendarSlotPopover';
import BulkActionBar from '@/components/admin/BulkActionBar';
import { inferProvince } from '@/lib/canada-places';
import { clientFieldsFromProspect, CURRENT_PLAN_NAMES, planForDropdown, isLegacyPlan } from '@/lib/client-tier';
import { firstPaymentCommission, fmtCommission } from '@/lib/first-payment';
import AllocatePanel from '@/components/admin/AllocatePanel';
import PullBackPanel from '@/components/admin/PullBackPanel';
import RepActivity from '@/components/admin/RepActivity';
import PromotePanel from '@/components/admin/PromotePanel';
import MilestoneProgress from '@/components/MilestoneProgress';
import SprintProgress from '@/components/SprintProgress';
import { COLD_CALL_OVERVIEW, COLD_CALL_STEPS, COLD_CALL_OBJECTIONS, COLD_CALL_VOICEMAIL_SCRIPT } from '@/lib/coldCallScript';
import { ASK_ABOUT_THE_CHANGE_MD } from '@/lib/askAboutTheChange';
import { FRONT_DOOR_BRIDGE_MD } from '@/lib/frontDoorBridge';
import MarkdownResource from '@/components/MarkdownResource';
import { getStatusColor, getStatusLabel } from '@/lib/call-status';
import { CallTranscript } from '@/components/CallTranscript';
import { normalizePhoneNumber } from '@/lib/phone';
import { sumPaymentsByCurrency, formatMoneyTotal } from '@/lib/client-payments';
import { CALL_OUTCOMES, CONNECTED_OUTCOMES, withCallOutcome, prospectUpdateForActivity } from '@/lib/callOutcomes';
import { fetchAllPages, prospectsQuery as prospectsQueryFor, fetchProspectStats as fetchProspectStatsRows, statusCounts, sumStatuses, type ProspectStatRow } from '@/lib/prospect-queries';
import { saveStatusChange } from '@/lib/stage-change';
import { PROSPECTS_PAGE_SIZE, ALLOCATE_MAX_IDS, NO_PROVINCE, filterOptionArgs, tradeOptionArgs, dropdownOptions, filtersKey, type ProspectFilters, type FilterOptionRow, type DueMode } from '@/lib/prospect-search';
import { followUpState, tallyFollowUpsByOwner, type FollowUpTally } from '@/lib/followups';
import { localDateStr, lastContactLabel } from '@/lib/local-date';

type Call = { id: string; caller_name: string | null; caller_number: string; reason: string | null; status: string; created_at: string; business_id: string | null; classification?: string | null; transcript?: unknown; };
// Alex's own phone — his test calls are kept out of opportunity views.
const OWNER_TEST_NUMBER = '5555550100';
const CALLS_PAGE_SIZE = 50; // All Calls rows per page
type Business = { id: string; name: string; phone?: string; email?: string; industry?: string; plan?: string; status?: string; created_at?: string; tier?: string | null; term?: string | null; upfront_paid_usd?: number | null; performance_goal_cad?: number | null; goal_a_target?: number | null; goal_a_current?: number | null; goal_b_current_cad?: number | null; minutes_limit?: number | null; go_live_date?: string | null; sms_contact_1?: string | null; sms_contact_2?: string | null; widget_enabled?: boolean | null; avg_job_value?: number | null; currency?: string | null; business_hours?: string | null; services?: string | null; urgent_triggers?: string | null; call_forwarding_number?: string | null; locked_at?: string | null; lock_reason?: string | null; lock_notes?: string | null; unlocked_at?: string | null; };
// A setter's request for a stale lead (migrations/018, /api/admin/lead-requests).
type AdminLeadRequest = { id: string; status: 'pending' | 'approved' | 'denied'; note: string | null; createdAt: string; decidedAt: string | null; prospectId: string; businessName: string; city: string | null; trade: string | null; leadStatus: string | null; lastActivity: string | null; requesterName: string; currentOwnerName: string | null; previousOwnerName: string | null; decidedByName: string | null; };
type SettingsChange = { id: string; business_id: string; business_name: string; changes: { field: string; old: string | null; new: string | null }[]; created_at: string; read_at: string | null; resolved_at: string | null; };
// Labels match the client portal's Settings tab.
const SETTINGS_FIELD_LABELS: Record<string, string> = { business_hours: 'Business Hours', services: 'Services Emily Knows About', urgent_triggers: 'What Makes a Call Urgent', sms_contact_1: 'Primary SMS Contact', sms_contact_2: 'Backup SMS Contact', avg_job_value: 'Average Job Value' };
type Touchpoint = { id: string; business_id: string; rep_id: string; type: string; notes: string | null; created_at: string; };
type NewClient = { id: string; business_name: string; owner_name: string; phone: string; email: string; city: string; province: string | null; website: string; plan: string; status: string; contract_signed: boolean; payment_collected: boolean; calls_per_day: string; current_phone_system: string; secondary_contact: string; how_they_heard: string; referred_by: string; best_time_to_reach: string; notes: string; rep_id: string; created_at: string; go_live_checklist?: Record<string, boolean>; business_id?: string | null; tier?: string | null; payment_type?: string | null; booked_by_setter_id?: string | null; };
type Problem = { id: string; business_name: string; issue: string; status: string; created_at: string; rep_id?: string; admin_notes?: string | null; };
type Prospect = { id: string; rep_id: string; company_name: string; trade: string; province: string; city: string; website: string; phone: string; email: string; contact_name: string; contact_position: string; contact_phone: string; contact_email: string; source: string; status: string; notes: string; follow_up_date: string | null; created_at: string; updated_at: string; do_not_contact: boolean; bad_number?: boolean; last_contacted_at: string | null; tier?: string | null; };
type Activity = { id: string; prospect_id: string; rep_id: string; type: string; outcome: string; notes: string; follow_up_date: string; created_at: string; };
type StageHistory = { id: string; prospect_id: string; stage: string; entered_at: string; left_at: string | null; days_in_stage: number | null; };
// Money actually received from a client (migrations/032, append-only; negative = refund/correction).
type ClientPayment = { id: string; client_id: string; amount: number; currency: string; paid_on: string; method: string | null; note: string | null; created_at: string; };
type Cancellation = { id: string; client_id: string | null; business_name: string; rep_id: string; reason: string; category: string; plan_type: string; mrr_lost: number | null; effective_date: string | null; final_month: string | null; notes: string | null; status: string; created_at: string; };
type RepProfile = { id: string; full_name: string | null; email: string; role: string; };
type CompTrack = 'setter_training' | 'setter' | 'setter_closer' | 'closer';
type RepCompensation = { rep_id: string; comp_track: CompTrack; rep_started_at: string; track_changed_at: string; };
type CompHistoryRow = { id: string; rep_id: string; previous_track: CompTrack | null; new_track: CompTrack; changed_at: string; changed_by: string | null; contract_sent_at: string | null; contract_signed_at: string | null; contract_sent_file_path: string | null; contract_signed_file_path: string | null; note: string | null; };
type PlanLink = { id: string; plan_slug: string | null; link_type: string; label: string; url: string | null; setup_fee: number | null; active: boolean; };
type Lead = { id: string; conversation_id: string | null; name: string | null; phone: string | null; email: string | null; business_type: string | null; reason: string | null; transcript: {role: string; message: string}[] | null; assigned_to: string | null; status: string; notes: string | null; created_at: string; };
type JobProspect = { id: string; full_name: string; email: string | null; phone: string | null; location: string | null; position: string | null; application_source: string | null; profile_url: string | null; resume_url: string | null; application_date: string | null; notes: string | null; interview_date: string | null; interview_time: string | null; meet_link: string | null; google_event_id: string | null; interviewer: string | null; status: string; created_at: string; updated_at: string; };

const JOB_STATUS_OPTIONS = ['New Applicant','Reviewing','Interview Requested','Interview Scheduled','Interviewed','Offer Sent','Hired','Passed'];
const EMPTY_JOB_PROSPECT_FORM = { full_name:'', email:'', phone:'', location:'', position:'', application_source:'', profile_url:'', resume_url:'', notes:'' };
const STATUS_OPTIONS = ['Not Contacted','Attempted','Contacted','Follow Up Required','Interested','Demo Scheduled','Proposal Sent','Closed Won','Closed Lost','Future Opportunity'];
// Prospects we're actively in conversation with: the only ones Pipeline Value
// counts. Out: Not Contacted / Attempted (no conversation yet), Future
// Opportunity (parked), Closed Won (already MRR) and Closed Lost.
const ACTIVE_PIPELINE_STATUSES = ['Contacted','Follow Up Required','Interested','Demo Scheduled','Proposal Sent'];
const ACTIVITY_TYPES = ['Call','Email','Demo','Meeting','Note','Proposal'];
const ADMIN_UI_ROLES = ['admin','owner']; // UI convenience only; /api/admin/delete-appointment enforces server-side
const TIER_PRICING: Record<string, number> = { 'Launch': 697, 'Grow': 1348, 'Starter': 2247 };
function getTierValue(tier: string | null | undefined): number { return tier ? (TIER_PRICING[tier] || 0) : 0; }
const CLIENT_STATUS_OPTIONS = ['Onboarding','Active','Paused','Cancelled'];
// Values must match businesses.lock_reason's check constraint (migrations/014).
const LOCK_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'term_ended', label: 'Term ended' },
  { value: 'non_payment', label: 'Non-payment' },
  { value: 'immediate_cancel', label: 'Immediate cancel' },
  { value: 'client_requested', label: 'Client requested' },
  { value: 'breach_non_renewal', label: 'Breach / non-renewal' },
];
const LEAD_STATUS_OPTIONS = ['new','contacted','qualified','converted','disqualified'];
const PIPELINE_COLUMNS = [
  { id: 'new', label: 'New', statuses: ['Not Contacted','Attempted','Contacted','Follow Up Required'], defaultStatus: 'Not Contacted', color: '#6b7280', accent: '#f3f4f6' },
  { id: 'meeting', label: 'Meeting', statuses: ['Interested','Demo Scheduled'], defaultStatus: 'Interested', color: '#8b5cf6', accent: '#ede9fe' },
  { id: 'proposal', label: 'Proposal', statuses: ['Proposal Sent'], defaultStatus: 'Proposal Sent', color: '#f59e0b', accent: '#fef3c7' },
  { id: 'won', label: 'Won', statuses: ['Closed Won'], defaultStatus: 'Closed Won', color: '#10b981', accent: '#d1fae5' },
];
const GO_LIVE_CHECKLIST_ITEMS = ['Agreement signed and uploaded','Payment received and confirmed','Emily agent configured','Call forwarding set up and instructions sent','Emily greeting approved','Test call completed and logged','SMS notification confirmed working','Client has dashboard access','Go-live date confirmed','Account marked as live'];
const CANCELLATION_CATEGORIES: Record<string, string> = { price: 'Pricing', no_show: 'No Show / Ghosted', competitor: 'Went with Competitor', seasonal: 'Seasonal / Slow Period', dissatisfied: 'Dissatisfied with Service', going_out_of_business: 'Going Out of Business', term_ended: 'Term Ended', other: 'Other' };

const SETERA_REP_PATH_STAGES = [
  { num: '01', title: 'Know the Product', desc: 'Found under Knowledge and Rules → Setera Product Guide. Read the Setera Product Guide. Call Emily live at heysetera.com. Know the product cold before touching a script.' },
  { num: '02', title: 'Know the Method', desc: 'Found under Sales Training → The Setera Method, then The Front Door Bridge and Ask About the Change. Read The Setera Method from start to finish. Then read it again. Understand the psychology behind every move.' },
  { num: '03', title: 'Know the Demo', desc: 'Found under Sales Training → Demo Flow, then Demo Prep and Demo Login. Read the Demo Flow. Practice the transition line out loud. Run one full practice demo before your first live call.' },
  { num: '04', title: 'Know the Numbers', desc: 'Found under Setera Payment Links (CAD) for the packages, and Knowledge and Rules → Commission Rules. Use Commission Rules and the payment links to work out the numbers. Know all three packages and exactly what you earn on each.' },
  { num: '05', title: 'Know the Process', desc: 'Found under Processes → New Client Onboarding Checklist and What Happens After a New Client Is Submitted, Sales Training → Follow-Up Templates, and Legal Documents. Read onboarding, follow-up templates, and legal. Know what happens after a yes before the yes comes.' },
];

const SETERA_VALUE_LEVELS = [
  { level: 'Level 1', name: 'Implementation', desc: 'On the roof. On the job. Answering their own calls. Works the most, paid the least per hour. Most contractors live here.', active: false },
  { level: 'Level 2', name: 'Unification', desc: 'Has a crew. Maybe part-time office help. Delegating labor but calls still slip through the cracks.', active: false },
  { level: 'Level 3', name: 'Communication', desc: 'Runs ads. Has some systems in place. Front door is still leaking leads despite the effort.', active: false },
  { level: 'Level 4', name: 'Imagination', desc: 'Business runs while they are off the tools. Every call captured, every lead prioritized. This is where Setera takes them.', active: true },
];

const SETERA_METHOD_PHASES = [
  {
    num: '01',
    name: 'The Authority Open',
    tag: 'Never open with Setera',
    content: 'Do not start with Setera. Open by positioning yourself as a consultant running a diagnosis — not a salesperson pitching a product.',
    quote: '"Before I show you anything, I want to make sure this actually makes sense for your business. Mind if I ask you a few questions first?"',
    bullets: [] as string[],
    tip: 'Tone is everything here — curious, not eager. You are qualifying them as much as they are evaluating you.',
  },
  {
    num: '02',
    name: 'The Situation Map',
    tag: 'Understand their world first',
    content: 'Neutral, curious questions. Build a picture of their current world — not looking for problems yet. Let them talk. Then ask the qualifying question that tells you everything about who you are dealing with.',
    quote: '',
    bullets: [
      '"How are you currently handling calls when you are on a job or after hours?"',
      '"On a busy day, how many calls would you say actually get answered versus go to voicemail?"',
      '"When someone does leave a voicemail — what does your follow-up look like?"',
      '"If your call volume increased by 30% next month — if that work just started showing up — would your business be set up to handle it?"',
    ],
    tip: 'The last question tells you everything. If they say probably not — capacity needs to come first. If they say absolutely, we have the crew, we just do not have the leads — that is your person. If they say that is a good problem to have — that is your best client.',
  },
  {
    num: '03',
    name: 'The Awareness Shift',
    tag: 'Get them to name the problem',
    content: 'You never tell a contractor he has a problem. You ask questions until he tells you. The moment he calculates his own lost revenue out loud — the emotional case is made. Then open the calculator at heysetera.com and hand it to them. Let them plug in their own numbers. You do not read the result to them. You let them see it.',
    quote: '"Does that feel about right to you?"',
    bullets: [
      '"When a call goes unanswered, what typically happens? Does that person usually call back or just move on?"',
      '"Have you ever found out after the fact that someone called you first, then went with a competitor?"',
      '"What is your average job value for a new customer?" [They answer.] "So if you are missing even two or three calls a week..." [Stop. Let them finish the math.]',
    ],
    tip: 'Never do the math for them. Ask the question, then go quiet. That silence is where the sale happens. After the calculator shows the number, just ask if it feels about right. Keep ownership on their side.',
  },
  {
    num: '04',
    name: 'The Scar Tissue Questions',
    tag: 'Surface objections before they become walls',
    content: 'This is where you learn their objections before you pitch — and neutralize them before they become walls. If they say an answering service was useless — you now know exactly how to position Emily without ever defending against that objection later.',
    quote: '',
    bullets: [
      '"Have you tried anything to fix this before? Answering service, part-time help, anything like that?"',
      '"What happened with that? Why did it not stick?"',
    ],
    tip: 'Listen for the emotional words — "useless," "embarrassing," "waste of money." That is the scar. That is what you are healing.',
  },
  {
    num: '05',
    name: 'The Legacy Gap',
    tag: 'Make the cost of inaction real',
    content: 'These questions create urgency without pressure. You are illuminating the gap between where they are and where they want to be. Then get specific with the one line that lands hardest.',
    quote: '"The call you missed last Tuesday — do you know who answered it?"',
    bullets: [
      '"If this does not get solved in the next six months, what does that realistically cost you?"',
      '"The contractor in your city who IS answering every call right now — what kind of advantage does that give them over you?"',
      '"Is there a version of your business where you are fully confident that call never gets missed?"',
    ],
    tip: 'They do not know who answered it. But they know someone did. That someone might be the guy they used to work for. That is not just lost revenue — that is personal. The one big job is never just one job. It is the homeowner whose neighbour needs the same work, whose brother-in-law owns four rental properties. A relationship worth $80,000 walked to a competitor because nobody picked up.',
  },
  {
    num: '06',
    name: 'The Reveal',
    tag: 'Now — and only now — show Emily',
    content: 'After they have named the problem, calculated the cost, and felt the weight of what has been slipping through — now you show the product. You drive the demo. Pull up Emily and let her run for 60 to 90 seconds. Do not narrate over her. Let the prospect sit with it and actually hear what their customers would hear. After Emily has done her work, you come back in.',
    quote: '"Okay — so after a call like that has been made to your business, let me show you where it shows up."',
    bullets: [] as string[],
    tip: 'Switch to the demo account. Walk them through the dashboard lightly — lead, contact info, transcript, job type, urgency. Then: "You do not have to call everyone back in the order they came in. You can see what is waiting before you make a single call. That $40K job that came in while you were on a roof — you see that first. You are not reacting anymore. You are choosing." Let the product close itself.',
  },
  {
    num: '07',
    name: 'The Identity Close',
    tag: 'Close on who they are choosing to become',
    content: 'Do not close on features. Do not close on funding. Close on identity.',
    quote: '"Every contractor I talk to knows they are losing jobs to missed calls. Most of them accept it as part of doing business. The ones who do not — they are the ones who end up owning their market. The ones who see every opportunity, choose their best work, and never hand a job to the competition again just because they were busy. Which one are you building?"',
    bullets: [] as string[],
    tip: 'Say it, then stop talking. The first person who speaks after this question loses. Let them close themselves.',
  },
];

const SETERA_METHOD_OBJECTIONS = [
  {
    obj: 'I need to think about it',
    response: '"Absolutely — how long do you realistically need? A night? A week?" [They answer. Whatever they say:] "Okay — let us double that. I want you to have all the time you need. But before we get off — the situation you described does not stay the same while you are thinking it over. It gets worse. Mold in an attic does not wait for you to find the right contractor. It spreads. You ran your own numbers today. You know exactly what a monthly call gap costs you. So I have to ask — has the habit of thinking it over helped you close gaps like this one in the past? Or is right now the moment to change that pattern and fill these gaps?"',
    note: 'The job is not to close them — they close themselves. The job is to move them from thinking, which costs nothing and produces nothing, into a place of decision where a real choice exists. A yes is a decision. A no is a decision. Both are movement. Thinking is just standing still in a burning building arguing about whether it is hot.',
  },
  {
    obj: 'I need to speak to my business partner first',
    response: '"Of course — I completely respect that. Let me ask you one thing before we wrap up. Flip this around — your partner had a day like today. Ran the numbers, found the gap, found the solution, funded it, and came back to you — not with a problem but with: I handled it, we are closing that gap. How would you feel? Frustrated they made the call without you — or grateful they took care of it?" [Let them answer.] "Right. So you already know what the right move looks like. The only question is who is going to be the one that makes it."',
    note: 'Never argue against the partner. Flip the identity instead. If the partner is real, this gives them permission to be the person who brought the solution — not the one who needed approval. If the partner is a stall, they will fumble the hypothetical. Either way you learn something true.',
  },
  {
    obj: 'Just tell me the price',
    response: '"I totally get that — but honestly I would not even know where to start because we do not just have one thing. It would be like pulling into a mechanic, tossing him your keys, and saying hey fix my car, how much is this going to cost." [Pause. They react.] "Right? So how should I look at you right now?"',
    note: 'Now it is playful and it makes sense to them. You are not avoiding the question — you are showing them why the question does not work the way they asked it. Go back into the diagnostic.',
  },
  {
    obj: 'It is too expensive',
    response: '"Well — I mean, it kind of just depends. You must have asked me that for a reason though. What is really going on?"',
    note: 'Do not defend the product. Do not break down features. That is panic. Stay calm. Stay indifferent. Never yes, never no. Let them tell you what is actually happening.',
  },
  {
    obj: 'Can you do it for cheaper',
    response: '"Well — it kind of just depends on the result you want to get." [Pause.] "Is the cheapest price the most important thing to you — or is it actually getting [the result they described earlier]?"',
    note: 'That question puts them back in results-based thinking and takes them out of price comparison mode. You are reminding them what they said they wanted when the conversation started.',
  },
  {
    obj: 'XYZ company offered me cheaper',
    response: '"What specifically did they offer you though?" [If they are vague:] "Well — if you really had to think about it, take a moment — what did they actually offer you?" [If they name a company:] "Yeah — they are fairly decent." [With slight pause, not threatened.] "But it really just depends on the result you are trying to get."',
    note: 'Someone who genuinely had a better offer in hand usually knows exactly what it was. If they cannot nail it down, that is useful information. Stay relaxed either way.',
  },
  {
    obj: 'My customers will not talk to an AI',
    response: '"That is a real concern. Two things — most people genuinely cannot tell the difference. But more importantly, right now when you miss a call, they are not talking to anyone at all. Which is worse for your business?"',
    note: 'Reframe the comparison. The alternative is not a human — it is silence. Silence always loses.',
  },
  {
    obj: 'I already have a receptionist',
    response: '"That is great — she is valuable. What happens when she is at lunch? When she is tied up? When three calls come in at once? Emily is not replacing her — she is the coverage no human can provide. And she gives you the intel before you even pick up the phone."',
    note: 'Position Emily as the extension, not the replacement.',
  },
  {
    obj: 'Let me wait until things slow down',
    response: '"I understand the timing. The season you are in right now is exactly when calls are coming in fastest and you are most likely on a job. That is when the big jobs come through. That is when this pays for itself the most. Slow season is when you would notice it the least."',
    note: 'Urgency without pressure. The most valuable time to have Emily is the busiest time — not the slowest.',
  },
  {
    obj: 'I have been burned by tech before',
    response: '"Tell me about that — what happened?" [Let them talk.] "I hear that. The difference is Emily is not software you have to manage. She runs. You get notified when a lead comes in with everything you need. Nothing to learn, nothing to break."',
    note: 'Let the scar tissue come out. Validate the past experience, then reframe Setera as fundamentally different.',
  },
  {
    obj: 'I am not sure I can handle more work right now',
    response: '"That is actually a good thing to know. Here is what Emily changes though — you are not obligated to take everything. You see every lead before you call back. You take the jobs that fit your capacity and your margins. You are not busier — you are more selective. The difference is you are the one doing the selecting."',
    note: 'The cherry-picking reframe. Emily does not just answer calls — she builds a pre-screened, prioritized pipeline.',
  },
];

const SETERA_METHOD_PRINCIPLES = [
  { title: 'Diagnose, do not pitch', body: 'A rep who pitches is a salesperson. A rep who diagnoses is a consultant. Contractors trust consultants. They resist salespeople. Your job is to find the revenue leak — not sell the patch.' },
  { title: 'Get them to a place of decision, not a close', body: 'Your job is not to convince them. Convincing is friction. Your job is to move them from thinking — which is indefinite, comfortable, and produces nothing — into a place of decision where a real choice exists and has to be made. A yes is a decision. A no is a decision. Both are movement. Both are progress. Thinking is just standing still in a burning building arguing about whether it is hot.' },
  { title: '70/30 — they talk more', body: 'If you are talking more than 30% of the time, you are pitching instead of diagnosing. Ask a question, then listen. The more they own the problem, the closer they are to solving it.' },
  { title: 'Certainty is contagious', body: 'The rep who fully believes Setera is the best decision a growing contractor can make will always outclose the rep who is still convincing themselves. Your belief is part of the product.' },
  { title: 'Scarcity is real — use it', body: 'Setera is selective about which contractors are brought on per market. We do not put competing businesses on the same platform in the same city. This is true — say it: "We are careful about who we bring on in each area."' },
  { title: 'Sell the outcome identity', body: 'Not "Emily answers your calls." Instead: "You become the contractor in your market who sees every opportunity, chooses the best work, and never loses a job to a missed call again." Features are forgotten. Identity sticks.' },
  { title: 'Never chase', body: 'One follow-up after a ghost, then move on. Chasing signals that you need them more than they need you. Operate from abundance — there are 50 contractors in this city losing jobs right now.' },
  { title: 'Results-based language always', body: 'Never say cost, price, or fee. Never say saving. The word is funding. Every word either keeps them in results-based thinking or pulls them into cost-based thinking. Choose every word like it matters, because on a sales call, it does.' },
];

const SETERA_PRODUCT_GUIDE_QA = [
  { q: 'What is Setera?', a: 'Setera is an AI-powered inbound call capture and revenue recovery platform built for trade businesses across Canada. Setera started with roofing companies — the problem was everywhere in that industry — but the platform works for any trade business where the phone rings and nobody answers.' },
  { q: 'Who is Setera for?', a: 'Any trade business that loses revenue when calls go unanswered. Roofing, HVAC, plumbing, electrical, landscaping, general contractors, restoration companies, and more. If your business runs on inbound calls and your team is out in the field, Setera was built for you.' },
  { q: 'What problem does Setera solve?', a: 'Trade businesses spend money on leads, ads, and referrals to make the phone ring. But when the owner is on a job, driving between sites, or after hours — that call goes to voicemail. The customer calls the next company on Google. One missed call in a trade business can be worth thousands of dollars. Setera makes sure that never happens.' },
  { q: 'How does Setera work?', a: 'When a call comes in, Emily — Setera\'s AI receptionist — answers immediately, every time, 24 hours a day. Emily greets the caller warmly, captures their name, callback number, reason for calling, urgency level, and best time to reach them. Every call is transcribed, summarized, and logged in the business\'s private dashboard. The owner gets an instant SMS notification. Nothing slips through.' },
  { q: 'Do I need a new phone number?', a: 'No new number needed. The business keeps their existing phone number completely. Setera works through simple call forwarding — when a call goes unanswered after a set number of rings, it forwards to Emily automatically. The caller never knows the difference. Setup takes 10 to 14 days on average from the time the agreement is signed.' },
  { q: 'What does the owner see?', a: 'Every Setera client gets their own private dashboard. Log in from your phone or computer and see every call — who called, why they called, how urgent it is, and when to call them back. Full transcript included. Color coded by priority so you always know what needs attention first.' },
  { q: 'What makes Setera different?', a: 'Traditional answering services use human operators — limited hours, higher cost, no intelligence. Setera\'s AI works 24/7, never calls in sick, captures more information faster, classifies urgency automatically, and delivers everything into a dashboard the owner can check from their phone on a job site. It is not an answering service — it is a revenue recovery system built for the trades.' },
  { q: 'Does Emily sound robotic?', a: 'Not at all. Emily has a natural, warm, and conversational voice. She discloses she is a virtual receptionist — professionally and naturally — and most callers simply move on and tell her exactly what they need.' },
  { q: 'Is Emily customized for my business?', a: 'Yes. Every Setera client gets Emily configured specifically for their business — their company name, services, service area, hours, and common caller questions. She sounds like she actually works for your company.' },
  { q: 'What calls does Emily handle best?', a: 'Emergency and urgent service calls, estimate and quote requests, insurance and damage inquiries, callback scheduling, after hours calls, and overflow when the team is busy in the field.' },
  { q: 'What happens after Emily captures a call?', a: 'The call is transcribed and summarized automatically. The owner gets an SMS instantly. The lead appears in the dashboard with full details — who called, why, how urgent, and when to call back. You follow up with everything you need to close the job.' },
  { q: 'What if a caller needs to speak to a human right now?', a: 'If a caller has a genuine emergency and needs immediate human contact, Emily acknowledges their urgency, reassures them their message is being escalated as urgent, and lets them know the business will be notified immediately by SMS. Every urgent call is flagged Red in the dashboard and the owner is notified instantly.' },
  { q: 'We already have a receptionist', a: 'Setera is not a replacement for your team — it is a safety net for the calls your team cannot catch. After hours. When lines are busy. When everyone is in the field. The phone rings while your receptionist is dispatching, quoting, billing, or with a customer standing right in front of them. That is when the calls get missed. Emily catches every one of them.' },
  { q: 'We just use voicemail', a: 'Callers do not leave voicemails anymore. The majority of people who reach voicemail hang up and call the next company on the list. Voicemail is where leads go to die. Emily answers live every time, captures the caller\'s information in real time, and makes sure nothing falls through the gap.' },
  { q: 'We are not ready for AI', a: 'That is completely fair. Most business owners felt the same way before they saw what a missed call actually costs them. Setera is not AI for the sake of AI — it is continuity. A way to make sure the business keeps responding even when the owner cannot. The setup is simple, nothing changes for the people calling in, and you are live in 10 to 14 days on average.' },
  { q: 'We are a seasonal business', a: 'That is exactly when you need it most. Peak season is when your phone rings the most and your team is stretched the thinnest. That is when the most calls get missed. Emily is most valuable when you are busiest.' },
  { q: 'We are too small for this', a: 'The smaller the team the more every call matters. A two person operation missing 5 calls a day is losing more proportionally than a large company with a full admin team. Emily is the infrastructure small operators cannot afford to hire but absolutely need.' },
  { q: 'Where is my data stored? Is it private?', a: 'All data is stored securely in Canadian infrastructure. Every client\'s data is completely private and isolated — no other business can see your calls, your leads, or your dashboard. Call recordings are stored with a 365 day retention period and deleted automatically after that. Clients can request a full data export within 30 days of cancellation.' },
  { q: 'Can Emily handle multiple calls at once?', a: 'Yes. Emily handles multiple simultaneous calls. No busy signals. No voicemail. No missed opportunities. Every caller gets answered.' },
  { q: 'What if Emily says something wrong?', a: 'Emily is configured to capture information — not give it. She will not quote prices, make promises, or offer advice. If a caller asks something outside her scope she captures their details and flags it for follow up. Nothing gets lost.' },
];

const SALES_CHEAT_SHEET = [
  { num: '01', title: 'What Setera Is', body: ['Setera is built for service and trade businesses where owners and crews are actually doing the work — not sitting beside a phone all day.', 'We help make sure important calls, customers, opportunities and information don’t slip through the cracks.', 'Emily is our AI receptionist and the front door into Setera. But Emily isn’t Setera. Emily handles the conversation. Setera is the operational system behind her that captures what happened, understands why someone called, records the information, identifies opportunities and helps determine what needs to happen next.', 'The easiest way to remember our entire philosophy: NOTHING SLIPS.'] },
  { num: '02', title: 'Who Setera Is For', body: ['We’re especially interested in smaller, owner-operated service businesses where the owner is still involved in estimates, jobs, crews and daily operations — renovation/remodeling, general contractors, kitchen and bathroom renovators, basement developers, plumbers, electricians, restoration companies, cleaning companies and similar.', 'A strong Setera prospect often looks like: busy owner + crew in the field + meaningful inbound calls + nobody dedicated to handling every call perfectly.', 'We’re not trying to force Setera onto everybody. If they genuinely don’t have a problem, don’t manufacture one.'] },
  { num: '03', title: 'One of the Best Questions You Can Ask', body: ['“When you’re on a job and the phone rings, who answers?” Then listen. Their answer determines where the conversation goes.'], bullets: ['“I answer.” — Potential interruption problem. Ask what they’re usually doing when the calls come in.', '“Sometimes nobody.” — Potential missed-call problem. Ask what happens afterward.', '“It goes to voicemail.” — Ask how many callers actually leave a message and how quickly they get called back.', '“My wife/husband answers.” — Ask what happens when they’re unavailable, busy or already dealing with another caller.', '“We have an admin/receptionist.” — Don’t attack their receptionist. Ask about simultaneous calls, busy periods, evenings, weekends and coverage. If they’ve genuinely solved the problem, that’s okay.', '“We’re booked solid anyway.” — Ask what happens to the jobs they can’t take. That may open another conversation.'] },
  { num: '04', title: 'Discovery Questions', body: ['Don’t fire these off like a checklist. Use the questions that fit naturally. The key: don’t rush into the pitch. The more the owner talks, the more you’ll understand where Setera actually fits.'], bullets: ['How many calls do you think you miss in a normal day?', 'What happens when you can’t answer? Do you normally call everybody back? How quickly?', 'What happens when you’re already on another call?', 'Who answers evenings and weekends?', 'How many of your calls do you think are actually new customers?', 'How do you keep track of new opportunities?', 'What happens when somebody wants an estimate? Can customers book directly over the phone?', 'What’s an average new job worth to you?', 'What happens when someone calls about a job you can’t take, or when you’re completely booked?', 'What happens when the customer is outside your service area?'] },
  { num: '05', title: 'Missed-Call Math', body: ['For conversational math, assume roughly six working days per week for a typical contractor — that’s approximately 77 working days over a 90-day quarter.', 'Missed/day → per week → ~90 days → ~1 year:', '1 → 6 → ~77 → ~313', '2 → 12 → ~154 → ~626', '3 → 18 → ~231 → ~939', '5 → 30 → ~385 → ~1,565', '10 → 60 → ~770 → ~3,130', 'If somebody says “I probably only miss three calls a day” — that’s approximately 230 missed calls over the next quarter. Never tell them those are 230 lost jobs — they’re not.', 'Instead: “Obviously those aren’t all new customers. But out of roughly 230 missed calls, how many would have to be legitimate opportunities before it starts to matter?” Then let them answer. That’s much stronger than trying to tell them what their lost revenue is.'] },
  { num: '06', title: 'What If They Answer Every Call?', body: ['That’s not necessarily better. Ask: “When those calls come in, what are you normally doing?” They may be installing a kitchen, working in someone’s house, driving, quoting another customer, managing employees, ordering materials or doing the actual work they’re being paid to do.', 'Two sides to the phone problem: don’t answer → something important may slip. Answer everything → everything else gets interrupted.', 'Setera isn’t only about missed calls. It’s also about protecting the owner’s attention.'] },
  { num: '07', title: 'Not Every Call Is a Lead — That’s Part of the Value', body: ['Never claim every phone call is a customer. Businesses receive new inquiries, existing customers, employees, suppliers, scheduling questions, follow-ups, wrong numbers, spam and everything else. The owner shouldn’t have to personally deal with all of those just to discover which calls actually matter.', 'From a real Setera deployment: approximately 332 calls → 56 real opportunities over roughly 2½ months.', 'The business doesn’t need the owner answering every call. It needs a reliable way of identifying the calls that matter.'] },
  { num: '08', title: 'What Emily Does', body: ['Emily can operate as the company’s AI receptionist. Depending on configuration, she can answer 24/7, handle multiple simultaneous calls, understand why someone is calling, distinguish caller types, collect customer information, capture job and scope details, answer questions using approved company information, schedule where configured, identify urgent situations, escalate or transfer per the company’s rules, document conversations, provide transcripts and feed information into Setera.', 'Emily doesn’t just answer — she figures out why they’re calling and captures the information needed for what happens next. And Emily doesn’t guess — she works from the business’s approved knowledge and operating rules.'] },
  { num: '09', title: 'Emily Is the Front Door — Setera Is the System', body: ['Don’t reduce Setera to “we have an AI that answers your phone.” The process: Call → Understand → Capture → Classify → Route → Document → Next Action.', 'The conversation is where information enters. Setera is what prevents that information from disappearing afterward.'] },
  { num: '10', title: 'The Demo Is the Goal', body: ['The cold call is not the demo. Don’t spend 20 minutes trying to explain everything Setera can do. Don’t drown the owner in features, start explaining AI architecture, or fight someone who’s skeptical about AI. Let them experience it.', 'Transition: “Instead of me spending another ten minutes trying to explain this over the phone, it’s honestly much easier to show you. Let us put Emily through an actual call so you can see how it works.”', 'If skeptical: “That’s completely fair. I’d rather have you hear Emily yourself than have me try to convince you what an AI receptionist sounds like.”', 'The objective: get the demo.'] },
  { num: '11', title: 'Setera Overflow — Know This Well', body: ['Overflow is another side of Setera. Our existing clients receive legitimate inbound opportunities they can’t always take — already booked, outside service area, wrong type of work, no crew capacity, bad timing, or just not a fit.', 'Normally: customer needs work → contractor can’t take it → opportunity disappears.', 'With Overflow: existing client receives the inbound opportunity → Setera captures what the customer needs → our client can’t take the job → opportunity enters Overflow → Setera finds a reputable contractor who can handle it → that contractor receives a hot opportunity with the information we’ve already captured.'] },
  { num: '12', title: 'What Makes an Overflow Opportunity Different?', body: ['These aren’t random internet leads. We’re not buying a database of names or calling someone a lead because they clicked an ad. These originate from real inbound customers contacting our existing Setera clients looking for work — our client just can’t take the project.', 'Because Setera already captured the interaction, the opportunity can include customer/contact info, what work they’re looking for, project/job scope, location, timing, and other details — not just a phone number.'] },
  { num: '13', title: 'Overflow Opportunities Are Time-Sensitive', body: ['Speed matters. These customers are actively looking for someone to perform the work — they’re hot opportunities, not something to sit on until Friday. The longer a contractor waits, the more likely the customer finds somebody else.', 'If you receive an Overflow opportunity, act on it.'] },
  { num: '14', title: 'Overflow Has Its Own Pricing', body: ['Overflow is not included in Launch, Grow or Starter pricing — it has its own offer and pricing structure. Don’t turn the cold call into an Overflow pricing pitch. The prospect first needs to understand where these opportunities come from and why they’re different, which is why Overflow prospects still need to see the demo.'] },
  { num: '15', title: 'Why Someone Interested Only in Overflow Still Sees the Demo', body: ['Someone might say “I don’t need an AI receptionist” — that’s okay, they may still be a good candidate to receive Overflow opportunities. But they still need to see the demo, to understand how the original customer reaches Setera, how Emily handles the conversation, how information gets captured, how an opportunity gets identified, and where their Overflow opportunity actually came from. Without that context, we sound like another company selling internet leads.', '“Before we even talk about getting you into Overflow, I’d want you to see how Setera works. Once you see how these calls are actually being captured and the information we’re getting from the customer, you’ll understand where these opportunities come from and why they’re different from buying random leads.”', 'Demo → understand the source → Overflow offer & pricing.'] },
  { num: '16', title: 'The Overflow Pivot', body: ['If somebody says “I don’t need an AI receptionist,” you don’t necessarily have to end the conversation. Ask: “Fair enough. Are you looking for more work?”', 'If yes: “Then there’s actually another side of Setera that might be more interesting to you. Our existing clients can’t take every job that comes through … instead of letting that opportunity die, we find reputable contractors who can handle it. The difference is we’ve already captured what the customer needs, and these are hot, time-sensitive opportunities.”', 'Then: “I’d still want you to see the Setera demo first because once you see where these opportunities actually come from and what we’re capturing, Overflow makes a lot more sense.” → Get the demo.'] },
  { num: '17', title: 'Two Different Ways to Win the Initial Call', body: ['Path 1 — Setera/Emily: they have a phone, communication or operational problem → discover it → create curiosity → demo → determine the right package.', 'Path 2 — Overflow: they don’t need Emily right now, but they’re reputable and looking for additional work → introduce Overflow → demo → show how Setera captures the original opportunities → discuss Overflow offer/pricing afterward.', 'Both paths lead to a Setera demo.'] },
  { num: '18', title: 'Never Promise This About Overflow', body: [], bullets: ['Don’t guarantee a specific number of opportunities, jobs, revenue, or close rates.', 'Don’t tell them every opportunity will turn into a customer.', 'Don’t call them “free leads.”', 'Don’t position Setera as a generic lead-generation company.', 'Accurate language: “Setera Overflow allows hot, time-sensitive opportunities that our existing clients can’t service to potentially reach reputable contractors who can.”'] },
  { num: '19', title: 'Core Setera Pricing — Know This Cold', body: ['Launch — $697 CAD + tax / 200 minutes', 'Grow — $1,348 CAD + tax / 1,000 minutes', 'Starter — $2,247 CAD + tax / 3,000 minutes', 'Standard Setup Fee — $1,397 CAD + tax, one time. This is part of normal Setera pricing.', 'Promotions: the setup fee may sometimes be reduced or waived. Never assume it’s waived — only offer that when you’ve specifically been told a promotion is currently authorized.', 'No promotion running: “There’s also a one-time $1,397 setup fee, plus tax.” Promotion authorized: “Normally there’s a $1,397 setup fee, but we’re currently waiving that as part of this promotion.”', 'Do not pitch Pro. Do not use old pricing.'] },
  { num: '20', title: 'If They Immediately Ask “How Much?”', body: ['Don’t dodge price. Answer them: “We have three main packages. Launch is $697 a month for 200 minutes, Grow is $1,348 for 1,000 minutes, and Starter is $2,247 for 3,000 minutes. They’re all plus tax, and there’s normally a one-time $1,397 setup fee. Which package makes sense really depends on your call volume and what you’re trying to handle.”', 'If there’s a current authorized promotion, explain it. Then get back to discovery.'] },
  { num: '21', title: 'Simple Revenue Math', body: ['Use their numbers, not promises. Ask: “What’s an average new job worth to you?”', 'If their average job is $2,000: 1 additional job/month = $24,000/year. If $5,000: $60,000/year. If $10,000: $120,000/year.', 'Never say “Setera will make you $60,000.” Instead: “If your average job is $5,000, how many additional opportunities would actually have to turn into jobs over the entire year before the math starts making sense?” Let them answer.'] },
  { num: '22', title: 'Common Objections', body: [], bullets: ['“I don’t miss many calls.” — Don’t tell them they’re wrong. Ask: “Have you ever actually tracked every incoming call for 30 days?” Then explore what happens when they can’t answer.', '“I call everybody back.” — “Absolutely. The question is whether every new customer waits for the callback or whether some of them call the next contractor.”', '“They can leave a voicemail.” — Ask: “How many new customers actually leave one?” Don’t answer for them.', '“My wife/husband answers.” — “What happens when they’re busy, unavailable, already on another call or it’s after hours?”', '“I have a receptionist.” — Good. Don’t attack them. Ask about simultaneous calls, evenings, weekends, busy periods and coverage. If the problem is genuinely solved, don’t force one.', '“We’re already booked.” — Ask: “What happens to the jobs you’re turning away?” Valuable operational information for a potential Setera client.', '“I don’t want AI talking to my customers.” — Don’t debate AI. “That’s fair. That’s exactly why I’d rather have you hear Emily yourself than have me try to convince you what she sounds like.” → Demo.', '“I don’t need Setera.” — “Fair enough. Are you looking for more work?” If yes → brief Overflow explanation → demo.'] },
  { num: '23', title: 'Listen for These Phrases', body: ['When somebody says any of the following, don’t immediately start pitching — ask about what they just said. They may have just told you exactly where their problem is.'], bullets: ['“I’m always on the tools.”', '“Everything goes to my cell.”', '“My phone never stops.”', '“My wife handles the phone.”', '“I call people back later.”', '“We’re booked solid.”', '“We turn jobs away.”', '“That’s outside our area.”', '“We don’t do that kind of work.”', '“They can leave a voicemail.”', '“Customers call me all evening.”'] },
  { num: '24', title: 'Basic Qualification', body: ['Over the conversation/demo process, we want to understand things like: business type, service area, team/crew size, approximate call volume, who currently answers, business hours, after-hours/weekend process, average job value, scheduling process, current CRM/system, biggest communication problem, how they handle work they can’t accept, whether they’re interested in additional work, decision maker and potential timeline.', 'You don’t need all of this during the first minute. Have a conversation.'] },
  { num: '25', title: 'What Happens After a Setera Client Signs?', body: ['Setera isn’t a generic bot that gets switched on and forgotten. We need to understand how that particular business operates — services, service area, business hours, caller types, scheduling rules, escalation rules, emergency handling, approved company knowledge and how different situations should be handled.', 'Then their Setera system is configured and tested. Typical implementation: 10–14 business days.'] },
  { num: '26', title: 'Know Your Authority as a Setera Rep', body: ['You should confidently know and explain: Setera, Emily, the demo process, Launch/Grow/Starter, included minutes, the standard setup fee, any currently authorized promotion, basic onboarding, how Setera captures calls and information, the basic Overflow model, why Overflow prospects need a demo, and that Overflow has separate pricing.', 'If somebody asks for something outside the standard offer — custom pricing, unauthorized discounts, unusual integrations, contractual changes, technical guarantees, exclusivity, special Overflow arrangements, or anything you’re unsure about — bring Alex in. There’s nothing wrong with saying “I don’t want to give you the wrong information. Let me confirm that for you.” Never guess.'] },
  { num: '27', title: 'Never Do This', body: [], bullets: ['Never guarantee ROI, Overflow volume, Overflow jobs, or Overflow revenue.', 'Never claim every missed call is a lost job.', 'Never invent Emily capabilities, integrations, or technical promises you haven’t confirmed.', 'Never invent pricing or offer an unauthorized discount.', 'Never assume the setup fee is waived. Never use old pricing. Never pitch Pro.', 'Never attack someone’s receptionist or admin. Never trash competitors.', 'Never position Setera as a cheap answering service, or Overflow as generic internet lead generation.', 'Never bullshit an answer because you don’t know it.'] },
  { num: '28', title: 'The Simple Call Flow', body: ['If you ever lose your place in a conversation, come back to this.'], bullets: ['1. Who answers? — “When you’re on a job and the phone rings, who answers?”', '2. What happens when they can’t answer? — Missed? Voicemail? Callback?', '3. How often does it happen? — If appropriate, use the missed-call math.', '4. What’s actually inside those calls? — New customers? Existing? Suppliers? Employees? Noise?', '5. What’s a real opportunity worth? — Use their numbers.', '6. What happens to jobs they can’t take? — Booked? Outside area? Wrong service? No capacity?', '7. Identify the path — Setera/Emily, or potentially Setera Overflow.', '8. Get the demo.'] },
  { num: '29', title: 'The Big Picture', body: ['You’re not selling AI because AI sounds cool. You’re talking to business owners trying to run crews, quote jobs, manage customers, order materials, complete projects and grow a company while their phone keeps ringing.', 'Some calls don’t matter. Some absolutely do. Some customers will wait for a callback. Some won’t. Some jobs the contractor can take. Some they can’t.', 'Setera is infrastructure around what happens when somebody contacts the business. Emily answers and understands the conversation. Setera captures what happened and what needs to happen next. And when our existing clients receive legitimate opportunities they cannot service, Setera Overflow gives us a way to connect those hot, time-sensitive opportunities with reputable contractors who may be able to perform the work.', 'That’s why the demo is so important. For a potential Setera client, it shows them what happens when their customer calls. For a potential Overflow contractor, it shows them where these opportunities actually originate and the information Setera captures before they ever receive one.', 'Find the problem. Don’t oversell. Use their numbers. Know Setera. Create curiosity. Get the demo. Setera — Nothing Slips.'] },
];

const OVERFLOW_NETWORK_SECTIONS = [
  { title: 'What Changes With Overflow', body: ['Until now, when we reached out to a business, the primary goal was straightforward: understand how they handle their calls, identify the operational problem, demonstrate Emily, and determine whether Setera makes sense for them. That is still our primary goal — Emily comes first.', 'But now, if a company sees the value in Emily and simply isn’t ready to become a client, the conversation doesn’t have to end there. We have a second opportunity.'] },
  { title: 'Why the Overflow Network Exists', body: ['Emily doesn’t just answer phones — she captures real opportunities. When someone calls one of our clients looking for work, Emily can collect the information needed to understand that opportunity: customer name, phone number, address, type of work required, scope, urgency, timing, property/job details, and anything else our client needs to determine what happens next.', 'Not every legitimate opportunity Emily captures can be serviced by the original Setera client — they might be completely booked, the project might be outside their service area, it might be work they don’t perform, too large or too small, not enough crews available, or they simply decide they don’t want the job.', 'Historically, that opportunity would probably die there. Setera Overflow is designed to prevent that — instead of letting a legitimate customer opportunity disappear, our client can pass it back to Setera, and Setera can match it with another qualified company capable of performing the work.'] },
  { title: 'Where the Companies Come From', body: ['We still run our normal Setera sales process when we prospect a company — learn about their operation, understand how calls are currently handled, identify problems, and demonstrate Emily when appropriate. We do NOT lead with Overflow instead of Emily.', 'The Emily demonstration matters because it shows the business exactly where these opportunities originate — they see that Setera isn’t buying lists of names and reselling them. These are real inbound customers contacting real businesses looking for real work.', 'After seeing Emily, there are two possible outcomes. Outcome one: they become a Setera client — we continue through the normal sales process. Outcome two: they’re interested, but not ready for Emily — this is where the conversation changes. Instead of just following up in six months, we introduce the Setera Overflow Network: “You may not be ready for Emily right now, and that’s completely fine. But there’s another reason I wanted you to see how she works. When one of our clients can’t take an opportunity Emily captures, we don’t necessarily want that customer to disappear. We’re building a vetted network of businesses that we trust enough to send those opportunities to. You just saw exactly where those opportunities come from. If you’re not ready for AI reception right now, would you be interested in being considered as one of the companies we send overflow work to?” Now the original “no” can become another relationship with Setera.'] },
  { title: 'This Is NOT a Lead List', body: ['This distinction is extremely important when explaining Overflow. We are not selling cold leads, scraping Google, buying contact lists, or sending five contractors the name and number of someone who filled out a Facebook form three weeks ago.', 'Emily has already spoken with the customer. Depending on the opportunity, Setera may already know who they are, where the job is, what they need, why they’re calling, when they want the work performed, how urgent it is, what type of project it is, and why the original contractor can’t take it.', 'These are intended to be high-intent, qualified opportunities. That’s what makes the network valuable.'] },
  { title: 'Businesses Must Qualify', body: ['A business cannot simply pay Setera and receive our clients’ opportunities. Setera’s reputation is attached to every referral we make — if a client passes us a customer and we recommend another company, we’re effectively telling them we trust that company enough to put their customer in their hands. We need to be able to stand behind that.', 'Joining the Overflow Network requires an application and vetting process — what services they actually perform, where they operate, how long they’ve been operating, their experience and skill level, crew capacity, insurance coverage, required licences or certifications, the types and sizes of projects they can handle, how quickly they can respond to customers, their reputation, and most importantly, their work: project photos, before-and-afters, portfolio examples, completed jobs, reviews, or other evidence of quality. Insurance and licensing need to be verified, and so do capabilities.', 'If we’re not comfortable recommending that company to one of our clients or their customers, they do not enter the network. Getting an Overflow application does NOT mean the closer has sold or approved the business — Setera makes the final approval decision.'] },
  { title: 'How the Money Works', body: ['Our current concept is simple: Setera earns $1,000 when an Overflow opportunity results in a successfully closed job. The exact attribution, cancellation, reporting, payment, and verification rules will be defined in the Overflow agreement.', 'We’re not trying to charge a contractor $1,000 merely because we sent them someone’s phone number — the value occurs when Setera delivers an opportunity that becomes revenue for that business. If we send a contractor a legitimate $15,000 roofing project and they win it, paying Setera $1,000 to acquire that job makes enormous sense. Same applies to renovation, restoration, electrical, cleaning, landscaping, roofing, and eventually many other industries where project economics support the model.'] },
  { title: 'Why We Still Demo Emily', body: ['Do not skip the Emily demonstration just because a company might be an Overflow candidate. We want them to understand how Setera creates these opportunities — when they see Emily speaking with a customer, gathering information, identifying intent, documenting the call and moving that opportunity through the system, Overflow becomes much easier to understand.', 'We’re not telling them “trust us, we have good leads” — we’re showing them the infrastructure responsible for creating those opportunities. And something else can happen during that demonstration: they may have entered thinking they only wanted more jobs, then see Emily and realize “wait, I actually need this for my own business.” That company can become a Setera client instead.'] },
  { title: 'The Flywheel', body: ['More Setera clients means Emily answers more calls. More calls means more opportunities are identified. More opportunities means more jobs our clients occasionally cannot service. More passed jobs means more opportunities for the Overflow Network. More Overflow opportunities make joining the network more valuable. More Overflow businesses give Setera greater geographic and service coverage. And those Overflow businesses are themselves potential future Emily clients.', 'Eventually an Overflow partner could be receiving enough business from Setera that they understand our value firsthand — “You’ve already seen what Emily is producing for other Setera businesses. What happens to the opportunities you’re currently missing?” Now Overflow can help sell Emily, and Emily helps create Overflow. Each side strengthens the other.'] },
  { title: 'What This Means for a Setera Closer', body: ['The goal is NOT to force every prospect into one product or the other. Your first job is still to understand the business. Your first Setera offer is still Emily when there’s a fit.', 'But a prospect saying “I’m interested, but we’re not ready,” “I can’t justify the monthly cost right now,” “I answer most of my calls myself,” or “maybe later” doesn’t necessarily mean the opportunity is dead. You now have another legitimate conversation available: would this be a company we trust enough to receive work from our clients? If the answer could be yes, introduce Overflow. If they’re interested, move them into the application and vetting process — and keep nurturing them as a potential future Emily client.'] },
  { title: 'What We Are Actually Building', body: ['Setera started by solving a very specific problem: businesses lose opportunities because calls and operational information slip through the cracks. Emily helps capture those opportunities.', 'Overflow takes the idea one step further — capturing the opportunity isn’t enough if the original business can’t fulfill it. So instead of letting it disappear, Setera can move it to another trusted company capable of doing the work. We’re connecting three things: Capture → Qualification → Fulfillment. Emily captures demand. Setera understands and organizes that demand. The Overflow Network gives qualified businesses the ability to fulfill demand our original client cannot. That’s much bigger than simply answering phones.'] },
  { title: 'The Rule to Remember', body: ['Emily is still the primary conversation. Show them the problem. Show them what Emily does. Show them where the opportunities come from. Try to determine whether Setera makes sense for their operation. If they’re ready, sell Setera.', 'If they’re not ready, don’t automatically throw the relationship away. Ask yourself: “Would we trust this company with one of our customers?” If the answer might be yes, introduce the Setera Overflow Network.', 'One prospect. One demo. Two potential ways to become part of the Setera ecosystem. And regardless of which door they enter through, the long-term goal is the same: Nothing Slips.'] },
];

const FOLLOW_UP_TEMPLATES = [
  {
    name: 'Post-Demo Follow-Up',
    subject: 'Good talking today',
    body: ['Hey [First Name],','','Good talking with you today.','','The main thing we looked at was simple. Your business already spends time, money, and reputation making the phone ring. Setera makes sure those calls are captured when your team cannot answer.','','Next step:','','[Insert agreement link or payment link depending on stage]','','Once complete, we will collect your business details, configure Emily for your company, test the call flow, and confirm everything before go-live.','','[Rep Name]','Setera','Nothing slips.'].join('\n'),
  },
  {
    name: 'Payment Link Email',
    subject: 'Setera payment link',
    body: ['Hey [First Name],','','Here is the payment link for the plan we discussed:','','Plan: [Plan Name]','Amount: [Amount]','Payment link: [Insert Link]','','Once payment is complete, we will move into onboarding, collect the final business details, configure Emily, and schedule the test call before go-live.','','[Rep Name]','Setera'].join('\n'),
  },
  {
    name: 'Agreement Email',
    subject: 'Setera service agreement',
    body: ['Hey [First Name],','','Attached is the Setera Service Agreement for review and signature.','','This covers the selected plan, payment terms, cancellation terms, AI disclosure, call recording responsibilities, data handling, and service limitations.','','Once signed, please send it back here or upload it through the onboarding form if provided.','','[Rep Name]','Setera'].join('\n'),
  },
  {
    name: 'Welcome to Setera',
    subject: 'Welcome to Setera',
    body: ['Hey [First Name],','','Welcome to Setera.','','We are excited to get Emily configured for [Business Name].','','The next step is onboarding. We will collect your business details, website, service areas, hours, urgent call rules, notification contacts, and anything Emily should or should not say.','','Once everything is configured, we will run a test call before go-live.','','Nothing goes live until the call flow is tested and approved.','','[Rep Name]','Setera'].join('\n'),
  },
  {
    name: 'Onboarding Started',
    subject: 'Setera onboarding started',
    body: ['Hey [First Name],','','Your Setera onboarding has started.','','Here is what we are setting up:','','Emily greeting.','Your business knowledge base.','Call forwarding.','SMS notifications.','Dashboard access.','Test call.','Go-live approval.','','If we need anything else, we will reach out before setup is complete.','','[Rep Name]','Setera'].join('\n'),
  },
  {
    name: 'Go-Live Confirmation',
    subject: 'Setera is live',
    body: ['Hey [First Name],','','Setera is now live for [Business Name].','','Emily is configured, the call flow has been tested, and your dashboard is ready.','','When a call is captured, you will be able to see the caller details, summary, transcript, urgency status, and follow-up information inside your dashboard.','','If anything looks off, let us know right away.','','Nothing slips.','','[Rep Name]','Setera'].join('\n'),
  },
  {
    name: 'No Response Follow-Up',
    subject: 'Quick follow-up',
    body: ['Hey [First Name],','','Just wanted to follow up.','','The question is still the same:','','When your phone rings and nobody answers, what happens to that opportunity?','','If this is still worth looking at, reply here and we can walk through it quickly.','','[Rep Name]','Setera'].join('\n'),
  },
];


// prospect_stage_history.stage for Closed Won (PIPELINE_COLUMNS 'won').
const WON_STAGE = 'Won';
function getColumnForStatus(status: string) { return PIPELINE_COLUMNS.find(c => c.statuses.includes(status)) || PIPELINE_COLUMNS[0]; }
function getStatusStyle(status: string) {
  const map: Record<string, {bg: string; color: string}> = { 'Not Contacted': {bg:'#f3f4f6',color:'#6b7280'}, 'Attempted': {bg:'#fef3c7',color:'#92400e'}, 'Contacted': {bg:'#dbeafe',color:'#1e40af'}, 'Follow Up Required': {bg:'#fed7aa',color:'#9a3412'}, 'Interested': {bg:'#d1fae5',color:'#065f46'}, 'Demo Scheduled': {bg:'#ede9fe',color:'#5b21b6'}, 'Proposal Sent': {bg:'#e0f2fe',color:'#0c4a6e'}, 'Closed Won': {bg:'#ccfbf1',color:'#065f46'}, 'Closed Lost': {bg:'#fee2e2',color:'#991b1b'}, 'Future Opportunity': {bg:'#f0fdf4',color:'#166534'} };
  return map[status] || {bg:'#f3f4f6',color:'#6b7280'};
}
function getLeadStatusStyle(status: string) {
  const map: Record<string, {bg: string; color: string; label: string}> = { new: {bg:'#dbeafe',color:'#1e40af',label:'New'}, contacted: {bg:'#fef3c7',color:'#92400e',label:'Contacted'}, qualified: {bg:'#ede9fe',color:'#5b21b6',label:'Qualified'}, converted: {bg:'#d1fae5',color:'#065f46',label:'Converted'}, disqualified: {bg:'#f3f4f6',color:'#6b7280',label:'Disqualified'} };
  return map[status] || {bg:'#f3f4f6',color:'#6b7280',label:status};
}
function getCategoryLabel(value: string): string { return CANCELLATION_CATEGORIES[value] || value; }
function getCancellationStatusStyle(status: string) { const map: Record<string, {bg: string; color: string; label: string}> = { pending: {bg:'#fef3c7',color:'#92400e',label:'Pending'}, reviewed: {bg:'#dbeafe',color:'#1e40af',label:'Reviewed'}, confirmed: {bg:'#fee2e2',color:'#991b1b',label:'Confirmed'} }; return map[status] || {bg:'#f3f4f6',color:'#6b7280',label:status}; }
function getPlanTypeLabel(pt: string): string { if (pt === '3_month') return '3-Month'; if (pt === 'annual') return 'Annual'; return 'Monthly'; }
function getChecklistProgress(cl: Record<string, boolean> | undefined): number { if (!cl) return 0; return Math.round((GO_LIVE_CHECKLIST_ITEMS.filter(i => cl[i]).length / GO_LIVE_CHECKLIST_ITEMS.length) * 100); }
function stagePct(count: number, total: number): string { if (total === 0) return '0%'; return Math.round((count / total) * 100) + '%'; }
function isStale(prospect: Prospect) { const ref = prospect.last_contacted_at || prospect.created_at; return Date.now() - new Date(ref).getTime() > 21 * 86400000 && !['Closed Won', 'Closed Lost'].includes(prospect.status); }
const timeAgoShort = (dateStr: string | null) => lastContactLabel(dateStr); // local calendar days (lib/local-date.ts)
function timeAgo(date: string) { const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000); if (diff < 1) return 'just now'; if (diff < 60) return diff + 'm ago'; if (diff < 1440) return Math.floor(diff / 60) + 'h ago'; return Math.floor(diff / 1440) + 'd ago'; }
// Date-only fields (Rep Started At, Contract Sent/Signed, sold_at, ...) are
// always stored as UTC midnight of the picked calendar date — either a
// plain "YYYY-MM-DD" string, or new Date(dateOnlyString).toISOString(),
// which always lands exactly on 00:00:00.000 UTC. Converting that through
// the viewer's local timezone (e.g. America/Regina, UTC-6) rolls it back to
// the previous day, which is the bug: picking the 21st and seeing the 20th.
// Extracting the UTC calendar-date components directly — never routing
// through a timezone-aware conversion — is what keeps "the 21st" always
// displaying as the 21st, everywhere. Genuine timestamps (changed_at,
// awarded_at, ...) essentially never land on that exact millisecond, so
// they fall through to normal local-timezone display, which is correct for
// "when did this actually happen."
function formatDate(d: string) {
  if (!d) return '';
  if (d.length === 10) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const dt = new Date(d);
  if (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0) {
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(d: string) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('en-CA', {month:'short',day:'numeric'}) + ' at ' + dt.toLocaleTimeString('en-CA', {hour:'2-digit',minute:'2-digit'}); }
function totalDays(p: Prospect) { const start = new Date(p.created_at).getTime(); const end = p.status === 'Closed Won' && p.updated_at ? new Date(p.updated_at).getTime() : Date.now(); return Math.floor((end - start) / 86400000); }
function clientDays(c: NewClient) { return Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000); }
// A past client is a signed client who has ended (status 'Cancelled', set from
// the Signups edit form). Kept as a record, never counted as live or in MRR.
function isPastClient(c: NewClient) { return c.status === 'Cancelled'; }
// Mirrors app/setter/page.tsx's isThisWeek() exactly — used to compute a
// setter's own Booked This Week stat for the Rep Management inline expand.
function isThisWeekAdmin(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + diff);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return date >= startOfWeek && date < endOfWeek;
}
function getTermDays(term: string | null | undefined): number { if (!term) return 30; const t = term.toLowerCase(); if (t.includes('annual') || t.includes('year')) return 365; if (t.includes('6')) return 180; if (t.includes('3')) return 90; return 30; }
function isPastAppointment(scheduledDate: string | null, scheduledTime: string | null): boolean {
  if (!scheduledDate) return false;
  const timeStr = scheduledTime || '11:59 PM';
  const [time, period] = timeStr.split(' ');
  const [h, m] = time.split(':').map(Number);
  let hour = h % 12;
  if (period === 'PM') hour += 12;
  const dt = new Date(scheduledDate);
  dt.setHours(hour, m || 0, 0, 0);
  return dt.getTime() < Date.now();
}
// "Today" for demos is a Regina calendar day. Regina has no DST (fixed UTC-6),
// the same -06:00 offset /api/create-meet books the Google event with.
// (isPastAppointment above parses the date as UTC, which lands a day early for
// a Regina viewer, so it isn't reused here.)
function reginaDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Regina', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function apptStartMs(scheduledDate: string, scheduledTime: string | null): number {
  const m = (scheduledTime || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  let h = 23, min = 59;
  if (m) {
    h = parseInt(m[1]) % 12; min = parseInt(m[2]);
    if (m[3] ? m[3].toUpperCase() === 'PM' : parseInt(m[1]) >= 12) h += 12;
  }
  return Date.parse(scheduledDate + 'T' + String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':00-06:00');
}
function demoDayLabel(scheduledDate: string, todayStr: string): string {
  if (scheduledDate === todayStr) return 'Today';
  const [y, mo, d] = todayStr.split('-').map(Number);
  if (scheduledDate === new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10)) return 'Tomorrow';
  return formatDate(scheduledDate);
}
// Owns its own clock so "Updated 12s ago" never re-renders the whole page.
function UpdatedAgo({ atRef }: { atRef: { current: number | null } }) {
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force(n => n + 1), 5000); return () => clearInterval(i); }, []);
  if (!atRef.current) return null;
  const sec = Math.max(0, Math.round((Date.now() - atRef.current) / 1000));
  return <span>{sec < 10 ? 'Updated just now' : sec < 60 ? 'Updated ' + sec + 's ago' : 'Updated ' + Math.floor(sec / 60) + 'm ago'}</span>;
}
function reginaWeekStart(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); // Monday
  return dt.toISOString().slice(0, 10);
}
function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const fmtReginaTime = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Regina', hour: 'numeric', minute: '2-digit' });
function getUsageColor(pct: number): string { if (pct >= 90) return '#ef4444'; if (pct >= 80) return '#f59e0b'; return '#10b981'; }
function getUsageBadge(pct: number): string { if (pct >= 90) return 'Red — Near Limit'; if (pct >= 80) return 'Amber — Monitor'; return 'Green — On Track'; }

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ backgroundColor: copied ? '#10b981' : '#0f2318', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'background 0.15s', flexShrink: 0 }}>
      {copied ? 'Copied' : label}
    </button>
  );
}

function RBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'Client Safe': { bg: '#d1fae5', color: '#065f46' },
    'Rep Only':    { bg: '#dbeafe', color: '#1e40af' },
    'Admin Only':  { bg: '#fee2e2', color: '#991b1b' },
    'Important':   { bg: '#fef3c7', color: '#92400e' },
    'Do Not Send': { bg: '#fee2e2', color: '#991b1b' },
  };
  const s = map[type] || { bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{ backgroundColor: s.bg, color: s.color, fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0 }}>{type}</span>;
}

function RCard({ title, badge, description, buttonLabel = 'View', defaultOpen = false, children }: {
  title: string; badge: string; description: string; buttonLabel?: string; defaultOpen?: boolean; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' as const }}>
            <span style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700' }}>{title}</span>
            <RBadge type={badge} />
          </div>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{description}</p>
        </div>
        {children && (
          <button onClick={() => setOpen(!open)} style={{ backgroundColor: open ? '#f3f4f6' : '#0f2318', color: open ? '#374151' : '#00d4aa', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
            {open ? 'Close' : buttonLabel}
          </button>
        )}
      </div>
      {open && children && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '20px 24px', backgroundColor: '#fafafa' }}>
          {children}
        </div>
      )}
    </div>
  );
}

async function adminFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(input, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: 'Bearer ' + (session?.access_token ?? '') } });
}

export default function HighTable() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [newClients, setNewClients] = useState<NewClient[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [wonThisMonth, setWonThisMonth] = useState(0);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [availSlots, setAvailSlotsRaw] = useState<any[]>([]);
  const setAvailSlots = <T extends SlotLike>(s: T[]) => setAvailSlotsRaw(sortSlots(s)); // date, then real clock time (lib/slots.ts)
  const [setterAppts, setSetterAppts] = useState<any[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [actStart, setActStart] = useState(() => reginaDateStr());
  const [actEnd, setActEnd] = useState(() => reginaDateStr());
  const [actSetter, setActSetter] = useState('all');
  const [actOpen, setActOpen] = useState<string | null>(null);
  const [actData, setActData] = useState<{ setters: any[]; activities: any[]; appointments: any[] } | null>(null);
  const [actLoading, setActLoading] = useState(false);
  const [actError, setActError] = useState('');
  const [actRefreshing, setActRefreshing] = useState(false);
  const actUpdatedRef = useRef<number | null>(null);
  const actRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false);
  const [deletingAppt, setDeletingAppt] = useState(false);
  const [apptDeleteNotice, setApptDeleteNotice] = useState<{ kind: 'warning' | 'error'; text: string } | null>(null);
const [assigningTo, setAssigningTo] = useState('');
  const [slotDate, setSlotDate] = useState('');
  const [slotTime, setSlotTime] = useState('9:00 AM');
  const [addingSlot, setAddingSlot] = useState(false);
  // Calendar per-slot popover (components/admin/CalendarSlotPopover.tsx). The
  // anchor is the last plain-clicked slot; shift-click opens a range from it.
  const [slotPopover, setSlotPopover] = useState<{ slotId: string; rangeFromId?: string; alignRight: boolean } | null>(null);
  const [slotAnchorId, setSlotAnchorId] = useState<string | null>(null);
  const [slotRangeIds, setSlotRangeIds] = useState<string[]>([]);
  const [genDays, setGenDays] = useState(5);
const [genStartTime, setGenStartTime] = useState('10:00 AM');
const [genEndTime, setGenEndTime] = useState('3:00 PM');
const [genInterval, setGenInterval] = useState(60);
const [generating, setGenerating] = useState(false);
  const [stageHistory, setStageHistory] = useState<StageHistory[]>([]);
  const [repNames, setRepNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [prospectView, setProspectView] = useState<'list'|'add'|'detail'>('list');
  const [clientView, setClientView] = useState<'list'|'detail'>('list');
  const [selectedClient, setSelectedClient] = useState<NewClient | null>(null);
  const [viewMode, setViewMode] = useState<'table'|'board'>('table');
  // Prospects table bulk selection (table view only). lastCheckedIdx = row
  // index in the filtered list of the last checkbox click, for shift-click ranges.
  const [selectedProspectIds, setSelectedProspectIds] = useState<Set<string>>(new Set());
  const lastCheckedIdx = useRef<number | null>(null);
  const [showAllocate, setShowAllocate] = useState(false);
  const [showPullBack, setShowPullBack] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  // Prospects table only (the Board doesn't read these). Province/city values
  // are compared lowercased + trimmed so "SK" and "sk " are one option.
  const [provinceFilter, setProvinceFilter] = useState('All');
  const [repFilter, setRepFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  // Exact stored trade; options + counts from prospect_trade_options (040).
  const [tradeFilter, setTradeFilter] = useState('All');
  const [tradeOptionRows, setTradeOptionRows] = useState<{ key: string; n: number }[]>([]);
  // "Callbacks due": follow-up today or earlier ('all'), only today, or only
  // overdue; oldest first (lib/followups.ts). Counts are per option.
  const [callbacksMode, setCallbacksMode] = useState<'off' | 'all' | DueMode>('off');
  const [callbackCounts, setCallbackCounts] = useState<{ key: string; today: number; overdue: number } | null>(null);
  // Server-side Prospects (migrations/035). `prospects` holds only the table
  // rows loaded so far (PROSPECTS_PAGE_SIZE at a time); prospectCount is the
  // exact match count for the filters it was fetched under.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [prospectCount, setProspectCount] = useState<{ key: string; n: number } | null>(null);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [prospectsReload, setProspectsReload] = useState(0);
  const [prospectStats, setProspectStats] = useState<ProspectStatRow[]>([]);
  const [filterOptionRows, setFilterOptionRows] = useState<FilterOptionRow[]>([]);
  const [boardCols, setBoardCols] = useState<Record<string, Prospect[]>>({});
  // Every id matching the current filters, fetched on demand (Select all /
  // selection counts); only trusted while `key` equals the current filters.
  const [matchingIds, setMatchingIds] = useState<{ key: string; ids: string[] } | null>(null);
  const [allocateIds, setAllocateIds] = useState<string[]>([]);
  const prospectsReq = useRef(0);
  const optionsReq = useRef(0);
  const tradeOptionsReq = useRef(0);
  const boardReq = useRef(0);
  const [ownerId, setOwnerId] = useState(''); // the owner account = the reserve
  const [currentUserId, setCurrentUserId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [draggedProspectId, setDraggedProspectId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  // The saveSuccess/saveError banner renders once at the top of the
  // scrollable content area — invisible if the Save Changes button that
  // triggered it is scrolled below the fold, which it usually is on these
  // long forms, and it self-clears in 3s regardless. This flashes the
  // button itself instead, guaranteed to be in view since it's exactly
  // what was just clicked.
  const [clientSaveFlash, setClientSaveFlash] = useState<'success' | 'error' | null>(null);
  const [lockDialog, setLockDialog] = useState<'lock' | 'unlock' | null>(null);
  const [settingsChanges, setSettingsChanges] = useState<SettingsChange[]>([]);
  const [showSettingsChanges, setShowSettingsChanges] = useState(false);
  const [lockForm, setLockForm] = useState({ confirmName: '', reason: '', notes: '' });
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [prospectToDelete, setProspectToDelete] = useState<{id:string;name:string}|null>(null);
  const [clientToDelete, setClientToDelete] = useState<{id:string;name:string}|null>(null);
  const [prospectToMove, setProspectToMove] = useState<Prospect|null>(null);
  const [clientToMove, setClientToMove] = useState<NewClient|null>(null);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: '', currency: 'CAD', paid_on: '', method: '', note: '' });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  type AttributionAuditRow = { sale_id: string; client_id: string; business_name: string; client_rep_id: string | null; client_booked_by_setter_id: string | null; sale_booked_by_setter_id: string | null; setter_id: string | null; plan_slug: string; plan_price: number; sold_at: string };
  const [attributionAudit, setAttributionAudit] = useState<AttributionAuditRow[]>([]);
  const [repProfiles, setRepProfiles] = useState<RepProfile[]>([]);
  const [setterProfiles, setSetterProfiles] = useState<RepProfile[]>([]);
  const [clientsManageView, setClientsManageView] = useState<'list'|'detail'>('list');
  const [selectedManagedClient, setSelectedManagedClient] = useState<NewClient | null>(null);
  const [goLiveChecklist, setGoLiveChecklist] = useState<Record<string, boolean>>({});
  const [callsBusinessFilter, setCallsBusinessFilter] = useState('');
  // All Calls is paged from the server (CALLS_PAGE_SIZE at a time); `calls`
  // holds the rows loaded so far and callsCount the exact total for
  // callsCountFor (the business filter it was fetched under).
  const [callsCount, setCallsCount] = useState<{ biz: string; n: number } | null>(null);
  const [callsLoading, setCallsLoading] = useState(false);
  const [recentOpportunities, setRecentOpportunities] = useState<Call[]>([]);
  const [activeClientCallCounts, setActiveClientCallCounts] = useState<Record<string, number>>({});
  const callsReq = useRef(0);
  const [highlightedCallId, setHighlightedCallId] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [expandedCancellation, setExpandedCancellation] = useState<string | null>(null);
  const [expandedProblem, setExpandedProblem] = useState<string | null>(null);
  const [problemNotesDraft, setProblemNotesDraft] = useState<Record<string, string>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamData, setTeamData] = useState<any[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', role: 'rep' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [removingRep, setRemovingRep] = useState<RepProfile | null>(null);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [removeRepLoading, setRemoveRepLoading] = useState(false);
  const [repCompensation, setRepCompensation] = useState<Record<string, RepCompensation>>({});
  const [commissionCounts, setCommissionCounts] = useState<Record<string, number>>({});
  const [managingTrackFor, setManagingTrackFor] = useState<any | null>(null);
  const [managingTrackHistory, setManagingTrackHistory] = useState<CompHistoryRow[]>([]);
  const [managingTrackLoading, setManagingTrackLoading] = useState(false);
  const [managingTrackProgress, setManagingTrackProgress] = useState<CompensationProgress | null>(null);
  const [expandedSetterId, setExpandedSetterId] = useState<string | null>(null);
  // Rep Management: paid-client counts (x/6), 12-month milestones, role history, Promote panel.
  const [paidClients, setPaidClients] = useState<Record<string, number>>({});
  const [milestoneMap, setMilestoneMap] = useState<Record<string, MilestoneProgressData | null>>({});
  const [progressMap, setProgressMap] = useState<Record<string, CompensationProgress | null>>({});
  const [roleHistory, setRoleHistory] = useState<{ user_id: string; role: string; started_at: string; ended_at: string | null }[]>([]);
  const [promoting, setPromoting] = useState<{ id: string; full_name: string | null; email: string; role: string } | null>(null);
  const [peopleVersion, setPeopleVersion] = useState(0);
  type SetterDashboardSnapshot = { dialsToday: number; bookedThisWeek: number; showRate: number; progress: CompensationProgress | null };
  // Rep Management: callbacks due per person (today / overdue), same rules as
  // their own dashboards (lib/followups.ts). null until loaded.
  const [followUpsByOwner, setFollowUpsByOwner] = useState<Record<string, FollowUpTally> | null>(null);
  const [setterDashboardData, setSetterDashboardData] = useState<Record<string, SetterDashboardSnapshot | 'loading'>>({});
  const [trackActionError, setTrackActionError] = useState('');
  const [trackActionLoading, setTrackActionLoading] = useState(false);
  const [pendingTrackAction, setPendingTrackAction] = useState<CompTrack | 'revert' | null>(null);
  const [startTrackingDate, setStartTrackingDate] = useState('');
  const [salesSinceLastChange, setSalesSinceLastChange] = useState(0);
  const [firstSaleSlugByClient, setFirstSaleSlugByClient] = useState<Record<string, string>>({}); // first payment's plan (lib/first-payment.ts)
  const [contractDateDraft, setContractDateDraft] = useState({ sent: '', signed: '' });
  const [contractFileDraft, setContractFileDraft] = useState<{ sent: File | null; signed: File | null }>({ sent: null, signed: null });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planLinks, setPlanLinks] = useState<PlanLink[]>([]);
  const [mostRecentSaleByClient, setMostRecentSaleByClient] = useState<Record<string, { plan_slug: string; plan_price: number; sold_at: string }>>({});
  const [showRecordSale, setShowRecordSale] = useState(false);
  const [recordSaleForm, setRecordSaleForm] = useState({ planSlug: '', setterId: '', closerId: '', creditRepId: '', soldAt: new Date().toISOString().slice(0, 10) });
  const [recordSaleLoading, setRecordSaleLoading] = useState(false);
  const [recordSaleError, setRecordSaleError] = useState('');
  const [recordSaleResult, setRecordSaleResult] = useState<{ amount: number; isOverride: boolean; newBonuses: string[] } | null>(null);
  // Identifies one Record Sale submission attempt (migrations/011) — generated
  // once when the panel opens, reused across any retry of that same attempt
  // so a double-click or a retry-after-timeout can't create a duplicate sale.
  // Cleared back to null in openRecordSaleModal() whenever a fresh attempt starts.
  const [recordSaleIdempotencyKey, setRecordSaleIdempotencyKey] = useState<string | null>(null);
  const [existingSales, setExistingSales] = useState<Sale[]>([]);
const [showBookDemoPanel, setShowBookDemoPanel] = useState(false);
const [bookSlotId, setBookSlotId] = useState('');
const [bookAssignTo, setBookAssignTo] = useState('');
const [bookDemoNotes, setBookDemoNotes] = useState('');
const [bookDemoLoading, setBookDemoLoading] = useState(false);
const [bookMeetLink, setBookMeetLink] = useState('');
const [useDirectBook, setUseDirectBook] = useState(false);
const [directBookDate, setDirectBookDate] = useState('');
const [directBookTime, setDirectBookTime] = useState('10:00 AM');
const [directBookNotes, setDirectBookNotes] = useState('');
const [directBookLoading, setDirectBookLoading] = useState(false);
const [showCalendarBookPanel, setShowCalendarBookPanel] = useState(false);
const [calendarMonth, setCalendarMonth] = useState(new Date());
const [calendarBookForm, setCalendarBookForm] = useState({ date:'', time:'10:00 AM', business_name:'', contact_name:'', contact_email:'', phone:'', trade:'Roofing', notes:'' });
const [calendarBookLoading, setCalendarBookLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadNotesDraft, setLeadNotesDraft] = useState(''); const [newProspectsCount, setNewProspectsCount] = useState(0);
  const [managedClientBusiness, setManagedClientBusiness] = useState<Business | null>(null);
  const [managedClientCalls, setManagedClientCalls] = useState<Call[]>([]);
  const [managedClientTouchpoints, setManagedClientTouchpoints] = useState<Touchpoint[]>([]);
  const [touchpointForm, setTouchpointForm] = useState({ type: 'Call', notes: '' });
  const [touchpointLoading, setTouchpointLoading] = useState(false);
  const [managedClientLoading, setManagedClientLoading] = useState(false);
  const [jobProspects, setJobProspects] = useState<JobProspect[]>([]);
  const [selectedJobProspect, setSelectedJobProspect] = useState<JobProspect | null>(null);
  const [jobProspectView, setJobProspectView] = useState<'list'|'add'|'detail'>('list');
  const [jobProspectSearchQuery, setJobProspectSearchQuery] = useState('');
  const [jobProspectStatusFilter, setJobProspectStatusFilter] = useState('All');
  const [jobProspectForm, setJobProspectForm] = useState(EMPTY_JOB_PROSPECT_FORM);
  const [jobProspectSaving, setJobProspectSaving] = useState(false);
  const [editingJobProspect, setEditingJobProspect] = useState(false);
  const [jobProspectEditForm, setJobProspectEditForm] = useState(EMPTY_JOB_PROSPECT_FORM);
  const [jobProspectToDelete, setJobProspectToDelete] = useState<{id:string;name:string}|null>(null);
  const [showScheduleInterviewPanel, setShowScheduleInterviewPanel] = useState(false);
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('10:00 AM');
  const [interviewer, setInterviewer] = useState('Alex Rivera');
  const [interviewLoading, setInterviewLoading] = useState(false);
  const router = useRouter();

  const [prospectForm, setProspectForm] = useState<ProspectFormValue>(EMPTY_PROSPECT_FORM);
  const [activityForm, setActivityForm] = useState({ type:'Call', outcome:'', notes:'', follow_up_date:'' });
  const [editForm, setEditForm] = useState({ business_name:'', owner_name:'', phone:'', email:'', city:'', province:'SK', website:'', calls_per_day:'', current_phone_system:'', secondary_contact:'', plan:'', how_they_heard:'', referred_by:'', best_time_to_reach:'', contract_signed:false, payment_collected:false, notes:'', status:'Onboarding' });
  const [editingProspect, setEditingProspect] = useState(false);
  const [prospectEditForm, setProspectEditForm] = useState({ company_name:'', trade:'Roofing', province:'SK', city:'', website:'', phone:'', email:'', contact_name:'', contact_position:'', contact_phone:'', contact_email:'' });
  const [editingManagedClient, setEditingManagedClient] = useState(false);
  const [editFormInitial, setEditFormInitial] = useState<Record<string, unknown> | null>(null); // what the Signups form opened with (lib/client-edit.ts)
  const [managedFormInitial, setManagedFormInitial] = useState<Record<string, unknown> | null>(null);
  const [managedClientEditForm, setManagedClientEditForm] = useState({ owner_name:'', phone:'', email:'', city:'', province:'SK', plan:'', sms_contact_1:'', sms_contact_2:'', call_forwarding_number:'', business_hours:'', services:'', urgent_triggers:'', avg_job_value:'' });

  useEffect(() => {
    if (tab !== 'setter-activity') return;
    let cancelled = false;
    let inflight = false;
    let failures = 0;
    // foreground = opening the tab / changing the date (shows "loading…", and
    // an error straight away). Background = timer, tab regaining focus, and the
    // Refresh button: the old data stays on screen, state is only touched when
    // the returned data actually differs, and errors need 3 failures in a row.
    const load = async (foreground: boolean) => {
      if (inflight) return;
      inflight = true;
      if (foreground) { setActLoading(true); setActError(''); }
      try {
        const r = await adminFetch('/api/admin/setter-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start: actStart, end: actEnd }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        if (cancelled) return;
        failures = 0;
        actUpdatedRef.current = Date.now();
        setActData(prev => (JSON.stringify(prev) === JSON.stringify(j) ? prev : j));
        setActError(prev => (prev ? '' : prev));
      } catch (e: any) {
        if (cancelled) return;
        failures++;
        if (foreground || failures >= 3) setActError('Could not load setter activity: ' + e.message);
      } finally {
        inflight = false;
        if (!cancelled && foreground) setActLoading(false);
      }
    };
    actRefreshRef.current = () => load(false);
    load(true);
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(false); }, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); actRefreshRef.current = null; };
  }, [tab, actStart, actEnd]);

  useEffect(() => {
    if (tab !== 'reps') return;
    let cancelled = false;
    (async () => {
      const ids = (teamData as { id: string }[]).map(t => t.id);
      const [counts, hist] = await Promise.all([
        getPaidClientCounts(ids).catch(() => ({} as Record<string, number>)),
        adminFetch('/api/admin/role-history').then(r => r.json()).catch(() => ({})),
      ]);
      const withComp = ids.filter((id: string) => repCompensation[id]);
      // Award anything due: sprint periods that have closed (highest tier, due
      // close + 7 days) and milestones reached. No cron, so this runs here and
      // after every recorded sale (lib/compensation.ts checkAndAwardBonuses).
      await Promise.all(withComp.map((id: string) => checkAndAwardBonuses(id).catch(() => [])));
      const [ms, progress] = await Promise.all([
        Promise.all(withComp.map((id: string) => getMilestoneProgress(id).catch(() => null))),
        Promise.all(withComp.map((id: string) => getCompensationProgress(id).catch(() => null))),
      ]);
      if (cancelled) return;
      setPaidClients(counts);
      setRoleHistory(hist.history || []);
      setMilestoneMap(Object.fromEntries(withComp.map((id: string, i: number) => [id, ms[i]])));
      setProgressMap(Object.fromEntries(withComp.map((id: string, i: number) => [id, progress[i]])));
    })();
    return () => { cancelled = true; };
  }, [tab, teamData, repCompensation, peopleVersion]);

  // Client Settings change feed (rows written by update_my_business_settings,
  // migrations/016). Holds every UNRESOLVED change: the Settings Changes Log
  // shows all of them, the bell only the unread ones. Mark Done (017) sets
  // resolved_at and the row drops out of both — it's never deleted.
  // Polled so both update without a reload.
  const settingsChangesRefreshRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('client_settings_changes').select('id, business_id, business_name, changes, created_at, read_at, resolved_at').is('resolved_at', null).order('created_at', { ascending: false }).limit(500);
      if (!cancelled && data) setSettingsChanges(data as SettingsChange[]);
    };
    settingsChangesRefreshRef.current = load;
    load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); settingsChangesRefreshRef.current = null; };
  }, []);
  // Lead Requests: setters asking for a stale lead. Polled like the settings
  // feed, so the sidebar badge is the "new request came in" alert.
  const [leadRequests, setLeadRequests] = useState<{ pending: AdminLeadRequest[]; decided: AdminLeadRequest[] }>({ pending: [], decided: [] });
  const [leadRequestBusy, setLeadRequestBusy] = useState<string | null>(null);
  const leadRequestsRefreshRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await adminFetch('/api/admin/lead-requests').catch(() => null);
      if (!cancelled && r?.ok) setLeadRequests(await r.json());
    };
    leadRequestsRefreshRef.current = load;
    load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); leadRequestsRefreshRef.current = null; };
  }, []);
  // Past Clients "Calls" column: an all-time count per business. The `calls`
  // state is only the latest 200 across everyone, so it can't be used here.
  // Alex's own test calls are left out, same as the opportunity views.
  const [pastClientCallCounts, setPastClientCallCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (tab !== 'clients') return;
    const bizIds = newClients.filter(isPastClient).map(c => findClientBusiness(c)?.id).filter((id): id is string => !!id);
    if (bizIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const counts: Record<string, number> = {};
      for (const id of bizIds) {
        let n = 0;
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('calls').select('caller_number').eq('business_id', id).range(from, from + 999);
          if (error || !data) break;
          n += data.filter(c => normalizePhoneNumber(c.caller_number) !== OWNER_TEST_NUMBER).length;
          if (data.length < 1000) break;
        }
        counts[id] = n;
      }
      if (!cancelled) setPastClientCallCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [tab, newClients, businesses]);
  // Same definition the client portal's Pipeline/Dashboard use: an explicit
  // classification of 'opportunity' (the classifier puts silence, hang-ups,
  // wrong numbers and spam in 'other'). Unclassified calls don't count.
  // Newest 10, skipping Alex's own test calls.
  async function loadRecentOpportunities() {
    const out: Call[] = [];
    for (let from = 0; out.length < 10; from += 50) {
      const { data, error } = await supabase.from('calls').select('*').eq('classification', 'opportunity').order('created_at', { ascending: false }).order('id').range(from, from + 49);
      if (error || !data) { if (error) console.error('Supabase error (recent opportunities):', error); break; }
      out.push(...data.filter((c: Call) => normalizePhoneNumber(c.caller_number) !== OWNER_TEST_NUMBER));
      if (data.length < 50) break;
    }
    setRecentOpportunities(out.slice(0, 10));
  }
  // reset: first page + exact count for the business filter; else the next page.
  // A highlighted call (opened from Overview) keeps loading pages until its row is in.
  async function loadCallsPage(reset: boolean) {
    const req = ++callsReq.current;
    const biz = callsBusinessFilter;
    let rows: Call[] = reset ? [] : calls;
    let n: number | null = null;
    setCallsLoading(true);
    for (let i = 0; i < 20; i++) {
      let q = supabase.from('calls').select('*', i === 0 && reset ? { count: 'exact' } : undefined);
      if (biz) q = q.eq('business_id', biz);
      const { data, error, count } = await q.order('created_at', { ascending: false }).order('id').range(rows.length, rows.length + CALLS_PAGE_SIZE - 1);
      if (req !== callsReq.current) return;
      if (error || !data) { console.error('Supabase error (calls page):', error); setSaveError('Failed to load calls: ' + (error?.message || 'no data')); break; }
      if (count !== null && count !== undefined) n = count;
      const seen = new Set(rows.map(c => c.id));
      rows = [...rows, ...data.filter((c: Call) => !seen.has(c.id))];
      if (!highlightedCallId || rows.some(c => c.id === highlightedCallId) || data.length < CALLS_PAGE_SIZE || !reset) break;
    }
    setCallsLoading(false);
    setCalls(rows);
    if (n !== null) setCallsCount({ biz, n });
  }
  useEffect(() => { if (tab === 'calls') loadCallsPage(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, callsBusinessFilter]);
  // Active clients' "N calls captured": exact count per business.
  useEffect(() => {
    if (tab !== 'clients') return;
    const bizIds = [...new Set(newClients.filter(c => c.status === 'Active').map(c => findClientBusiness(c)?.id).filter((id): id is string => !!id))];
    let cancelled = false;
    Promise.all(bizIds.map(async id => [id, (await supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', id)).count ?? 0] as const))
      .then(pairs => { if (!cancelled) setActiveClientCallCounts(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, newClients, businesses]);
  async function decideLeadRequest(id: string, action: 'approve' | 'deny') {
    setLeadRequestBusy(id);
    const r = await adminFetch('/api/admin/lead-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) { setSaveSuccess(action === 'approve' ? 'Lead reassigned to the setter.' : 'Request denied.'); setTimeout(() => setSaveSuccess(''), 3000); }
    else { setSaveError('Could not ' + action + ' request: ' + (j.error || 'unknown error')); setTimeout(() => setSaveError(''), 4000); }
    await leadRequestsRefreshRef.current?.();
    setLeadRequestBusy(null);
  }
  // Overview → All Calls: bring the clicked call into view once its row renders
  // (rows arrive after the tab opens, so re-check as they load; once per call).
  const scrolledToCallRef = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== 'calls' || !highlightedCallId) { scrolledToCallRef.current = null; return; }
    if (scrolledToCallRef.current === highlightedCallId) return;
    const row = document.getElementById('call-row-' + highlightedCallId);
    if (row) { row.scrollIntoView({ block: 'center' }); scrolledToCallRef.current = highlightedCallId; }
  }, [tab, highlightedCallId, calls]);
  async function markSettingsChangesRead(ids: string[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('client_settings_changes').update({ read_at: now }).in('id', ids).is('read_at', null);
    if (!error) setSettingsChanges(prev => prev.map(c => ids.includes(c.id) && !c.read_at ? { ...c, read_at: now } : c));
  }
  async function markSettingsChangeDone(c: SettingsChange) {
    const now = new Date().toISOString();
    const { error } = await supabase.from('client_settings_changes').update({ resolved_at: now, resolved_by: currentUserId, ...(c.read_at ? {} : { read_at: now }) }).eq('id', c.id).is('resolved_at', null);
    if (error) { setSaveError('Could not mark done: ' + error.message); setTimeout(() => setSaveError(''), 4000); return; }
    setSettingsChanges(prev => prev.filter(x => x.id !== c.id));
  }
  const unreadSettingsChanges = settingsChanges.filter(c => !c.read_at);
  const renderSettingsChangeFields = (c: SettingsChange) => c.changes.map(ch => (
    <div key={ch.field} style={{marginBottom:'6px'}}>
      <p style={{color:'#6b7280',fontSize:'11px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'0.04em',margin:'0 0 2px 0'}}>{SETTINGS_FIELD_LABELS[ch.field]||ch.field}</p>
      <p style={{fontSize:'13px',margin:0,lineHeight:'1.5',wordBreak:'break-word' as const}}>
        <span style={{color:'#9ca3af',textDecoration:'line-through'}}>{ch.old||'(empty)'}</span>
        <span style={{color:'#9ca3af',margin:'0 6px'}}>→</span>
        <span style={{color:'#0a1f13',fontWeight:'600'}}>{ch.new||'(empty)'}</span>
      </p>
    </div>
  ));
  const formatChangeTime = (iso: string) => new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) { router.push('/auth/login'); return; }
      setCurrentUserId(session.user.id);
      setCurrentUserRole(profile.role);
      const { data: pd } = await supabase.from('profiles').select('id, full_name, email, role');
      if (pd) {
        const names: Record<string, string> = {};
        pd.forEach((p: {id: string; full_name: string | null; email: string; role: string}) => { if (p.full_name) names[p.id] = p.full_name; });
        setRepNames(names);
        setRepProfiles(pd.filter((p: {role: string}) => p.role === 'rep' || p.role === 'vp_sales') as RepProfile[]);
        setSetterProfiles(pd.filter((p: {role: string}) => p.role === 'setter') as RepProfile[]);
        setOwnerId(pd.find((p: {role: string}) => p.role === 'owner')?.id || '');
      }
      const { data: bd } = await supabase.from('businesses').select('*').order('name');
      if (bd) setBusinesses(bd);
      loadRecentOpportunities();
      const { data: nd } = await supabase.from('clients').select('*').order('created_at', {ascending:false});
      if (nd) setNewClients(nd);
      const { data: prd } = await supabase.from('problems').select('*').order('created_at', {ascending:false});
      if (prd) setProblems(prd);
      fetchProspectStats();
      fetchWonThisMonth();
      const lastViewed = localStorage.getItem('lastViewedProspects');
      if (lastViewed) { const { count } = await supabase.from('prospects').select('id', { count: 'exact', head: true }).gt('created_at', new Date(lastViewed).toISOString()); setNewProspectsCount(count ?? 0); }
      const { data: cnd } = await supabase.from('cancellations').select('*').order('created_at', {ascending:false});
      if (cnd) setCancellations(cnd);
      const { data: cpd } = await supabase.from('client_payments').select('*').order('paid_on', {ascending:false});
      if (cpd) setClientPayments(cpd);
      const { data: ld } = await supabase.from('leads').select('*').order('created_at', {ascending:false});
      if (ld) setLeads(ld);
      const { data: jpd } = await supabase.from('job_prospects').select('*').order('created_at', {ascending:false});
      if (jpd) setJobProspects(jpd);
      const { data: aad } = await supabase.from('setter_attribution_audit').select('*').order('sold_at', {ascending:false});
      if (aad) setAttributionAudit(aad);
      const { data: slots } = await supabase
  .from('setter_availability')
  .select('*, appointments(business_name, contact_name, trade, status)')
  .order('date', { ascending: true })
  .order('time_slot', { ascending: true });
if (slots) setAvailSlots(slots);
const { data: sappts } = await supabase.from('appointments').select('*').not('setter_id', 'is', null).order('created_at', { ascending: false });
if (sappts) setSetterAppts(sappts);
      const teamRes = await adminFetch('/api/admin/get-team');
      const teamJson = await teamRes.json();
      if (teamJson.team) setTeamData(teamJson.team);
      const { data: rcRows } = await supabase.from('rep_compensation').select('*');
      if (rcRows) setRepCompensation(Object.fromEntries(rcRows.map((r: RepCompensation) => [r.rep_id, r])));
      const { data: ceRows } = await supabase.from('commission_earnings').select('rep_id');
      if (ceRows) {
        const counts: Record<string, number> = {};
        ceRows.forEach((r: { rep_id: string }) => { counts[r.rep_id] = (counts[r.rep_id] || 0) + 1; });
        setCommissionCounts(counts);
      }
      const { data: planRows } = await supabase.from('plans').select('*').eq('active', true).order('monthly_price');
      if (planRows) setPlans(planRows);
      const { data: salesRows } = await supabase.from('sales').select('client_id, plan_slug, plan_price, sold_at').order('sold_at', { ascending: false });
      if (salesRows) {
        const mostRecent: Record<string, { plan_slug: string; plan_price: number; sold_at: string }> = {};
        salesRows.forEach((s: { client_id: string; plan_slug: string; plan_price: number; sold_at: string }) => {
          if (!mostRecent[s.client_id]) mostRecent[s.client_id] = s; // already sorted sold_at desc, so first hit per client is the most recent
        });
        setMostRecentSaleByClient(mostRecent);
        const first: Record<string, string> = {};
        salesRows.forEach((s: { client_id: string; plan_slug: string }) => { first[s.client_id] = s.plan_slug; }); // sorted desc, so the last write is the earliest sale
        setFirstSaleSlugByClient(first);
      }
      const { data: planLinkRows } = await supabase.from('plan_links').select('*').eq('active', true).order('created_at');
      if (planLinkRows) setPlanLinks(planLinkRows);
      setLoading(false);
    };
    loadData();
  }, [router]);

  function timeToMins(t: string) {
  const [time, period] = t.split(' ');
  const [h, m] = time.split(':').map(Number);
  let hr = h;
  if (period === 'PM' && h !== 12) hr += 12;
  if (period === 'AM' && h === 12) hr = 0;
  return hr * 60 + m;
}

function minsToTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return hour + ':' + m.toString().padStart(2, '0') + ' ' + period;
}

// The owner's way to manage availability (High Table → Calendar). /rep has the
// same feature (generateRepSlots). Both skip any time that already has a slot
// that day, booked or open (lib/slots.ts), backed by migrations/030's unique
// index on (owned_by, date, time_slot).
async function generateSlots() {
  setGenerating(true);
  const { data: { session } } = await supabase.auth.getSession();
  const inserts: any[] = [];
  const startMins = timeToMins(genStartTime);
  const endMins = timeToMins(genEndTime);
  for (const dateStr of generationDates(genDays)) { // Regina dates, starting today
    for (let m = startMins; m < endMins; m += genInterval) {
      inserts.push({ date: dateStr, time_slot: minsToTime(m), is_booked: false, created_by: session?.user.id, owned_by: session?.user.id });
    }
  }
  // Skip every time that already has a slot that day, booked or open (lib/slots.ts).
  const dates = inserts.map(i => i.date);
  const { data: existing } = dates.length ? await supabase.from('setter_availability').select('owned_by, date, time_slot').eq('owned_by', session?.user.id).gte('date', dates[0]).lte('date', dates[dates.length - 1]) : { data: [] };
  const toInsert = newSlotsOnly(inserts, existing || []);
  const { error } = toInsert.length ? await supabase.from('setter_availability').insert(toInsert) : { error: null };
  if (error) setSaveError('Some slots could not be added: ' + error.message);
  else { setSaveSuccess(`Added ${toInsert.length} slot${toInsert.length === 1 ? '' : 's'}` + (inserts.length > toInsert.length ? `; skipped ${inserts.length - toInsert.length} time${inserts.length - toInsert.length === 1 ? '' : 's'} that already had a slot.` : '.')); setTimeout(() => setSaveSuccess(''), 5000); }
  const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
  if (s) setAvailSlots(s);
  setGenerating(false);
}

async function deleteAppointmentFully(apptId: string) {
  setDeletingAppt(true);
  setApptDeleteNotice(null);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/delete-appointment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ appointmentId: apptId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setApptDeleteNotice({ kind: 'error', text: 'Could not delete appointment: ' + (data.error || res.status) });
    } else {
      const warnings = [data.calendarWarning, data.slotWarning].filter(Boolean).join(' ');
      if (warnings) setApptDeleteNotice({ kind: 'warning', text: warnings });
      else { setSaveSuccess('Appointment deleted, slot reopened, calendar event cancelled.'); setTimeout(() => setSaveSuccess(''), 4000); }
      setSelectedAppt(null);
      const { data: sappts } = await supabase.from('appointments').select('*').not('setter_id', 'is', null).order('created_at', { ascending: false });
      if (sappts) setSetterAppts(sappts);
      const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
      if (s) setAvailSlots(s);
    }
  } catch (e: any) {
    setApptDeleteNotice({ kind: 'error', text: 'Could not delete appointment: ' + (e?.message || 'network error') });
  }
  setDeletingAppt(false);
  setConfirmDeleteAppt(false);
}

async function markAdminAppointmentOutcome(apptId: string, outcome: 'Showed' | 'No Show') {
  await supabase.from('appointments').update({ status: outcome }).eq('id', apptId);
  setSelectedAppt(null);
  const { data: sappts } = await supabase.from('appointments').select('*').not('setter_id', 'is', null).order('created_at', { ascending: false });
  if (sappts) setSetterAppts(sappts);
}

async function reassignAppointment(apptId: string, userId: string) {
  await supabase.from('appointments').update({ assigned_to: userId }).eq('id', apptId);
  const updated = setterAppts.map((a: any) => a.id === apptId ? { ...a, assigned_to: userId } : a);
  setSetterAppts(updated);
  if (selectedAppt?.id === apptId) setSelectedAppt({ ...selectedAppt, assigned_to: userId });
  setAssigningTo('');
}
async function clearDate(date: string) {
  await supabase.from('setter_availability').delete().eq('date', date).eq('is_booked', false);
  const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
  if (s) setAvailSlots(s);
}
async function deleteAppointment(appt: any) {
  await supabase.from('appointments').delete().eq('id', appt.id);
  if (appt.availability_id) {
    await supabase.from('setter_availability').update({ is_booked: false }).eq('id', appt.availability_id);
  }
  const { data: sappts } = await supabase.from('appointments').select('*').not('setter_id', 'is', null).order('created_at', { ascending: false });
  if (sappts) setSetterAppts(sappts);
  const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
  if (s) setAvailSlots(s);
}
  async function addSlot() {
  if (!slotDate || !slotTime) return;
  setAddingSlot(true);
  const { data: { session } } = await supabase.auth.getSession();
  const row = { date: slotDate, time_slot: slotTime, is_booked: false, created_by: session?.user.id, owned_by: session?.user.id };
  const { data: existing } = await supabase.from('setter_availability').select('owned_by, date, time_slot').eq('owned_by', session?.user.id).eq('date', slotDate);
  if (newSlotsOnly([row], existing || []).length === 0) { setSaveError('There is already a slot at ' + slotTime + ' on ' + slotDate + '.'); setAddingSlot(false); return; }
  await supabase.from('setter_availability').insert(row);
  setSlotDate('');
  setSlotTime('9:00 AM');
  const { data: s } = await supabase.from('setter_availability').select('*, appointments(business_name, contact_name, trade, status)').order('date', { ascending: true }).order('time_slot', { ascending: true }); if (s) setAvailSlots(s);
  setAddingSlot(false);
}

// The live (not Cancelled) appointment on a slot. A cancelled demo keeps its
// availability_id, so a rebooked slot can have both.
function apptForSlot(slotId: string) {
  return setterAppts.find((a: any) => a.availability_id === slotId && a.status !== 'Cancelled');
}

function onSlotClick(e: React.MouseEvent, slot: any) {
  const alignRight = e.currentTarget.getBoundingClientRect().left > window.innerWidth - 320;
  if (e.shiftKey && slotAnchorId && slotAnchorId !== slot.id && availSlots.some((s: any) => s.id === slotAnchorId)) {
    setSlotPopover({ slotId: slot.id, rangeFromId: slotAnchorId, alignRight });
    return;
  }
  setSlotAnchorId(slot.id);
  setSlotRangeIds([]);
  setSlotPopover(slotPopover && slotPopover.slotId === slot.id && !slotPopover.rangeFromId ? null : { slotId: slot.id, alignRight });
}

async function onSlotPopoverDone(result: PopoverResult) {
  setSlotPopover(null);
  setSlotRangeIds([]);
  if (result.warning) setApptDeleteNotice({ kind: 'warning', text: result.message });
  else { setSaveSuccess(result.message); setTimeout(() => setSaveSuccess(''), 5000); }
  const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
  if (s) setAvailSlots(s);
  const { data: sappts } = await supabase.from('appointments').select('*').not('setter_id', 'is', null).order('created_at', { ascending: false });
  if (sappts) setSetterAppts(sappts);
}

async function deleteSlot(id: string) {
  await supabase.from('setter_availability').delete().eq('id', id).eq('is_booked', false); // never a booked slot
  const { data: s } = await supabase.from('setter_availability').select('*, appointments(business_name, contact_name, trade, status)').order('date', { ascending: true }).order('time_slot', { ascending: true }); if (s) setAvailSlots(s);
}
  async function refreshClients() { const { data } = await supabase.from('clients').select('*').order('created_at', {ascending:false}); if (data) setNewClients(data); }
  function openClientDetail(client: NewClient) { setSelectedClient(client); setClientSaveFlash(null); const opened = { business_name:client.business_name||'', owner_name:client.owner_name||'', phone:client.phone||'', email:client.email||'', city:client.city||'', province:client.province||'', website:client.website||'', calls_per_day:client.calls_per_day||'', current_phone_system:client.current_phone_system||'', secondary_contact:client.secondary_contact||'', plan:planForDropdown(client.plan), how_they_heard:client.how_they_heard||'', referred_by:client.referred_by||'', best_time_to_reach:client.best_time_to_reach||'', contract_signed:client.contract_signed||false, payment_collected:client.payment_collected||false, notes:client.notes||'', status:client.status||'Onboarding' }; setEditForm(opened); setEditFormInitial(opened); setClientView('detail'); }
  async function saveClientChanges() {
    if (!selectedClient) return;
    setActionLoading(true);
    setSaveError('');
    setClientSaveFlash(null);
    // Only the fields actually changed since the form opened (lib/client-edit.ts).
    const updates = changedFields(editFormInitial ?? editForm, editForm);
    const { error } = Object.keys(updates).length ? await supabase.from('clients').update(updates).eq('id', selectedClient.id) : { error: null };
    if (!error) {
      setSaveSuccess(Object.keys(updates).length ? 'Changes saved.' : 'No changes to save.');
      setClientSaveFlash('success');
      await refreshClients();
      setSelectedClient({ ...selectedClient, ...updates } as NewClient);
      setEditFormInitial(editForm);
      setTimeout(()=>setSaveSuccess(''),3000);
      setTimeout(()=>setClientSaveFlash(null),2500);
    } else {
      setSaveError('Failed to save changes: ' + error.message);
      setClientSaveFlash('error');
    }
    setActionLoading(false);
  }

  async function openRecordSaleModal() {
    if (!selectedClient) return;
    setRecordSaleError('');
    setRecordSaleResult(null);
    setRecordSaleIdempotencyKey(null);
    // Default the setter/credit dropdowns from the client's booked_by_setter_id
    // (set automatically when a setter originated this client) so admin isn't
    // re-picking from scratch — still fully editable up until the sale is
    // saved, at which point it's frozen (see migration 008).
    const bookedBy = selectedClient.booked_by_setter_id || '';
    setRecordSaleForm({ planSlug: plans[0]?.slug || '', setterId: bookedBy, closerId: '', creditRepId: bookedBy, soldAt: new Date().toISOString().slice(0, 10) });
    const { data } = await supabase.from('sales').select('*').eq('client_id', selectedClient.id).order('sold_at', { ascending: false });
    setExistingSales((data || []) as Sale[]);
    setShowRecordSale(true);
  }

  async function submitRecordSale() {
    if (!selectedClient || !recordSaleForm.planSlug || !recordSaleForm.creditRepId) return;
    setRecordSaleLoading(true);
    setRecordSaleError('');

    // Generated once per attempt, reused on any retry (see the state
    // declaration above) — this is what makes a double-click or a retry
    // after a timeout safe rather than a duplicate sale.
    const idempotencyKey = recordSaleIdempotencyKey ?? crypto.randomUUID();
    if (!recordSaleIdempotencyKey) setRecordSaleIdempotencyKey(idempotencyKey);

    let commissionEarning;
    try {
      const result = await recordSale({
        clientId: selectedClient.id,
        repId: recordSaleForm.creditRepId,
        planSlug: recordSaleForm.planSlug,
        setterId: recordSaleForm.setterId || undefined,
        closerId: recordSaleForm.closerId || undefined,
        soldAt: new Date(recordSaleForm.soldAt).toISOString(),
        idempotencyKey,
      });
      commissionEarning = result.commissionEarning;
    } catch (err: any) {
      setRecordSaleError(err.message || 'Failed to record sale.');
      setRecordSaleLoading(false);
      return;
    }

    // The sale itself is now durably recorded (migrations/011 made this
    // atomic) — anything that fails past this point is a bonus-check or
    // UI-refresh problem, never a "the sale didn't happen" problem, and
    // must never be reported as "Failed to record sale". Previously a
    // checkAndAwardBonuses failure here landed in the same catch block as
    // recordSale itself and showed that exact misleading message, which
    // could lead an admin to retry a sale that had already succeeded.
    let newBonuses: string[] = [];
    try {
      const newAwards = await checkAndAwardBonuses(recordSaleForm.creditRepId);
      newBonuses = newAwards.map(a => a.bonus_type + ' ($' + a.amount.toLocaleString() + ')');
    } catch (err: any) {
      console.error('checkAndAwardBonuses failed after a successful sale:', err);
      setRecordSaleError('Sale recorded successfully, but checking for new bonuses failed. Refresh to see current bonus status.');
    }
    setRecordSaleResult({
      amount: commissionEarning.commission_amount,
      isOverride: commissionEarning.is_milestone_override,
      newBonuses,
    });
    try {
      const { data: ceRows } = await supabase.from('commission_earnings').select('rep_id');
      if (ceRows) {
        const counts: Record<string, number> = {};
        ceRows.forEach((r: { rep_id: string }) => { counts[r.rep_id] = (counts[r.rep_id] || 0) + 1; });
        setCommissionCounts(counts);
      }
    } catch (err) {
      console.error('Failed to refresh commission counts after sale:', err);
    }
    setRecordSaleLoading(false);
  }
  async function deleteClient(id: string) {
    setActionLoading(true);
    setSaveError('');
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) {
      console.error('Supabase error (clients delete):', error);
      setSaveError('Failed to delete signup: ' + error.message);
    } else {
      setNewClients(prev => prev.filter(c => c.id !== id));
      setSelectedClient(null);
      setClientView('list');
    }
    setClientToDelete(null);
    setActionLoading(false);
  }
  async function moveClientToProspect(c: NewClient) {
    setActionLoading(true);
    setSaveError('');
    const extras: string[] = [];
    if (c.plan) extras.push('Plan: ' + c.plan);
    if (c.how_they_heard) extras.push('How They Heard: ' + c.how_they_heard);
    if (c.calls_per_day) extras.push('Calls/Day: ' + c.calls_per_day);
    if (c.current_phone_system) extras.push('Current Phone System: ' + c.current_phone_system);
    if (c.secondary_contact) extras.push('Secondary Contact: ' + c.secondary_contact);
    if (c.referred_by) extras.push('Referred By: ' + c.referred_by);
    if (c.best_time_to_reach) extras.push('Best Time To Reach: ' + c.best_time_to_reach);
    extras.push('Contract Signed: ' + (c.contract_signed ? 'true' : 'false'));
    extras.push('Payment Collected: ' + (c.payment_collected ? 'true' : 'false'));
    if (c.payment_type) extras.push('Payment Type: ' + c.payment_type);
    if (c.business_id) extras.push('Linked Business ID: ' + c.business_id);
    const extrasNote = '[Moved from Signups] ' + extras.join(' | ');
    const combinedNotes = [c.notes, extrasNote].filter(Boolean).join('\n\n');

    const { error: insertError, data: np } = await supabase.from('prospects').insert({
      company_name: c.business_name,
      contact_name: c.owner_name || '',
      phone: c.phone || '',
      email: c.email || '',
      city: c.city || '',
      // The signup's own province, else from its city; blank if unsure (never a default).
      province: c.province || inferProvince(c.city, [c.phone]),
      website: c.website || '',
      rep_id: c.rep_id,
      trade: 'Roofing',
      status: 'Not Contacted',
      tier: 'Starter',
      term: '1 Month',
      notes: combinedNotes,
    }).select().single();

    if (insertError) {
      console.error('Supabase error (prospects insert during move):', insertError);
      setSaveError('Failed to move signup to Prospects: ' + insertError.message);
      setClientToMove(null);
      setActionLoading(false);
      return;
    }

    if (np) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error: stageError } = await supabase.from('prospect_stage_history').insert({ prospect_id: np.id, rep_id: session.user.id, stage: getColumnForStatus('Not Contacted').label, entered_at: new Date().toISOString() });
        if (stageError) console.error('Supabase error (prospect_stage_history insert during move):', stageError);
      }
    }

    const { error: deleteError } = await supabase.from('clients').delete().eq('id', c.id);
    if (deleteError) {
      console.error('Supabase error (clients delete during move):', deleteError);
      setSaveError('Moved to Prospects, but failed to remove the original signup record — it now exists in both places: ' + deleteError.message);
    } else {
      setNewClients(prev => prev.filter(cl => cl.id !== c.id));
    }
    await fetchProspects();
    setSelectedClient(null);
    setClientView('list');
    setClientToMove(null);
    setActionLoading(false);
  }
  async function resolveProblem(id: string) { await supabase.from('problems').update({status:'Resolved'}).eq('id',id); setProblems(prev=>prev.map(p=>p.id===id?{...p,status:'Resolved'}:p)); }
  // Won This Month: prospects that entered the Won stage this (browser) month
  // per prospect_stage_history and are still Closed Won. Not updated_at, which
  // allocation, lead-request approvals and later edits also bump.
  async function fetchWonThisMonth() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const ids = new Set<string>();
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase.from('prospect_stage_history').select('prospect_id, prospects!inner(status)')
        .eq('stage', WON_STAGE).eq('prospects.status', 'Closed Won').gte('entered_at', from).lt('entered_at', to)
        .order('entered_at').order('id').range(start, start + 999);
      if (error || !data) { if (error) console.error('Supabase error (won this month):', error); return; }
      data.forEach((r: { prospect_id: string }) => ids.add(r.prospect_id));
      if (data.length < 1000) break;
    }
    setWonThisMonth(ids.size);
  }
  // Reloads whatever Prospects view is showing (table page 1 / board) plus the counts.
  function fetchProspects() { setProspectsReload(n => n + 1); fetchProspectStats(); fetchWonThisMonth(); }
  async function fetchProspectStats() { const rows = await fetchProspectStatsRows(); if (rows) setProspectStats(rows); }
  // supabase.from('prospects') with the filter bar applied (lib/prospect-queries.ts).
  function prospectsQuery(columns: string, opts?: { count: 'exact'; head?: boolean }, f: ProspectFilters = prospectFilters) { return prospectsQueryFor(columns, opts, f); }
  // reset: page 1 + exact count for the current filters; else the next page.
  async function loadProspectsPage(reset: boolean) {
    const req = ++prospectsReq.current;
    const key = prospectFiltersKey;
    const from = reset ? 0 : prospects.length;
    if (reset) setMatchingIds(null);
    setProspectsLoading(true);
    const q = prospectsQuery('*', reset ? { count: 'exact' } : undefined);
    const { data, error, count } = await (callbacksMode!=='off' ? q.order('follow_up_date', { ascending: true }) : q)
      .order('created_at', { ascending: false }).order('id').range(from, from + PROSPECTS_PAGE_SIZE - 1);
    if (req !== prospectsReq.current) return;
    setProspectsLoading(false);
    if (error || !data) { console.error('Supabase error (prospects page):', error); setSaveError('Failed to load prospects: ' + (error?.message || 'no data')); return; }
    if (reset) { setProspects(data); setProspectCount({ key, n: count ?? data.length }); lastCheckedIdx.current = null; }
    else setProspects(prev => { const seen = new Set(prev.map(p => p.id)); return [...prev, ...data.filter((p: Prospect) => !seen.has(p.id))]; });
  }
  async function loadFilterOptions() {
    const req = ++optionsReq.current;
    const args = filterOptionArgs(prospectFilters);
    const rows = await fetchAllPages<FilterOptionRow>((a, b) => supabase.rpc('prospect_filter_options', args).order('kind').order('key').range(a, b));
    if (rows && req === optionsReq.current) setFilterOptionRows(rows);
    loadTradeOptions();
  }
  async function loadTradeOptions() {
    const req = ++tradeOptionsReq.current;
    const { data, error } = await supabase.rpc('prospect_trade_options', tradeOptionArgs(prospectFilters));
    if (error) console.error('Supabase error (trade options):', error);
    if (data && req === tradeOptionsReq.current) setTradeOptionRows(data);
  }
  // Board: newest PROSPECTS_PAGE_SIZE per column (counts come from prospect_stats); `more` appends the next page.
  async function loadBoardColumn(colId: string, more: boolean) {
    const column = PIPELINE_COLUMNS.find(c => c.id === colId); if (!column) return;
    const req = boardReq.current;
    const from = more ? (boardCols[colId] || []).length : 0;
    const { data, error } = await supabase.from('prospects').select('*').in('status', column.statuses)
      .order('created_at', { ascending: false }).order('id').range(from, from + PROSPECTS_PAGE_SIZE - 1);
    if (error || !data || req !== boardReq.current) { if (error) console.error('Supabase error (board column):', error); return; }
    setBoardCols(prev => { const cur = more ? (prev[colId] || []) : []; const seen = new Set(cur.map(p => p.id)); return { ...prev, [colId]: [...cur, ...data.filter((p: Prospect) => !seen.has(p.id))] }; });
  }
  function loadBoard() { boardReq.current++; PIPELINE_COLUMNS.forEach(c => loadBoardColumn(c.id, false)); }
  function removeProspectLocally(id: string) {
    setProspects(prev => prev.filter(p => p.id !== id));
    setProspectCount(c => c ? { ...c, n: Math.max(0, c.n - 1) } : c);
    setBoardCols(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.filter(p => p.id !== id)])));
    fetchProspectStats();
  }
  async function fetchJobProspects() { const { data } = await supabase.from('job_prospects').select('*').order('created_at',{ascending:false}); if (data) setJobProspects(data); }
  async function submitJobProspect() {
    if (!jobProspectForm.full_name) return;
    setJobProspectSaving(true);
    setSaveError('');
    const { data, error } = await supabase.from('job_prospects').insert({ ...jobProspectForm }).select().single();
    if (error) {
      console.error('Supabase error (job_prospects insert):', error);
      setSaveError('Failed to add job prospect: ' + error.message);
    } else if (data) {
      setJobProspects(prev => [data, ...prev]);
      setJobProspectForm(EMPTY_JOB_PROSPECT_FORM);
      setJobProspectView('list');
    }
    setJobProspectSaving(false);
  }
  function openJobProspectDetail(jp: JobProspect) { setSelectedJobProspect(jp); setJobProspectView('detail'); setEditingJobProspect(false); }
  function openJobProspectEdit() {
    if (!selectedJobProspect) return;
    setJobProspectEditForm({ full_name: selectedJobProspect.full_name, email: selectedJobProspect.email || '', phone: selectedJobProspect.phone || '', location: selectedJobProspect.location || '', position: selectedJobProspect.position || '', application_source: selectedJobProspect.application_source || '', profile_url: selectedJobProspect.profile_url || '', resume_url: selectedJobProspect.resume_url || '', notes: selectedJobProspect.notes || '' });
    setEditingJobProspect(true);
  }
  async function saveJobProspectEdit() {
    if (!selectedJobProspect) return;
    setActionLoading(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('job_prospects').update({ ...jobProspectEditForm, updated_at: now }).eq('id', selectedJobProspect.id);
    if (!error) {
      setJobProspects(prev => prev.map(j => j.id === selectedJobProspect.id ? { ...j, ...jobProspectEditForm, updated_at: now } : j));
      setSelectedJobProspect(prev => prev ? { ...prev, ...jobProspectEditForm, updated_at: now } : null);
      setEditingJobProspect(false);
      setSaveSuccess('Job prospect updated.');
      setTimeout(() => setSaveSuccess(''), 3000);
    }
    setActionLoading(false);
  }
  async function updateJobProspectStatus(id: string, newStatus: string) {
    const now = new Date().toISOString();
    await supabase.from('job_prospects').update({ status: newStatus, updated_at: now }).eq('id', id);
    setJobProspects(prev => prev.map(j => j.id === id ? { ...j, status: newStatus, updated_at: now } : j));
    setSelectedJobProspect(prev => prev ? { ...prev, status: newStatus, updated_at: now } : null);
  }
  async function deleteJobProspect(id: string) {
    setActionLoading(true);
    setSaveError('');
    const { error } = await supabase.from('job_prospects').delete().eq('id', id);
    if (error) {
      console.error('Supabase error (job_prospects delete):', error);
      setSaveError('Failed to delete job prospect: ' + error.message);
    } else {
      setJobProspects(prev => prev.filter(j => j.id !== id));
      setSelectedJobProspect(null);
      setJobProspectView('list');
    }
    setActionLoading(false);
    setJobProspectToDelete(null);
  }
  async function clearAllOpenSlots() { await supabase.from('setter_availability').delete().eq('is_booked', false); const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true }); if (s) setAvailSlots(s); setSaveSuccess('All open slots cleared.'); setTimeout(() => setSaveSuccess(''), 3000); }
  async function createMeetLinkWithRetry(payload: { title: string; date: string; time: string; attendeeName: string; attendeeEmail: string; notes: string }): Promise<{ meetLink: string; failed: boolean }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await adminFetch('/api/create-meet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          const data = await res.json();
          if (data.meetLink) return { meetLink: data.meetLink, failed: false };
          console.error('create-meet returned no meetLink:', data);
        } else {
          console.error('create-meet HTTP ' + res.status + ':', await res.text());
        }
      } catch (e) {
        console.error('create-meet attempt ' + (attempt + 1) + ' threw:', e);
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
    return { meetLink: '', failed: true };
  }
  // Job Prospects: separate, non-shared wrapper around the same /api/create-meet
  // endpoint the sales-demo booking functions use (createMeetLinkWithRetry,
  // above). Kept as its own copy rather than reusing that helper so interview
  // scheduling never depends on — or risks changing behavior of — the sales
  // demo booking path. Also captures eventId, which the sales-side wrapper
  // discards but appointments doesn't need and job_prospects does.
  async function createInterviewMeet(payload: { title: string; date: string; time: string; attendeeName: string; attendeeEmail: string; notes: string }): Promise<{ meetLink: string; eventId: string; failed: boolean }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await adminFetch('/api/create-meet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          const data = await res.json();
          if (data.meetLink) return { meetLink: data.meetLink, eventId: data.eventId || '', failed: false };
          console.error('create-meet returned no meetLink:', data);
        } else {
          console.error('create-meet HTTP ' + res.status + ':', await res.text());
        }
      } catch (e) {
        console.error('create-meet attempt ' + (attempt + 1) + ' threw:', e);
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
    return { meetLink: '', eventId: '', failed: true };
  }
  async function scheduleInterview() {
    if (!selectedJobProspect || !interviewDate || !interviewTime) return;
    setInterviewLoading(true);
    const { meetLink, eventId, failed: calendarSyncFailed } = await createInterviewMeet({
      title: 'Setera Interview — ' + selectedJobProspect.full_name,
      date: interviewDate,
      time: interviewTime,
      attendeeName: selectedJobProspect.full_name,
      attendeeEmail: selectedJobProspect.email || '',
      notes: 'Position: ' + (selectedJobProspect.position || '-') + (selectedJobProspect.notes ? ('\n' + selectedJobProspect.notes) : ''),
    });
    const now = new Date().toISOString();
    const { error } = await supabase.from('job_prospects').update({
      interview_date: interviewDate,
      interview_time: interviewTime,
      interviewer: interviewer || null,
      meet_link: meetLink || null,
      google_event_id: eventId || null,
      status: 'Interview Scheduled',
      updated_at: now,
    }).eq('id', selectedJobProspect.id);
    if (!error) {
      setJobProspects(prev => prev.map(j => j.id === selectedJobProspect.id ? { ...j, interview_date: interviewDate, interview_time: interviewTime, interviewer, meet_link: meetLink || null, google_event_id: eventId || null, status: 'Interview Scheduled', updated_at: now } : j));
      setSelectedJobProspect(prev => prev ? { ...prev, interview_date: interviewDate, interview_time: interviewTime, interviewer, meet_link: meetLink || null, google_event_id: eventId || null, status: 'Interview Scheduled', updated_at: now } : null);
      setShowScheduleInterviewPanel(false);
      setInterviewDate('');
      setInterviewTime('10:00 AM');
      if (calendarSyncFailed) {
        alert('Interview saved for ' + interviewDate + ' at ' + interviewTime + ', but the Google Calendar invite + Meet link FAILED to send after 2 attempts. The candidate has NOT been notified. Create and send the invite manually.');
      } else {
        setSaveSuccess('Interview scheduled — Meet link generated! for ' + interviewDate + ' at ' + interviewTime + '.');
        setTimeout(() => setSaveSuccess(''), 4000);
      }
    } else {
      setSaveError('Failed to save interview: ' + error.message);
    }
    setInterviewLoading(false);
  }
 async function bookFromCalendar() {
  if (!calendarBookForm.date || !calendarBookForm.business_name || !calendarBookForm.contact_name) return;
  setCalendarBookLoading(true);
  const { meetLink, failed: calendarSyncFailed } = await createMeetLinkWithRetry({
    title: 'Setera Demo — ' + calendarBookForm.business_name,
    date: calendarBookForm.date,
    time: calendarBookForm.time,
    attendeeName: calendarBookForm.contact_name,
    attendeeEmail: calendarBookForm.contact_email || '',
    notes: calendarBookForm.notes || '',
  });
  const { error } = await supabase.from('appointments').insert({
    business_name: calendarBookForm.business_name,
    trade: calendarBookForm.trade,
    phone: calendarBookForm.phone,
    contact_name: calendarBookForm.contact_name,
    contact_phone: calendarBookForm.phone,
    scheduled_date: calendarBookForm.date,
    scheduled_time: calendarBookForm.time,
    assigned_to: currentUserId,
    setter_id: currentUserId,
    status: 'Scheduled',
    source: 'admin_direct',
    notes: calendarBookForm.notes || '',
    meet_link: meetLink,
    calendar_sync_failed: calendarSyncFailed,
  });
  if (error) {
    alert('Booking error: ' + error.message + ' | Code: ' + error.code);
    setCalendarBookLoading(false);
    return;
  }
  if (!error) {
    const { data: sappts } = await supabase.from('appointments').select('*').not('setter_id', 'is', null).order('created_at', { ascending: false });
    if (sappts) setSetterAppts(sappts);
    setShowCalendarBookPanel(false);
    setCalendarBookForm({ date:'', time:'10:00 AM', business_name:'', contact_name:'', contact_email:'', phone:'', trade:'Roofing', notes:'' });
    if (calendarSyncFailed) {
      alert('Demo saved for ' + calendarBookForm.date + ' at ' + calendarBookForm.time + ', but the Google Calendar invite + Meet link FAILED to send after 2 attempts. The client has NOT been notified. Create and send the invite manually.');
    } else {
      setSaveSuccess('Demo booked — Meet link generated! for ' + calendarBookForm.date + ' at ' + calendarBookForm.time + '.');
      setTimeout(() => setSaveSuccess(''), 4000);
    }
  }
  setCalendarBookLoading(false);
}

async function directBookMeeting() {

  if (!selectedProspect || !directBookDate || !directBookTime) return;
  setDirectBookLoading(true);
  const { meetLink, failed: calendarSyncFailed } = await createMeetLinkWithRetry({
    title: 'Setera Demo — ' + selectedProspect.company_name,
    date: directBookDate,
    time: directBookTime,
    attendeeName: selectedProspect.contact_name || selectedProspect.company_name,
    attendeeEmail: selectedProspect.contact_email || '',
    notes: directBookNotes || '',
  });
  const now = new Date().toISOString();
  const { error } = await supabase.from('appointments').insert({
    business_name: selectedProspect.company_name,
    trade: selectedProspect.trade,
    phone: selectedProspect.contact_phone || selectedProspect.phone,
    contact_name: selectedProspect.contact_name || '',
    contact_phone: selectedProspect.contact_phone || selectedProspect.phone,
    scheduled_date: directBookDate,
    scheduled_time: directBookTime,
    assigned_to: currentUserId,
    setter_id: currentUserId,
    status: 'Scheduled',
    source: 'admin_direct',
    notes: directBookNotes || '',
    meet_link: meetLink,
    calendar_sync_failed: calendarSyncFailed,
  });
  if (!error) {
    await updateProspectStatus(selectedProspect.id, 'Demo Scheduled');
    await supabase.from('prospect_activities').insert({
      prospect_id: selectedProspect.id,
      rep_id: currentUserId,
      type: 'Demo',
      outcome: 'Demo booked — ' + directBookDate + ' at ' + directBookTime,
      notes: directBookNotes || '',
      follow_up_date: directBookDate,
    });
    await supabase.from('prospects').update({ last_contacted_at: now }).eq('id', selectedProspect.id);
    setProspects(prev => prev.map(p => p.id === selectedProspect.id ? { ...p, last_contacted_at: now } : p));
    fetchActivities(selectedProspect.id);
    setShowBookDemoPanel(false);
    setUseDirectBook(false);
    setDirectBookDate('');
    setDirectBookTime('10:00 AM');
    setDirectBookNotes('');
    if (calendarSyncFailed) {
      alert('Meeting saved for ' + directBookDate + ' at ' + directBookTime + ', but the Google Calendar invite + Meet link FAILED to send after 2 attempts. The client has NOT been notified. Create and send the invite manually.');
    } else {
      setSaveSuccess('Meeting booked — Meet link generated! for ' + directBookDate + ' at ' + directBookTime + '.');
      setTimeout(() => setSaveSuccess(''), 4000);
    }
  }
  setDirectBookLoading(false);
}

async function bookDemoFromHighTable() {
 if (!selectedProspect || !bookSlotId) return;
 setBookDemoLoading(true);
 const slot = availSlots.find((s: any) => s.id === bookSlotId);
 if (!slot) { setBookDemoLoading(false); return; }
 const assignTo = bookAssignTo || currentUserId;
 const now = new Date().toISOString();
 // Claim the slot first: if someone else just booked it, stop before creating a Meet invite (lib/slots.ts).
 if (!(await claimSlot(supabase, slot.id))) {
   setSaveError(SLOT_TAKEN_MESSAGE); setBookSlotId('');
   const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
   if (s) setAvailSlots(s);
   setBookDemoLoading(false); return;
 }
 const { meetLink, failed: calendarSyncFailed } = await createMeetLinkWithRetry({
 title: 'Setera Demo — ' + selectedProspect.company_name,
 date: slot.date,
 time: slot.time_slot,
 attendeeName: selectedProspect.contact_name || selectedProspect.company_name,
 attendeeEmail: selectedProspect.contact_email || '',
 notes: bookDemoNotes || '',
 });
 const { error } = await supabase.from('appointments').insert({
 business_name: selectedProspect.company_name,
 trade: selectedProspect.trade,
 phone: selectedProspect.contact_phone || selectedProspect.phone,
 contact_name: selectedProspect.contact_name || '',
 contact_phone: selectedProspect.contact_phone || selectedProspect.phone,
 scheduled_date: slot.date,
 scheduled_time: slot.time_slot,
 availability_id: slot.id,
 assigned_to: assignTo,
 setter_id: currentUserId,
 status: 'Scheduled',
 source: 'admin_direct',
 notes: bookDemoNotes || '',
 meet_link: meetLink,
 calendar_sync_failed: calendarSyncFailed,
 });
 if (error) { await releaseSlot(supabase, slot.id); setSaveError('Could not book the demo: ' + error.message); } // appointment not saved: reopen the slot
 if (!error) {
 await updateProspectStatus(selectedProspect.id, 'Demo Scheduled');
 await supabase.from('prospect_activities').insert({ prospect_id: selectedProspect.id, rep_id: currentUserId, type: 'Demo', outcome: 'Demo booked — ' + slot.date + ' at ' + slot.time_slot, notes: bookDemoNotes || '', follow_up_date: slot.date });
 await supabase.from('prospects').update({ last_contacted_at: now }).eq('id', selectedProspect.id);
 setProspects(prev => prev.map(p => p.id === selectedProspect.id ? { ... p, last_contacted_at: now } : p));
 const { data: s } = await supabase.from('setter_availability').select('*').order('date', { ascending: true }).order('time_slot', { ascending: true });
 if (s) setAvailSlots(s);
 fetchActivities(selectedProspect.id);
 setShowBookDemoPanel(false);
 setBookSlotId('');
 setBookAssignTo('');
 setBookDemoNotes('');
 if (calendarSyncFailed) {
 alert('Demo saved for ' + slot.date + ' at ' + slot.time_slot + ', but the Google Calendar invite + Meet link FAILED to send after 2 attempts. The client has NOT been notified. Create and send the invite manually.');
 } else {
 setSaveSuccess('Demo booked — Meet link generated! for ' + slot.date + ' at ' + slot.time_slot + '.');
 setTimeout(() => setSaveSuccess(''), 4000);
 }
 }
 setBookDemoLoading(false);
 }
  async function reassignProspect(prospectId: string, newRepId: string) { await supabase.from('prospects').update({ rep_id: newRepId }).eq('id', prospectId); setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, rep_id: newRepId } : p)); setSelectedProspect(prev => prev ? { ...prev, rep_id: newRepId } : null); setSaveSuccess('Prospect reassigned.'); setTimeout(() => setSaveSuccess(''), 3000); }
  async function clearBadNumber(prospectId: string) { await supabase.from('prospects').update({ bad_number: false }).eq('id', prospectId); setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, bad_number: false } : p)); setSelectedProspect(prev => prev ? { ...prev, bad_number: false } : null); }
  async function toggleDNC(prospectId: string, value: boolean) { await supabase.from('prospects').update({ do_not_contact: value }).eq('id', prospectId); setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, do_not_contact: value } : p)); setSelectedProspect(prev => prev ? { ...prev, do_not_contact: value } : null); }
  async function fetchActivities(pid: string) { const { data } = await supabase.from('prospect_activities').select('*').eq('prospect_id',pid).order('created_at',{ascending:false}); if (data) setActivities(data); }
  async function fetchStageHistory(pid: string) { const { data } = await supabase.from('prospect_stage_history').select('*').eq('prospect_id',pid).order('entered_at',{ascending:true}); if (data) setStageHistory(data); }
  async function submitProspect() {
    setActionLoading(true);
    setSaveError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setActionLoading(false); setSaveError('Your session expired — please log in again.'); return; }
    const { error, data: np } = await supabase.from('prospects').insert({...prospectForm,trade:normalizeTrade(prospectForm.trade),province:prospectForm.province||null,rep_id:session.user.id,follow_up_date:prospectForm.follow_up_date||null}).select().single();
    if (error) {
      console.error('Supabase error (prospects insert):', error);
      setSaveError('Failed to save prospect: ' + error.message);
    } else if (np) {
      const { error: stageError } = await supabase.from('prospect_stage_history').insert({prospect_id:np.id,rep_id:session.user.id,stage:getColumnForStatus(prospectForm.status).label,entered_at:new Date().toISOString()});
      if (stageError) console.error('Supabase error (prospect_stage_history insert):', stageError);
      setProspectForm(EMPTY_PROSPECT_FORM);
      fetchProspects();
      setProspectView('list');
    }
    setActionLoading(false);
  }
  async function updateProspectStatus(pid: string, newStatus: string) { const prospect = prospects.find(p=>p.id===pid) || Object.values(boardCols).flat().find(p=>p.id===pid) || (selectedProspect?.id===pid ? selectedProspect : undefined); if (!prospect) return; const oldCol = getColumnForStatus(prospect.status); const newCol = getColumnForStatus(newStatus); const now = new Date().toISOString(); const days = Math.floor((Date.now()-new Date(prospect.updated_at||prospect.created_at).getTime())/86400000); const saved = await saveStatusChange(supabase, { prospectId: pid, newStatus, now, columnChanged: oldCol.id !== newCol.id, newStage: newCol.label, historyRepId: prospect.rep_id, daysInStage: days }); /* lib/stage-change.ts: reports what didn't save */ if (saved.status === 'not_saved') { setSaveError(saved.message); if (viewMode==='board') loadBoard(); return; } if (saved.status === 'history_failed') setSaveError(saved.message); setSelectedProspect(prev=>prev?{...prev,status:newStatus,updated_at:now}:null); setProspects(prev=>prev.map(p=>p.id===pid?{...p,status:newStatus,updated_at:now}:p)); fetchProspectStats(); if (oldCol.id !== newCol.id && (oldCol.label === WON_STAGE || newCol.label === WON_STAGE)) fetchWonThisMonth(); if (viewMode==='board') loadBoard(); if (selectedProspect?.id===pid) fetchStageHistory(pid); }
  async function logActivity() { if (!selectedProspect || !activityForm.outcome.trim()) return; /* outcome required (migrations/026) */ setActionLoading(true); const { data: { session } } = await supabase.auth.getSession(); if (!session) return; const now = new Date().toISOString(); const followUp = activityForm.follow_up_date || null; /* blank -> null; an entered date also becomes the prospect's follow-up, blank keeps the existing one */ const { error } = await supabase.from('prospect_activities').insert({...activityForm,follow_up_date:followUp,prospect_id:selectedProspect.id,rep_id:session.user.id}); if (!error) { const prospectUpdate = prospectUpdateForActivity(activityForm.type, activityForm.outcome, followUp, now); /* lib/callOutcomes.ts: Wrong Number also flags bad_number */ await supabase.from('prospects').update(prospectUpdate).eq('id', selectedProspect.id); setProspects(prev => prev.map(p => p.id === selectedProspect.id ? { ...p, ...prospectUpdate } : p)); setSelectedProspect(prev => prev ? { ...prev, ...prospectUpdate } : prev); setActivityForm({type:'Call',outcome:'',notes:'',follow_up_date:''}); fetchActivities(selectedProspect.id); } setActionLoading(false); }
  function openDetail(prospect: Prospect) { setSelectedProspect(prospect); fetchActivities(prospect.id); fetchStageHistory(prospect.id); setProspectView('detail'); setShowBookDemoPanel(false); setBookSlotId(''); setBookAssignTo(''); setBookDemoNotes(''); setEditingProspect(false); }
  function openProspectEdit() { if (!selectedProspect) return; setProspectEditForm({ company_name: selectedProspect.company_name || '', trade: selectedProspect.trade || 'Roofing', province: selectedProspect.province || '', city: selectedProspect.city || '', website: selectedProspect.website || '', phone: selectedProspect.phone || '', email: selectedProspect.email || '', contact_name: selectedProspect.contact_name || '', contact_position: selectedProspect.contact_position || '', contact_phone: selectedProspect.contact_phone || '', contact_email: selectedProspect.contact_email || '' }); setEditingProspect(true); }
  async function saveProspectEdit() { if (!selectedProspect) return; setActionLoading(true); const form = { ...prospectEditForm, trade: normalizeTrade(prospectEditForm.trade) }; const { error } = await supabase.from('prospects').update({ ...form, province: form.province || null }).eq('id', selectedProspect.id); if (!error) { const edited = (prospectEditForm.phone !== (selectedProspect.phone || '') || prospectEditForm.contact_phone !== (selectedProspect.contact_phone || '')) ? { ...form, bad_number: false } : form; /* phone or contact_phone changed -> trigger cleared bad_number (migrations/034) */ setProspects(prev => prev.map(p => p.id === selectedProspect.id ? { ...p, ...edited } : p)); setSelectedProspect(prev => prev ? { ...prev, ...edited } : null); setEditingProspect(false); setSaveSuccess('Prospect updated.'); setTimeout(() => setSaveSuccess(''), 3000); } setActionLoading(false); }
  async function deleteProspect(id: string) {
    setActionLoading(true);
    setSaveError('');
    const { error } = await supabase.from('prospects').delete().eq('id', id);
    if (error) {
      console.error('Supabase error (prospects delete):', error);
      setSaveError('Failed to delete prospect: ' + error.message);
    } else {
      removeProspectLocally(id);
      setSelectedProspect(null);
      setProspectView('list');
    }
    setProspectToDelete(null);
    setActionLoading(false);
  }
  async function moveProspectToSignup(p: Prospect) {
    setActionLoading(true);
    setSaveError('');
    const finalPhone = p.contact_phone || p.phone || '';
    const finalEmail = p.contact_email || p.email || '';
    const extras: string[] = [];
    if (p.trade) extras.push('Trade: ' + p.trade);
    if (p.contact_position) extras.push('Contact Position: ' + p.contact_position);
    if (p.source) extras.push('Source: ' + p.source);
    if (p.follow_up_date) extras.push('Follow Up Date: ' + p.follow_up_date);
    if (p.do_not_contact) extras.push('Do Not Contact: true');
    if (p.last_contacted_at) extras.push('Last Contacted: ' + p.last_contacted_at);
    if (p.contact_phone && p.phone && p.phone !== p.contact_phone) extras.push('Business Phone: ' + p.phone);
    if (p.contact_email && p.email && p.email !== p.contact_email) extras.push('Business Email: ' + p.email);
    const extrasNote = extras.length ? '[Moved from Prospects] ' + extras.join(' | ') : '';
    const combinedNotes = [p.notes, extrasNote].filter(Boolean).join('\n\n');

    // Lowercase tier (clients_tier_check); current plan name for current tiers,
    // no plan for legacy or blank tiers; province given or inferred, never a
    // default (lib/client-tier.ts).
    const { tier, plan, province } = clientFieldsFromProspect(p);
    const { error: insertError } = await supabase.from('clients').insert({
      business_name: p.company_name,
      owner_name: p.contact_name || '',
      phone: finalPhone,
      email: finalEmail,
      city: p.city || '',
      province,
      website: p.website || '',
      rep_id: p.rep_id,
      tier,
      plan,
      status: 'Onboarding',
      contract_signed: false,
      payment_collected: false,
      notes: combinedNotes,
    });

    if (insertError) {
      console.error('Supabase error (clients insert during move):', insertError);
      setSaveError('Failed to move prospect to Signups: ' + insertError.message);
      setProspectToMove(null);
      setActionLoading(false);
      return;
    }

    const { error: deleteError } = await supabase.from('prospects').delete().eq('id', p.id);
    if (deleteError) {
      console.error('Supabase error (prospects delete during move):', deleteError);
      setSaveError('Moved to Signups, but failed to remove the original prospect record — it now exists in both places: ' + deleteError.message);
    } else {
      removeProspectLocally(p.id);
    }
    await refreshClients();
    setSelectedProspect(null);
    setProspectView('list');
    setProspectToMove(null);
    setActionLoading(false);
  }
  function getRepLabel(id: string) { return id ? (repNames[id] || (id === currentUserId ? 'Alex' : 'Rep ' + id.substring(0,6))) : 'Unassigned'; }
  // Shared by the Manage Track modal and the Rep Management inline expand —
  // one render path for MRR Progress/Sprint/every-10th-sale so the two
  // surfaces can never show different numbers for the same setter.
  function renderCompensationProgress(progress: CompensationProgress) {
    const PLAN_COLORS: Record<string, string> = { launch: '#8b5cf6', grow: '#10b981', starter_v2: '#c9a876' };
    const fmtCAD = (n: number) => '$' + Math.round(n).toLocaleString();
    const miniBar = (pct: number, color: string) => (
      <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'6px',overflow:'hidden',margin:'4px 0'}}>
        <div style={{backgroundColor:color,height:'100%',width:Math.max(0,Math.min(100,pct))+'%',borderRadius:'99px'}} />
      </div>
    );
    return (
      <div style={{backgroundColor:'#fff',border:'1px solid #f3f4f6',borderRadius:'10px',padding:'16px',display:'flex',flexDirection:'column' as const,gap:'16px'}}>
        <p style={{color:'#0a1f13',fontSize:'11px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:0}}>Compensation Progress</p>

        {progress.mrrProgress ? (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px'}}>
              <span style={{color:'#374151',fontWeight:'600'}}>MRR Progress</span>
              <span style={{color:'#6b7280'}}>{fmtCAD(progress.mrrProgress.cumulativeMRR)}{progress.mrrProgress.nextMilestone ? ' / ' + fmtCAD(progress.mrrProgress.nextMilestone.threshold) : ' — all milestones hit'}</span>
            </div>
            {miniBar(progress.mrrProgress.percentComplete, '#00d4aa')}
            <div style={{display:'flex',gap:'12px',flexWrap:'wrap' as const}}>
              {progress.mrrProgress.thresholds.map(t=>(
                <span key={t.type} style={{fontSize:'11px',color:t.awarded?'#10b981':'#9ca3af',fontWeight:t.awarded?'700':'400'}}>{t.awarded?'✓ ':''}{fmtCAD(t.threshold)} → {fmtCAD(t.amount)}</span>
              ))}
            </div>
          </div>
        ) : (
          <p style={{color:'#6b7280',fontSize:'12px',margin:0}}>Permanent Setter track — flat 5%, no MRR/bonus tracking.</p>
        )}

        {progress.sprint && (
          <div>
            <p style={{color:'#374151',fontWeight:'600',fontSize:'12px',margin:'0 0 6px 0'}}>Monthly Sprint</p>
            <SprintProgress sprint={progress.sprint} compact />
          </div>
        )}

        {progress.planMilestones.length > 0 && (
          <div>
            <p style={{color:'#374151',fontSize:'12px',fontWeight:'600',margin:'0 0 8px 0'}}>Every 10th Sale</p>
            <div style={{display:'flex',flexDirection:'column' as const,gap:'8px'}}>
              {progress.planMilestones.map(m=>(
                <div key={m.planSlug}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px'}}>
                    <span style={{color:'#6b7280'}}>{m.displayName}{!m.payable?' (not yet payable)':''}</span>
                    <span style={{color:PLAN_COLORS[m.planSlug]||'#6b7280',fontWeight:'700'}}>{m.countTowardNext} / 10</span>
                  </div>
                  {miniBar((m.countTowardNext/10)*100, PLAN_COLORS[m.planSlug]||'#8b5cf6')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  // Once a client has a recorded sale, that sale's plan_slug/plan_price (the
  // snapshot taken at sale time — see lib/compensation.ts) is the real
  // source of truth for what they're actually paying, and always wins over
  // the manually-typed clients.plan field. Before any sale exists (e.g.
  // still onboarding), clients.plan is the only signal of what they signed
  // up for, so it's kept as the fallback.
  function getClientPlanDisplay(client: NewClient): string {
    const sale = mostRecentSaleByClient[client.id];
    if (!sale) return client.plan;
    const plan = plans.find(p => p.slug === sale.plan_slug);
    return (plan?.display_name || sale.plan_slug) + ' — $' + sale.plan_price.toLocaleString() + '/mo';
  }
  async function openManagedClientDetail(client: NewClient) {
    setSelectedManagedClient(client);
    setGoLiveChecklist(client.go_live_checklist||{});
    setManagedClientBusiness(null);
    setManagedClientCalls([]);
    setManagedClientTouchpoints([]);
    const bizCurrency = findClientBusiness(client)?.currency;
    setPaymentForm({ amount: '', currency: bizCurrency === 'USD' ? 'USD' : 'CAD', paid_on: reginaDateStr(), method: '', note: '' });
    setPaymentError('');
    setClientsManageView('detail');
    setManagedClientLoading(true);
    const { data: bizData } = client.business_id
      ? await supabase.from('businesses').select('*').eq('id', client.business_id).maybeSingle()
      : await supabase.from('businesses').select('*').ilike('name', client.business_name).maybeSingle();
    if (bizData) {
      setManagedClientBusiness(bizData);
      const { data: callData } = await supabase.from('calls').select('*').eq('business_id', bizData.id).order('created_at', { ascending: false });
      if (callData) setManagedClientCalls(callData);
      const { data: tpData } = await supabase.from('client_touchpoints').select('*').eq('business_id', bizData.id).order('created_at', { ascending: false }).limit(10);
      if (tpData) setManagedClientTouchpoints(tpData);
    }
    setManagedClientLoading(false);
    setEditingManagedClient(false);
  }

  function findClientBusiness(client: NewClient) {
    return client.business_id ? businesses.find(b => b.id === client.business_id) : businesses.find(b => b.name.toLowerCase().trim() === client.business_name.toLowerCase().trim());
  }

  function isClientLocked(client: NewClient) {
    return findClientBusiness(client)?.status === 'locked';
  }

  // Past Clients reuse what already exists instead of new columns: the
  // client's confirmed row on the Cancellations page gives the end date and
  // reason; without one, the account lock (date + lock reason/notes) does.
  // Days active run from go-live (else signup) to the end date.
  function getPastClientInfo(client: NewClient) {
    const biz = findClientBusiness(client);
    const canc = cancellations
      .filter(c => c.client_id === client.id && c.status === 'confirmed')
      .sort((a, b) => (b.effective_date || b.created_at).localeCompare(a.effective_date || a.created_at))[0];
    const endDate = canc?.effective_date || (biz?.locked_at ? reginaDateStr(new Date(biz.locked_at)) : null);
    const startDate = biz?.go_live_date || reginaDateStr(new Date(client.created_at));
    const daysActive = endDate ? Math.max(0, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000)) : null;
    const lockLabel = biz?.lock_reason ? (LOCK_REASON_OPTIONS.find(r => r.value === biz.lock_reason)?.label || biz.lock_reason) : '';
    const reason = canc
      ? [canc.category ? getCategoryLabel(canc.category) : '', canc.reason].filter(Boolean).join(': ')
      : [lockLabel, biz?.lock_notes || ''].filter(Boolean).join(': ');
    return { endDate, daysActive, reason, callCount: biz ? pastClientCallCounts[biz.id] : undefined };
  }

  // Total Paid: the client's ledger entries, one total per currency (never
  // added across currencies). A pre-platform direct payment (Northfield, kept on
  // businesses.upfront_paid_usd) is labelled, not counted.
  function getClientPaidLabel(client: NewClient) {
    const totals = sumPaymentsByCurrency(clientPayments.filter(p => p.client_id === client.id));
    if (totals.length) return totals.map(formatMoneyTotal).join(' · ');
    if (findClientBusiness(client)?.upfront_paid_usd) return 'Paid direct (pre-platform)';
    return '—';
  }

  async function recordClientPayment() {
    if (!selectedManagedClient) return;
    const amount = Number(paymentForm.amount);
    if (!paymentForm.amount.trim() || !Number.isFinite(amount) || amount === 0) { setPaymentError('Enter a non-zero amount (negative for a refund or correction).'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentForm.paid_on)) { setPaymentError('Pick the date the money arrived.'); return; }
    setPaymentBusy(true);
    setPaymentError('');
    const { data, error } = await supabase.from('client_payments').insert({
      client_id: selectedManagedClient.id,
      amount: Math.round(amount * 100) / 100,
      currency: paymentForm.currency,
      paid_on: paymentForm.paid_on,
      method: paymentForm.method.trim() || null,
      note: paymentForm.note.trim() || null,
    }).select().single();
    setPaymentBusy(false);
    if (error || !data) { setPaymentError('Could not record payment: ' + (error?.message || 'unknown error')); return; }
    setClientPayments(prev => [data as ClientPayment, ...prev]);
    setPaymentForm({ amount: '', currency: paymentForm.currency, paid_on: reginaDateStr(), method: '', note: '' });
  }

  async function submitLockDialog() {
    if (!managedClientBusiness || !lockDialog) return;
    setLockBusy(true);
    setLockError('');
    const body = lockDialog === 'lock'
      ? { businessId: managedClientBusiness.id, reason: lockForm.reason, notes: lockForm.notes.trim() || null, confirmName: lockForm.confirmName }
      : { businessId: managedClientBusiness.id };
    const res = await adminFetch('/api/admin/' + (lockDialog === 'lock' ? 'lock-account' : 'unlock-account'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    // 401 = this tab's session no longer exists server-side (e.g. signed out
    // elsewhere). Page data keeps loading because PostgREST only checks the
    // JWT signature, so say plainly what happened and that nothing changed.
    if (res.status === 401) { setLockError('Your login session has ended (signed out elsewhere or expired). Nothing was changed — sign out, log back in, and try again.'); setLockBusy(false); return; }
    if (!res.ok) { setLockError(json.error || ('Request failed (' + res.status + ')')); setLockBusy(false); return; }
    // Re-read rather than patching locally, so what's shown is what's stored.
    const { data: bizData } = await supabase.from('businesses').select('*').eq('id', managedClientBusiness.id).maybeSingle();
    if (bizData) {
      setManagedClientBusiness(bizData);
      setBusinesses(prev => prev.map(b => b.id === bizData.id ? bizData : b));
    }
    setLockBusy(false);
    setLockDialog(null);
  }

  function openManagedClientEdit() {
    if (!selectedManagedClient) return;
    setClientSaveFlash(null);
    const opened = {
      owner_name: selectedManagedClient.owner_name || '',
      phone: selectedManagedClient.phone || '',
      email: selectedManagedClient.email || '',
      city: selectedManagedClient.city || '',
      province: selectedManagedClient.province || '', // blank stays blank (never default SK)
      plan: planForDropdown(selectedManagedClient.plan),
      sms_contact_1: managedClientBusiness?.sms_contact_1 || '',
      sms_contact_2: managedClientBusiness?.sms_contact_2 || '',
      call_forwarding_number: managedClientBusiness?.call_forwarding_number || '',
      business_hours: managedClientBusiness?.business_hours || '',
      services: managedClientBusiness?.services || '',
      urgent_triggers: managedClientBusiness?.urgent_triggers || '',
      avg_job_value: managedClientBusiness?.avg_job_value != null ? String(managedClientBusiness.avg_job_value) : '',
    };
    setManagedClientEditForm(opened);
    setManagedFormInitial(opened);
    setEditingManagedClient(true);
  }
  async function saveManagedClientEdit() {
    if (!selectedManagedClient) return;
    setActionLoading(true);
    setSaveError('');
    setClientSaveFlash(null);
    // Only the fields actually changed since the form opened (lib/client-edit.ts),
    // split between the client row and the business (Emily settings) row.
    const changed = changedFields(managedFormInitial ?? managedClientEditForm, managedClientEditForm) as Record<string, unknown>;
    const CLIENT_KEYS = ['owner_name', 'phone', 'email', 'city', 'province', 'plan'];
    const clientUpdates = Object.fromEntries(Object.entries(changed).filter(([key]) => CLIENT_KEYS.includes(key)));
    const bizUpdates = Object.fromEntries(Object.entries(changed).filter(([key]) => !CLIENT_KEYS.includes(key)).map(([key, v]) => [key, key === 'avg_job_value' && v != null ? parseFloat(String(v)) : v]));
    const { error: clientError } = Object.keys(clientUpdates).length ? await supabase.from('clients').update(clientUpdates).eq('id', selectedManagedClient.id) : { error: null };
    let bizError = null;
    if (managedClientBusiness && Object.keys(bizUpdates).length) {
      const { error } = await supabase.from('businesses').update(bizUpdates).eq('id', managedClientBusiness.id);
      bizError = error;
    }
    if (!clientError && !bizError) {
      setNewClients(prev => prev.map(c => c.id === selectedManagedClient.id ? { ...c, ...clientUpdates } as NewClient : c));
      setSelectedManagedClient(prev => prev ? { ...prev, ...clientUpdates } as NewClient : null);
      if (managedClientBusiness) setManagedClientBusiness(prev => prev ? { ...prev, ...bizUpdates } : null);
      setSaveSuccess('Client updated.');
      setClientSaveFlash('success');
      setTimeout(() => setSaveSuccess(''), 3000);
      // Hold the edit form open just long enough for the "✓ Saved" flash on
      // the button to actually register before switching back to the
      // read-only view — otherwise the button (and the flash on it) would
      // unmount in the same render as the success state, and never be seen.
      setTimeout(() => { setEditingManagedClient(false); setClientSaveFlash(null); }, 900);
    } else {
      const messages = [clientError && 'client info: ' + clientError.message, bizError && 'business info: ' + bizError.message].filter(Boolean);
      setSaveError('Failed to save changes — ' + messages.join('; '));
      setClientSaveFlash('error');
    }
    setActionLoading(false);
  }

  async function logTouchpoint() {
    if (!managedClientBusiness || !touchpointForm.notes) return;
    setTouchpointLoading(true);
    const { error } = await supabase.from('client_touchpoints').insert({ business_id: managedClientBusiness.id, rep_id: currentUserId, type: touchpointForm.type, notes: touchpointForm.notes });
    if (!error) {
      setTouchpointForm({ type: 'Call', notes: '' });
      const { data: tpData } = await supabase.from('client_touchpoints').select('*').eq('business_id', managedClientBusiness.id).order('created_at', { ascending: false }).limit(10);
      if (tpData) setManagedClientTouchpoints(tpData);
      setSaveSuccess('Touchpoint logged.');
      setTimeout(() => setSaveSuccess(''), 2000);
    }
    setTouchpointLoading(false);
  }
  async function sendLoginSetupEmail(email: string) { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/reset-password' }); if (!error) setSaveSuccess('Login setup email sent to ' + email); else setSaveSuccess('Error: could not send email.'); }
  async function toggleGoLiveItem(item: string, checked: boolean) { if (!selectedManagedClient) return; const updated = {...goLiveChecklist,[item]:checked}; setGoLiveChecklist(updated); await supabase.from('clients').update({go_live_checklist:updated}).eq('id',selectedManagedClient.id); setNewClients(prev=>prev.map(c=>c.id===selectedManagedClient.id?{...c,go_live_checklist:updated}:c)); setSelectedManagedClient(prev=>prev?{...prev,go_live_checklist:updated}:null); }
  async function linkClientToBusiness(businessId: string) {
    if (!selectedManagedClient) return;
    const bizId = businessId || null;
    await supabase.from('clients').update({business_id:bizId}).eq('id',selectedManagedClient.id);
    setNewClients(prev=>prev.map(c=>c.id===selectedManagedClient.id?{...c,business_id:bizId}:c));
    setSelectedManagedClient(prev=>prev?{...prev,business_id:bizId}:null);
    if (bizId) {
      const { data: bizData } = await supabase.from('businesses').select('*').eq('id',bizId).maybeSingle();
      setManagedClientBusiness(bizData||null);
      if (bizData) {
        const { data: callData } = await supabase.from('calls').select('*').eq('business_id',bizData.id).order('created_at',{ascending:false});
        if (callData) setManagedClientCalls(callData);
      }
    } else {
      setManagedClientBusiness(null);
      setManagedClientCalls([]);
    }
    setSaveSuccess('Linked business updated.');
    setTimeout(()=>setSaveSuccess(''),3000);
  }
  async function updateCancellationStatus(id: string, status: string) { await supabase.from('cancellations').update({status}).eq('id',id); setCancellations(prev=>prev.map(c=>c.id===id?{...c,status}:c)); }
  function handleExpandProblem(id: string, notes: string|null|undefined) { if (expandedProblem===id) { setExpandedProblem(null); return; } setExpandedProblem(id); setProblemNotesDraft(prev=>({...prev,[id]:prev[id]!==undefined?prev[id]:(notes||'')})); }
  async function saveProblemNotes(id: string) { const notes = problemNotesDraft[id]||''; await supabase.from('problems').update({admin_notes:notes}).eq('id',id); setProblems(prev=>prev.map(p=>p.id===id?{...p,admin_notes:notes}:p)); setSaveSuccess('Notes saved.'); setTimeout(()=>setSaveSuccess(''),2000); }
  async function updateLeadStatus(id: string, status: string) { await supabase.from('leads').update({status}).eq('id',id); setLeads(prev=>prev.map(l=>l.id===id?{...l,status}:l)); if (selectedLead?.id===id) setSelectedLead(prev=>prev?{...prev,status}:null); }
  async function assignLead(id: string, assigned_to: string|null) { await supabase.from('leads').update({assigned_to}).eq('id',id); setLeads(prev=>prev.map(l=>l.id===id?{...l,assigned_to}:l)); if (selectedLead?.id===id) setSelectedLead(prev=>prev?{...prev,assigned_to}:null); }
  async function saveLeadNotes(id: string) { await supabase.from('leads').update({notes:leadNotesDraft}).eq('id',id); setLeads(prev=>prev.map(l=>l.id===id?{...l,notes:leadNotesDraft}:l)); if (selectedLead?.id===id) setSelectedLead(prev=>prev?{...prev,notes:leadNotesDraft}:null); setSaveSuccess('Notes saved.'); setTimeout(()=>setSaveSuccess(''),2000); }
  function openLeadDetail(lead: Lead) { setSelectedLead(lead); setLeadNotesDraft(lead.notes||''); }
  // scope 'local': the default ('global') deletes every session this user has,
  // silently breaking every other open tab/device's admin API calls.
  const handleSignOut = async () => { await supabase.auth.signOut({ scope: 'local' }); router.push('/auth/login'); };

  async function refreshTeam() { const r = await adminFetch('/api/admin/get-team'); const j = await r.json(); if (j.team) setTeamData(j.team); }

  async function inviteTeamMember() {
    if (!inviteForm.email || !inviteForm.full_name) return;
    setInviteLoading(true);
    const res = await adminFetch('/api/admin/invite-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...inviteForm, invited_by: currentUserId }) });
    const data = await res.json();
    if (data.success) { setSaveSuccess(inviteForm.full_name + ' invited — they will get an email to set their password.'); setShowInviteForm(false); setInviteForm({ full_name: '', email: '', role: 'rep' }); refreshTeam(); }
    else { setSaveSuccess('Error: ' + (data.error || 'Could not send invite.')); }
    setInviteLoading(false);
  }

  async function toggleTeamMember(userId: string, action: 'deactivate' | 'reactivate') {
    await adminFetch('/api/admin/toggle-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action }) });
    refreshTeam();
    setSaveSuccess(action === 'deactivate' ? 'User deactivated.' : 'User reactivated.');
    setTimeout(() => setSaveSuccess(''), 3000);
  }

  // After a promotion: re-read profiles (rep/setter lists move) and the team list.
  async function reloadPeople() {
    const { data: pd } = await supabase.from('profiles').select('id, full_name, email, role');
    if (pd) {
      setRepProfiles(pd.filter((p: {role: string}) => p.role === 'rep' || p.role === 'vp_sales') as RepProfile[]);
      setSetterProfiles(pd.filter((p: {role: string}) => p.role === 'setter') as RepProfile[]);
    }
    await refreshTeam();
    setPeopleVersion(v => v + 1);
  }
  // "Rep since Oct 1, 2026 · Setter Sep 2 – Oct 1, 2026" from role_history (migrations/027).
  function roleHistoryLine(userId: string): string {
    const rows = roleHistory.filter(h => h.user_id === userId);
    if (rows.length < 2) return '';
    const d = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    const label = (r: string) => ({ setter: 'Setter', rep: 'Rep', vp_sales: 'VP' } as Record<string, string>)[r] || r;
    return [...rows].reverse().map(h => h.ended_at ? `${label(h.role)} ${d(h.started_at)} – ${d(h.ended_at)}` : `${label(h.role)} since ${d(h.started_at)}`).join(' · ');
  }

  async function removeTeamMember() {
    if (!removingRep) return;
    setRemoveRepLoading(true);
    setSaveError('');
    const res = await adminFetch('/api/admin/remove-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: removingRep.id }) });
    const data = await res.json();
    if (data.success) {
      setRepProfiles(prev => prev.filter(r => r.id !== removingRep.id));
      setTeamData(prev => prev.filter(t => t.id !== removingRep.id));
      setSaveSuccess((removingRep.full_name || removingRep.email) + ' removed.');
      setTimeout(() => setSaveSuccess(''), 3000);
      setRemovingRep(null);
    } else {
      setSaveError('Failed to remove ' + (removingRep.full_name || removingRep.email) + ': ' + (data.error || 'unknown error'));
    }
    setRemoveRepLoading(false);
  }

  // Powers the Rep Management inline expand — same four stats + same
  // getCompensationProgress() call the setter sees on their own dashboard,
  // fetched on demand (not for every setter up front) and cached per
  // setter for the rest of the session.
  async function toggleSetterExpand(setterId: string) {
    if (expandedSetterId === setterId) { setExpandedSetterId(null); return; }
    setExpandedSetterId(setterId);
    if (setterDashboardData[setterId] && setterDashboardData[setterId] !== 'loading') return;
    setSetterDashboardData(prev => ({ ...prev, [setterId]: 'loading' }));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [{ count: dialsToday }, { data: apptRows }, progress] = await Promise.all([
      supabase.from('prospect_activities').select('id', { count: 'exact', head: true }).eq('rep_id', setterId).eq('type', 'Call').gte('created_at', todayStart.toISOString()),
      supabase.from('appointments').select('created_at, status').eq('setter_id', setterId),
      getCompensationProgress(setterId).catch(() => null),
    ]);
    const appts = apptRows || [];
    const bookedThisWeek = appts.filter((a: { created_at: string; status: string }) => isThisWeekAdmin(a.created_at) && a.status !== 'Cancelled').length;
    const completedAppts = appts.filter((a: { status: string }) => a.status !== 'Scheduled' && a.status !== 'Cancelled'); // a cancelled demo isn't a no-show
    const showedAppts = completedAppts.filter((a: { status: string }) => a.status === 'Showed' || a.status === 'Closed');
    const showRate = completedAppts.length > 0 ? Math.round((showedAppts.length / completedAppts.length) * 100) : 0;
    setSetterDashboardData(prev => ({ ...prev, [setterId]: { dialsToday: dialsToday || 0, bookedThisWeek, showRate, progress } }));
  }

  async function openTrackModal(setter: any) {
    setManagingTrackFor(setter);
    setTrackActionError('');
    setPendingTrackAction(null);
    setStartTrackingDate(new Date().toISOString().slice(0, 10));
    setContractDateDraft({ sent: '', signed: '' });
    setManagingTrackLoading(true);
    const { data: history } = await supabase
      .from('rep_compensation_history')
      .select('*')
      .eq('rep_id', setter.id)
      .order('changed_at', { ascending: false });
    setManagingTrackHistory((history || []) as CompHistoryRow[]);

    if (history && history.length > 0) {
      const { count } = await supabase
        .from('commission_earnings')
        .select('id', { count: 'exact', head: true })
        .eq('rep_id', setter.id)
        .gte('created_at', history[0].changed_at);
      setSalesSinceLastChange(count || 0);
    } else {
      setSalesSinceLastChange(0);
    }
    // Same getCompensationProgress() call the setter's own dashboard uses —
    // this view can never drift from what they actually see, and it's
    // read-only here (no writes), so re-fetching on every modal open/action
    // is always safe.
    try {
      setManagingTrackProgress(await getCompensationProgress(setter.id));
    } catch {
      setManagingTrackProgress(null); // no rep_compensation row yet — tracking hasn't started
    }
    setManagingTrackLoading(false);
  }

  function closeTrackModal() {
    setManagingTrackFor(null);
    setManagingTrackHistory([]);
    setManagingTrackProgress(null);
    setPendingTrackAction(null);
    setTrackActionError('');
  }

  async function startTracking() {
    if (!managingTrackFor || !startTrackingDate) return;
    setTrackActionLoading(true);
    setTrackActionError('');
    const startedAt = new Date(startTrackingDate).toISOString();
    const { error: rcError } = await supabase.from('rep_compensation').insert({
      rep_id: managingTrackFor.id,
      comp_track: 'setter_training',
      rep_started_at: startedAt,
      track_changed_at: new Date().toISOString(),
    });
    if (rcError) { setTrackActionError('Failed to start tracking: ' + rcError.message); setTrackActionLoading(false); return; }
    await supabase.from('rep_compensation_history').insert({
      rep_id: managingTrackFor.id,
      previous_track: null,
      new_track: 'setter_training',
      changed_by: currentUserId,
      note: 'Manually backfilled for existing setter.',
    });
    setRepCompensation(prev => ({ ...prev, [managingTrackFor.id]: { rep_id: managingTrackFor.id, comp_track: 'setter_training', rep_started_at: startedAt, track_changed_at: new Date().toISOString() } }));
    setTrackActionLoading(false);
    await openTrackModal(managingTrackFor);
  }

  async function transitionTrack(newTrack: CompTrack) {
    if (!managingTrackFor) return;
    const current = repCompensation[managingTrackFor.id];
    if (!current) return;
    setTrackActionLoading(true);
    setTrackActionError('');
    const now = new Date().toISOString();
    const { error: rcError } = await supabase
      .from('rep_compensation')
      .update({ comp_track: newTrack, track_changed_at: now })
      .eq('rep_id', managingTrackFor.id);
    if (rcError) { setTrackActionError('Failed to change track: ' + rcError.message); setTrackActionLoading(false); return; }
    await supabase.from('rep_compensation_history').insert({
      rep_id: managingTrackFor.id,
      previous_track: current.comp_track,
      new_track: newTrack,
      changed_by: currentUserId,
    });
    setRepCompensation(prev => ({ ...prev, [managingTrackFor.id]: { ...current, comp_track: newTrack, track_changed_at: now } }));
    setPendingTrackAction(null);
    setTrackActionLoading(false);
    await openTrackModal(managingTrackFor);
  }

  async function revertLastChange() {
    if (!managingTrackFor || managingTrackHistory.length === 0 || salesSinceLastChange > 0) return;
    const last = managingTrackHistory[0];
    setTrackActionLoading(true);
    setTrackActionError('');
    const now = new Date().toISOString();

    if (last.previous_track === null) {
      // Reverting the very first "start tracking" entry means going back to
      // "not tracked at all" — a state new_track's NOT NULL/enum constraint
      // can't represent as a row. Rather than insert a misleading row (there's
      // no valid "reverted to" track to put in new_track), annotate the
      // original entry in place; it's still the true record of what happened.
      const { error } = await supabase.from('rep_compensation').delete().eq('rep_id', managingTrackFor.id);
      if (error) { setTrackActionError('Failed to revert: ' + error.message); setTrackActionLoading(false); return; }
      await supabase.from('rep_compensation_history').update({
        note: [last.note, 'REVERTED by admin on ' + formatDate(now) + ' — compensation tracking setup was undone.'].filter(Boolean).join(' '),
      }).eq('id', last.id);
      setRepCompensation(prev => { const next = { ...prev }; delete next[managingTrackFor.id]; return next; });
    } else {
      const { error } = await supabase
        .from('rep_compensation')
        .update({ comp_track: last.previous_track, track_changed_at: now })
        .eq('rep_id', managingTrackFor.id);
      if (error) { setTrackActionError('Failed to revert: ' + error.message); setTrackActionLoading(false); return; }
      await supabase.from('rep_compensation_history').insert({
        rep_id: managingTrackFor.id,
        previous_track: last.new_track,
        new_track: last.previous_track,
        changed_by: currentUserId,
        note: 'Reverted transition recorded ' + formatDate(last.changed_at) + '.',
      });
      setRepCompensation(prev => ({ ...prev, [managingTrackFor.id]: { ...prev[managingTrackFor.id], comp_track: last.previous_track as CompTrack, track_changed_at: now } }));
    }
    setTrackActionLoading(false);
    await openTrackModal(managingTrackFor);
  }

  async function logContractDate(field: 'sent' | 'signed', dateStr: string, file: File | null) {
    if (!managingTrackFor || managingTrackHistory.length === 0 || !dateStr) return;
    setTrackActionLoading(true);
    setTrackActionError('');
    const latest = managingTrackHistory[0];
    const body = new FormData();
    body.set('historyId', latest.id);
    body.set('field', field);
    body.set('date', dateStr);
    if (file) body.set('file', file);
    const res = await adminFetch('/api/admin/contract-upload', { method: 'POST', body });
    const data = await res.json();
    if (!data.success) { setTrackActionError('Failed to log contract: ' + (data.error || 'unknown error')); setTrackActionLoading(false); return; }
    setContractFileDraft(prev => ({ ...prev, [field]: null }));
    setTrackActionLoading(false);
    await openTrackModal(managingTrackFor);
  }

  async function viewContractFile(historyId: string, field: 'sent' | 'signed') {
    setTrackActionError('');
    const res = await adminFetch(`/api/admin/contract-file?historyId=${historyId}&field=${field}`);
    const data = await res.json();
    if (!data.url) { setTrackActionError('Failed to open file: ' + (data.error || 'unknown error')); return; }
    window.open(data.url, '_blank', 'noopener,noreferrer');
  }

  async function resetTeamMemberPassword(email: string) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/reset-password' });
    setSaveSuccess('Password reset sent to ' + email + '.'); setTimeout(() => setSaveSuccess(''), 4000);
  }

  // Current plans at current prices; Northfield's legacy plan via the legacy table; no plan → 0 (lib/client-revenue.ts).
  const getClientMRR = (c: NewClient) => clientMonthlyRevenue(c, { saleSlug: firstSaleSlugByClient[c.id], termStart: businesses.find(b => b.id === c.business_id)?.go_live_date });
  const activeMRR = newClients.filter(c=>c.status==='Active').reduce((s,c)=>s+getClientMRR(c),0);
  // Prospect counts come from prospect_stats() (migrations/035), not loaded rows.
  const prospectsTotal = prospectStats.reduce((s,r)=>s+r.n,0);
  const pipelineValue = prospectStats.filter(r=>ACTIVE_PIPELINE_STATUSES.includes(r.status)).reduce((s,r)=>s+r.n*getTierValue(r.tier),0);
  const repStatusCounts = (repId: string) => statusCounts(prospectStats, repId);
  const repPipelineValue = (repId: string) => prospectStats.filter(r=>r.rep_id===repId&&ACTIVE_PIPELINE_STATUSES.includes(r.status)).reduce((s,r)=>s+r.n*getTierValue(r.tier),0);

  const pendingCancellations = cancellations.filter(c=>c.status==='pending').length;
  // Cancellations page "this month" figures: a confirmed loss counts in the
  // Regina month it takes effect (submission month if no effective date).
  const confirmedChurnMRRThisMonth = cancellations.filter(c=>c.status==='confirmed'&&(c.effective_date||reginaDateStr(new Date(c.created_at))).slice(0,7)===reginaDateStr().slice(0,7)).reduce((s,c)=>s+(c.mrr_lost||0),0);
  // Growth (Clients + Overview). A client's MRR is "new" in the Regina month
  // it went live (business go-live date, else signup date). Net = new MRR
  // minus MRR confirmed lost this month (Cancellations page).
  const thisMonthRegina = reginaDateStr().slice(0,7);
  const newMRRClients = newClients.filter(c=>c.status==='Active'&&(findClientBusiness(c)?.go_live_date||reginaDateStr(new Date(c.created_at))).slice(0,7)===thisMonthRegina);
  const newMRRThisMonth = newMRRClients.reduce((s,c)=>s+getClientMRR(c),0);
  const netMRRThisMonth = newMRRThisMonth - confirmedChurnMRRThisMonth;
  const lifetimeCollected = sumPaymentsByCurrency(clientPayments);
  const growthStats = [
    {label:'Current MRR',value:'$'+activeMRR.toLocaleString(),sub:'CAD / month',color:'#00d4aa'},
    {label:'New MRR This Month',value:'+$'+newMRRThisMonth.toLocaleString(),sub:newMRRClients.length+' client'+(newMRRClients.length===1?'':'s')+' went live',color:'#10b981'},
    {label:'Net MRR Change This Month',value:(netMRRThisMonth<0?'−$':'+$')+Math.abs(netMRRThisMonth).toLocaleString(),sub:'+$'+newMRRThisMonth.toLocaleString()+' new − $'+confirmedChurnMRRThisMonth.toLocaleString()+' lost',color:netMRRThisMonth<0?'#ef4444':'#0f2318'},
    {label:'Lifetime Revenue Collected',value:lifetimeCollected.length?formatMoneyTotal(lifetimeCollected[0]):'$0',sub:lifetimeCollected.length>1?lifetimeCollected.slice(1).map(t=>'+ '+formatMoneyTotal(t)).join(' ')+' (not combined)':lifetimeCollected.length?'recorded payments, all clients incl. past':'no payments recorded yet',color:'#8b5cf6'},
  ];
  const callsTotal = callsCount?.biz===callsBusinessFilter ? callsCount.n : null;
  function openCallInAllCalls(call: Call) {
    setCallsBusinessFilter(call.business_id || '');
    setHighlightedCallId(call.id);
    setExpandedCallId(call.id);
    setTab('calls');
  }
  // Filtering, counting and paging happen in the query (migrations/035,
  // lib/prospect-search.ts). Province/City options are counted under Search +
  // Status + Rep (City also under Province) by prospect_filter_options().
  const todayLocal = localDateStr();
  const prospectFilters: ProspectFilters = { search: debouncedSearch, status: statusFilter, rep: repFilter, province: provinceFilter, city: cityFilter, trade: tradeFilter, due: callbacksMode!=='off' ? todayLocal : undefined, dueMode: callbacksMode==='today'||callbacksMode==='overdue' ? callbacksMode : undefined };
  const prospectFiltersKey = filtersKey(prospectFilters);
  const prospectFilterActive = debouncedSearch.trim()!=='' || statusFilter!=='All' || provinceFilter!=='All' || repFilter!=='All' || cityFilter!=='All' || tradeFilter!=='All' || callbacksMode!=='off';
  const prospectMatchCount = prospectCount?.key===prospectFiltersKey ? prospectCount.n : null;
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchQuery), 250); return () => clearTimeout(t); }, [searchQuery]);
  useEffect(() => {
    if (tab!=='prospects') return;
    if (viewMode==='table') { loadProspectsPage(true); loadFilterOptions(); } else loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, viewMode, prospectFiltersKey, prospectsReload]);
  // Counts on the Callbacks options: what each would list under the other
  // filters. While off on All Reps that's your own, since turning one on narrows to you.
  const callbackCountFilters: ProspectFilters = { ...prospectFilters, rep: callbacksMode==='off' && repFilter==='All' && currentUserId ? currentUserId : repFilter, due: todayLocal, dueMode: undefined };
  const callbackCountKey = filtersKey(callbackCountFilters);
  useEffect(() => {
    if (tab!=='prospects' || viewMode!=='table' || !currentUserId) return;
    const key = callbackCountKey, f = callbackCountFilters;
    const n = (dueMode: DueMode) => prospectsQuery('id', { count: 'exact', head: true }, { ...f, dueMode });
    Promise.all([n('today'), n('overdue')]).then(([t, o]) => {
      if (t.error || o.error) { console.error('Supabase error (callbacks due counts):', t.error || o.error); return; }
      setCallbackCounts({ key, today: t.count ?? 0, overdue: o.count ?? 0 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, viewMode, prospectsReload, currentUserId, callbackCountKey]);
  const callbackCountsNow = callbackCounts?.key===callbackCountKey ? callbackCounts : null;
  useEffect(() => {
    if (tab!=='reps') return;
    fetchAllPages<{ rep_id: string | null; follow_up_date: string | null }>((a, b) => prospectsQuery('rep_id, follow_up_date', undefined, { search: '', status: 'All', rep: 'All', province: 'All', city: 'All', due: todayLocal }).order('id').range(a, b))
      .then(rows => { if (rows) setFollowUpsByOwner(tallyFollowUpsByOwner(rows, todayLocal)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, todayLocal]);
  // From Rep Management: that person's callbacks on Prospects, other filters cleared.
  function openCallbacksFor(ownerId: string, mode: DueMode) {
    lastCheckedIdx.current = null;
    setSearchQuery(''); setDebouncedSearch(''); setStatusFilter('All'); setProvinceFilter('All'); setCityFilter('All'); setTradeFilter('All');
    setRepFilter(ownerId); setCallbacksMode(mode); setViewMode('table'); setProspectView('list'); setTab('prospects');
  }
  // Today / Overdue counts for one person; each opens that list.
  const callbackChips = (ownerId: string) => {
    if (!followUpsByOwner) return <span style={{color:'#9ca3af',fontSize:'11px'}}>Callbacks…</span>;
    const t = followUpsByOwner[ownerId] ?? { today: 0, overdue: 0 };
    return (
      <span style={{display:'inline-flex',gap:'6px'}}>
        {([['today','today',t.today,'#fef3c7','#92400e'],['overdue','overdue',t.overdue,'#fee2e2','#991b1b']] as const).map(([mode,label,n,bg,fg])=>(
          <button key={mode} onClick={e=>{e.stopPropagation();openCallbacksFor(ownerId,mode);}} title={'Open '+label+' callbacks on Prospects'} style={{backgroundColor:n?bg:'#f3f4f6',color:n?fg:'#9ca3af',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700',border:'none',cursor:'pointer',whiteSpace:'nowrap'}}>{n+' '+label}</button>
        ))}
      </span>
    );
  };
  // Picking an option from All Reps narrows to your own (pick another rep or
  // All Reps after); picking the selected one again turns it off.
  function pickCallbacks(mode: 'all' | DueMode) {
    lastCheckedIdx.current = null;
    if (callbacksMode==='off' && repFilter==='All' && currentUserId) setRepFilter(currentUserId);
    setCallbacksMode(callbacksMode===mode ? 'off' : mode);
  }
  // While anything is selected under a filter, fetch the matching ids so the
  // "N of M matching selected" count is exact (skipped above ALLOCATE_MAX_IDS).
  useEffect(() => {
    if (tab!=='prospects' || !prospectFilterActive || selectedProspectIds.size===0 || prospectMatchCount===null || prospectMatchCount>ALLOCATE_MAX_IDS || matchingIds?.key===prospectFiltersKey) return;
    fetchMatchingIds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, prospectFiltersKey, prospectFilterActive, selectedProspectIds.size>0, prospectMatchCount, matchingIds]);
  const provinceOptions = dropdownOptions(filterOptionRows, 'province', provinceFilter);
  const cityOptions = dropdownOptions(filterOptionRows, 'city', cityFilter);
  const tradeOptions = tradeOptionRows.filter(r=>Number(r.n)>0||r.key===tradeFilter).sort((x,y)=>x.key.localeCompare(y.key,undefined,{sensitivity:'base'})||x.key.localeCompare(y.key));
  // Selecting a province drops the city filter when no prospect has that pair.
  async function onProvinceChange(v: string) {
    onProspectFilter(setProvinceFilter)(v);
    if (v==='All' || cityFilter==='All') return;
    const city = cityFilter;
    const { count } = await prospectsQuery('id', { count: 'exact', head: true }, { search: '', status: 'All', rep: 'All', province: v, city });
    if (count===0) setCityFilter(c=>c===city?'All':c);
  }
  const reserveName = repNames[ownerId] || 'Alex Rivera';
  // Reserve first, then every rep/setter plus anyone else who owns a prospect.
  const repFilterOptions = (() => {
    const ids = new Set<string>([...repProfiles, ...setterProfiles].map(r=>r.id));
    prospectStats.forEach(r=>{ if (r.rep_id) ids.add(r.rep_id); });
    ids.delete(ownerId);
    const rest = [...ids].map(id=>({ id, label: getRepLabel(id) })).sort((a,b)=>a.label.localeCompare(b.label));
    return ownerId ? [{ id: ownerId, label: reserveName + ' (reserve)' }, ...rest] : rest;
  })();
  // Shift-click ranges are indices into the loaded rows; a filter change invalidates them.
  const onProspectFilter = <T,>(set: (v: T) => void) => (v: T) => { lastCheckedIdx.current = null; set(v); };
  // Selected ∩ matching: exact once the matching ids are cached (fetched while
  // anything is selected and ≤ ALLOCATE_MAX_IDS match), else the loaded rows.
  const cachedMatchingIds = matchingIds?.key===prospectFiltersKey ? matchingIds.ids : null;
  const selectedMatchingCount = !prospectFilterActive ? selectedProspectIds.size
    : (cachedMatchingIds ?? prospects.map(p=>p.id)).reduce((n,id)=>n+(selectedProspectIds.has(id)?1:0),0);
  const allMatchingSelected = (prospectMatchCount??0)>0 && selectedMatchingCount===prospectMatchCount;
  async function fetchMatchingIds(): Promise<string[] | null> {
    if (cachedMatchingIds) return cachedMatchingIds;
    const key = prospectFiltersKey, f = prospectFilters;
    const rows = await fetchAllPages<{ id: string }>((a, b) => prospectsQuery('id', undefined, f).order('created_at', { ascending: false }).order('id').range(a, b), ALLOCATE_MAX_IDS);
    if (!rows) return null;
    const ids = rows.map(r => r.id);
    setMatchingIds({ key, ids });
    return ids;
  }
  // Allocate wants the selection in table order (newest first).
  async function openAllocate() {
    const ids = [...selectedProspectIds];
    const rows = await fetchAllPages<{ id: string }>((a, b) => supabase.rpc('prospect_ids_in_order', { p_ids: ids }).order('created_at', { ascending: false }).order('id').range(a, b));
    if (!rows) { setSaveError('Could not load the selected prospects. Try again.'); return; }
    setAllocateIds(rows.map(r => r.id)); setShowAllocate(true);
  }
  function toggleProspectSelected(idx: number, shift: boolean) {
    const id = prospects[idx].id;
    const on = !selectedProspectIds.has(id);
    const next = new Set(selectedProspectIds);
    const from = shift && lastCheckedIdx.current!==null ? Math.min(lastCheckedIdx.current, idx) : idx;
    const to = shift && lastCheckedIdx.current!==null ? Math.max(lastCheckedIdx.current, idx) : idx;
    for (let i=from;i<=to;i++) { if (on) next.add(prospects[i].id); else next.delete(prospects[i].id); }
    lastCheckedIdx.current = idx;
    setSelectedProspectIds(next);
  }
  async function setAllMatchingSelected(on: boolean) {
    lastCheckedIdx.current = null;
    if (!on && !prospectFilterActive) { setSelectedProspectIds(new Set()); return; }
    const n = prospectMatchCount ?? 0;
    if (on && n > ALLOCATE_MAX_IDS) { setSaveError(n.toLocaleString()+' prospects match. Select all works up to '+ALLOCATE_MAX_IDS.toLocaleString()+' (the most Allocate takes at once), so narrow the filters first.'); return; }
    const ids = (n <= ALLOCATE_MAX_IDS ? await fetchMatchingIds() : null) ?? (on ? null : prospects.map(p=>p.id));
    if (!ids) { setSaveError('Could not load the matching prospects. Try again.'); return; }
    setSelectedProspectIds(prev => { const next = new Set(prev); ids.forEach(id=>{ if (on) next.add(id); else next.delete(id); }); return next; });
  }
  function finishBulk(message: string) {
    setShowAllocate(false); setShowPullBack(false);
    setSelectedProspectIds(new Set()); lastCheckedIdx.current = null;
    setSaveError(''); setSaveSuccess(message); setTimeout(()=>setSaveSuccess(''), 10000);
    fetchProspects();
  }
  const newLeads = leads.filter(l=>l.status==='new').length;
  // Demo lists read the same setterAppts state the Calendar page uses. Demos run
  // 1 hour (see /api/create-meet), so one stays "upcoming" until it ends.
  const isAdminView = ADMIN_UI_ROLES.includes(currentUserRole);
  const nowMs = Date.now();
  const todayRegina = reginaDateStr();
  const startOf = (a: any) => apptStartMs(a.scheduled_date, a.scheduled_time);
  const isUpcomingDemo = (a: any) => a.status === 'Scheduled' && !!a.scheduled_date && startOf(a) + 3600000 > nowMs;
  const myTodayDemos = setterAppts.filter((a: any) => a.assigned_to === currentUserId && a.scheduled_date === todayRegina && a.status !== 'Cancelled');
  const nextTodayDemo = myTodayDemos.filter((a: any) => a.status === 'Scheduled' && startOf(a) > nowMs).sort((a: any, b: any) => startOf(a) - startOf(b))[0];
  const myUpcomingDemos = setterAppts.filter((a: any) => a.assigned_to === currentUserId && isUpcomingDemo(a)).sort((a: any, b: any) => startOf(a) - startOf(b));
  const unassignedDemos = isAdminView ? setterAppts.filter((a: any) => !a.assigned_to && isUpcomingDemo(a)).sort((a: any, b: any) => startOf(a) - startOf(b)) : [];
  const openDemo = (appt: any) => { setSelectedAppt(appt); setTab('calendar'); };
  const renderDemoRows = (list: any[]) => {
    const groups: [string, any[]][] = [];
    list.forEach((a: any) => { const label = demoDayLabel(a.scheduled_date, todayRegina); const g = groups.find(x => x[0] === label); if (g) g[1].push(a); else groups.push([label, [a]]); });
    return groups.map(([label, items]) => (
      <div key={label}>
        <p style={{color:'#9ca3af',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'14px 0 4px 0'}}>{label}</p>
        {items.map((appt: any) => {
          const bySetter = appt.setter_id && appt.setter_id !== currentUserId;
          return (
            <div key={appt.id} onClick={() => openDemo(appt)} style={{display:'flex',alignItems:'center',gap:'16px',padding:'12px 0',borderBottom:'1px solid #f3f4f6',cursor:'pointer'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:0,width:'72px',flexShrink:0}}>{appt.scheduled_time}</p>
              <div style={{flex:1,minWidth:0}}>
                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}><BlurField>{appt.business_name}</BlurField></p>
                <p style={{color:'#6b7280',fontSize:'12px',margin:0}}><BlurField>{appt.contact_name}</BlurField></p>
              </div>
              {bySetter
                ? <span style={{backgroundColor:'#ede9fe',color:'#5b21b6',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'600'}}><BlurField>{'Booked by ' + (repNames[appt.setter_id] || 'a setter')}</BlurField></span>
                : <span style={{color:'#9ca3af',fontSize:'11px'}}>Booked by me</span>}
              {appt.meet_link && <a href={appt.meet_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{backgroundColor:'#1a73e8',color:'#fff',padding:'7px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',textDecoration:'none',whiteSpace:'nowrap'}}>Join Google Meet</a>}
            </div>
          );
        })}
      </div>
    ));
  };
  const allReps = [...repProfiles, {id: currentUserId, full_name: 'Alex Rivera', email: 'founder@example.com', role: 'owner'}];

  if (loading) return (<div style={{display:'flex',minHeight:'100vh',backgroundColor:'#f0f4f1',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif'}}><p style={{color:'#6b7280'}}>Loading The High Table...</p></div>);

  const inp: React.CSSProperties = {width:'100%',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',boxSizing:'border-box',fontFamily:'Inter, sans-serif'};
  // Prospects table: below prospectTableMin wide it scrolls sideways inside
  // its card instead of squeezing columns into each other.
  const prospectGridCols = (isAdminView?'28px ':'')+'2fr 1fr 1.3fr 1fr 1fr 1.1fr 1.2fr'+(isAdminView?' 40px':'');
  const prospectTableMin = isAdminView ? '860px' : '780px';
  const prospectFilterSel: React.CSSProperties = {padding:'10px 14px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',backgroundColor:'#fff',outline:'none',cursor:'pointer',fontFamily:'Inter, sans-serif',minWidth:'140px'};
  const lbl: React.CSSProperties = {display:'block',color:'#6b7280',fontSize:'12px',fontWeight:'600',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.05em'};
  const sec: React.CSSProperties = {color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'28px 0 20px 0',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid #f3f4f6',paddingBottom:'12px'};

  const navItems = [
    {id:'overview',label:'Overview',badge:0,bc:'teal'},
    {id:'leads',label:'Web Leads',badge:newLeads,bc:'teal'},
    {id:'clients',label:'Clients',badge:0,bc:'teal'},
    {id:'settings-log',label:'Settings Changes Log',badge:settingsChanges.length,bc:'amber'},
    {id:'lead-requests',label:'Lead Requests',badge:leadRequests.pending.length,bc:'amber'},
    {id:'calls',label:'All Calls',badge:0,bc:'teal'},
    {id:'prospects',label:'Prospects',badge:newProspectsCount,bc:'teal'},
    {id:'signups',label:'Signups',badge:newClients.filter(c=>c.status==='Onboarding').length,bc:'amber'},
    {id:'cancellations',label:'Cancellations',badge:pendingCancellations,bc:'red'},
    {id:'problems',label:'Problems',badge:problems.filter(p=>p.status==='Open').length,bc:'red'},
    {id:'reps',label:'Rep Management',badge:0,bc:'teal'},
    {id:'setter-activity',label:'Setter Activity',badge:0,bc:'teal'},
    {id:'rep-activity',label:'Rep Activity',badge:0,bc:'teal'},
    {id:'attribution-audit',label:'Attribution Audit',badge:attributionAudit.length,bc:'red'},
    { id: 'calendar', label: 'Calendar', badge: unassignedDemos.length, bc: 'teal' },
    {id:'job-prospects',label:'Job Prospects',badge:0,bc:'teal'},
    {id:'overflow',label:'Overflow Early Access',badge:0,bc:'teal'},
    {id:'resources',label:'Resources',badge:0,bc:'teal'},
  ];

  return (
    <div style={{display:'flex',minHeight:'100vh',backgroundColor:'#f0f4f1',fontFamily:'Inter, sans-serif'}}>
      <div style={{width:'220px',backgroundColor:'#0f2318',display:'flex',flexDirection:'column',padding:'24px 16px',position:'fixed',height:'100vh',boxShadow:'4px 0 24px rgba(0,0,0,0.15)',zIndex:100,overflowY:'auto'}}>
        <div style={{marginBottom:'32px',padding:'0 8px',display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <h2 style={{color:'#00d4aa',fontSize:'22px',fontWeight:'800',margin:'0 0 3px 0'}}>Setera</h2>
            <p style={{color:'rgba(255,255,255,0.35)',fontSize:'11px',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>High Table</p>
          </div>
          <button onClick={()=>{setShowSettingsChanges(v=>!v);settingsChangesRefreshRef.current?.();}} aria-label={unreadSettingsChanges.length+' unread client settings changes'} title="Client settings changes" style={{position:'relative',background:'transparent',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'8px',width:'34px',height:'34px',cursor:'pointer',color:unreadSettingsChanges.length?'#fff':'rgba(255,255,255,0.45)',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
            🔔
            {unreadSettingsChanges.length>0&&<span style={{position:'absolute',top:'-6px',right:'-6px',backgroundColor:'#ef4444',color:'#fff',fontSize:'10px',fontWeight:'700',minWidth:'18px',height:'18px',borderRadius:'9px',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px',boxSizing:'border-box'}}>{unreadSettingsChanges.length>9?'9+':unreadSettingsChanges.length}</span>}
          </button>
        </div>
        {navItems.map(item=>(
          <div key={item.id} onClick={()=>{setTab(item.id);if(item.id==='prospects'){setProspectView('list');localStorage.setItem('lastViewedProspects',new Date().toISOString());setNewProspectsCount(0);}if(item.id==='signups')setClientView('list');if(item.id==='clients')setClientsManageView('list');if(item.id==='leads')setSelectedLead(null);if(item.id==='job-prospects')setJobProspectView('list');}}
            style={{padding:'10px 12px',borderRadius:'10px',marginBottom:'3px',color:tab===item.id?'#fff':'rgba(255,255,255,0.45)',backgroundColor:tab===item.id?'rgba(0,212,170,0.18)':'transparent',cursor:'pointer',fontSize:'13px',fontWeight:tab===item.id?'600':'400',borderLeft:tab===item.id?'3px solid #00d4aa':'3px solid transparent',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            {item.label}
            {item.badge>0&&<span style={{backgroundColor:item.bc==='red'?'rgba(239,68,68,0.25)':item.bc==='amber'?'rgba(245,158,11,0.25)':'rgba(0,212,170,0.25)',color:item.bc==='red'?'#ef4444':item.bc==='amber'?'#f59e0b':'#00d4aa',fontSize:'10px',fontWeight:'700',padding:'2px 7px',borderRadius:'10px'}}>{item.badge}</span>}
          </div>
        ))}
        <div style={{marginTop:'auto',padding:'14px',borderRadius:'12px',backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
            <div style={{width:'34px',height:'34px',borderRadius:'50%',backgroundColor:'#00d4aa',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:'700',color:'#000',flexShrink:0}}>T</div>
            <div><p style={{color:'#fff',fontSize:'13px',fontWeight:'600',margin:0}}>Alex Rivera</p><p style={{color:'rgba(255,255,255,0.35)',fontSize:'11px',margin:0}}>Founder</p></div>
          </div>
          <div style={{marginBottom:'8px'}}><DemoModeToggle /></div>
          <button onClick={handleSignOut} style={{width:'100%',backgroundColor:'transparent',border:'1px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.5)',padding:'8px',borderRadius:'6px',cursor:'pointer',fontSize:'12px'}}>Sign out</button>
        </div>
      </div>

      {showSettingsChanges&&(
        <>
          <div onClick={()=>setShowSettingsChanges(false)} style={{position:'fixed',inset:0,zIndex:150}}/>
          <div style={{position:'fixed',left:'232px',top:'16px',width:'420px',maxWidth:'calc(100vw - 248px)',maxHeight:'calc(100vh - 32px)',overflowY:'auto' as const,backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',zIndex:160}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid #f3f4f6',position:'sticky' as const,top:0,backgroundColor:'#fff'}}>
              <div>
                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Client Settings Changes</p>
                <p style={{color:'#9ca3af',fontSize:'12px',margin:'2px 0 0 0'}}>{unreadSettingsChanges.length} unread</p>
              </div>
              <div style={{display:'flex',gap:'8px'}}>
                {unreadSettingsChanges.length>0&&<button onClick={()=>markSettingsChangesRead(unreadSettingsChanges.map(c=>c.id))} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'6px 10px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Mark all read</button>}
                <button onClick={()=>setShowSettingsChanges(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 10px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Close</button>
              </div>
            </div>
            <BlurBlock>
            {unreadSettingsChanges.length===0?(
              <p style={{color:'#9ca3af',fontSize:'13px',textAlign:'center' as const,padding:'32px 20px',margin:0}}>No unread client settings changes.</p>
            ):unreadSettingsChanges.map(c=>(
              <div key={c.id} onClick={()=>markSettingsChangesRead([c.id])} style={{padding:'14px 20px',borderBottom:'1px solid #f9fafb',backgroundColor:'#f0fdfa',cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',marginBottom:'8px'}}>
                  <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:0}}><span style={{display:'inline-block',width:'7px',height:'7px',borderRadius:'50%',backgroundColor:'#00d4aa',marginRight:'8px',verticalAlign:'middle'}}/>{c.business_name}</p>
                  <span style={{color:'#9ca3af',fontSize:'11px',whiteSpace:'nowrap' as const}}>{formatChangeTime(c.created_at)}</span>
                </div>
                {renderSettingsChangeFields(c)}
              </div>
            ))}
            </BlurBlock>
            <button onClick={()=>{setShowSettingsChanges(false);setTab('settings-log');}} style={{display:'block',width:'100%',textAlign:'center' as const,backgroundColor:'#f9fafb',border:'none',borderTop:'1px solid #f3f4f6',color:'#0f2318',padding:'12px',fontSize:'13px',fontWeight:'600',cursor:'pointer',borderRadius:'0 0 14px 14px'}}>Open Settings Changes Log{settingsChanges.length?' ('+settingsChanges.length+' to do)':''} →</button>
          </div>
        </>
      )}
      <div style={{marginLeft:'220px',flex:1,minWidth:0,padding:'32px 36px'}}>
        {saveSuccess&&<div style={{backgroundColor:'#d1fae5',border:'1px solid #10b981',borderRadius:'10px',padding:'14px 20px',marginBottom:'24px',color:'#065f46',fontSize:'14px',fontWeight:'600'}}>{'✓ ' + saveSuccess}</div>}
        {saveError&&<div style={{backgroundColor:'#fee2e2',border:'1px solid #ef4444',borderRadius:'10px',padding:'14px 20px',marginBottom:'24px',color:'#991b1b',fontSize:'14px',fontWeight:'600'}}>{'✕ ' + saveError}</div>}

        {/* SETTINGS CHANGES LOG TAB */}
        {tab==='settings-log'&&(
          <div>
            <div style={{marginBottom:'28px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Settings Changes Log</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Every client Settings change you haven&apos;t marked done yet. Mark Done once you&apos;ve updated whatever else it affects — it leaves this list but the record is kept.</p></div>
            {settingsChanges.length===0?(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center' as const,boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>All caught up — no unresolved client settings changes.</p></div>
            ):(
              <div style={{display:'flex',flexDirection:'column' as const,gap:'12px',maxWidth:'860px'}}>
                {settingsChanges.map(c=>(
                  <div key={c.id} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'18px 22px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderLeft:'4px solid '+(c.read_at?'#e5e7eb':'#00d4aa'),display:'flex',gap:'20px',alignItems:'flex-start'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:'10px',marginBottom:'10px',flexWrap:'wrap' as const}}>
                        <p style={{color:'#0a1f13',fontSize:'15px',fontWeight:'700',margin:0}}>{c.business_name}</p>
                        <span style={{color:'#9ca3af',fontSize:'12px'}}>{formatChangeTime(c.created_at)}</span>
                        {!c.read_at&&<span style={{backgroundColor:'#ccfbf1',color:'#0f766e',fontSize:'10px',fontWeight:'700',padding:'2px 8px',borderRadius:'20px',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>New</span>}
                      </div>
                      {renderSettingsChangeFields(c)}
                    </div>
                    <button onClick={()=>markSettingsChangeDone(c)} style={{flexShrink:0,backgroundColor:'#0f2318',color:'#00d4aa',border:'none',padding:'9px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>✓ Mark Done</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEAD REQUESTS TAB */}
        {tab==='lead-requests'&&(
          <div>
            <div style={{marginBottom:'28px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Lead Requests</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Setters asking for a stale lead (no activity in 30+ days). Approve reassigns it to them; Deny closes the request. The setter sees the outcome in their Call Log.</p></div>
            {leadRequests.pending.length===0?(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center' as const,boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'28px'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>No pending lead requests.</p></div>
            ):(
              <div style={{display:'flex',flexDirection:'column' as const,gap:'12px',maxWidth:'860px',marginBottom:'28px'}}>
                {leadRequests.pending.map(r=>(
                  <div key={r.id} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'18px 22px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderLeft:'4px solid #f59e0b',display:'flex',gap:'20px',alignItems:'flex-start'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:'10px',marginBottom:'6px',flexWrap:'wrap' as const}}>
                        <p style={{color:'#0a1f13',fontSize:'15px',fontWeight:'700',margin:0}}>{r.businessName}</p>
                        <span style={{color:'#9ca3af',fontSize:'12px'}}>{[r.trade,r.city].filter(Boolean).join(' · ')}{r.leadStatus?' · '+r.leadStatus:''}</span>
                      </div>
                      <p style={{color:'#374151',fontSize:'13px',margin:'0 0 4px 0'}}><strong>{r.requesterName}</strong> wants this lead · currently owned by <strong>{r.currentOwnerName||'nobody'}</strong></p>
                      <p style={{color:'#6b7280',fontSize:'12px',margin:0}}>Requested {formatChangeTime(r.createdAt)}{r.lastActivity?' · last activity '+formatChangeTime(r.lastActivity):''}</p>
                      {r.note&&<p style={{color:'#374151',fontSize:'13px',margin:'10px 0 0 0',padding:'8px 12px',backgroundColor:'#f9fafb',borderRadius:'8px',whiteSpace:'pre-wrap' as const}}>{r.note}</p>}
                    </div>
                    <div style={{display:'flex',gap:'8px',flexShrink:0}}>
                      <button disabled={leadRequestBusy===r.id} onClick={()=>decideLeadRequest(r.id,'approve')} style={{backgroundColor:'#0f2318',color:'#00d4aa',border:'none',padding:'9px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',opacity:leadRequestBusy===r.id?0.6:1}}>✓ Approve</button>
                      <button disabled={leadRequestBusy===r.id} onClick={()=>decideLeadRequest(r.id,'deny')} style={{backgroundColor:'transparent',color:'#991b1b',border:'1px solid #fca5a5',padding:'9px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',opacity:leadRequestBusy===r.id?0.6:1}}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {leadRequests.decided.length>0&&(
              <div style={{maxWidth:'860px'}}>
                <p style={{color:'#9ca3af',fontSize:'11px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.1em',margin:'0 0 12px 0'}}>Recently decided</p>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                  {leadRequests.decided.map(r=>(
                    <div key={r.id} style={{padding:'12px 22px',borderBottom:'1px solid #f3f4f6',display:'flex',gap:'12px',alignItems:'center',fontSize:'13px'}}>
                      <span style={{backgroundColor:r.status==='approved'?'#d1fae5':'#fee2e2',color:r.status==='approved'?'#065f46':'#991b1b',fontSize:'11px',padding:'2px 10px',borderRadius:'20px',fontWeight:'700',textTransform:'capitalize' as const}}>{r.status}</span>
                      <span style={{color:'#0a1f13',fontWeight:'600'}}>{r.businessName}</span>
                      <span style={{color:'#6b7280',flex:1}}>{r.requesterName}{r.status==='approved'&&r.previousOwnerName?' (from '+r.previousOwnerName+')':''}</span>
                      <span style={{color:'#9ca3af',fontSize:'12px'}}>{r.decidedAt?formatChangeTime(r.decidedAt):''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* OVERVIEW TAB */}
        {tab==='overview'&&(
          <div>
            <div style={{marginBottom:'32px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>The High Table</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Master admin — all clients</p></div>
            {/* auto-fit: one row on normal screens, wraps onto more rows on narrow windows instead of clipping */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',gap:'16px',marginBottom:'16px'}}>
              {growthStats.map(stat=>(
                <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                  <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                  <p style={{color:stat.color,fontSize:'30px',fontWeight:'800',margin:'0 0 2px 0'}}><BlurField>{stat.value}</BlurField></p>
                  <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}><BlurField>{stat.sub}</BlurField></p>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:'16px',marginBottom:'16px'}}>
              {[{label:'Pipeline Value',value:'$'+pipelineValue.toLocaleString(),sub:'CAD · active conversations',color:'#8b5cf6',blur:true},{label:'Active Clients',value:String(newClients.filter(c=>c.status==='Active').length),sub:newClients.filter(c=>c.status==='Onboarding').length+' onboarding',color:'#10b981',blur:true},{label:'Won This Month',value:String(wonThisMonth),sub:(statusCounts(prospectStats)['Closed Won']||0)+' all time',color:'#f59e0b',blur:true},{label:"Today's Meetings",value:String(myTodayDemos.length),sub:myTodayDemos.length===0?'none today':nextTodayDemo?'next: '+nextTodayDemo.scheduled_time:'none left today',color:'#8b5cf6',blur:true}].map(stat=>(
                <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                  <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                  <p style={{color:stat.color,fontSize:'30px',fontWeight:'800',margin:'0 0 2px 0'}}>{stat.blur ? <BlurField>{stat.value}</BlurField> : stat.value}</p>
                  <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{stat.blur ? <BlurField>{stat.sub}</BlurField> : stat.sub}</p>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:'16px',marginBottom:'28px'}}>
              {[{label:'Web Leads',value:String(leads.length),sub:newLeads+' new',color:'#00d4aa',blur:true},{label:'Total Prospects',value:String(prospectsTotal),sub:'',color:'#6b7280',blur:true},{label:'Pending Cancellations',value:String(pendingCancellations),sub:'$'+confirmedChurnMRRThisMonth.toLocaleString()+' confirmed lost this month',color:pendingCancellations>0?'#ef4444':'#9ca3af',blur:true},{label:'Open Problems',value:String(problems.filter(p=>p.status==='Open').length),sub:'',color:problems.filter(p=>p.status==='Open').length>0?'#ef4444':'#9ca3af',blur:true}].map(stat=>(
                <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                  <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                  <p style={{color:stat.color,fontSize:'30px',fontWeight:'800',margin:'0 0 2px 0'}}>{stat.blur ? <BlurField>{stat.value}</BlurField> : stat.value}</p>
                  {stat.sub&&<p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{stat.blur ? <BlurField>{stat.sub}</BlurField> : stat.sub}</p>}
                </div>
              ))}
            </div>
            {repProfiles.length>0&&(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'0 0 20px 0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Rep Performance</p>
                {/* Scrolls sideways inside its card on narrow windows. width:0 + minWidth:100%
                    fills the card without the table's 480px minimum widening the whole page. */}
                <div style={{overflowX:'auto',width:0,minWidth:'100%'}}><div style={{minWidth:'480px'}}>
                <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr',paddingBottom:'10px',marginBottom:'4px',borderBottom:'1px solid #f3f4f6'}}>
                  {['Rep','Clients','Active','Prospects','Won'].map(col=><p key={col} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                </div>
                {repProfiles.map(rep=>{
                  const rc=newClients.filter(c=>c.rep_id===rep.id);
                  const ac=rc.filter(c=>c.status==='Active');
                  const rp=repStatusCounts(rep.id);
                  return (
                    <div key={rep.id} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr',padding:'14px 0',borderBottom:'1px solid #f9fafb',alignItems:'center'}}>
                      <div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 3px 0'}}><BlurField>{rep.full_name||rep.email}</BlurField></p><span style={{backgroundColor:rep.role==='vp_sales'?'#ede9fe':'#f3f4f6',color:rep.role==='vp_sales'?'#5b21b6':'#6b7280',fontSize:'10px',padding:'1px 7px',borderRadius:'10px',fontWeight:'700'}}><BlurField>{rep.role==='vp_sales'?'VP Sales':'Sales Rep'}</BlurField></span></div>
                      <p style={{color:'#374151',fontSize:'14px',fontWeight:'700',margin:0}}><BlurField>{rc.length}</BlurField></p>
                      <p style={{color:'#10b981',fontSize:'14px',fontWeight:'700',margin:0}}><BlurField>{ac.length}</BlurField></p>
                      <p style={{color:'#374151',fontSize:'14px',fontWeight:'700',margin:0}}><BlurField>{sumStatuses(rp)}</BlurField></p>
                      <p style={{color:'#374151',fontSize:'14px',fontWeight:'700',margin:0}}><BlurField>{rp['Closed Won']||0}</BlurField></p>
                    </div>
                  );
                })}
                </div></div>
              </div>
            )}
            {unassignedDemos.length>0&&(
              <div style={{backgroundColor:'#fffbeb',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',borderLeft:'4px solid #f59e0b'}}>
                <p style={{color:'#92400e',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Needs assignment (<BlurField>{unassignedDemos.length}</BlurField>)</p>
                <BlurBlock>{renderDemoRows(unassignedDemos)}</BlurBlock>
              </div>
            )}
            <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',borderLeft:'4px solid #8b5cf6'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>My Upcoming Demos (<BlurField>{myUpcomingDemos.length}</BlurField>)</p>
              <BlurBlock>{myUpcomingDemos.length===0?<p style={{color:'#9ca3af',fontSize:'13px',margin:'14px 0 0 0'}}>No upcoming demos assigned to you.</p>:renderDemoRows(myUpcomingDemos)}</BlurBlock>
            </div>
            <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
              <div style={{padding:'20px 24px',borderBottom:'1px solid #f3f4f6'}}><h2 style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:'0 0 2px 0'}}>Recent Opportunities</h2><p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>Opportunity calls across all clients — click one to open it in All Calls</p></div>
              {/* Real client data (business, caller, summary) — fully blurred in Demo Mode. */}
              <BlurBlock>
              {recentOpportunities.length===0?<div style={{padding:'48px',textAlign:'center'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>No recent opportunities.</p></div>:recentOpportunities.map(call=>{
                const color=getStatusColor(call.status);
                const biz=businesses.find(b=>b.id===call.business_id);
                return (
                  <div key={call.id} onClick={()=>openCallInAllCalls(call)} style={{padding:'14px 24px 14px 20px',borderBottom:'1px solid #f9fafb',borderLeft:'4px solid '+color,backgroundColor:call.status==='red'?'#fef2f2':'transparent',display:'flex',alignItems:'center',gap:'16px',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor=call.status==='red'?'#fee2e2':'#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor=call.status==='red'?'#fef2f2':'transparent')}>
                    {/* width:0 keeps the one-line (nowrap) summary chip out of the
                        page's min-content width — without it, a long summary widened
                        the whole main column and pushed Overview's stat cards off-screen. */}
                    <div style={{flex:1,minWidth:0,width:0}}>
                      <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'0 0 6px 0'}}>{biz?.name||'Unknown business'}<span style={{color:'#6b7280',fontWeight:'500'}}>{' · '+(call.caller_name||'Unknown caller')}</span></p>
                      {call.reason&&<span title={call.reason} style={{display:'inline-block',maxWidth:'100%',backgroundColor:'#f0f4f1',color:'#0a1f13',fontSize:'12px',fontWeight:'500',borderRadius:'8px',padding:'5px 12px',whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis',boxSizing:'border-box' as const}}>{call.reason}</span>}
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <span style={{backgroundColor:color+'18',color,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700'}}>{getStatusLabel(call.status)}</span>
                      <p style={{color:'#374151',fontSize:'11px',fontWeight:'600',margin:'6px 0 0'}}>{new Date(call.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</p>
                      <p style={{color:'#9ca3af',fontSize:'10px',margin:'1px 0 0'}}>{timeAgo(call.created_at)}</p>
                    </div>
                  </div>
                );
              })}
              </BlurBlock>
            </div>
          </div>
        )}
        {tab==='leads'&&(
          <div>
            {!selectedLead?(
              <div>
                <div style={{marginBottom:'32px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Web Leads</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Visitors who talked to Emily on the website</p></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:'16px',marginBottom:'28px'}}>
                  {[{label:'Total',value:leads.length,color:'#0f2318'},{label:'New',value:leads.filter(l=>l.status==='new').length,color:'#3b82f6'},{label:'Contacted',value:leads.filter(l=>l.status==='contacted').length,color:'#f59e0b'},{label:'Qualified',value:leads.filter(l=>l.status==='qualified').length,color:'#8b5cf6'},{label:'Converted',value:leads.filter(l=>l.status==='converted').length,color:'#10b981'}].map(stat=>(
                    <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                      <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                      <p style={{color:stat.color,fontSize:'30px',fontWeight:'800',margin:0}}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                {leads.length===0?(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'16px',fontWeight:'700',margin:'0 0 8px 0'}}>No web leads yet</p>
                    <p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>When visitors talk to Emily on heysetera.com their info will appear here.</p>
                  </div>
                ):(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr 1fr 1fr 80px',padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                      {['Name','Phone','Email','Business','Status','Assigned','Date'].map(col=><p key={col} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                    </div>
                    {leads.map(lead=>{
                      const st=getLeadStatusStyle(lead.status);
                      return (
                        <div key={lead.id} onClick={()=>openLeadDetail(lead)} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1.5fr 1fr 1fr 1fr 80px',padding:'16px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                          <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}>{lead.name||'Unknown'}</p>
                          <p style={{color:'#374151',fontSize:'13px',margin:0}}>{lead.phone||'—'}</p>
                          <p style={{color:'#374151',fontSize:'12px',margin:0,wordBreak:'break-word'}}>{lead.email||'—'}</p>
                          <p style={{color:'#374151',fontSize:'12px',margin:0}}>{lead.business_type||'—'}</p>
                          <span style={{backgroundColor:st.bg,color:st.color,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700',display:'inline-block'}}>{st.label}</span>
                          <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{lead.assigned_to?getRepLabel(lead.assigned_to):'Unassigned'}</span>
                          <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{timeAgo(lead.created_at)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ):(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'28px'}}>
                  <button onClick={()=>setSelectedLead(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div style={{flex:1}}>
                    <h1 style={{color:'#0a1f13',fontSize:'26px',fontWeight:'800',margin:'0 0 2px 0'}}>{selectedLead.name||'Unknown Visitor'}</h1>
                    <p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{selectedLead.business_type||'Business type unknown'} · {formatTime(selectedLead.created_at)}</p>
                  </div>
                  <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                    <select value={selectedLead.status} onChange={e=>updateLeadStatus(selectedLead.id,e.target.value)} style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',backgroundColor:'#fff',fontWeight:'600',cursor:'pointer',outline:'none',fontFamily:'Inter, sans-serif'}}>
                      {LEAD_STATUS_OPTIONS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                    </select>
                    <select value={selectedLead.assigned_to||''} onChange={e=>assignLead(selectedLead.id,e.target.value||null)} style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',backgroundColor:'#fff',fontWeight:'600',cursor:'pointer',outline:'none',fontFamily:'Inter, sans-serif'}}>
                      <option value="">Unassigned</option>
                      {allReps.map(r=><option key={r.id} value={r.id}>{r.full_name||r.email}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'24px'}}>
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>Contact Info</p>
                    {([['Name',selectedLead.name],['Phone',selectedLead.phone],['Email',selectedLead.email],['Business Type',selectedLead.business_type],['Conversation ID',selectedLead.conversation_id]] as [string,string|null][]).filter(([,v])=>v).map(([label,value])=>(
                      <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f9fafb'}}>
                        <span style={{color:'#9ca3af',fontSize:'12px'}}>{label}</span>
                        <span style={{color:'#374151',fontSize:'13px',fontWeight:'500',textAlign:'right',maxWidth:'60%',wordBreak:'break-word'}}>{value}</span>
                      </div>
                    ))}
                    {selectedLead.reason&&(
                      <div style={{marginTop:'16px',padding:'12px',backgroundColor:'#f9fafb',borderRadius:'8px'}}>
                        <p style={{color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 6px 0'}}>Summary</p>
                        <p style={{color:'#374151',fontSize:'13px',margin:0,lineHeight:'1.6'}}>{selectedLead.reason}</p>
                      </div>
                    )}
                  </div>
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>Admin Notes</p>
                    <textarea placeholder="Notes about this lead..." value={leadNotesDraft} onChange={e=>setLeadNotesDraft(e.target.value)} style={{width:'100%',minHeight:'120px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',outline:'none',resize:'vertical',boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif',marginBottom:'12px'}}/>
                    <button onClick={()=>saveLeadNotes(selectedLead.id)} style={{backgroundColor:'#0f2318',color:'#fff',padding:'9px 20px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none'}}>Save Notes</button>
                  </div>
                </div>
                {selectedLead.transcript&&selectedLead.transcript.length>0&&(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 20px 0',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>Full Transcript</p>
                    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                      {selectedLead.transcript.map((turn,i)=>(
                        <div key={i} style={{display:'flex',gap:'12px',flexDirection:turn.role==='agent'?'row':'row-reverse'}}>
                          <div style={{width:'28px',height:'28px',borderRadius:'50%',backgroundColor:turn.role==='agent'?'#0f2318':'#e5e7eb',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:'700',color:turn.role==='agent'?'#00d4aa':'#374151',flexShrink:0}}>{turn.role==='agent'?'E':'V'}</div>
                          <div style={{maxWidth:'75%',padding:'10px 14px',borderRadius:'12px',backgroundColor:turn.role==='agent'?'#f0fdf4':'#f9fafb',border:'1px solid '+(turn.role==='agent'?'#bbf7d0':'#e5e7eb')}}>
                            <p style={{color:turn.role==='agent'?'#065f46':'#374151',fontSize:'13px',margin:0,lineHeight:'1.5'}}>{turn.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CLIENTS TAB */}
        {tab==='clients'&&(
          <>
            {clientsManageView==='list'&&(
              <div>
                <div style={{marginBottom:'32px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Clients</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>All signed clients — onboarding, active, and past</p></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',gap:'16px',marginBottom:'16px'}}>
                  {growthStats.map(stat=>(
                    <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                      <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                      <p style={{color:stat.color,fontSize:'30px',fontWeight:'800',margin:0}}>{stat.value}</p>
                      <p style={{color:'#9ca3af',fontSize:'12px',margin:'4px 0 0 0'}}>{stat.sub}</p>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:'16px',marginBottom:'28px'}}>
                  {[{label:'Total Clients (All-Time)',value:newClients.length,sub:newClients.filter(isPastClient).length>0?'incl. '+newClients.filter(isPastClient).length+' past':'',color:'#0f2318'},{label:'Active',value:newClients.filter(c=>c.status==='Active').length,sub:'',color:'#10b981'},{label:'Onboarding',value:newClients.filter(c=>c.status==='Onboarding').length,sub:'',color:'#f59e0b'}].map(stat=>(
                    <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                      <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                      <p style={{color:stat.color,fontSize:'30px',fontWeight:'800',margin:0}}>{stat.value}</p>
                      {stat.sub&&<p style={{color:'#9ca3af',fontSize:'12px',margin:'4px 0 0 0'}}>{stat.sub}</p>}
                    </div>
                  ))}
                </div>
                {newClients.filter(c=>c.status==='Onboarding').length>0&&(
                  <div style={{marginBottom:'24px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}><span style={{backgroundColor:'#fef3c7',color:'#92400e',fontSize:'11px',fontWeight:'700',padding:'3px 12px',borderRadius:'20px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Onboarding</span><span style={{color:'#9ca3af',fontSize:'12px'}}>Not yet live</span></div>
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px',padding:'12px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#fefce8'}}>
                        {['Business','Plan','Rep','Contract','Payment','Days'].map(col=><p key={col} style={{color:'#92400e',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                      </div>
                      {newClients.filter(c=>c.status==='Onboarding').map(client=>{
                        const progress=getChecklistProgress(client.go_live_checklist);
                        return (
                          <div key={client.id} onClick={()=>openManagedClientDetail(client)} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px',padding:'14px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                            <div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 4px 0'}}>{client.business_name}{isClientLocked(client)&&<span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'10px',fontWeight:'700',padding:'1px 8px',borderRadius:'20px',marginLeft:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em',verticalAlign:'middle'}}>Locked</span>}</p><div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{flex:1,maxWidth:'80px',backgroundColor:'#f3f4f6',borderRadius:'99px',height:'4px'}}><div style={{backgroundColor:progress===100?'#10b981':'#f59e0b',height:'100%',width:progress+'%',borderRadius:'99px'}}/></div><span style={{color:'#9ca3af',fontSize:'11px'}}>{progress+'%'}</span></div></div>
                            <p style={{color:'#374151',fontSize:'12px',margin:0}}>{getClientPlanDisplay(client)}</p>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getRepLabel(client.rep_id)}</span>
                            <span style={{color:client.contract_signed?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.contract_signed?'Yes':'No'}</span>
                            <span style={{color:client.payment_collected?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.payment_collected?'Yes':'No'}</span>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{clientDays(client)+'d'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {newClients.filter(c=>c.status==='Active').length>0&&(
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}><span style={{backgroundColor:'#d1fae5',color:'#065f46',fontSize:'11px',fontWeight:'700',padding:'3px 12px',borderRadius:'20px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Active</span><span style={{color:'#9ca3af',fontSize:'12px'}}>Live on the platform</span></div>
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px 1.2fr',padding:'12px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f0fdf4'}}>
                        {['Business','Plan','Rep','Contract','Payment','Days','Total Paid'].map(col=><p key={col} style={{color:'#065f46',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                      </div>
                      {newClients.filter(c=>c.status==='Active').map(client=>{
                        const linkedBiz=client.business_id?businesses.find(b=>b.id===client.business_id):businesses.find(b=>b.name.toLowerCase().trim()===client.business_name.toLowerCase().trim());
                        const callCount=linkedBiz?(activeClientCallCounts[linkedBiz.id]??0):0;
                        return (
                          <div key={client.id} onClick={()=>openManagedClientDetail(client)} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px 1.2fr',padding:'14px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                            <div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}>{client.business_name}{isClientLocked(client)&&<span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'10px',fontWeight:'700',padding:'1px 8px',borderRadius:'20px',marginLeft:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em',verticalAlign:'middle'}}>Locked</span>}</p>{callCount>0&&<p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{callCount+' calls captured'}</p>}</div>
                            <p style={{color:'#374151',fontSize:'12px',margin:0}}>{getClientPlanDisplay(client)}</p>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getRepLabel(client.rep_id)}</span>
                            <span style={{color:client.contract_signed?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.contract_signed?'Yes':'No'}</span>
                            <span style={{color:client.payment_collected?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.payment_collected?'Yes':'No'}</span>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{clientDays(client)+'d'}</span>
                            <span style={{color:'#374151',fontSize:'12px'}}>{getClientPaidLabel(client)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {newClients.filter(c=>c.status==='Paused').length>0&&(
                  <div style={{marginTop:'24px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}><span style={{backgroundColor:'#f3f4f6',color:'#6b7280',fontSize:'11px',fontWeight:'700',padding:'3px 12px',borderRadius:'20px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Paused</span><span style={{color:'#9ca3af',fontSize:'12px'}}>Not currently active</span></div>
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px',padding:'12px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                        {['Business','Plan','Rep','Contract','Payment','Days'].map(col=><p key={col} style={{color:'#6b7280',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                      </div>
                      {newClients.filter(c=>c.status==='Paused').map(client=>(
                        <div key={client.id} onClick={()=>openManagedClientDetail(client)} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px',padding:'14px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer',opacity:0.75}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                          <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}>{client.business_name}{isClientLocked(client)&&<span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'10px',fontWeight:'700',padding:'1px 8px',borderRadius:'20px',marginLeft:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em',verticalAlign:'middle'}}>Locked</span>}</p>
                          <p style={{color:'#374151',fontSize:'12px',margin:0}}>{getClientPlanDisplay(client)}</p>
                          <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getRepLabel(client.rep_id)}</span>
                          <span style={{color:client.contract_signed?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.contract_signed?'Yes':'No'}</span>
                          <span style={{color:client.payment_collected?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.payment_collected?'Yes':'No'}</span>
                          <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{clientDays(client)+'d'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {newClients.filter(isPastClient).length>0&&(
                  <div style={{marginTop:'24px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}><span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'11px',fontWeight:'700',padding:'3px 12px',borderRadius:'20px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Past Clients</span><span style={{color:'#9ca3af',fontSize:'12px'}}>Cancelled or ended — kept as records, not counted as live or in MRR</span></div>
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 80px 1.2fr 80px 2fr',padding:'12px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#fef2f2'}}>
                        {['Business','Plan','Rep','Ended','Days','Total Paid','Calls','Reason'].map(col=><p key={col} style={{color:'#991b1b',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                      </div>
                      {newClients.filter(isPastClient).map(client=>{
                        const past=getPastClientInfo(client);
                        return (
                          <div key={client.id} onClick={()=>openManagedClientDetail(client)} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 80px 1.2fr 80px 2fr',padding:'14px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                            <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}>{client.business_name}{isClientLocked(client)&&<span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'10px',fontWeight:'700',padding:'1px 8px',borderRadius:'20px',marginLeft:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em',verticalAlign:'middle'}}>Locked</span>}</p>
                            <p style={{color:'#374151',fontSize:'12px',margin:0}}>{getClientPlanDisplay(client)}</p>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getRepLabel(client.rep_id)}</span>
                            <span style={{color:'#374151',fontSize:'12px'}}>{past.endDate?formatDate(past.endDate):'—'}</span>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block',justifySelf:'start'}}>{past.daysActive!==null?past.daysActive+'d':'—'}</span>
                            <span style={{color:'#374151',fontSize:'12px'}}>{getClientPaidLabel(client)}</span>
                            <span style={{color:'#374151',fontSize:'12px'}}>{past.callCount!==undefined?past.callCount.toLocaleString():'…'}</span>
                            <p style={{color:'#6b7280',fontSize:'12px',margin:0,lineHeight:'1.4'}}>{past.reason||'—'}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {newClients.length===0&&<div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>No clients yet.</p></div>}
              </div>
            )}
            {clientsManageView==='detail'&&selectedManagedClient&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'28px'}}>
                  <button onClick={()=>{setClientsManageView('list');setSelectedManagedClient(null);setManagedClientBusiness(null);setManagedClientCalls([]);setManagedClientTouchpoints([]);setEditingManagedClient(false);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div style={{flex:1}}><h1 style={{color:'#0a1f13',fontSize:'26px',fontWeight:'800',margin:'0 0 2px 0'}}>{selectedManagedClient.business_name}</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{selectedManagedClient.owner_name} · {selectedManagedClient.city}, {selectedManagedClient.province}</p></div>
                  <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                    <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'12px',padding:'5px 12px',borderRadius:'20px',fontWeight:'700'}}>{isPastClient(selectedManagedClient)?(()=>{const past=getPastClientInfo(selectedManagedClient);return (past.daysActive!==null?past.daysActive+'d active':'Past client')+(past.endDate?' · ended '+formatDate(past.endDate):'');})():clientDays(selectedManagedClient)+'d as client'}</span>
                    {managedClientBusiness?.status==='locked'?(
                      <span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'12px',padding:'5px 12px',borderRadius:'20px',fontWeight:'700'}}>🔒 Locked</span>
                    ):(
                      <span style={{backgroundColor:selectedManagedClient.status==='Active'?'#d1fae5':isPastClient(selectedManagedClient)?'#fee2e2':'#fef3c7',color:selectedManagedClient.status==='Active'?'#065f46':isPastClient(selectedManagedClient)?'#991b1b':'#92400e',fontSize:'12px',padding:'5px 12px',borderRadius:'20px',fontWeight:'700'}}>{selectedManagedClient.status}</span>
                    )}
                    <span style={{backgroundColor:'#e0f2fe',color:'#0c4a6e',fontSize:'12px',padding:'5px 12px',borderRadius:'20px',fontWeight:'700'}}>{getClientPlanDisplay(selectedManagedClient)}</span>
                    <button onClick={openManagedClientEdit} style={{padding:'6px 14px',borderRadius:'20px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#0f2318',color:'#00d4aa'}}>
                      ✎ Edit
                    </button>
                    {managedClientBusiness&&(managedClientBusiness.status==='locked'?(
                      <button onClick={()=>{setLockError('');setLockDialog('unlock');}} style={{padding:'6px 14px',borderRadius:'20px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'1px solid #10b981',backgroundColor:'#fff',color:'#065f46'}}>Unlock Account</button>
                    ):(
                      <button onClick={()=>{setLockError('');setLockForm({confirmName:'',reason:'',notes:''});setLockDialog('lock');}} style={{padding:'6px 14px',borderRadius:'20px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'1px solid #ef4444',backgroundColor:'#fff',color:'#b91c1c'}}>Lock Account</button>
                    ))}
                  </div>
                </div>
                {managedClientBusiness?.status==='locked'&&(
                  <div style={{backgroundColor:'#fef2f2',border:'1px solid #ef4444',borderRadius:'12px',padding:'16px 20px',marginBottom:'24px'}}>
                    <p style={{color:'#991b1b',fontSize:'14px',fontWeight:'700',margin:'0 0 4px 0'}}>🔒 Account locked{managedClientBusiness.locked_at?' — '+new Date(managedClientBusiness.locked_at).toLocaleString():''}</p>
                    <p style={{color:'#7f1d1d',fontSize:'13px',margin:0}}>Reason: {LOCK_REASON_OPTIONS.find(r=>r.value===managedClientBusiness.lock_reason)?.label||managedClientBusiness.lock_reason||'—'}. Client portal is blocked and Emily is unassigned from their number in ElevenLabs. All data below is intact. {isPastClient(selectedManagedClient)?'SignalWire number released.':'The SignalWire number was not touched.'}</p>
                    {managedClientBusiness.lock_notes&&<p style={{color:'#7f1d1d',fontSize:'13px',margin:'8px 0 0 0',whiteSpace:'pre-wrap' as const}}>{managedClientBusiness.lock_notes}</p>}
                  </div>
                )}
                {lockDialog&&managedClientBusiness&&(
                  <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'480px',maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid '+(lockDialog==='lock'?'#ef4444':'#10b981')}}>
                      <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0'}}>{lockDialog==='lock'?'Lock Account':'Unlock Account'}</p>
                      {lockDialog==='lock'?(
                        <>
                          <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 16px 0'}}>This takes effect <strong>immediately</strong>: {managedClientBusiness.name} is logged out of their portal and Emily stops answering their number. No calls, appointments, or pipeline data is changed, and the SignalWire number is left alone.</p>
                          <label style={lbl}>Reason</label>
                          <select style={{...inp,backgroundColor:'#fff',marginBottom:'14px'}} value={lockForm.reason} onChange={e=>setLockForm({...lockForm,reason:e.target.value})}>
                            <option value="">— Select a reason —</option>
                            {LOCK_REASON_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <label style={lbl}>Notes</label>
                          <textarea style={{...inp,minHeight:'80px',resize:'vertical' as const,marginBottom:'14px'}} value={lockForm.notes} onChange={e=>setLockForm({...lockForm,notes:e.target.value})} placeholder="e.g. Confirmed non-renewal via text/email Sep 20, extended courtesy week"/>
                          <label style={lbl}>Type <span style={{textTransform:'none' as const,color:'#0a1f13'}}>{managedClientBusiness.name}</span> to confirm</label>
                          <input style={{...inp,marginBottom:'16px'}} value={lockForm.confirmName} onChange={e=>setLockForm({...lockForm,confirmName:e.target.value})} autoComplete="off"/>
                        </>
                      ):(
                        <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 16px 0'}}>Reactivate {managedClientBusiness.name}? Their portal login works again and Emily is reassigned to their number right away. Make sure their call forwarding is back in place.</p>
                      )}
                      {lockError&&<p style={{color:'#b91c1c',fontSize:'13px',margin:'0 0 12px 0'}}>{lockError}</p>}
                      <div style={{display:'flex',gap:'10px'}}>
                        {(()=>{const ready=lockDialog==='unlock'||(!!lockForm.reason&&lockForm.confirmName.trim()===managedClientBusiness.name.trim());return(
                          <button onClick={submitLockDialog} disabled={!ready||lockBusy} style={{backgroundColor:lockDialog==='lock'?'#ef4444':'#10b981',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:ready&&!lockBusy?'pointer':'not-allowed',border:'none',opacity:ready&&!lockBusy?1:0.5}}>{lockBusy?'Working...':lockDialog==='lock'?'Lock Account':'Unlock Account'}</button>
                        );})()}
                        <button onClick={()=>setLockDialog(null)} disabled={lockBusy} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
                {editingManagedClient&&(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'32px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',maxWidth:'800px',marginBottom:'24px'}}>
                    <p style={sec}>Client Info</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'4px'}}>
                      <div><label style={lbl}>Owner Name</label><input style={inp} value={managedClientEditForm.owner_name} onChange={e=>setManagedClientEditForm({...managedClientEditForm,owner_name:e.target.value})}/></div>
                      <div><label style={lbl}>Phone</label><input style={inp} value={managedClientEditForm.phone} onChange={e=>setManagedClientEditForm({...managedClientEditForm,phone:e.target.value})}/></div>
                      <div><label style={lbl}>Email</label><input style={inp} value={managedClientEditForm.email} onChange={e=>setManagedClientEditForm({...managedClientEditForm,email:e.target.value})}/></div>
                      <div><label style={lbl}>City</label><input style={inp} value={managedClientEditForm.city} onChange={e=>setManagedClientEditForm({...managedClientEditForm,city:e.target.value})}/></div>
                      <div><label style={lbl}>Province</label><select style={{...inp,backgroundColor:'#fff'}} value={managedClientEditForm.province} onChange={e=>setManagedClientEditForm({...managedClientEditForm,province:e.target.value})}><option value="">Not set</option>{['SK','AB','BC','MB','ON','QC','NS','NB','NL','PE','YT','NT','NU'].map(p=><option key={p}>{p}</option>)}</select></div>
                      <div><label style={lbl}>Plan</label>{selectedManagedClient&&isLegacyPlan(selectedManagedClient.plan)?<input style={{...inp,backgroundColor:'#f9fafb',color:'#6b7280'}} value={selectedManagedClient.plan+' (legacy plan, kept as is)'} readOnly title="Legacy plan: shown read-only; saving this form never changes it."/>:<select style={{...inp,backgroundColor:'#fff'}} value={managedClientEditForm.plan} onChange={e=>setManagedClientEditForm({...managedClientEditForm,plan:e.target.value})}>{!managedClientEditForm.plan&&<option value="">— not set —</option>}{CURRENT_PLAN_NAMES.map(n=><option key={n}>{n}</option>)}</select>}</div>
                    </div>
                    {managedClientBusiness&&(
                      <>
                        <p style={sec}>Emily Settings</p>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'4px'}}>
                          <div><label style={lbl}>Primary SMS Contact</label><input style={inp} value={managedClientEditForm.sms_contact_1} onChange={e=>setManagedClientEditForm({...managedClientEditForm,sms_contact_1:e.target.value})}/></div>
                          <div><label style={lbl}>Backup SMS Contact</label><input style={inp} value={managedClientEditForm.sms_contact_2} onChange={e=>setManagedClientEditForm({...managedClientEditForm,sms_contact_2:e.target.value})}/></div>
                          <div><label style={lbl}>Call Forwarding Number</label><input style={inp} value={managedClientEditForm.call_forwarding_number} onChange={e=>setManagedClientEditForm({...managedClientEditForm,call_forwarding_number:e.target.value})}/></div>
                          <div><label style={lbl}>Average Job Value</label><input style={inp} type="number" value={managedClientEditForm.avg_job_value} onChange={e=>setManagedClientEditForm({...managedClientEditForm,avg_job_value:e.target.value})}/></div>
                          <div style={{gridColumn:'1 / -1'}}><label style={lbl}>Business Hours</label><input style={inp} value={managedClientEditForm.business_hours} onChange={e=>setManagedClientEditForm({...managedClientEditForm,business_hours:e.target.value})}/></div>
                          <div style={{gridColumn:'1 / -1'}}><label style={lbl}>Services</label><textarea style={{...inp,minHeight:'80px',resize:'vertical' as const}} value={managedClientEditForm.services} onChange={e=>setManagedClientEditForm({...managedClientEditForm,services:e.target.value})}/></div>
                          <div style={{gridColumn:'1 / -1'}}><label style={lbl}>Urgent Triggers</label><textarea style={{...inp,minHeight:'80px',resize:'vertical' as const}} value={managedClientEditForm.urgent_triggers} onChange={e=>setManagedClientEditForm({...managedClientEditForm,urgent_triggers:e.target.value})}/></div>
                        </div>
                      </>
                    )}
                    <div style={{display:'flex',gap:'12px',marginTop:'16px'}}>
                      <button onClick={saveManagedClientEdit} disabled={actionLoading} style={{backgroundColor:clientSaveFlash==='success'?'#10b981':clientSaveFlash==='error'?'#ef4444':'#0f2318',color:clientSaveFlash?'#fff':'#00d4aa',padding:'13px 36px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1,transition:'background-color 0.2s'}}>{actionLoading?'Saving...':clientSaveFlash==='success'?'✓ Saved':clientSaveFlash==='error'?'✕ Failed — see error above':'Save Changes'}</button>
                      <button onClick={()=>setEditingManagedClient(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'13px 24px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
                {managedClientLoading ? (
                  <div style={{textAlign:'center' as const,padding:'60px',color:'#9ca3af'}}>Loading client data...</div>
                ) : (
                  <>
                    {!managedClientBusiness && (
                      <div style={{backgroundColor:'#fef3c7',border:'1px solid #f59e0b',borderRadius:'12px',padding:'16px 20px',marginBottom:'16px'}}>
                        <p style={{color:'#92400e',fontSize:'14px',margin:0,fontWeight:'500'}}>This client is not yet linked to an Emily account. Once Alex sets up their business profile the data will appear here.</p>
                      </div>
                    )}
                    <div style={{backgroundColor:'#fff',borderRadius:'12px',padding:'16px 20px',marginBottom:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:'14px'}}>
                      <label style={{color:'#6b7280',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',flexShrink:0}}>Linked Business</label>
                      <select value={selectedManagedClient.business_id||''} onChange={e=>linkClientToBusiness(e.target.value)} style={{...inp,backgroundColor:'#fff',maxWidth:'320px'}}>
                        <option value="">— Not linked —</option>
                        {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    {managedClientBusiness?.go_live_date && managedClientBusiness?.term && (()=>{
                      const termDays = getTermDays(managedClientBusiness.term);
                      const goLive = new Date(managedClientBusiness.go_live_date);
                      const endDate = new Date(goLive.getTime() + termDays * 86400000);
                      const daysLeft = Math.max(0, Math.floor((endDate.getTime() - Date.now()) / 86400000));
                      const daysUsed = Math.max(0, Math.floor((Date.now() - goLive.getTime()) / 86400000));
                      const pct = Math.min(100, Math.round((daysUsed / termDays) * 100));
                      const isNear = daysLeft <= 14;
                      return (
                        <div style={{backgroundColor:'#fff',borderRadius:'12px',padding:'18px 24px',marginBottom:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                            <div><span style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700'}}>{'Day '+daysUsed+' of '+termDays}</span><span style={{color:'#9ca3af',fontSize:'12px',marginLeft:'8px'}}>{managedClientBusiness.term+' term'}</span></div>
                            <span style={{color:isNear?'#ef4444':'#6b7280',fontSize:'12px',fontWeight:'700',backgroundColor:isNear?'#fee2e2':'#f3f4f6',padding:'3px 10px',borderRadius:'20px'}}>{daysLeft===0?'Term complete':daysLeft+' days remaining'}</span>
                          </div>
                          <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'8px',overflow:'hidden'}}><div style={{backgroundColor:isNear?'#ef4444':'#00d4aa',height:'100%',width:pct+'%',borderRadius:'99px'}}/></div>
                          {isNear&&daysLeft>0&&<p style={{color:'#ef4444',fontSize:'12px',fontWeight:'600',margin:'8px 0 0 0'}}>⚠️ Renewal due soon — start the conversation.</p>}
                          {daysLeft===0&&<p style={{color:'#ef4444',fontSize:'12px',fontWeight:'600',margin:'8px 0 0 0'}}>Term complete — renewal action required.</p>}
                        </div>
                      );
                    })()}
                    {managedClientBusiness?.minutes_limit && (()=>{
                      const now = new Date();
                      const goLiveDate = managedClientBusiness.go_live_date;
                      const callsThisMonth = goLiveDate ? managedClientCalls.filter(c=>{const d=new Date(c.created_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()&&d>=new Date(goLiveDate);}).length : 0;
                      const estMins = callsThisMonth * 3;
                      const pct = Math.min(100, Math.round((estMins / (managedClientBusiness.minutes_limit||1)) * 100));
                      const uColor = getUsageColor(pct);
                      return (
                        <div style={{backgroundColor:'#fff',borderRadius:'12px',padding:'18px 24px',marginBottom:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderLeft:'4px solid '+uColor}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                            <div><span style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700'}}>Usage This Month</span><span style={{color:'#9ca3af',fontSize:'12px',marginLeft:'8px'}}>~{estMins} of {managedClientBusiness.minutes_limit} min estimated</span></div>
                            <span style={{color:uColor,fontSize:'12px',fontWeight:'700',backgroundColor:uColor+'18',padding:'3px 10px',borderRadius:'20px'}}>{getUsageBadge(pct)}</span>
                          </div>
                          <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'8px',overflow:'hidden'}}><div style={{backgroundColor:uColor,height:'100%',width:pct+'%',borderRadius:'99px'}}/></div>
                          <p style={{color:'#9ca3af',fontSize:'11px',margin:'6px 0 0 0'}}>{callsThisMonth} calls × ~3 min avg = {estMins} min · Tier limit: {managedClientBusiness.minutes_limit} min/mo</p>
                        </div>
                      );
                    })()}
                    {managedClientBusiness && (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'24px'}}>
                        {[{label:'Total Calls',value:managedClientCalls.length,color:'#00d4aa'},{label:'Urgent',value:managedClientCalls.filter(c=>c.status==='red'||c.status==='Urgent').length,color:'#ef4444'},{label:'Follow Up',value:managedClientCalls.filter(c=>c.status==='yellow'||c.status==='Follow Up').length,color:'#f59e0b'},{label:'After Hours',value:managedClientCalls.filter(c=>{const h=new Date(c.created_at).getHours();return h<8||h>=18;}).length,color:'#8b5cf6'}].map(stat=>(
                          <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                            <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase' as const,letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                            <p style={{color:stat.color,fontSize:'32px',fontWeight:'800',margin:0}}>{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {managedClientCalls.length > 0 && (()=>{
                      const counts: Record<string,number>={};
                      managedClientCalls.forEach(c=>{if(c.reason)counts[c.reason]=(counts[c.reason]||0)+1;});
                      const top=Object.entries(counts).sort(([,a],[,b])=>b-a).slice(0,5);
                      if(!top.length)return null;
                      return (
                        <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                          <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 16px 0'}}>Top Call Reasons</p>
                          <div style={{display:'flex',gap:'10px',flexWrap:'wrap' as const}}>
                            {top.map(([reason,count])=>(
                              <div key={reason} style={{backgroundColor:'#f0f4f1',borderRadius:'8px',padding:'8px 14px',display:'flex',alignItems:'center',gap:'8px'}}>
                                <span style={{color:'#0a1f13',fontSize:'13px',fontWeight:'500'}}>{reason}</span>
                                <span style={{backgroundColor:'#0f2318',color:'#00d4aa',fontSize:'11px',padding:'1px 6px',borderRadius:'10px',fontWeight:'700'}}>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {managedClientBusiness && (
                      <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden',marginBottom:'24px'}}>
                        <div style={{padding:'20px 24px',borderBottom:'1px solid #f3f4f6'}}><h3 style={{color:'#0a1f13',fontSize:'15px',fontWeight:'700',margin:0}}>Recent Calls from Emily</h3></div>
                        {managedClientCalls.length===0?<p style={{color:'#9ca3af',fontSize:'14px',padding:'40px',textAlign:'center' as const}}>No calls yet. Emily is standing by.</p>:managedClientCalls.slice(0,15).map(call=>(
                          <div key={call.id} style={{padding:'14px 24px',borderBottom:'1px solid #f9fafb',display:'flex',alignItems:'center',gap:'16px'}}>
                            <div style={{width:'8px',height:'8px',borderRadius:'50%',backgroundColor:getStatusColor(call.status),flexShrink:0}}/>
                            <div style={{flex:1}}><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}>{call.caller_name||'Unknown caller'}</p><p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{call.reason||'No reason provided'}</p></div>
                            <div style={{textAlign:'right' as const}}><span style={{backgroundColor:getStatusColor(call.status)+'18',color:getStatusColor(call.status),fontSize:'11px',padding:'3px 8px',borderRadius:'20px',fontWeight:'600'}}>{getStatusLabel(call.status)}</span><p style={{color:'#9ca3af',fontSize:'11px',margin:'3px 0 0'}}>{timeAgo(call.created_at)}</p></div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(()=>{
                      const pays=clientPayments.filter(p=>p.client_id===selectedManagedClient.id);
                      const upfront=managedClientBusiness?.upfront_paid_usd;
                      return (
                        <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'16px'}}>
                            <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:0}}>Payments</p>
                            <span style={{color:'#374151',fontSize:'13px',fontWeight:'700'}}>Total paid: {getClientPaidLabel(selectedManagedClient)}</span>
                          </div>
                          {upfront?<p style={{color:'#6b7280',fontSize:'12px',margin:'0 0 12px 0'}}>{'Paid direct before the platform tracked payments: $'+Number(upfront).toLocaleString()+' USD (business record). Not counted in ledger or lifetime totals.'}</p>:null}
                          {pays.length===0?<p style={{color:'#9ca3af',fontSize:'13px',margin:'0 0 16px 0'}}>No payments recorded.</p>:(
                            <div style={{marginBottom:'16px'}}>
                              {pays.map(p=>(
                                <div key={p.id} style={{display:'grid',gridTemplateColumns:'110px 140px 1fr',gap:'12px',padding:'8px 0',borderBottom:'1px solid #f9fafb',fontSize:'13px'}}>
                                  <span style={{color:'#6b7280'}}>{formatDate(p.paid_on)}</span>
                                  <span style={{color:p.amount<0?'#b91c1c':'#0a1f13',fontWeight:'700'}}>{formatMoneyTotal({amount:Number(p.amount),currency:p.currency})}</span>
                                  <span style={{color:'#6b7280'}}>{[p.method,p.note].filter(Boolean).join(' · ')||'—'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <p style={{color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 10px 0'}}>Record payment</p>
                          <div style={{display:'grid',gridTemplateColumns:'130px 90px 150px 1fr 1fr',gap:'12px',marginBottom:'12px'}}>
                            <div><label style={lbl}>Amount</label><input style={inp} inputMode="decimal" placeholder="697.00" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})}/></div>
                            <div><label style={lbl}>Currency</label><select style={{...inp,backgroundColor:'#fff'}} value={paymentForm.currency} onChange={e=>setPaymentForm({...paymentForm,currency:e.target.value})}><option>CAD</option><option>USD</option></select></div>
                            <div><label style={lbl}>Date received</label><input type="date" style={inp} value={paymentForm.paid_on} onChange={e=>setPaymentForm({...paymentForm,paid_on:e.target.value})}/></div>
                            <div><label style={lbl}>Method</label><input style={inp} placeholder="Stripe, e-Transfer…" value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}/></div>
                            <div><label style={lbl}>Note</label><input style={inp} placeholder="e.g. setup fee + first month" value={paymentForm.note} onChange={e=>setPaymentForm({...paymentForm,note:e.target.value})}/></div>
                          </div>
                          {paymentError&&<p style={{color:'#b91c1c',fontSize:'13px',margin:'0 0 10px 0'}}>{paymentError}</p>}
                          <button onClick={recordClientPayment} disabled={paymentBusy} style={{backgroundColor:'#0f2318',color:'#fff',padding:'10px 24px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:paymentBusy?'not-allowed':'pointer',border:'none',opacity:paymentBusy?0.6:1}}>{paymentBusy?'Saving...':'Record Payment'}</button>
                          <p style={{color:'#9ca3af',fontSize:'11px',margin:'8px 0 0 0'}}>Entries can't be edited or deleted. Record a refund or correction as a negative amount with a note.</p>
                        </div>
                      );
                    })()}
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                      <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 20px 0'}}>Log Touchpoint</p>
                      <div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:'16px',marginBottom:'16px'}}>
                        <div><label style={lbl}>Type</label><select style={{...inp,backgroundColor:'#fff'}} value={touchpointForm.type} onChange={e=>setTouchpointForm({...touchpointForm,type:e.target.value})}>{['Call','Text','Email','In-Person','Note'].map(t=><option key={t}>{t}</option>)}</select></div>
                        <div><label style={lbl}>Notes</label><input style={inp} placeholder="What happened? Any issues, wins, or feedback..." value={touchpointForm.notes} onChange={e=>setTouchpointForm({...touchpointForm,notes:e.target.value})}/></div>
                      </div>
                      <button onClick={logTouchpoint} disabled={touchpointLoading||!touchpointForm.notes||!managedClientBusiness} style={{backgroundColor:'#0f2318',color:'#fff',padding:'10px 24px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',opacity:touchpointLoading||!touchpointForm.notes||!managedClientBusiness?0.6:1}}>{touchpointLoading?'Logging...':'Log Touchpoint'}</button>
                    </div>
                    {managedClientTouchpoints.length > 0 && (
                      <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                        <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 16px 0'}}>Touchpoint History</p>
                        <div style={{position:'relative',paddingLeft:'24px'}}>
                          <div style={{position:'absolute',left:'7px',top:0,bottom:0,width:'1px',backgroundColor:'#e5e7eb'}}/>
                          {managedClientTouchpoints.slice(0,5).map((tp,i)=>(
                            <div key={tp.id} style={{position:'relative',marginBottom:i<Math.min(4,managedClientTouchpoints.length-1)?'20px':0}}>
                              <div style={{position:'absolute',left:'-21px',top:'4px',width:'10px',height:'10px',borderRadius:'50%',backgroundColor:'#00d4aa',border:'2px solid #fff',boxShadow:'0 0 0 1px #00d4aa'}}/>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'4px'}}>
                                <span style={{backgroundColor:'#0f2318',color:'#00d4aa',fontSize:'11px',padding:'2px 8px',borderRadius:'4px',fontWeight:'700'}}>{tp.type}</span>
                                <span style={{color:'#9ca3af',fontSize:'11px'}}>{timeAgo(tp.created_at)}</span>
                              </div>
                              {tp.notes&&<p style={{color:'#374151',fontSize:'13px',margin:'4px 0 0 0',lineHeight:'1.5'}}>{tp.notes}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
                      <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                        <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 16px 0',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>Client Info</p>
                        {([['Owner',selectedManagedClient.owner_name],['Phone',selectedManagedClient.phone],['Email',selectedManagedClient.email],['City',selectedManagedClient.city+(selectedManagedClient.province?', '+selectedManagedClient.province:'')],['Plan',getClientPlanDisplay(selectedManagedClient)],['Contract Signed',selectedManagedClient.contract_signed?'Yes':'No'],['Payment Collected',selectedManagedClient.payment_collected?'Yes':'No'],['Days as Client',clientDays(selectedManagedClient)+'d']] as [string,string][]).filter(([,v])=>v).map(([label,value])=>(
                          <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f9fafb'}}><span style={{color:'#9ca3af',fontSize:'12px'}}>{label}</span><span style={{color:'#374151',fontSize:'13px',fontWeight:'500'}}>{value}</span></div>
                        ))}
                        {managedClientBusiness && (
                          <div style={{marginTop:'12px',paddingTop:'12px',borderTop:'1px solid #f3f4f6'}}>
                            {([['SMS Contact 1',managedClientBusiness.sms_contact_1],['SMS Contact 2',managedClientBusiness.sms_contact_2],['Call Forwarding',managedClientBusiness.call_forwarding_number],['Go-Live Date',managedClientBusiness.go_live_date?formatDate(managedClientBusiness.go_live_date):null]] as [string,string|null][]).filter(([,v])=>v).map(([label,value])=>(
                              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f9fafb'}}><span style={{color:'#9ca3af',fontSize:'12px'}}>{label}</span><span style={{color:'#374151',fontSize:'13px',fontWeight:'500'}}>{value}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>
                          <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:0}}>Go-Live Checklist</p>
                          <span style={{backgroundColor:getChecklistProgress(goLiveChecklist)===100?'#d1fae5':'#fef3c7',color:getChecklistProgress(goLiveChecklist)===100?'#065f46':'#92400e',fontSize:'11px',fontWeight:'700',padding:'3px 10px',borderRadius:'20px'}}>{GO_LIVE_CHECKLIST_ITEMS.filter(item=>goLiveChecklist[item]).length+' / '+GO_LIVE_CHECKLIST_ITEMS.length}</span>
                        </div>
                        <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'6px',marginBottom:'16px',overflow:'hidden'}}><div style={{backgroundColor:getChecklistProgress(goLiveChecklist)===100?'#10b981':'#f59e0b',height:'100%',width:getChecklistProgress(goLiveChecklist)+'%',borderRadius:'99px',transition:'width 0.3s'}}/></div>
                        {GO_LIVE_CHECKLIST_ITEMS.map(item=>(
                          <label key={item} style={{display:'flex',alignItems:'center',gap:'10px',padding:'7px 0',borderBottom:'1px solid #f9fafb',cursor:'pointer'}}>
                            <input type="checkbox" checked={!!goLiveChecklist[item]} onChange={e=>toggleGoLiveItem(item,e.target.checked)} style={{width:'16px',height:'16px',accentColor:'#0f2318',cursor:'pointer',flexShrink:0}}/>
                            <span style={{color:goLiveChecklist[item]?'#9ca3af':'#374151',fontSize:'13px',textDecoration:goLiveChecklist[item]?'line-through':'none'}}>{item}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ALL CALLS TAB */}
        {tab==='calls'&&(
          <div>
            <div style={{marginBottom:'28px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>All Calls</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{(callsTotal===null?'…':callsTotal.toLocaleString())+' calls'+(callsBusinessFilter?' for this client':' across all clients')}</p></div>
            <div style={{marginBottom:'20px'}}>
              <select value={callsBusinessFilter} onChange={e=>{setCallsBusinessFilter(e.target.value);setHighlightedCallId(null);setExpandedCallId(null);}} style={{padding:'10px 14px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',backgroundColor:'#fff',outline:'none',cursor:'pointer',fontFamily:'Inter, sans-serif',minWidth:'240px'}}>
                <option value="">All Clients</option>
                {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1.5fr 1fr 1fr',padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                {['Client','Caller','Reason','Status','Time'].map(col=><p key={col} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
              </div>
              {calls.length===0?<p style={{color:'#9ca3af',fontSize:'14px',padding:'48px',textAlign:'center'}}>{callsLoading||callsTotal===null?'Loading…':'No calls to show.'}</p>:calls.map(call=>{
                const biz=businesses.find(b=>b.id===call.business_id);
                return (
                  <div key={call.id}>
                  <div id={'call-row-'+call.id} onClick={()=>setExpandedCallId(id=>id===call.id?null:call.id)} title={expandedCallId===call.id?'Hide transcript':'Show full transcript'} style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1.5fr 1fr 1fr',padding:'14px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer',...(highlightedCallId===call.id?{backgroundColor:'#fffbeb',boxShadow:'inset 4px 0 0 #f59e0b'}:{})}}>
                    <p style={{color:'#374151',fontSize:'12px',fontWeight:'600',margin:0}}>{biz?.name||'—'}</p>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',backgroundColor:getStatusColor(call.status),flexShrink:0}}/><div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 1px 0'}}>{call.caller_name||'Unknown'}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{call.caller_number}</p></div></div>
                    <p style={{color:'#374151',fontSize:'13px',margin:0}}>{call.reason||'—'}</p>
                    <span style={{backgroundColor:getStatusColor(call.status)+'18',color:getStatusColor(call.status),fontSize:'11px',padding:'3px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getStatusLabel(call.status)}</span>
                    <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{timeAgo(call.created_at)}</p>
                  </div>
                  {expandedCallId===call.id&&(
                    <div style={{padding:'20px 24px',backgroundColor:'#fafafa',borderBottom:'1px solid #f3f4f6'}}>
                      <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 8px 0'}}>Summary</p>
                      <p style={{color:'#374151',fontSize:'13px',lineHeight:'1.6',margin:'0 0 20px 0'}}>{call.reason||'No summary captured.'}</p>
                      <CallTranscript transcript={call.transcript} emptyText="No transcript available for this call." />
                    </div>
                  )}
                  </div>
                );
              })}
              {calls.length>0&&callsTotal!==null&&calls.length<callsTotal&&(
                <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:'12px',padding:'16px'}}>
                  <span style={{color:'#9ca3af',fontSize:'13px'}}>Showing {calls.length.toLocaleString()} of {callsTotal.toLocaleString()}</span>
                  <button onClick={()=>loadCallsPage(false)} disabled={callsLoading} style={{backgroundColor:'#fff',color:'#0f2318',padding:'8px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:callsLoading?'default':'pointer',border:'1px solid #e5e7eb'}}>{callsLoading?'Loading…':'Load '+Math.min(CALLS_PAGE_SIZE,callsTotal-calls.length)+' more'}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROSPECTS TAB */}
        {tab==='prospects'&&(
          <>
            {prospectView==='list'&&(
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'28px'}}>
                  <div><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Prospects</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{viewMode==='table'&&callbacksMode!=='off'?(prospectMatchCount===null?'…':prospectMatchCount.toLocaleString())+(callbacksMode==='today'?' due today':callbacksMode==='overdue'?' overdue':' callback'+(prospectMatchCount===1?'':'s')+' due'):viewMode==='table'&&prospectFilterActive?(prospectMatchCount===null?'…':prospectMatchCount.toLocaleString())+' of '+prospectsTotal.toLocaleString():prospectsTotal.toLocaleString()+' total across all reps'}</p></div>
                  <div style={{display:'flex',gap:'10px',alignItems:'center',flexShrink:0}}>
                    <div style={{display:'flex',border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
                      <button onClick={()=>setViewMode('table')} style={{padding:'8px 16px',fontSize:'13px',fontWeight:'600',cursor:'pointer',border:'none',backgroundColor:viewMode==='table'?'#0f2318':'#fff',color:viewMode==='table'?'#00d4aa':'#6b7280'}}>Table</button>
                      <button onClick={()=>setViewMode('board')} style={{padding:'8px 16px',fontSize:'13px',fontWeight:'600',cursor:'pointer',border:'none',backgroundColor:viewMode==='board'?'#0f2318':'#fff',color:viewMode==='board'?'#00d4aa':'#6b7280',borderLeft:'1px solid #e5e7eb'}}>Board</button>
                    </div>
                    {isAdminView&&<button onClick={()=>setShowPullBack(true)} style={{backgroundColor:'#fff',color:'#374151',padding:'10px 18px',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:'pointer',border:'1px solid #e5e7eb'}}>Pull back</button>}
                    <button onClick={()=>setProspectView('add')} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>+ Add Prospect</button>
                  </div>
                </div>
                {viewMode==='table'&&(
                  <>
                    <div style={{display:'flex',gap:'12px',marginBottom:'20px',flexWrap:'wrap'}}>
                      <input style={{...inp,backgroundColor:'#fff',flex:'1 1 260px'}} placeholder="Search by company, contact, phone, city, or trade..." value={searchQuery} onChange={e=>onProspectFilter(setSearchQuery)(e.target.value)}/>
                      <select value={statusFilter} onChange={e=>onProspectFilter(setStatusFilter)(e.target.value)} style={{...prospectFilterSel,minWidth:'170px'}}>
                        <option value="All">All Statuses</option>
                        {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
                      </select>
                      <select value={repFilter} onChange={e=>onProspectFilter(setRepFilter)(e.target.value)} style={prospectFilterSel} aria-label="Rep">
                        <option value="All">All Reps</option>
                        {repFilterOptions.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                      <select value={provinceFilter} onChange={e=>onProvinceChange(e.target.value)} style={prospectFilterSel} aria-label="Province">
                        <option value="All">All Provinces</option>
                        {provinceOptions.map(o=><option key={o.key} value={o.key}>{o.label+' ('+o.count+')'}</option>)}
                      </select>
                      <select value={cityFilter} onChange={e=>onProspectFilter(setCityFilter)(e.target.value)} style={prospectFilterSel} aria-label="City">
                        <option value="All">All Cities</option>
                        {cityOptions.map(o=><option key={o.key} value={o.key}>{o.label+' ('+o.count+')'}</option>)}
                      </select>
                      <select value={tradeFilter} onChange={e=>onProspectFilter(setTradeFilter)(e.target.value)} style={prospectFilterSel} aria-label="Trade">
                        <option value="All">All Trades</option>
                        {tradeFilter!=='All'&&!tradeOptions.some(o=>o.key===tradeFilter)&&<option value={tradeFilter}>{tradeFilter+' (0)'}</option>}
                        {tradeOptions.map(o=><option key={o.key} value={o.key}>{o.key+' ('+o.n+')'}</option>)}
                      </select>
                      <div role="group" aria-label="Callbacks" style={{display:'flex',border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
                        {([['all','Callbacks due',callbackCountsNow&&callbackCountsNow.today+callbackCountsNow.overdue,'#fef3c7','#92400e'],['today','Today',callbackCountsNow?.today,'#fef3c7','#92400e'],['overdue','Overdue',callbackCountsNow?.overdue,'#fee2e2','#991b1b']] as const).map(([mode,label,n,bg,fg],i)=>{
                          const on=callbacksMode===mode;
                          return (
                            <button key={mode} onClick={()=>pickCallbacks(mode)} aria-pressed={on} style={{padding:'10px 14px',fontSize:'14px',fontFamily:'Inter, sans-serif',fontWeight:'600',cursor:'pointer',border:'none',borderLeft:i?'1px solid #e5e7eb':'none',backgroundColor:on?'#0f2318':'#fff',color:on?'#00d4aa':'#374151',display:'flex',alignItems:'center',gap:'8px'}}>
                              {label}
                              {n!=null&&<span style={{backgroundColor:n?bg:'#f3f4f6',color:n?fg:'#9ca3af',fontSize:'11px',padding:'1px 7px',borderRadius:'20px',fontWeight:'700'}}>{n}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {isAdminView&&<BulkActionBar count={selectedProspectIds.size} onClear={()=>{setSelectedProspectIds(new Set());lastCheckedIdx.current=null;}}
                      note={prospectFilterActive&&selectedProspectIds.size>selectedMatchingCount?(selectedProspectIds.size-selectedMatchingCount)+' outside this filter':undefined}
                      actions={[{label:'Allocate',tone:'primary',onClick:openAllocate}]}/>}
                    {isAdminView&&prospectFilterActive&&selectedMatchingCount>0&&(
                      <p style={{color:'#6b7280',fontSize:'13px',margin:'0 0 12px 2px'}}>
                        {allMatchingSelected
                          ?<>All {(prospectMatchCount??0).toLocaleString()} matching selected. <button onClick={()=>setAllMatchingSelected(false)} style={{background:'none',border:'none',color:'#0f2318',fontWeight:'700',cursor:'pointer',padding:0,fontSize:'13px'}}>Clear</button></>
                          :<>{selectedMatchingCount.toLocaleString()} of {(prospectMatchCount??0).toLocaleString()} matching selected. <button onClick={()=>setAllMatchingSelected(true)} style={{background:'none',border:'none',color:'#0f2318',fontWeight:'700',cursor:'pointer',padding:0,fontSize:'13px'}}>Select all {(prospectMatchCount??0).toLocaleString()} matching</button></>}
                      </p>
                    )}
                    <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflowX:'auto',overflowY:'hidden'}}>
                      <div style={{display:'grid',gridTemplateColumns:prospectGridCols,columnGap:'8px',minWidth:prospectTableMin,padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb',alignItems:'center'}}>
                        {isAdminView&&<input type="checkbox" aria-label="Select all matching" checked={allMatchingSelected} ref={el=>{if(el)el.indeterminate=selectedMatchingCount>0&&!allMatchingSelected;}} onChange={e=>setAllMatchingSelected(e.target.checked)} disabled={!prospectMatchCount} style={{accentColor:'#0f2318',cursor:'pointer',margin:0}}/>}
                        {[...['Company','Trade','Contact','Rep','Last Contact','Follow-Up','Status'],...(isAdminView?['']:[])].map((col,i)=><p key={col||('col'+i)} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                      </div>
                      {prospects.length===0?<p style={{color:'#9ca3af',fontSize:'14px',padding:'48px',textAlign:'center'}}>{prospectsLoading||prospectMatchCount===null?'Loading…':prospectsTotal===0?'No prospects yet.':'No results for that filter.'}</p>:prospects.map((p,idx)=>{
                        const st=getStatusStyle(p.status);
                        const stale=isStale(p);
                        const checked=selectedProspectIds.has(p.id);
                        const rowBg=checked?'#f0fdf4':p.do_not_contact?'#fff5f5':'transparent';
                        const fu=followUpState(p,todayLocal);
                        return (
                          <div key={p.id} onClick={()=>openDetail(p)} style={{display:'grid',gridTemplateColumns:prospectGridCols,columnGap:'8px',minWidth:prospectTableMin,padding:'15px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer',backgroundColor:rowBg}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor=checked?'#dcfce7':p.do_not_contact?'#fee2e2':'#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor=rowBg)}>
                            {isAdminView&&<input type="checkbox" aria-label={'Select '+p.company_name} checked={checked} onClick={e=>{e.stopPropagation();toggleProspectSelected(idx,e.shiftKey);}} onChange={()=>{}} style={{accentColor:'#0f2318',cursor:'pointer',margin:0}}/>}
                            <div>
                              <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'2px'}}>
                                {p.do_not_contact&&<span style={{fontSize:'11px'}}>🚫</span>}
                                {p.bad_number&&<span title="Bad number (Wrong Number logged)" style={{fontSize:'11px'}}>📵</span>}
                                {stale&&<span style={{fontSize:'11px'}}>⚠️</span>}
                                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}>{p.company_name}</p>
                              </div>
                              {p.city&&<p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{p.city}</p>}
                            </div>
                            <p style={{color:'#374151',fontSize:'13px',margin:0}}>{p.trade||'-'}</p>
                            <div><p style={{color:'#374151',fontSize:'13px',margin:'0 0 1px 0'}}>{p.contact_name||'-'}</p>{p.contact_position&&<p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{p.contact_position}</p>}</div>
                            <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'3px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getRepLabel(p.rep_id)}</span>
                            <span style={{backgroundColor:stale?'#fee2e2':'#f3f4f6',color:stale?'#991b1b':'#6b7280',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{timeAgoShort(p.last_contacted_at)}</span>
                            {fu?<span style={{backgroundColor:fu==='overdue'?'#fee2e2':'#fef3c7',color:fu==='overdue'?'#991b1b':'#92400e',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'700',display:'inline-block',width:'fit-content'}}>{fu==='overdue'?'Overdue · '+formatDate(p.follow_up_date||'').replace(/, \d{4}$/,''):'Today'}</span>
                              :<p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{p.follow_up_date?formatDate(p.follow_up_date):'-'}</p>}
                            <span style={{backgroundColor:st.bg,color:st.color,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{p.status}</span>
                            {isAdminView&&(
                              <button onClick={e=>{e.stopPropagation();setProspectToDelete({id:p.id,name:p.company_name});}} title="Delete prospect" style={{backgroundColor:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',fontSize:'15px',padding:'4px',justifySelf:'center'}}>🗑</button>
                            )}
                          </div>
                        );
                      })}
                      {prospects.length>0&&prospectMatchCount!==null&&prospects.length<prospectMatchCount&&(
                        <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:'12px',padding:'16px'}}>
                          <span style={{color:'#9ca3af',fontSize:'13px'}}>Showing {prospects.length.toLocaleString()} of {prospectMatchCount.toLocaleString()}</span>
                          <button onClick={()=>loadProspectsPage(false)} disabled={prospectsLoading} style={{backgroundColor:'#fff',color:'#0f2318',padding:'8px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:prospectsLoading?'default':'pointer',border:'1px solid #e5e7eb'}}>{prospectsLoading?'Loading…':'Load '+Math.min(PROSPECTS_PAGE_SIZE,prospectMatchCount-prospects.length)+' more'}</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {viewMode==='board'&&(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:'16px'}}>
                    {PIPELINE_COLUMNS.map(column=>{
                      const colP=boardCols[column.id]||[];
                      const colCount=prospectStats.filter(r=>column.statuses.includes(r.status)).reduce((s,r)=>s+r.n,0);
                      return (
                        <div key={column.id} onDragOver={e=>{e.preventDefault();setDragOverColumnId(column.id);}} onDragLeave={()=>setDragOverColumnId(null)} onDrop={e=>{e.preventDefault();if(draggedProspectId){updateProspectStatus(draggedProspectId,column.defaultStatus);setDraggedProspectId(null);setDragOverColumnId(null);}}} style={{backgroundColor:dragOverColumnId===column.id?column.accent:'#f9fafb',borderRadius:'12px',padding:'14px',border:'2px dashed '+(dragOverColumnId===column.id?column.color:'transparent'),minHeight:'480px',transition:'all 0.15s'}}>
                          <div style={{marginBottom:'16px',paddingBottom:'12px',borderBottom:'2px solid '+column.color+'30'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}><span style={{fontSize:'15px',fontWeight:'800',color:'#0a1f13'}}>{column.label}</span><span style={{backgroundColor:column.accent,color:column.color,fontSize:'12px',padding:'2px 10px',borderRadius:'20px',fontWeight:'700',border:'1px solid '+column.color+'40'}}>{colCount.toLocaleString()}</span></div>
                          </div>
                          {colP.map(p=>{
                            const days=totalDays(p);
                            return (
                              <div key={p.id} draggable onDragStart={()=>setDraggedProspectId(p.id)} onDragEnd={()=>{setDraggedProspectId(null);setDragOverColumnId(null);}} onClick={()=>openDetail(p)} style={{backgroundColor:'#fff',borderRadius:'10px',padding:'12px 14px',marginBottom:'8px',boxShadow:'0 1px 4px rgba(0,0,0,0.08)',cursor:'grab',opacity:draggedProspectId===p.id?0.4:1,border:'0.5px solid #e5e7eb'}}>
                                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'0 0 4px 0'}}>{p.company_name}</p>
                                {p.contact_name&&<p style={{color:'#6b7280',fontSize:'12px',margin:'0 0 2px 0'}}>{p.contact_name}</p>}
                                {(p.contact_phone||p.phone)&&<p style={{color:'#6b7280',fontSize:'12px',margin:'0 0 8px 0'}}>{p.contact_phone||p.phone}</p>}
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                  <span style={{fontSize:'11px',color:'#9ca3af',backgroundColor:'#f3f4f6',padding:'1px 6px',borderRadius:'10px',fontWeight:'600'}}>{getRepLabel(p.rep_id)}</span>
                                  <span style={{backgroundColor:p.status==='Closed Won'?'#d1fae5':'#f3f4f6',color:p.status==='Closed Won'?'#065f46':'#374151',fontSize:'10px',padding:'2px 7px',borderRadius:'20px',fontWeight:'700'}}>{days===0?'Today':days+'d total'}</span>
                                </div>
                              </div>
                            );
                          })}
                          {colP.length<colCount&&colP.length>0&&<button onClick={()=>loadBoardColumn(column.id,true)} style={{width:'100%',backgroundColor:'transparent',color:'#6b7280',padding:'8px',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer',border:'1px dashed #d1d5db'}}>{'Show more ('+(colCount-colP.length).toLocaleString()+' not shown)'}</button>}
                          {colP.length===0&&<div style={{textAlign:'center',padding:'40px 16px',color:'#9ca3af',fontSize:'13px',border:'1.5px dashed #e5e7eb',borderRadius:'8px'}}>Drop here</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {prospectView==='add'&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'32px'}}>
                  <button onClick={()=>setProspectView('list')} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 2px 0'}}>Add Prospect</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Adding directly from The High Table</p></div>
                </div>
                <AddProspectForm value={prospectForm} onChange={setProspectForm} onSubmit={submitProspect} onCancel={()=>setProspectView('list')} loading={actionLoading} />
              </div>
            )}
            {prospectView==='detail'&&selectedProspect&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'28px'}}>
                  <button onClick={()=>{setProspectView('list');setSelectedProspect(null);setActivities([]);setStageHistory([]);setEditingProspect(false);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div style={{flex:1}}><h1 style={{color:'#0a1f13',fontSize:'26px',fontWeight:'800',margin:'0 0 2px 0'}}>{selectedProspect.company_name}</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{[selectedProspect.trade,selectedProspect.city,selectedProspect.province].filter(Boolean).join(' / ')}</p></div>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap' as const}}>
                    <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'12px',padding:'5px 12px',borderRadius:'20px',fontWeight:'700'}}>{totalDays(selectedProspect)===0?'Day 1':totalDays(selectedProspect)+' days total'}</span>
                    <select value={selectedProspect.rep_id} onChange={e=>reassignProspect(selectedProspect.id,e.target.value)} style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',backgroundColor:'#fff',fontWeight:'600',cursor:'pointer',outline:'none'}}>
                      {[...repProfiles,...setterProfiles,{id:currentUserId,full_name:'Alex Rivera',email:'founder@example.com',role:'owner'}].map(r=><option key={r.id} value={r.id}>{r.full_name||r.email}</option>)}
                    </select>
                    <button onClick={()=>toggleDNC(selectedProspect.id,!selectedProspect.do_not_contact)} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:selectedProspect.do_not_contact?'#fee2e2':'#f3f4f6',color:selectedProspect.do_not_contact?'#991b1b':'#6b7280'}}>
                      {selectedProspect.do_not_contact?'🚫 DNC On':'DNC Off'}
                    </button>
                    {selectedProspect.bad_number&&<button onClick={()=>clearBadNumber(selectedProspect.id)} title="Wrong Number was logged. Clear once the number is fixed." style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#fee2e2',color:'#991b1b'}}>📵 Bad # · Clear</button>}
                    <button onClick={()=>setShowBookDemoPanel(!showBookDemoPanel)} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#8b5cf6',color:'#fff'}}>
                      📅 Book Demo
                    </button>
                    <button onClick={openProspectEdit} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#0f2318',color:'#00d4aa'}}>
                      ✎ Edit
                    </button>
                    <select value={selectedProspect.status} onChange={e=>updateProspectStatus(selectedProspect.id,e.target.value)} style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',backgroundColor:'#fff',fontWeight:'600',cursor:'pointer',outline:'none'}}>
                      {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
                    </select>
                    {(currentUserRole==='admin'||currentUserRole==='owner')&&(
                      <button onClick={()=>setProspectToMove(selectedProspect)} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#dbeafe',color:'#1e40af'}}>
                        → Move to Signups
                      </button>
                    )}
                    {(currentUserRole==='admin'||currentUserRole==='owner')&&(
                      <button onClick={()=>setProspectToDelete({id:selectedProspect.id,name:selectedProspect.company_name})} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#fee2e2',color:'#991b1b'}}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
                {editingProspect&&(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'32px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',maxWidth:'800px',marginBottom:'24px'}}>
                    <p style={sec}>Company Info</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'4px'}}>
                      <div><label style={lbl}>Company Name</label><input style={inp} value={prospectEditForm.company_name} onChange={e=>setProspectEditForm({...prospectEditForm,company_name:e.target.value})}/></div>
                      <div><label style={lbl}>Trade</label><select style={{...inp,backgroundColor:'#fff'}} value={prospectEditForm.trade} onChange={e=>setProspectEditForm({...prospectEditForm,trade:e.target.value})}>{TRADE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
                      <div><label style={lbl}>Province</label><select style={{...inp,backgroundColor:'#fff'}} value={prospectEditForm.province} onChange={e=>setProspectEditForm({...prospectEditForm,province:e.target.value})}><option value="">Not set</option>{['SK','AB','BC','MB','ON','QC','NS','NB','NL','PE','YT','NT','NU'].map(p=><option key={p}>{p}</option>)}</select></div>
                      <div><label style={lbl}>City</label><input style={inp} value={prospectEditForm.city} onChange={e=>setProspectEditForm({...prospectEditForm,city:e.target.value})}/></div>
                      <div><label style={lbl}>Website</label><input style={inp} value={prospectEditForm.website} onChange={e=>setProspectEditForm({...prospectEditForm,website:e.target.value})}/></div>
                      <div><label style={lbl}>Phone</label><input style={inp} value={prospectEditForm.phone} onChange={e=>setProspectEditForm({...prospectEditForm,phone:e.target.value})}/></div>
                      <div><label style={lbl}>Email</label><input style={inp} value={prospectEditForm.email} onChange={e=>setProspectEditForm({...prospectEditForm,email:e.target.value})}/></div>
                    </div>
                    <p style={sec}>Contact Info</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'20px'}}>
                      <div><label style={lbl}>Contact Name</label><input style={inp} value={prospectEditForm.contact_name} onChange={e=>setProspectEditForm({...prospectEditForm,contact_name:e.target.value})}/></div>
                      <div><label style={lbl}>Position</label><input style={inp} value={prospectEditForm.contact_position} onChange={e=>setProspectEditForm({...prospectEditForm,contact_position:e.target.value})}/></div>
                      <div><label style={lbl}>Direct Phone</label><input style={inp} value={prospectEditForm.contact_phone} onChange={e=>setProspectEditForm({...prospectEditForm,contact_phone:e.target.value})}/></div>
                      <div><label style={lbl}>Direct Email</label><input style={inp} value={prospectEditForm.contact_email} onChange={e=>setProspectEditForm({...prospectEditForm,contact_email:e.target.value})}/></div>
                    </div>
                    <div style={{display:'flex',gap:'12px'}}>
                      <button onClick={saveProspectEdit} disabled={actionLoading} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'13px 36px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Saving...':'Save Changes'}</button>
                      <button onClick={()=>setEditingProspect(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'13px 24px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'24px'}}>
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>Company</p>
                    {([['Phone',selectedProspect.phone],['Email',selectedProspect.email],['Website',selectedProspect.website],['Source',selectedProspect.source],['Last Contacted',timeAgoShort(selectedProspect.last_contacted_at)]] as [string,string][]).filter(([,v])=>v).map(([label,value])=>(
                      <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f9fafb'}}><span style={{color:'#9ca3af',fontSize:'12px'}}>{label}</span><span style={{color:'#374151',fontSize:'13px',fontWeight:'500',textAlign:'right',maxWidth:'60%',wordBreak:'break-word'}}>{value}</span></div>
                    ))}
                  </div>
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px'}}>Contact</p>
                    {([['Name',selectedProspect.contact_name],['Position',selectedProspect.contact_position],['Direct Phone',selectedProspect.contact_phone],['Direct Email',selectedProspect.contact_email]] as [string,string][]).filter(([,v])=>v).map(([label,value])=>(
                      <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f9fafb'}}><span style={{color:'#9ca3af',fontSize:'12px'}}>{label}</span><span style={{color:'#374151',fontSize:'13px',fontWeight:'500'}}>{value}</span></div>
                    ))}
                    {selectedProspect.follow_up_date&&<div style={{marginTop:'16px',padding:'10px 14px',backgroundColor:'#f0fdf4',borderRadius:'8px',border:'1px solid #bbf7d0'}}><p style={{color:'#166534',fontSize:'12px',fontWeight:'600',margin:'0 0 2px 0'}}>Follow Up</p><p style={{color:'#166534',fontSize:'13px',margin:0}}>{formatDate(selectedProspect.follow_up_date)}</p></div>}
                    {selectedProspect.notes&&<div style={{marginTop:'14px',padding:'10px 14px',backgroundColor:'#f9fafb',borderRadius:'8px'}}><p style={{color:'#6b7280',fontSize:'12px',fontWeight:'600',margin:'0 0 4px 0'}}>Notes</p><p style={{color:'#374151',fontSize:'13px',margin:0,lineHeight:'1.5'}}>{selectedProspect.notes}</p></div>}
                  </div>
                </div>
                {showBookDemoPanel&&(
 <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',border:'2px solid #8b5cf6'}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
 <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Book Demo</p>
 <button onClick={()=>{setShowBookDemoPanel(false); setBookSlotId(''); setBookAssignTo(''); setBookDemoNotes(''); setUseDirectBook(false);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
 </div>
 <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
 <button onClick={()=>setUseDirectBook(false)} style={{padding:'7px 16px',borderRadius:'6px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:!useDirectBook?'#8b5cf6':'#f3f4f6',color:!useDirectBook?'#fff':'#6b7280'}}>Pick a Slot</button>
 <button onClick={()=>setUseDirectBook(true)} style={{padding:'7px 16px',borderRadius:'6px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:useDirectBook?'#8b5cf6':'#f3f4f6',color:useDirectBook?'#fff':'#6b7280'}}>Enter Date & Time</button>
 </div>
 {!useDirectBook ? (
   availSlots.filter((s:any)=>!s.is_booked).length===0 ? (
     <p style={{color:'#9ca3af',fontSize:'13px',margin:'0 0 12px 0'}}>No open slots available — switch to "Enter Date & Time" to book directly.</p>
   ) : (
     <>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
     <div><label style={lbl}>Available Slot *</label><select value={bookSlotId} onChange={e=>setBookSlotId(e.target.value)} style={{...inp,backgroundColor:'#fff'}}><option value="">— Pick a slot —</option>{availSlots.filter((s:any)=>!s.is_booked).map((slot:any)=><option key={slot.id} value={slot.id}>{slot.date} at {slot.time_slot}</option>)}</select></div>
     <div><label style={lbl}>Assign To</label><select value={bookAssignTo||currentUserId} onChange={e=>setBookAssignTo(e.target.value)} style={{...inp,backgroundColor:'#fff'}}><option value={currentUserId}>Alex Rivera (me)</option>{repProfiles.map(r=><option key={r.id} value={r.id}>{r.full_name||r.email}</option>)}</select></div>
     </div>
     <div style={{marginBottom:'16px'}}><label style={lbl}>Notes (optional)</label><textarea value={bookDemoNotes} onChange={e=>setBookDemoNotes(e.target.value)} placeholder="Any context for the demo..." style={{width:'100%',minHeight:'70px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',resize:'vertical' as const,boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/></div>
     <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
     <button onClick={bookDemoFromHighTable} disabled={bookDemoLoading||!bookSlotId} style={{backgroundColor:'#8b5cf6',color:'#fff',padding:'11px 28px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:bookDemoLoading||!bookSlotId?0.6:1}}>{bookDemoLoading?'Booking + Generating Meet Link...':'Confirm Demo'}</button>
     <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>Meet link auto-generates on confirm</p>
     </div>
     </>
   )
 ) : (
   <>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
   <div><label style={lbl}>Date *</label><input type="date" value={directBookDate} onChange={e=>setDirectBookDate(e.target.value)} style={{...inp,backgroundColor:'#fff'}}/></div>
   <div><label style={lbl}>Time *</label><select value={directBookTime} onChange={e=>setDirectBookTime(e.target.value)} style={{...inp,backgroundColor:'#fff'}}>
   {['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM'].map(t=><option key={t}>{t}</option>)}
   </select></div>
   </div>
   <div style={{marginBottom:'16px'}}><label style={lbl}>Notes (optional)</label><textarea value={directBookNotes} onChange={e=>setDirectBookNotes(e.target.value)} placeholder="Any context for the meeting..." style={{width:'100%',minHeight:'70px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',resize:'vertical' as const,boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/></div>
   <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
   <button onClick={directBookMeeting} disabled={directBookLoading||!directBookDate} style={{backgroundColor:'#8b5cf6',color:'#fff',padding:'11px 28px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:directBookLoading||!directBookDate?0.6:1}}>{directBookLoading?'Booking + Generating Meet Link...':'Book Meeting'}</button>
   <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>Meet link auto-generates on confirm</p>
   </div>
   </>
 )} </div>
 )}
 {stageHistory.length>0&&(
 <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
 <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0'}}>Stage Breakdown</p>

                    <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                      {stageHistory.map((h,i)=>{
                        const col=PIPELINE_COLUMNS.find(c=>c.label===h.stage)||PIPELINE_COLUMNS[0];
                        const days=h.days_in_stage!==null?h.days_in_stage:Math.floor((Date.now()-new Date(h.entered_at).getTime())/86400000);
                        return (
                          <div key={i} style={{backgroundColor:col.accent,borderRadius:'10px',padding:'12px 16px',border:'1px solid '+col.color+'30'}}>
                            <p style={{color:col.color,fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px 0'}}>{h.stage}</p>
                            <p style={{color:'#0a1f13',fontSize:'20px',fontWeight:'800',margin:0}}>{days===0?'< 1':days}<span style={{fontSize:'12px',fontWeight:'500',color:'#6b7280',marginLeft:'3px'}}>days</span></p>
                            {!h.left_at&&<p style={{color:col.color,fontSize:'10px',margin:'4px 0 0 0',fontWeight:'600'}}>current</p>}
                          </div>
                        );
                      })}
                      <div style={{backgroundColor:'#0f2318',borderRadius:'10px',padding:'12px 16px'}}><p style={{color:'#00d4aa',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px 0'}}>Total</p><p style={{color:'#fff',fontSize:'20px',fontWeight:'800',margin:0}}>{totalDays(selectedProspect)}<span style={{fontSize:'12px',fontWeight:'500',color:'rgba(255,255,255,0.5)',marginLeft:'3px'}}>days</span></p></div>
                    </div>
                  </div>
                )}
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                  <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 20px 0'}}>Log Activity</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                    <div><label style={lbl}>Type</label><select style={{...inp,backgroundColor:'#fff'}} value={activityForm.type} onChange={e=>setActivityForm({...activityForm,type:e.target.value})}>{ACTIVITY_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                    <div><label style={lbl}>Outcome</label>{activityForm.type==='Call'?(<select style={{...inp,backgroundColor:'#fff'}} value={activityForm.outcome} onChange={e => setActivityForm(withCallOutcome(activityForm, e.target.value))}><option value="">— Select —</option>{CALL_OUTCOMES.map(o=><option key={o}>{o}</option>)}</select>):(<input style={inp} placeholder="Spoke with owner, sent proposal..." value={activityForm.outcome} onChange={e=>setActivityForm({...activityForm,outcome:e.target.value})}/>)}</div>
                    <div><label style={lbl}>Follow Up Date</label><input type="date" style={inp} value={activityForm.follow_up_date} onChange={e=>setActivityForm({...activityForm,follow_up_date:e.target.value})}/></div>
                  </div>
                  <div style={{marginBottom:'16px'}}><label style={lbl}>Notes</label><textarea placeholder="What happened? What did they say?" value={activityForm.notes} onChange={e=>setActivityForm({...activityForm,notes:e.target.value})} style={{width:'100%',minHeight:'80px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',resize:'vertical',boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/></div>
                  {!activityForm.outcome.trim()&&<p style={{color:'#9ca3af',fontSize:'12px',margin:'0 0 8px 0'}}>Add an outcome to log this activity.</p>}<button onClick={logActivity} disabled={actionLoading||!activityForm.outcome.trim()} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 28px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:(actionLoading||!activityForm.outcome.trim())?0.6:1}}>{actionLoading?'Logging...':'Log Activity'}</button>
                </div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                  <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 20px 0'}}>Activity Timeline</p>
                  {activities.length===0?<p style={{color:'#9ca3af',fontSize:'14px',textAlign:'center',padding:'24px 0'}}>No activity logged yet.</p>:(
                    <div style={{position:'relative',paddingLeft:'24px'}}>
                      <div style={{position:'absolute',left:'7px',top:0,bottom:0,width:'1px',backgroundColor:'#e5e7eb'}}/>
                      {activities.map((activity,i)=>(
                        <div key={activity.id} style={{position:'relative',marginBottom:i<activities.length-1?'24px':0}}>
                          <div style={{position:'absolute',left:'-21px',top:'4px',width:'10px',height:'10px',borderRadius:'50%',backgroundColor:'#00d4aa',border:'2px solid #fff',boxShadow:'0 0 0 1px #00d4aa'}}/>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
                            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                              <span style={{backgroundColor:'#0f2318',color:'#00d4aa',fontSize:'11px',padding:'2px 8px',borderRadius:'4px',fontWeight:'700'}}>{activity.type}</span>
                              {activity.outcome&&<span style={{color:'#374151',fontSize:'13px',fontWeight:'600'}}>{activity.outcome}</span>}
                            </div>
                            <span style={{color:'#9ca3af',fontSize:'11px',whiteSpace:'nowrap',marginLeft:'12px'}}>{formatTime(activity.created_at)}</span>
                          </div>
                          {activity.notes&&<p style={{color:'#6b7280',fontSize:'13px',margin:'0 0 4px 0',lineHeight:'1.5'}}>{activity.notes}</p>}
                          {activity.follow_up_date&&<p style={{color:'#059669',fontSize:'12px',margin:0,fontWeight:'500'}}>{'Follow up: '+formatDate(activity.follow_up_date)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}{/* SIGNUPS TAB */}
        {tab==='signups'&&(
          <>
            {clientView==='list'&&(
              <div>
                <div style={{marginBottom:'32px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Signups</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Clients submitted by reps — click any row to view or edit</p></div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:(currentUserRole==='admin'||currentUserRole==='owner')?'2fr 1fr 1fr 1fr 1fr 1fr 40px':'2fr 1fr 1fr 1fr 1fr 1fr',padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                    {[...['Business','Owner','Plan','Contract','Payment','Submitted'],...((currentUserRole==='admin'||currentUserRole==='owner')?['']:[])].map((col,i)=><p key={col||('col'+i)} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                  </div>
                  {newClients.length===0?<p style={{color:'#9ca3af',fontSize:'14px',padding:'40px',textAlign:'center'}}>No signups yet.</p>:newClients.map(client=>(
                    <div key={client.id} onClick={()=>openClientDetail(client)} style={{display:'grid',gridTemplateColumns:(currentUserRole==='admin'||currentUserRole==='owner')?'2fr 1fr 1fr 1fr 1fr 1fr 40px':'2fr 1fr 1fr 1fr 1fr 1fr',padding:'16px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                      <div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}>{client.business_name}{isClientLocked(client)&&<span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'10px',fontWeight:'700',padding:'1px 8px',borderRadius:'20px',marginLeft:'8px',textTransform:'uppercase' as const,letterSpacing:'0.05em',verticalAlign:'middle'}}>Locked</span>}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{client.phone}</p></div>
                      <p style={{color:'#374151',fontSize:'13px',margin:0}}>{client.owner_name}</p>
                      <p style={{color:'#374151',fontSize:'12px',margin:0}}>{getClientPlanDisplay(client)}</p>
                      <span style={{color:client.contract_signed?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.contract_signed?'Yes':'No'}</span>
                      <span style={{color:client.payment_collected?'#10b981':'#ef4444',fontSize:'12px',fontWeight:'600'}}>{client.payment_collected?'Yes':'No'}</span>
                      <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{timeAgo(client.created_at)}</p>
                      {(currentUserRole==='admin'||currentUserRole==='owner')&&(
                        <button onClick={e=>{e.stopPropagation();setClientToDelete({id:client.id,name:client.business_name});}} title="Delete signup" style={{backgroundColor:'transparent',border:'none',color:'#9ca3af',cursor:'pointer',fontSize:'15px',padding:'4px',justifySelf:'center'}}>🗑</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {clientView==='detail'&&selectedClient&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'28px'}}>
                  <button onClick={()=>{setClientView('list');setSelectedClient(null);setSaveSuccess('');}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div style={{flex:1}}><h1 style={{color:'#0a1f13',fontSize:'26px',fontWeight:'800',margin:'0 0 2px 0'}}>{selectedClient.business_name}</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{selectedClient.owner_name+' · Submitted '+timeAgo(selectedClient.created_at)}</p></div>
                </div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'32px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',maxWidth:'860px'}}>
                  <p style={sec}>Business Info</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'4px'}}>
                    <div><label style={lbl}>Business Name</label><input style={inp} value={editForm.business_name} onChange={e=>setEditForm({...editForm,business_name:e.target.value})}/></div>
                    <div><label style={lbl}>Owner Name</label><input style={inp} value={editForm.owner_name} onChange={e=>setEditForm({...editForm,owner_name:e.target.value})}/></div>
                    <div><label style={lbl}>Phone</label><input style={inp} value={editForm.phone} onChange={e=>setEditForm({...editForm,phone:e.target.value})}/></div>
                    <div><label style={lbl}>Email</label><input style={inp} value={editForm.email} onChange={e=>setEditForm({...editForm,email:e.target.value})}/></div>
                    <div><label style={lbl}>City</label><input style={inp} value={editForm.city} onChange={e=>setEditForm({...editForm,city:e.target.value})}/></div>
                    <div><label style={lbl}>Province</label><select style={{...inp,backgroundColor:'#fff'}} value={editForm.province} onChange={e=>setEditForm({...editForm,province:e.target.value})}><option value="">Not set</option>{['SK','AB','BC','MB','ON','QC','NS','NB','NL','PE','YT','NT','NU'].map(p=><option key={p}>{p}</option>)}</select></div>
                    <div><label style={lbl}>Website</label><input style={inp} value={editForm.website} onChange={e=>setEditForm({...editForm,website:e.target.value})}/></div>
                    <div><label style={lbl}>Secondary Contact</label><input style={inp} value={editForm.secondary_contact} onChange={e=>setEditForm({...editForm,secondary_contact:e.target.value})}/></div>
                  </div>
                  <p style={sec}>Deal Info</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'4px'}}>
                    <div><label style={lbl}>Plan</label>{selectedClient&&isLegacyPlan(selectedClient.plan)?<input style={{...inp,backgroundColor:'#f9fafb',color:'#6b7280'}} value={selectedClient.plan+' (legacy plan, kept as is)'} readOnly title="Legacy plan: shown read-only; saving this form never changes it."/>:<select style={{...inp,backgroundColor:'#fff'}} value={editForm.plan} onChange={e=>setEditForm({...editForm,plan:e.target.value})}>{!editForm.plan&&<option value="">— not set —</option>}{CURRENT_PLAN_NAMES.map(n=><option key={n}>{n}</option>)}</select>}</div>
                    <div><label style={lbl}>Account Status</label><select style={{...inp,backgroundColor:'#fff'}} value={editForm.status} onChange={e=>setEditForm({...editForm,status:e.target.value})}>{CLIENT_STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></div>
                    <div><label style={lbl}>How They Heard</label><input style={inp} value={editForm.how_they_heard} onChange={e=>setEditForm({...editForm,how_they_heard:e.target.value})}/></div>
                    <div><label style={lbl}>Referred By</label><input style={inp} value={editForm.referred_by} onChange={e=>setEditForm({...editForm,referred_by:e.target.value})}/></div>
                  </div>
                  <p style={sec}>Confirmations</p>
                  <div style={{display:'flex',flexDirection:'column',gap:'14px',marginBottom:'24px'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'12px',cursor:'pointer'}}><input type="checkbox" checked={editForm.contract_signed} onChange={e=>setEditForm({...editForm,contract_signed:e.target.checked})} style={{width:'18px',height:'18px',accentColor:'#0f2318',cursor:'pointer'}}/><span style={{color:'#374151',fontSize:'14px',fontWeight:'500'}}>Contract signed</span></label>
                    <label style={{display:'flex',alignItems:'center',gap:'12px',cursor:'pointer'}}><input type="checkbox" checked={editForm.payment_collected} onChange={e=>setEditForm({...editForm,payment_collected:e.target.checked})} style={{width:'18px',height:'18px',accentColor:'#0f2318',cursor:'pointer'}}/><span style={{color:'#374151',fontSize:'14px',fontWeight:'500'}}>Payment collected</span></label>
                  </div>
                  {editForm.contract_signed && editForm.payment_collected && (
                    <div style={{backgroundColor:'#f0f4f1',borderRadius:'10px',padding:'16px 20px',marginBottom:'24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap' as const,gap:'12px'}}>
                      <div>
                        <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'0 0 2px 0'}}>Record Sale</p>
                        <p style={{color:'#6b7280',fontSize:'12px',margin:0}}>Log the plan, setter, and closer so commission calculates correctly.</p>
                      </div>
                      <button onClick={openRecordSaleModal} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'10px 20px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'1px solid #00d4aa'}}>Record Sale</button>
                    </div>
                  )}
                  <div style={{marginBottom:'28px'}}><label style={lbl}>Notes</label><textarea value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})} style={{width:'100%',minHeight:'100px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',resize:'vertical',boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/></div>
                  <div style={{display:'flex',gap:'12px'}}>
                    <button onClick={()=>{ if(editForm.status==='Paused'&&selectedClient?.status!=='Paused'){setShowPauseConfirm(true);}else{saveClientChanges();} }} disabled={actionLoading} style={{backgroundColor:clientSaveFlash==='success'?'#10b981':clientSaveFlash==='error'?'#ef4444':'#0f2318',color:'#fff',padding:'13px 36px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1,transition:'background-color 0.2s'}}>{actionLoading?'Saving...':clientSaveFlash==='success'?'✓ Saved':clientSaveFlash==='error'?'✕ Failed — see error above':'Save Changes'}</button>
                    <button onClick={()=>{setClientView('list');setSelectedClient(null);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'13px 24px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                    {(currentUserRole==='admin'||currentUserRole==='owner')&&(
                      <button onClick={()=>setClientToMove(selectedClient)} style={{backgroundColor:'#dbeafe',color:'#1e40af',padding:'13px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>
                        → Move to Prospects
                      </button>
                    )}
                    {(currentUserRole==='admin'||currentUserRole==='owner')&&(
                      <button onClick={()=>setClientToDelete({id:selectedClient.id,name:selectedClient.business_name})} style={{backgroundColor:'#fee2e2',color:'#991b1b',padding:'13px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                  {showPauseConfirm&&(
                    <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'460px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #f59e0b'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                          <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Confirm Pause</p>
                          <button onClick={()=>setShowPauseConfirm(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
                        </div>
                        <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Setting {selectedClient?.business_name} to Paused stops new calls from being logged and blocks their portal login, but Emily will keep physically answering the phone until you manually update call forwarding — this app can&apos;t do that part. Confirm you&apos;ll handle that separately?</p>
                        <div style={{display:'flex',gap:'10px'}}>
                          <button onClick={()=>{setShowPauseConfirm(false);saveClientChanges();}} disabled={actionLoading} style={{backgroundColor:'#f59e0b',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>Confirm Pause</button>
                          <button onClick={()=>setShowPauseConfirm(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {showRecordSale && (
                    <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
                      <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'520px',maxWidth:'100%',maxHeight:'85vh',overflowY:'auto' as const,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                          <div>
                            <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:0}}>Record Sale</p>
                            <p style={{color:'#6b7280',fontSize:'13px',margin:'2px 0 0 0'}}>{selectedClient.business_name}</p>
                          </div>
                          <button onClick={()=>setShowRecordSale(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Close</button>
                        </div>

                        {existingSales.length > 0 && !recordSaleResult && (
                          <div style={{backgroundColor:'#fef3c7',border:'1px solid #f59e0b',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px'}}>
                            <p style={{color:'#92400e',fontSize:'13px',margin:0}}>{existingSales.length} sale{existingSales.length!==1?'s':''} already recorded for this client (most recent: {formatDate(existingSales[0].sold_at)}, {existingSales[0].plan_slug}). Recording another is fine for a renewal — just confirming this isn&apos;t a duplicate entry.</p>
                          </div>
                        )}

                        {recordSaleError && (
                          <div style={{backgroundColor:'#fee2e2',border:'1px solid #ef4444',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',color:'#991b1b',fontSize:'13px',fontWeight:'600'}}>{'✕ ' + recordSaleError}</div>
                        )}

                        {recordSaleResult ? (
                          <div>
                            <div style={{backgroundColor:'#d1fae5',border:'1px solid #86efac',borderRadius:'10px',padding:'16px',marginBottom:'16px'}}>
                              <p style={{color:'#065f46',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 6px 0'}}>Sale Recorded</p>
                              <p style={{color:'#065f46',fontSize:'22px',fontWeight:'800',margin:'0 0 4px 0'}}>${recordSaleResult.amount.toLocaleString()} CAD</p>
                              {recordSaleResult.isOverride && <p style={{color:'#065f46',fontSize:'12px',margin:0}}>Every-10th-Starter override applied — full month instead of standard rate.</p>}
                            </div>
                            {recordSaleResult.newBonuses.length > 0 && (
                              <div style={{backgroundColor:'#ede9fe',border:'1px solid #c4b5fd',borderRadius:'10px',padding:'16px',marginBottom:'16px'}}>
                                <p style={{color:'#5b21b6',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 6px 0'}}>New Bonus{recordSaleResult.newBonuses.length!==1?'es':''} Awarded</p>
                                {recordSaleResult.newBonuses.map((b,i)=><p key={i} style={{color:'#5b21b6',fontSize:'14px',fontWeight:'700',margin:0}}>{b}</p>)}
                              </div>
                            )}
                            <button onClick={()=>setShowRecordSale(false)} style={{width:'100%',backgroundColor:'#0f2318',color:'#00d4aa',padding:'11px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'1px solid #00d4aa'}}>Done</button>
                          </div>
                        ) : (
                          <div>
                            <div style={{marginBottom:'16px'}}>
                              <label style={lbl}>Plan *</label>
                              <select value={recordSaleForm.planSlug} onChange={e=>setRecordSaleForm(prev=>({...prev,planSlug:e.target.value}))} style={{...inp,backgroundColor:'#fff'}}>
                                <option value="">— Select plan —</option>
                                {plans.map(p=><option key={p.slug} value={p.slug}>{p.display_name} — ${p.monthly_price.toLocaleString()} {p.currency}/mo</option>)}
                              </select>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                              <div>
                                <label style={lbl}>Setter (who sourced it)</label>
                                <select value={recordSaleForm.setterId} onChange={e=>setRecordSaleForm(prev=>({...prev,setterId:e.target.value}))} style={{...inp,backgroundColor:'#fff'}}>
                                  <option value="">— None —</option>
                                  {teamData.filter((t:any)=>t.role==='setter').map((s:any)=><option key={s.id} value={s.id}>{s.full_name||s.email}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={lbl}>Closer (who closed it)</label>
                                <select value={recordSaleForm.closerId} onChange={e=>setRecordSaleForm(prev=>({...prev,closerId:e.target.value}))} style={{...inp,backgroundColor:'#fff'}}>
                                  <option value="">— None —</option>
                                  {[...teamData.filter((t:any)=>t.role==='setter'), ...allReps].map((r:any)=><option key={r.id} value={r.id}>{r.full_name||r.email}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{marginBottom:'16px'}}>
                              <label style={lbl}>Credit Commission To *</label>
                              <select value={recordSaleForm.creditRepId} onChange={e=>setRecordSaleForm(prev=>({...prev,creditRepId:e.target.value}))} style={{...inp,backgroundColor:'#fff'}}>
                                <option value="">— Select rep —</option>
                                {teamData.filter((t:any)=>repCompensation[t.id]).map((t:any)=><option key={t.id} value={t.id}>{t.full_name||t.email} ({repCompensation[t.id].comp_track})</option>)}
                              </select>
                              <p style={{color:'#9ca3af',fontSize:'11px',margin:'4px 0 0 0'}}>Only reps with compensation tracking started are shown. Usually the Setter, unless they&apos;re already a full Closer.</p>
                            </div>
                            <div style={{marginBottom:'20px'}}>
                              <label style={lbl}>Sale Date</label>
                              <input type="date" value={recordSaleForm.soldAt} onChange={e=>setRecordSaleForm(prev=>({...prev,soldAt:e.target.value}))} style={{...inp,backgroundColor:'#fff'}} />
                            </div>
                            <button onClick={submitRecordSale} disabled={recordSaleLoading||!recordSaleForm.planSlug||!recordSaleForm.creditRepId} style={{width:'100%',backgroundColor:'#0f2318',color:'#00d4aa',padding:'12px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'1px solid #00d4aa',opacity:recordSaleLoading||!recordSaleForm.planSlug||!recordSaleForm.creditRepId?0.6:1}}>{recordSaleLoading?'Recording...':'Record Sale'}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* CANCELLATIONS TAB */}
        {tab==='cancellations'&&(
          <div>
            <div style={{marginBottom:'32px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Cancellations</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Submitted by reps — review, action, and confirm</p></div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:'16px',marginBottom:'28px'}}>
              {[{label:'Submitted This Month',value:cancellations.filter(c=>reginaDateStr(new Date(c.created_at)).slice(0,7)===reginaDateStr().slice(0,7)).length,color:'#6b7280'},{label:'Pending Review',value:cancellations.filter(c=>c.status==='pending').length,color:'#f59e0b'},{label:'MRR at Risk',value:'$'+cancellations.filter(c=>c.status!=='confirmed').reduce((s,c)=>s+(c.mrr_lost||0),0).toLocaleString(),color:'#ef4444'},{label:'MRR Confirmed Lost This Month',value:'$'+confirmedChurnMRRThisMonth.toLocaleString(),color:'#991b1b'}].map(stat=>(
                <div key={stat.label} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'20px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',borderTop:'3px solid '+stat.color}}>
                  <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                  <p style={{color:stat.color,fontSize:'28px',fontWeight:'800',margin:0}}>{stat.value}</p>
                </div>
              ))}
            </div>
            {cancellations.length===0?<div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>No cancellations submitted yet.</p></div>:(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr 1fr 160px',padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                  {['Business','Rep','Plan','MRR Lost','Category','Status',''].map((col,i)=><p key={i} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                </div>
                {cancellations.map(c=>{
                  const st=getCancellationStatusStyle(c.status);
                  const isExp=expandedCancellation===c.id;
                  return (
                    <div key={c.id} style={{borderBottom:'1px solid #f9fafb'}}>
                      <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr 1fr 160px',padding:'16px 24px',alignItems:'center',cursor:'pointer'}} onClick={()=>setExpandedCancellation(isExp?null:c.id)} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                        <div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}>{c.business_name}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{formatDate(c.created_at)}</p></div>
                        <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{getRepLabel(c.rep_id)}</span>
                        <span style={{color:'#374151',fontSize:'12px'}}>{getPlanTypeLabel(c.plan_type)}</span>
                        <span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'12px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{'$'+(c.mrr_lost||0).toLocaleString()+'/mo'}</span>
                        <span style={{color:'#374151',fontSize:'12px'}}>{getCategoryLabel(c.category)}</span>
                        <span style={{backgroundColor:st.bg,color:st.color,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700',display:'inline-block'}}>{st.label}</span>
                        <div style={{display:'flex',gap:'6px'}}>
                          {c.status==='pending'&&<button onClick={e=>{e.stopPropagation();updateCancellationStatus(c.id,'reviewed');}} style={{backgroundColor:'#dbeafe',color:'#1e40af',padding:'5px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:'700',cursor:'pointer',border:'none',whiteSpace:'nowrap'}}>Mark Reviewed</button>}
                          {c.status==='reviewed'&&<button onClick={e=>{e.stopPropagation();updateCancellationStatus(c.id,'confirmed');}} style={{backgroundColor:'#fee2e2',color:'#991b1b',padding:'5px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:'700',cursor:'pointer',border:'none',whiteSpace:'nowrap'}}>Confirm Lost</button>}
                          {c.status==='confirmed'&&<span style={{color:'#9ca3af',fontSize:'12px'}}>Closed</span>}
                        </div>
                      </div>
                      {isExp&&(
                        <div style={{padding:'16px 24px 20px',backgroundColor:'#f9fafb',borderTop:'1px solid #f3f4f6'}}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
                            <div><p style={{color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 6px 0'}}>Client Reason</p><p style={{color:'#374151',fontSize:'13px',margin:0,lineHeight:'1.5'}}>{c.reason||'—'}</p></div>
                            <div><p style={{color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 6px 0'}}>Rep Notes</p><p style={{color:'#374151',fontSize:'13px',margin:0,lineHeight:'1.5'}}>{c.notes||'—'}</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PROBLEMS TAB */}
        {tab==='problems'&&(
          <div>
            <div style={{marginBottom:'32px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Problems</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Issues flagged by reps — resolve when handled</p></div>
            <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'1.2fr 2.5fr 1fr 1fr 1fr 120px',padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                {['Business','Issue','Rep','Status','Reported',''].map((col,i)=><p key={i} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
              </div>
              {problems.length===0?<p style={{color:'#9ca3af',fontSize:'14px',padding:'40px',textAlign:'center'}}>No problems flagged.</p>:problems.map(p=>(
                <div key={p.id} style={{borderBottom:'1px solid #f9fafb'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1.2fr 2.5fr 1fr 1fr 1fr 120px',padding:'16px 24px',alignItems:'center'}}>
                    <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}>{p.business_name}</p>
                    <p style={{color:'#374151',fontSize:'13px',margin:0}}>{p.issue}</p>
                    <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{p.rep_id?getRepLabel(p.rep_id):'—'}</span>
                    <span style={{backgroundColor:p.status==='Open'?'#fee2e2':'#d1fae5',color:p.status==='Open'?'#ef4444':'#10b981',fontSize:'11px',padding:'3px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{p.status}</span>
                    <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{timeAgo(p.created_at)}</p>
                    <div style={{display:'flex',gap:'6px',flexWrap:'wrap' as const}}>
                      {p.status==='Open'&&<button onClick={()=>resolveProblem(p.id)} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'6px 12px',borderRadius:'6px',fontSize:'11px',fontWeight:'700',cursor:'pointer',border:'none',whiteSpace:'nowrap'}}>Resolve</button>}
                      <button onClick={()=>handleExpandProblem(p.id,p.admin_notes)} style={{backgroundColor:expandedProblem===p.id?'#f3f4f6':'#f9fafb',color:'#6b7280',padding:'6px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:'600',cursor:'pointer',border:'1px solid #e5e7eb',whiteSpace:'nowrap'}}>{p.admin_notes?'Notes':'+ Notes'}</button>
                    </div>
                  </div>
                  {expandedProblem===p.id&&(
                    <div style={{padding:'16px 24px 20px',backgroundColor:'#f9fafb',borderTop:'1px solid #f3f4f6'}}>
                      <label style={{display:'block',color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'8px'}}>Admin Notes</label>
                      <textarea placeholder="Internal notes — not visible to reps..." value={problemNotesDraft[p.id]!==undefined?problemNotesDraft[p.id]:(p.admin_notes||'')} onChange={e=>setProblemNotesDraft(prev=>({...prev,[p.id]:e.target.value}))} style={{width:'100%',minHeight:'80px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',outline:'none',resize:'vertical',boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif',marginBottom:'10px'}}/>
                      <button onClick={()=>saveProblemNotes(p.id)} style={{backgroundColor:'#0f2318',color:'#fff',padding:'8px 20px',borderRadius:'6px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'none'}}>Save Notes</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REP MANAGEMENT TAB */}
        {tab==='rep-activity'&&<RepActivity onOpenProspect={async id=>{const p=prospects.find(x=>x.id===id) ?? (await supabase.from('prospects').select('*').eq('id',id).maybeSingle()).data; if (p) { setTab('prospects'); openDetail(p); }}}/>}
        {tab==='setter-activity'&&(() => {
          const today = reginaDateStr();
          const presets: [string, string, string][] = [['Today', today, today], ['Yesterday', shiftDateStr(today, -1), shiftDateStr(today, -1)], ['This week', reginaWeekStart(today), today]];
          const isRange = actStart !== actEnd;
          const rows = (actData?.setters || []).filter((st: any) => actSetter === 'all' || st.id === actSetter).map((st: any) => {
            const acts = (actData?.activities || []).filter((a: any) => a.rep_id === st.id);
            const appts = (actData?.appointments || []).filter((a: any) => a.setter_id === st.id);
            const callActs = acts.filter((a: any) => a.type === 'Call');
            const log = [
              ...acts.map((a: any) => ({ id: 'a' + a.id, ts: a.created_at, kind: a.type, who: a.prospects?.company_name || '—', contact: a.prospects?.contact_name || '', outcome: a.outcome || '', notes: a.notes || '' })),
              ...appts.map((a: any) => ({ id: 'p' + a.id, ts: a.created_at, kind: 'Demo booked', who: a.business_name || '—', contact: a.contact_name || '', outcome: 'For ' + a.scheduled_date + ' at ' + a.scheduled_time + ' (' + a.status + ')', notes: a.notes || '' })),
            ].sort((x, y) => x.ts.localeCompare(y.ts));
            return { st, log, calls: callActs.length, conv: callActs.filter((a: any) => CONNECTED_OUTCOMES.includes(a.outcome)).length, demos: appts.length, other: acts.filter((a: any) => a.type !== 'Call').length };
          });
          const tot = rows.reduce((t, r) => ({ calls: t.calls + r.calls, conv: t.conv + r.conv, demos: t.demos + r.demos, other: t.other + r.other }), { calls: 0, conv: 0, demos: 0, other: 0 });
          const pill = (active: boolean): React.CSSProperties => ({ padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (active ? '#00d4aa' : '#e5e7eb'), backgroundColor: active ? 'rgba(0,212,170,0.12)' : '#fff', color: active ? '#0a1f13' : '#6b7280', fontFamily: 'Inter, sans-serif' });
          const numCell: React.CSSProperties = {color:'#0a1f13',fontSize:'16px',fontWeight:'700',margin:0};
          const cols = 'minmax(140px,1.6fr) minmax(56px,0.6fr) minmax(118px,1.1fr) minmax(88px,1fr) minmax(56px,0.6fr)';
          return (
          <div style={{contain:'inline-size'}}>
            <div style={{marginBottom:'24px'}}><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Setter Activity</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>What each setter logged, by day (America/Regina time)</p></div>
            <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center',marginBottom:'20px'}}>
              {presets.map(([label, a, b]) => <button key={label} onClick={() => { setActStart(a); setActEnd(b); }} style={pill(actStart === a && actEnd === b)}>{label}</button>)}
              <input type="date" value={actStart === actEnd ? actStart : ''} onChange={e => { if (e.target.value) { setActStart(e.target.value); setActEnd(e.target.value); } }} style={{...inp,width:'auto',minHeight:'40px'}} />
              <select value={actSetter} onChange={e => { setActSetter(e.target.value); setActOpen(e.target.value === 'all' ? null : e.target.value); }} style={{...inp,width:'auto',minHeight:'40px',backgroundColor:'#fff'}}>
                <option value="all">All setters</option>
                {(actData?.setters || []).map((st: any) => <option key={st.id} value={st.id}>{st.full_name || st.email}</option>)}
              </select>
            </div>
            <p style={{color:'#9ca3af',fontSize:'12px',margin:'0 0 16px 0',display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
              <span>{isRange ? formatDate(actStart) + ' – ' + formatDate(actEnd) : formatDate(actStart)}{actLoading ? ' · loading…' : ''}</span>
              <span>·</span><UpdatedAgo atRef={actUpdatedRef} />
              <button disabled={actRefreshing} onClick={async () => { setActRefreshing(true); try { await actRefreshRef.current?.(); } finally { setActRefreshing(false); } }} style={{background:'none',border:'1px solid #e5e7eb',borderRadius:'6px',padding:'3px 10px',fontSize:'12px',fontWeight:600,color:'#6b7280',cursor:actRefreshing?'default':'pointer',fontFamily:'Inter, sans-serif'}}>{actRefreshing ? 'Refreshing…' : 'Refresh'}</button>
            </p>
            {actError&&<div style={{backgroundColor:'#fee2e2',border:'1px solid #ef4444',borderRadius:'10px',padding:'14px 20px',marginBottom:'16px',color:'#991b1b',fontSize:'14px',fontWeight:'600'}}>{actError}</div>}
            <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflowX:'auto'}}>
              <div style={{minWidth:'520px'}}>
                <div style={{display:'grid',gridTemplateColumns:cols,padding:'14px 24px',borderBottom:'1px solid #f3f4f6'}}>
                  {['Setter','Calls','Conversations','Demos booked','Other'].map(c => <p key={c} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{c}</p>)}
                </div>
                {rows.length===0?<div style={{padding:'40px',textAlign:'center'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>{actLoading ? 'Loading…' : 'No setters found.'}</p></div>:rows.map(r => (
                  <div key={r.st.id} style={{borderBottom:'1px solid #f9fafb'}}>
                    <div onClick={() => setActOpen(actOpen === r.st.id ? null : r.st.id)} style={{display:'grid',gridTemplateColumns:cols,padding:'16px 24px',alignItems:'center',cursor:'pointer',backgroundColor:actOpen===r.st.id?'#f0f4f1':'transparent'}}>
                      <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}><BlurField>{r.st.full_name || r.st.email}</BlurField>{r.st.now_role&&r.st.now_role!=='setter'&&<span style={{marginLeft:'6px',backgroundColor:'#ede9fe',color:'#5b21b6',fontSize:'10px',padding:'1px 7px',borderRadius:'20px',fontWeight:700}}>now {r.st.now_role==='vp_sales'?'VP':'Rep'}</span>}</p>
                      <p style={numCell}>{r.calls}</p>
                      <p style={numCell}>{r.conv}</p>
                      <p style={numCell}>{r.demos}</p>
                      <p style={numCell}>{r.other}</p>
                    </div>
                    {actOpen===r.st.id&&(
                      <div style={{padding:'4px 24px 18px 24px',backgroundColor:'#f0f4f1'}}>
                        {r.log.length===0?<p style={{color:'#9ca3af',fontSize:'13px',margin:'8px 0 0 0'}}>Nothing logged in this period.</p>:r.log.map(e => (
                          <div key={e.id} style={{display:'flex',gap:'14px',padding:'10px 0',borderBottom:'1px solid #e5e7eb',flexWrap:'wrap'}}>
                            <div style={{width:'92px',flexShrink:0}}>
                              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:0}}>{fmtReginaTime(e.ts)}</p>
                              {isRange&&<p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{formatDate(reginaDateStr(new Date(e.ts)))}</p>}
                            </div>
                            <div style={{flex:'1 1 220px',minWidth:0}}>
                              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}><span style={{backgroundColor:e.kind==='Demo booked'?'#ede9fe':'#e5e7eb',color:e.kind==='Demo booked'?'#5b21b6':'#374151',fontSize:'11px',padding:'2px 8px',borderRadius:'20px',fontWeight:'700',marginRight:'8px'}}>{e.kind}</span><BlurField>{e.who}{e.contact ? ' · ' + e.contact : ''}</BlurField></p>
                              {e.outcome&&<p style={{color:'#374151',fontSize:'12px',margin:'0 0 2px 0'}}>{e.outcome}</p>}
                              {e.notes&&<p style={{color:'#6b7280',fontSize:'12px',margin:0,whiteSpace:'pre-wrap'}}><BlurField>{e.notes}</BlurField></p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {rows.length>1&&(
                  <div style={{display:'grid',gridTemplateColumns:cols,padding:'14px 24px',backgroundColor:'#fafafa'}}>
                    <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',margin:0,textTransform:'uppercase'}}>Total</p>
                    {[tot.calls,tot.conv,tot.demos,tot.other].map((n,i)=><p key={i} style={numCell}>{n}</p>)}
                  </div>
                )}
              </div>
            </div>
            <p style={{color:'#9ca3af',fontSize:'11px',margin:'12px 0 0 0'}}>Calls = logged Call activities. Conversations = calls with outcome Send Info, Not Interested, Callback or Booked. Demos booked = appointments the setter created. Other = emails, notes, meetings, etc.</p>
          </div>
          );
        })()}
        {tab==='reps'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'32px'}}>
              <div><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Rep Management</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Team, performance, and commission</p></div>
              <button onClick={()=>setShowInviteForm(!showInviteForm)} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'1px solid #00d4aa'}}>+ Invite Someone</button>
            </div>

            {showInviteForm&&(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',border:'2px solid #00d4aa'}}>
                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 20px 0'}}>Invite New Team Member</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                  <div><label style={lbl}>Full Name *</label><input style={inp} placeholder="Full Name" value={inviteForm.full_name} onChange={e=>setInviteForm({...inviteForm,full_name:e.target.value})}/></div>
                  <div><label style={lbl}>Email *</label><input style={inp} placeholder="name@example.com" value={inviteForm.email} onChange={e=>setInviteForm({...inviteForm,email:e.target.value})}/></div>
                  <div><label style={lbl}>Role</label>
                    <select style={{...inp,backgroundColor:'#fff'}} value={inviteForm.role} onChange={e=>setInviteForm({...inviteForm,role:e.target.value})}>
                      <option value="setter">Setter</option>
<option value="rep">Sales Rep</option>
                    </select>
                  </div>
                </div>
                <div style={{backgroundColor:'#f0f4f1',borderRadius:'8px',padding:'12px 14px',marginBottom:'16px'}}>
                  <p style={{color:'#374151',fontSize:'13px',margin:0}}>They will receive an email with a link to set their password. Once set they can log into their portal immediately.</p>
                </div>
                <div style={{display:'flex',gap:'10px'}}>
                  <button onClick={inviteTeamMember} disabled={inviteLoading||!inviteForm.email||!inviteForm.full_name} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 28px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:inviteLoading||!inviteForm.email||!inviteForm.full_name?0.6:1}}>{inviteLoading?'Sending...':'Send Invite'}</button>
                  <button onClick={()=>setShowInviteForm(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}

            
            <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 20px 0',paddingBottom:'12px',borderBottom:'1px solid #f3f4f6'}}>Performance</p>
            {repProfiles.length===0?<div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>No reps yet — invite someone above.</p></div>:(
              <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
                {repProfiles.map(rep=>{
                  const repClients=newClients.filter(c=>c.rep_id===rep.id);
                  const activeClients=repClients.filter(c=>c.status==='Active');
                  const onboardingClients=repClients.filter(c=>c.status==='Onboarding');
                  const repStatus=repStatusCounts(rep.id);
                  const wonCount=repStatus['Closed Won']||0;
                  const newCount=sumStatuses(repStatus,['Not Contacted','Attempted','Contacted','Follow Up Required']);
                  const meetingCount=sumStatuses(repStatus,['Interested','Demo Scheduled']);
                  const proposalCount=repStatus['Proposal Sent']||0;
                  // 15% of first payment: current plans at today's prices, legacy plans at the old table (lib/first-payment.ts).
                  const firstPaymentTotal=Math.round(repClients.reduce((sum,c)=>sum+firstPaymentCommission(c,firstSaleSlugByClient[c.id]).amount,0)*100)/100;
                  const repCancellations=cancellations.filter(c=>c.rep_id===rep.id);
                  const openProblemsCount=problems.filter(p=>p.rep_id===rep.id&&p.status==='Open').length;
                  const total=sumStatuses(repStatus);
                  const pipelineStages=[
                    {label:'New',count:newCount,color:'#6b7280',pct:stagePct(newCount,total)},
                    {label:'Meeting',count:meetingCount,color:'#8b5cf6',pct:stagePct(meetingCount,total)},
                    {label:'Proposal',count:proposalCount,color:'#f59e0b',pct:stagePct(proposalCount,total)},
                    {label:'Won',count:wonCount,color:'#10b981',pct:stagePct(wonCount,total)},
                  ];
                  return (
                    <div key={rep.id} style={{backgroundColor:'#fff',borderRadius:'14px',padding:'28px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'24px',paddingBottom:'20px',borderBottom:'1px solid #f3f4f6'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                          <div style={{width:'44px',height:'44px',borderRadius:'50%',backgroundColor:rep.role==='vp_sales'?'#8b5cf6':'#0f2318',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:'700',color:rep.role==='vp_sales'?'#fff':'#00d4aa',flexShrink:0}}>{(rep.full_name||rep.email)[0].toUpperCase()}</div>
                          <div>
                            <p style={{color:'#0a1f13',fontSize:'16px',fontWeight:'800',margin:'0 0 4px 0'}}>{rep.full_name||rep.email}</p>
                            <div style={{display:'flex',gap:'8px',alignItems:'center'}}><span style={{backgroundColor:rep.role==='vp_sales'?'#ede9fe':'#f3f4f6',color:rep.role==='vp_sales'?'#5b21b6':'#6b7280',fontSize:'11px',padding:'2px 9px',borderRadius:'20px',fontWeight:'700'}}>{rep.role==='vp_sales'?'VP of Sales':'Sales Rep'}</span><p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{rep.email}</p></div>
                            {roleHistoryLine(rep.id)&&<p style={{color:'#6b7280',fontSize:'11px',margin:'4px 0 0 0'}}>{roleHistoryLine(rep.id)}</p>}
                          </div>
                        </div>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
                          <span style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'0.05em'}}>Callbacks</span>
                          {callbackChips(rep.id)}
                          {openProblemsCount>0&&<span style={{backgroundColor:'#fee2e2',color:'#ef4444',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700'}}>{openProblemsCount+' open problem'+(openProblemsCount!==1?'s':'')}</span>}
                          {repCancellations.filter(c=>c.status==='pending').length>0&&<span style={{backgroundColor:'#fef3c7',color:'#92400e',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700'}}>{repCancellations.filter(c=>c.status==='pending').length+' pending cancellation'+(repCancellations.filter(c=>c.status==='pending').length!==1?'s':'')}</span>}
                          {repCompensation[rep.id]&&<button onClick={()=>openTrackModal(rep)} style={{backgroundColor:'transparent',border:'1px solid #00d4aa',color:'#00815f',padding:'6px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>Manage Track</button>}
                          <button onClick={()=>setRemovingRep(rep)} style={{backgroundColor:'transparent',border:'1px solid #fecaca',color:'#ef4444',padding:'6px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>Remove Rep</button>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:'16px',marginBottom:'24px'}}>
                        {[{label:'Total Clients',value:repClients.length,sub:onboardingClients.length+' onboarding',color:'#0f2318'},{label:'Active Clients',value:activeClients.length,sub:'$'+activeClients.reduce((s,c)=>s+getClientMRR(c),0).toLocaleString()+' MRR (CAD)',color:'#10b981'},{label:'Total Prospects',value:total,sub:wonCount+' won',color:'#8b5cf6'},{label:'Pipeline Value',value:'$'+repPipelineValue(rep.id).toLocaleString(),sub:'CAD · active conversations',color:'#f59e0b'}].map(stat=>(
                          <div key={stat.label} style={{backgroundColor:'#f9fafb',borderRadius:'12px',padding:'16px',borderTop:'3px solid '+stat.color}}>
                            <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 6px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                            <p style={{color:stat.color,fontSize:'26px',fontWeight:'800',margin:'0 0 2px 0'}}>{stat.value}</p>
                            <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{stat.sub}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{backgroundColor:'#f9fafb',borderRadius:'12px',padding:'16px',marginBottom:'20px'}}>
                        <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 10px 0'}}>12-Month Milestones</p>
                        <MilestoneProgress progress={milestoneMap[rep.id] ?? null} showDiscrepancies />
                      </div>
                      {progressMap[rep.id]?.sprint && (
                        <div style={{backgroundColor:'#f9fafb',borderRadius:'12px',padding:'16px',marginBottom:'20px'}}>
                          <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 10px 0'}}>Monthly Sprint</p>
                          <SprintProgress sprint={progressMap[rep.id]!.sprint!} />
                        </div>
                      )}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
                        <div>
                          <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 12px 0'}}>Pipeline Breakdown</p>
                          {pipelineStages.map(stage=>(
                            <div key={stage.label} style={{marginBottom:'10px'}}>
                              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}><span style={{color:'#374151',fontSize:'12px',fontWeight:'600'}}>{stage.label}</span><span style={{color:'#9ca3af',fontSize:'12px'}}>{stage.count}</span></div>
                              <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'6px',overflow:'hidden'}}><div style={{backgroundColor:stage.color,height:'100%',width:stage.pct,borderRadius:'99px'}}/></div>
                            </div>
                          ))}
                        </div>
                        <div style={{backgroundColor:'#0f2318',borderRadius:'12px',padding:'20px'}}>
                          <p style={{color:'#00d4aa',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 16px 0'}}>Commission Summary</p>
                          <div style={{marginBottom:'14px',paddingBottom:'14px',borderBottom:'1px solid rgba(255,255,255,0.08)'}}><p style={{color:'rgba(255,255,255,0.45)',fontSize:'11px',margin:'0 0 4px 0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Commission (15% of first payment)</p><p style={{color:'#fff',fontSize:'22px',fontWeight:'800',margin:0}}>{fmtCommission(firstPaymentTotal)+' CAD'}</p></div>
                          
                          <div style={{marginBottom:'14px',paddingBottom:'14px',borderBottom:'1px solid rgba(255,255,255,0.08)'}}><p style={{color:'rgba(255,255,255,0.45)',fontSize:'11px',margin:'0 0 4px 0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Total Closes</p><p style={{color:'#00d4aa',fontSize:'22px',fontWeight:'800',margin:'0 0 2px 0'}}>{repClients.length}</p><p style={{color:'rgba(255,255,255,0.35)',fontSize:'11px',margin:0}}>{activeClients.length + ' currently active'}</p></div>
                          <div><p style={{color:'rgba(255,255,255,0.45)',fontSize:'11px',margin:'0 0 4px 0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Cancellations Submitted</p><p style={{color:repCancellations.length>0?'#fca5a5':'rgba(255,255,255,0.5)',fontSize:'16px',fontWeight:'700',margin:0}}>{repCancellations.length+' total · '+repCancellations.filter(c=>c.status==='confirmed').length+' confirmed'}</p></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'40px 0 20px 0',paddingBottom:'12px',borderBottom:'1px solid #f3f4f6'}}>Setter Management</p>
            {(() => {
              const setterProfiles = teamData.filter((t: any) => t.role === 'setter');
              if (setterProfiles.length === 0) return (
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}><p style={{color:'#9ca3af',fontSize:'14px',margin:0}}>No setters yet — invite someone above.</p></div>
              );
              return (
                <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
                  {setterProfiles.map((setter: any) => {
                    const setterApptList = setterAppts.filter((a: any) => a.setter_id === setter.id);
                    const scheduledCount = setterApptList.filter((a: any) => a.status === 'Scheduled').length;
                    const cancelledCount = setterApptList.filter((a: any) => a.status === 'Cancelled').length;
                    const noShowCount = setterApptList.filter((a: any) => a.status === 'No Show').length;
                    const isBanned = !!setter.banned_until && new Date(setter.banned_until) > new Date();
                    const status = isBanned
                      ? { label: 'Deactivated', bg: '#fee2e2', fg: '#991b1b' }
                      : !setter.email_confirmed_at
                      ? { label: 'Invited · Pending', bg: '#fef3c7', fg: '#92400e' }
                      : { label: 'Active', bg: '#d1fae5', fg: '#065f46' };
                    const comp = repCompensation[setter.id];
                    const trackBadge: Record<CompTrack | 'none', {label:string;bg:string;fg:string}> = {
                      none: { label: 'Not Started', bg: '#f3f4f6', fg: '#6b7280' },
                      setter_training: { label: 'Training (15%)', bg: '#e0f2fe', fg: '#0c4a6e' },
                      setter: { label: 'Setter (5%)', bg: '#f3f4f6', fg: '#6b7280' },
                      setter_closer: { label: 'Setter → Closer (15%)', bg: '#ede9fe', fg: '#5b21b6' },
                      closer: { label: 'Closer (15%)', bg: '#d1fae5', fg: '#065f46' },
                    };
                    const track = trackBadge[comp?.comp_track || 'none'];
                    const isExpanded = expandedSetterId === setter.id;
                    const snapshot = setterDashboardData[setter.id];
                    return (
                      <div key={setter.id} style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                        <div onClick={()=>toggleSetterExpand(setter.id)} style={{padding:'22px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap' as const,gap:'16px',cursor:'pointer'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                            <span style={{color:'#9ca3af',fontSize:'12px',transform:isExpanded?'rotate(90deg)':'none',transition:'transform 0.15s',display:'inline-block'}}>▶</span>
                            <div style={{width:'44px',height:'44px',borderRadius:'50%',backgroundColor:'#0f2318',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:'700',color:'#00d4aa',flexShrink:0}}>{(setter.full_name||setter.email)[0].toUpperCase()}</div>
                            <div>
                              <p style={{color:'#0a1f13',fontSize:'16px',fontWeight:'800',margin:'0 0 4px 0'}}>{setter.full_name||setter.email}</p>
                              <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap' as const}}>
                                <span style={{backgroundColor:'#f3f4f6',color:'#6b7280',fontSize:'11px',padding:'2px 9px',borderRadius:'20px',fontWeight:'700'}}>Setter</span>
                                <span style={{backgroundColor:status.bg,color:status.fg,fontSize:'11px',padding:'2px 9px',borderRadius:'20px',fontWeight:'700'}}>{status.label}</span>
                                <span style={{backgroundColor:track.bg,color:track.fg,fontSize:'11px',padding:'2px 9px',borderRadius:'20px',fontWeight:'700'}}>{track.label}</span>
                                <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{setter.email}</p>
                              </div>
                              <p style={{color:'#9ca3af',fontSize:'11px',margin:'4px 0 0 0',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap' as const}}>
                                <span>New-system sales: {commissionCounts[setter.id] || 0}</span>
                                <span style={{backgroundColor:(paidClients[setter.id]||0)>=PROMOTION_PAID_CLIENTS?'#d1fae5':'#f3f4f6',color:(paidClients[setter.id]||0)>=PROMOTION_PAID_CLIENTS?'#065f46':'#374151',fontSize:'11px',padding:'2px 9px',borderRadius:'20px',fontWeight:'700'}}>{(paidClients[setter.id]||0)}/{PROMOTION_PAID_CLIENTS} paid clients{(paidClients[setter.id]||0)>=PROMOTION_PAID_CLIENTS?' · eligible, their choice':''}</span>
                              </p>
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:'24px',flexWrap:'wrap' as const}}>
                            <div style={{textAlign:'center' as const}}><p style={{color:'#0a1f13',fontSize:'20px',fontWeight:'800',margin:'0 0 2px 0'}}>{setterApptList.length}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0,textTransform:'uppercase' as const}}>Booked</p></div>
                            <div style={{textAlign:'center' as const}}><p style={{color:'#8b5cf6',fontSize:'20px',fontWeight:'800',margin:'0 0 2px 0'}}>{scheduledCount}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0,textTransform:'uppercase' as const}}>Scheduled</p></div>
                            <div style={{textAlign:'center' as const}}><p style={{color:'#9ca3af',fontSize:'20px',fontWeight:'800',margin:'0 0 2px 0'}}>{cancelledCount}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0,textTransform:'uppercase' as const}}>Cancelled</p></div>
                            <div style={{textAlign:'center' as const}}><p style={{color:'#ef4444',fontSize:'20px',fontWeight:'800',margin:'0 0 2px 0'}}>{noShowCount}</p><p style={{color:'#9ca3af',fontSize:'11px',margin:0,textTransform:'uppercase' as const}}>No Show</p></div>
                            <div style={{textAlign:'center' as const}}><div style={{margin:'0 0 4px 0'}}>{callbackChips(setter.id)}</div><p style={{color:'#9ca3af',fontSize:'11px',margin:0,textTransform:'uppercase' as const}}>Callbacks</p></div>
                            <div style={{display:'flex',gap:'8px'}}>
                              <button onClick={(e)=>{e.stopPropagation();setPromoting(setter);}} style={{backgroundColor:'#0f2318',border:'1px solid #0f2318',color:'#00d4aa',padding:'6px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>Promote</button>
                              <button onClick={(e)=>{e.stopPropagation();openTrackModal(setter);}} style={{backgroundColor:'transparent',border:'1px solid #00d4aa',color:'#00815f',padding:'6px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>Manage Track</button>
                              <button onClick={(e)=>{e.stopPropagation();toggleTeamMember(setter.id, isBanned?'reactivate':'deactivate');}} style={{backgroundColor:'transparent',border:'1px solid '+(isBanned?'#00d4aa':'#e5e7eb'),color:isBanned?'#00815f':'#6b7280',padding:'6px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>{isBanned?'Reactivate':'Deactivate'}</button>
                              <button onClick={(e)=>{e.stopPropagation();setRemovingRep(setter);}} style={{backgroundColor:'transparent',border:'1px solid #fecaca',color:'#ef4444',padding:'6px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>Remove</button>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{padding:'0 24px 24px 24px',borderTop:'1px solid #f3f4f6'}}>
                            {repCompensation[setter.id] && (
                              <div style={{marginTop:'20px',backgroundColor:'#fff',border:'1px solid #f3f4f6',borderRadius:'12px',padding:'16px'}}>
                                <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 10px 0'}}>12-Month Milestones</p>
                                <MilestoneProgress progress={milestoneMap[setter.id] ?? null} showDiscrepancies />
                              </div>
                            )}
                            {snapshot === 'loading' || !snapshot ? (
                              <p style={{color:'#9ca3af',fontSize:'13px',margin:'20px 0 0 0'}}>Loading dashboard…</p>
                            ) : (
                              <div style={{marginTop:'20px',display:'flex',flexDirection:'column' as const,gap:'16px'}}>
                                <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:'12px'}}>
                                  {[
                                    { label: 'Dials Today', value: snapshot.dialsToday, color: '#8b5cf6' },
                                    { label: 'Booked This Week', value: snapshot.bookedThisWeek, color: '#00d4aa' },
                                    { label: 'Show Rate', value: snapshot.showRate + '%', color: '#10b981' },
                                    (() => { const t = followUpsByOwner?.[setter.id]; const n = t ? t.today + t.overdue : null; return { label: 'Callbacks Due', value: n ?? '…', color: t?.overdue ? '#ef4444' : n ? '#f59e0b' : '#9ca3af' }; })(),
                                  ].map(stat => (
                                    <div key={stat.label} style={{backgroundColor:'#f9fafb',borderRadius:'10px',padding:'14px 16px',borderTop:'3px solid '+stat.color}}>
                                      <p style={{color:'#9ca3af',fontSize:'10px',margin:'0 0 6px',textTransform:'uppercase' as const,letterSpacing:'0.5px',fontWeight:'600'}}>{stat.label}</p>
                                      <p style={{color:stat.color,fontSize:'22px',fontWeight:'800',margin:0}}>{stat.value}</p>
                                    </div>
                                  ))}
                                </div>

                                {snapshot.progress && snapshot.progress.compTrack === 'setter_training' && (
                                  <div style={{backgroundColor:'#fff',border:'1px solid #f3f4f6',borderRadius:'10px',padding:'16px'}}>
                                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'6px'}}>
                                      <span style={{color:'#374151',fontWeight:'600'}}>Training Progress</span>
                                      <span style={{color:'#6b7280'}}>{snapshot.progress.qualifyingClientCount} / {snapshot.progress.trainingClientCount}</span>
                                    </div>
                                    <div style={{backgroundColor:'#f3f4f6',borderRadius:'99px',height:'6px',overflow:'hidden'}}>
                                      <div style={{backgroundColor:'#00d4aa',height:'100%',width:Math.min(100,(snapshot.progress.qualifyingClientCount/snapshot.progress.trainingClientCount)*100)+'%',borderRadius:'99px'}} />
                                    </div>
                                  </div>
                                )}

                                {snapshot.progress ? renderCompensationProgress(snapshot.progress) : (
                                  <p style={{color:'#9ca3af',fontSize:'13px',margin:0}}>Compensation tracking hasn&apos;t started yet.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {managingTrackFor && (
              <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'560px',maxWidth:'100%',maxHeight:'85vh',overflowY:'auto' as const,boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                    <div>
                      <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:0}}>Manage Compensation Track</p>
                      <p style={{color:'#6b7280',fontSize:'13px',margin:'2px 0 0 0'}}>{managingTrackFor.full_name || managingTrackFor.email}</p>
                    </div>
                    <button onClick={closeTrackModal} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Close</button>
                  </div>

                  {trackActionError && (
                    <div style={{backgroundColor:'#fee2e2',border:'1px solid #ef4444',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',color:'#991b1b',fontSize:'13px',fontWeight:'600'}}>{'✕ ' + trackActionError}</div>
                  )}

                  {managingTrackLoading ? (
                    <p style={{color:'#9ca3af',fontSize:'13px'}}>Loading…</p>
                  ) : (() => {
                    const comp = repCompensation[managingTrackFor.id];
                    const trackBadge: Record<CompTrack | 'none', {label:string;bg:string;fg:string}> = {
                      none: { label: 'Not Started', bg: '#f3f4f6', fg: '#6b7280' },
                      setter_training: { label: 'Training (15%)', bg: '#e0f2fe', fg: '#0c4a6e' },
                      setter: { label: 'Setter (5%)', bg: '#f3f4f6', fg: '#6b7280' },
                      setter_closer: { label: 'Setter → Closer (15%)', bg: '#ede9fe', fg: '#5b21b6' },
                      closer: { label: 'Closer (15%)', bg: '#d1fae5', fg: '#065f46' },
                    };
                    const badge = trackBadge[comp?.comp_track || 'none'];
                    const latest = managingTrackHistory[0];

                    return (
                      <div>
                        <div style={{backgroundColor:'#f9fafb',borderRadius:'10px',padding:'16px',marginBottom:'20px'}}>
                          <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:comp?'8px':0}}>
                            <span style={{backgroundColor:badge.bg,color:badge.fg,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700'}}>{badge.label}</span>
                          </div>
                          {comp && (
                            <>
                              <p style={{color:'#6b7280',fontSize:'12px',margin:'0 0 2px 0'}}>Started: {formatDate(comp.rep_started_at)}</p>
                              <p style={{color:'#6b7280',fontSize:'12px',margin:0}}>New-system sales: {commissionCounts[managingTrackFor.id] || 0}</p>
                            </>
                          )}
                        </div>

                        {comp && managingTrackProgress && (
                          <div style={{marginBottom:'20px'}}>{renderCompensationProgress(managingTrackProgress)}</div>
                        )}

                        {!comp && (
                          <div style={{marginBottom:'20px'}}>
                            <p style={{color:'#374151',fontSize:'13px',margin:'0 0 10px 0'}}>Compensation tracking hasn&apos;t been started for this setter — this is expected for setters invited before this system existed. Backfill their real start date below (used to anchor bonus windows).</p>
                            <div style={{display:'flex',gap:'10px',alignItems:'flex-end'}}>
                              <div style={{flex:1}}>
                                <label style={lbl}>Rep Started At</label>
                                <input type="date" value={startTrackingDate} onChange={e=>setStartTrackingDate(e.target.value)} style={{...inp,backgroundColor:'#fff'}} />
                              </div>
                              <button onClick={startTracking} disabled={trackActionLoading} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'11px 20px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'1px solid #00d4aa',opacity:trackActionLoading?0.6:1}}>Start Compensation Tracking</button>
                            </div>
                          </div>
                        )}

                        {comp && comp.comp_track === 'setter_training' && (
                          <div style={{marginBottom:'20px'}}>
                            <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 10px 0'}}>Choose Path</p>
                            {pendingTrackAction === null ? (
                              <div style={{display:'flex',gap:'10px',flexWrap:'wrap' as const}}>
                                <button onClick={()=>setPendingTrackAction('setter')} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'10px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>Elect Permanent Setter (5%)</button>
                                <button onClick={()=>setPendingTrackAction('setter_closer')} style={{backgroundColor:'#0f2318',color:'#00d4aa',border:'1px solid #00d4aa',padding:'10px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>Advance to Setter/Closer</button>
                              </div>
                            ) : (
                              <div style={{backgroundColor:'#fef3c7',border:'1px solid #f59e0b',borderRadius:'8px',padding:'14px'}}>
                                <p style={{color:'#92400e',fontSize:'13px',margin:'0 0 12px 0'}}>
                                  {pendingTrackAction === 'setter'
                                    ? 'This moves them to a permanent 5% Setter. They will no longer be eligible for any sales bonuses. This cannot be undone once further sales are recorded under this track.'
                                    : 'This moves them into Setter/Closer — still 15% + bonus-eligible, shadowing toward becoming a full Closer. A new contract is required at this election (log it below once signed).'}
                                </p>
                                <div style={{display:'flex',gap:'10px'}}>
                                  <button onClick={()=>transitionTrack(pendingTrackAction as CompTrack)} disabled={trackActionLoading} style={{backgroundColor:'#ef4444',color:'#fff',padding:'9px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',opacity:trackActionLoading?0.6:1}}>{trackActionLoading?'Saving…':'Confirm'}</button>
                                  <button onClick={()=>setPendingTrackAction(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'9px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer'}}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {comp && comp.comp_track === 'setter_closer' && (
                          <div style={{marginBottom:'20px'}}>
                            {pendingTrackAction === null ? (
                              <button onClick={()=>setPendingTrackAction('closer')} style={{backgroundColor:'#0f2318',color:'#00d4aa',border:'1px solid #00d4aa',padding:'10px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>Promote to Closer</button>
                            ) : (
                              <div style={{backgroundColor:'#fef3c7',border:'1px solid #f59e0b',borderRadius:'8px',padding:'14px'}}>
                                <p style={{color:'#92400e',fontSize:'13px',margin:'0 0 12px 0'}}>This promotes them to full Closer — closing their own deals from now on (they can still set their own appointments too). A second new contract is required at this promotion (log it below once signed).</p>
                                <div style={{display:'flex',gap:'10px'}}>
                                  <button onClick={()=>transitionTrack('closer')} disabled={trackActionLoading} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'9px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'1px solid #00d4aa',opacity:trackActionLoading?0.6:1}}>{trackActionLoading?'Saving…':'Confirm'}</button>
                                  <button onClick={()=>setPendingTrackAction(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'9px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer'}}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {comp && (comp.comp_track === 'setter' || comp.comp_track === 'closer') && (
                          <p style={{color:'#9ca3af',fontSize:'13px',margin:'0 0 20px 0'}}>This is a terminal compensation state — no further transitions.</p>
                        )}

                        {latest && (
                          <div style={{marginBottom:'20px',paddingTop:'16px',borderTop:'1px solid #f3f4f6'}}>
                            <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 10px 0'}}>Contract — Most Recent Transition</p>
                            <div style={{display:'flex',gap:'20px',flexWrap:'wrap' as const}}>
                              {(['sent', 'signed'] as const).map(field => {
                                const atField = field === 'sent' ? 'contract_sent_at' : 'contract_signed_at';
                                const filePathField = field === 'sent' ? 'contract_sent_file_path' : 'contract_signed_file_path';
                                const label = field === 'sent' ? 'Contract Sent' : 'Contract Signed';
                                const loggedAt = latest[atField];
                                const filePath = latest[filePathField];
                                return (
                                  <div key={field}>
                                    <label style={lbl}>{label}</label>
                                    {loggedAt ? (
                                      <div>
                                        <p style={{color:'#065f46',fontSize:'13px',fontWeight:'700',margin:'0 0 4px 0'}}>{formatDate(loggedAt)}</p>
                                        {filePath ? (
                                          <button onClick={()=>viewContractFile(latest.id, field)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'5px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:'700',cursor:'pointer'}}>View File</button>
                                        ) : (
                                          <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>No file attached</p>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={{display:'flex',flexDirection:'column' as const,gap:'6px',maxWidth:'220px'}}>
                                        <input type="date" value={contractDateDraft[field]} onChange={e=>setContractDateDraft(prev=>({...prev,[field]:e.target.value}))} style={{...inp,backgroundColor:'#fff',padding:'8px 10px',fontSize:'12px'}} />
                                        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={e=>setContractFileDraft(prev=>({...prev,[field]:e.target.files?.[0]||null}))} style={{fontSize:'11px'}} />
                                        <button onClick={()=>logContractDate(field, contractDateDraft[field], contractFileDraft[field])} disabled={!contractDateDraft[field]||trackActionLoading} style={{backgroundColor:'#0f2318',color:'#00d4aa',padding:'8px 12px',borderRadius:'6px',fontSize:'12px',fontWeight:'700',cursor:'pointer',border:'none',opacity:!contractDateDraft[field]||trackActionLoading?0.6:1}}>Log</button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {latest && (
                          <div style={{marginBottom:'20px',paddingTop:'16px',borderTop:'1px solid #f3f4f6'}}>
                            <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 10px 0'}}>Revert Last Change</p>
                            {salesSinceLastChange > 0 ? (
                              <p style={{color:'#9ca3af',fontSize:'13px',margin:0}}>Cannot revert — commissions have already been recorded under this track. Contact support for a manual correction.</p>
                            ) : (
                              <button onClick={revertLastChange} disabled={trackActionLoading} style={{backgroundColor:'transparent',border:'1px solid #fecaca',color:'#ef4444',padding:'8px 14px',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer',opacity:trackActionLoading?0.6:1}}>Revert Last Change</button>
                            )}
                          </div>
                        )}

                        {managingTrackHistory.length > 0 && (
                          <div style={{paddingTop:'16px',borderTop:'1px solid #f3f4f6'}}>
                            <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 10px 0'}}>History</p>
                            {managingTrackHistory.map(h => (
                              <div key={h.id} style={{padding:'8px 0',borderBottom:'1px solid #f9fafb'}}>
                                <p style={{color:'#374151',fontSize:'12px',margin:'0 0 2px 0'}}>{h.previous_track ? trackBadge[h.previous_track].label : '—'} → {trackBadge[h.new_track].label}</p>
                                <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{formatDate(h.changed_at)}{h.note ? ' · ' + h.note : ''}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {removingRep&&(
              <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'440px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #ef4444'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                    <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>{removingRep.role==='setter'?'Remove Setter':'Remove Rep'}</p>
                    <button onClick={()=>{setRemovingRep(null);setSaveError('');}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
                  </div>
                  <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Are you sure you want to remove {removingRep.full_name||removingRep.email}? This cannot be undone.</p>
                  {saveError && (
                    <div style={{backgroundColor:'#fee2e2',border:'1px solid #ef4444',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',color:'#991b1b',fontSize:'13px',fontWeight:'600'}}>{'✕ ' + saveError}</div>
                  )}
                  <div style={{display:'flex',gap:'10px'}}>
                    <button onClick={removeTeamMember} disabled={removeRepLoading} style={{backgroundColor:'#ef4444',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:removeRepLoading?0.6:1}}>{removeRepLoading?'Removing...':'Confirm Remove'}</button>
                    <button onClick={()=>{setRemovingRep(null);setSaveError('');}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
{/* CALENDAR TAB */}
        {tab === 'calendar' && (
          <div>
            <div style={{ marginBottom: '28px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Calendar</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Upcoming demos and availability management.</p>
            </div>

            <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
                <button onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))} style={{backgroundColor:'#f3f4f6',border:'none',borderRadius:'8px',padding:'8px 18px',cursor:'pointer',fontSize:'18px',fontWeight:'700',color:'#374151'}}>‹</button>
                <p style={{color:'#0a1f13',fontSize:'16px',fontWeight:'800',margin:0}}>{calendarMonth.toLocaleDateString('en-CA',{month:'long',year:'numeric'})}</p>
                <button onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))} style={{backgroundColor:'#f3f4f6',border:'none',borderRadius:'8px',padding:'8px 18px',cursor:'pointer',fontSize:'18px',fontWeight:'700',color:'#374151'}}>›</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'8px'}}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><p key={d} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'700',textAlign:'center' as const,margin:0,padding:'4px 0',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>{d}</p>)}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
                {(()=>{
                  const firstDay=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1).getDay();
                  const daysInMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0).getDate();
                  const today=new Date();
                  const cells:any[]=[];
                  for(let i=0;i<firstDay;i++) cells.push(<div key={'e'+i}/>);
                  for(let d=1;d<=daysInMonth;d++){
                    const dateStr=calendarMonth.getFullYear()+'-'+String(calendarMonth.getMonth()+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
                    const dayAppts=setterAppts.filter((a:any)=>a.scheduled_date===dateStr&&a.status!=='Cancelled');
                    const isToday=today.getDate()===d&&today.getMonth()===calendarMonth.getMonth()&&today.getFullYear()===calendarMonth.getFullYear();
                    cells.push(
                      <div key={d} onClick={()=>{setCalendarBookForm({...calendarBookForm,date:dateStr});setShowCalendarBookPanel(true);}} style={{minHeight:'70px',padding:'6px',borderRadius:'8px',border:'1px solid '+(isToday?'#00d4aa':'#f3f4f6'),backgroundColor:isToday?'rgba(0,212,170,0.05)':'#fafafa',cursor:'pointer',transition:'background 0.1s'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f0f4f1')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor=isToday?'rgba(0,212,170,0.05)':'#fafafa')}>
                        <p style={{color:isToday?'#00d4aa':'#374151',fontSize:'12px',fontWeight:isToday?'800':'600',margin:'0 0 4px 0'}}>{d}</p>
                        {dayAppts.slice(0,2).map((a:any,i:number)=>(
                          <div key={i} style={{backgroundColor:'#ede9fe',borderRadius:'4px',padding:'2px 5px',marginBottom:'2px'}}>
                            <p style={{color:'#5b21b6',fontSize:'10px',fontWeight:'600',margin:0,overflow:'hidden',whiteSpace:'nowrap' as const,textOverflow:'ellipsis'}}>{a.business_name}</p>
                          </div>
                        ))}
                        {dayAppts.length>2&&<p style={{color:'#9ca3af',fontSize:'10px',margin:0}}>+{dayAppts.length-2} more</p>}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'24px'}}>
              <button onClick={()=>setShowCalendarBookPanel(!showCalendarBookPanel)} style={{backgroundColor:'#8b5cf6',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>+ Book a Demo</button>
            </div>

            {showCalendarBookPanel && (
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',border:'2px solid #8b5cf6'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
                  <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:0}}>Book a Demo</p>
                  <button onClick={()=>setShowCalendarBookPanel(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                  <div><label style={lbl}>Date *</label><input type="date" value={calendarBookForm.date} onChange={e=>setCalendarBookForm({...calendarBookForm,date:e.target.value})} style={{...inp,backgroundColor:'#fff'}}/></div>
                  <div><label style={lbl}>Time *</label><select value={calendarBookForm.time} onChange={e=>setCalendarBookForm({...calendarBookForm,time:e.target.value})} style={{...inp,backgroundColor:'#fff'}}>{['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM'].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label style={lbl}>Business Name *</label><input style={{...inp,backgroundColor:'#fff'}} placeholder="Business name" value={calendarBookForm.business_name} onChange={e=>setCalendarBookForm({...calendarBookForm,business_name:e.target.value})}/></div>
                  <div><label style={lbl}>Contact Name *</label><input style={{...inp,backgroundColor:'#fff'}} placeholder="Contact name" value={calendarBookForm.contact_name} onChange={e=>setCalendarBookForm({...calendarBookForm,contact_name:e.target.value})}/></div>
                  <div><label style={lbl}>Phone</label><input style={{...inp,backgroundColor:'#fff'}} placeholder="Phone number" value={calendarBookForm.phone} onChange={e=>setCalendarBookForm({...calendarBookForm,phone:e.target.value})}/></div>
                  <div><label style={lbl}>Email (for Meet invite)</label><input style={{...inp,backgroundColor:'#fff'}} placeholder="Email address" value={calendarBookForm.contact_email} onChange={e=>setCalendarBookForm({...calendarBookForm,contact_email:e.target.value})}/></div>
                  <div><label style={lbl}>Trade</label><select value={calendarBookForm.trade} onChange={e=>setCalendarBookForm({...calendarBookForm,trade:e.target.value})} style={{...inp,backgroundColor:'#fff'}}>{TRADE_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
                </div>
                <div style={{marginBottom:'16px'}}><label style={lbl}>Notes</label><textarea value={calendarBookForm.notes} onChange={e=>setCalendarBookForm({...calendarBookForm,notes:e.target.value})} placeholder="Anything useful for the call..." style={{width:'100%',minHeight:'70px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',resize:'vertical' as const,boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/></div>
                <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                  <button onClick={bookFromCalendar} disabled={calendarBookLoading||!calendarBookForm.date||!calendarBookForm.business_name||!calendarBookForm.contact_name} style={{backgroundColor:'#8b5cf6',color:'#fff',padding:'11px 28px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:calendarBookLoading||!calendarBookForm.date||!calendarBookForm.business_name||!calendarBookForm.contact_name?0.6:1}}>{calendarBookLoading?'Booking + Generating Meet Link...':'Book Demo'}</button>
                  <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>Meet link auto-generates on confirm</p>
                </div>
              </div>
            )}

            {setterAppts.filter((a:any)=>a.status==='Scheduled').length > 0 && (
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',borderLeft:'4px solid #8b5cf6'}}>
                <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase' as const,letterSpacing:'0.05em',margin:'0 0 16px 0'}}>Upcoming Demos ({setterAppts.filter((a:any)=>a.status==='Scheduled').length})</p>
                {setterAppts.filter((a:any)=>a.status==='Scheduled').sort((a:any,b:any)=>a.scheduled_date>b.scheduled_date?1:-1).map((appt:any)=>(
                  <div key={appt.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 0',borderBottom:'1px solid #f3f4f6'}}>
                    <div>
                      <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'0 0 3px 0'}}>{appt.business_name}</p>
                      <p style={{color:'#6b7280',fontSize:'12px',margin:'0 0 2px 0'}}>{appt.contact_name} · {appt.trade}</p>
                      <p style={{color:'#9ca3af',fontSize:'12px',margin:0}}>{appt.scheduled_date} at {appt.scheduled_time}</p>
                    </div>
                    <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                      {appt.calendar_sync_failed && (
                        <span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700'}}>⚠ No Invite Sent</span>
                      )}
                      {appt.meet_link && (
                        <a href={appt.meet_link} target="_blank" rel="noopener noreferrer" style={{backgroundColor:'#1a73e8',color:'#fff',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',textDecoration:'none',display:'inline-block'}}>Join Meet</a>
                      )}
                      <span style={{backgroundColor:'#ede9fe',color:'#5b21b6',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'600'}}>Scheduled</span>
                      <button onClick={()=>deleteAppointment(appt)} style={{backgroundColor:'#fee2e2',color:'#991b1b',padding:'6px 12px',borderRadius:'6px',fontSize:'11px',fontWeight:'700',cursor:'pointer',border:'none'}}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
              <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Generate Slots</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Days Out From Today</label>
                  <select value={genDays} onChange={e => setGenDays(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>
                    {[1,2,3,4,5,6,7].map(d => <option key={d} value={d} style={{ backgroundColor: '#0f2318' }}>{d} day{d > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Start Time</label>
                  <select value={genStartTime} onChange={e => setGenStartTime(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>
                    {['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM','9:30 PM','10:00 PM','10:30 PM','11:00 PM'].map(t => <option key={t} style={{ backgroundColor: '#0f2318' }}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>End Time</label>
                  <select value={genEndTime} onChange={e => setGenEndTime(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>
                    {['9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM','9:30 PM','10:00 PM','10:30 PM','11:00 PM'].map(t => <option key={t} style={{ backgroundColor: '#0f2318' }}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Slot Length</label>
                  <select value={genInterval} onChange={e => setGenInterval(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>
                    <option value={30} style={{ backgroundColor: '#0f2318' }}>30 minutes</option>
                    <option value={60} style={{ backgroundColor: '#0f2318' }}>60 minutes</option>
                    <option value={90} style={{ backgroundColor: '#0f2318' }}>90 minutes</option>
                  </select>
                </div>
              </div>
              <button onClick={generateSlots} disabled={generating}
                style={{ backgroundColor: '#00d4aa', color: '#000', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: generating ? 'not-allowed' : 'pointer', border: 'none', opacity: generating ? 0.7 : 1 }}>
                {generating ? 'Generating...' : ['Generate slots for next ', genDays, ' day', genDays > 1 ? 's' : ''].join('')}
              </button>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>All Slots ({availSlots.length})</p>
                {availSlots.filter((s: any) => !s.is_booked).length > 0 && (
                  <button onClick={clearAllOpenSlots} style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fca5a5' }}>
                    Clear All Open Slots ({availSlots.filter((s: any) => !s.is_booked).length})
                  </button>
                )}
              </div>
              {availSlots.length > 0 && <p style={{ color: '#9ca3af', fontSize: '12px', margin: '-8px 0 16px 0' }}>Click a slot to mark it busy or manage its demo. Shift-click a second slot to block everything in between.</p>}
              {availSlots.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No slots yet. Generate some above and your setter will see them immediately.</p>
              ) : (() => {
                const byDate = availSlots.reduce((acc: Record<string, any[]>, slot) => {
                  if (!acc[slot.date]) acc[slot.date] = [];
                  acc[slot.date].push(slot);
                  return acc;
                }, {});
                return Object.entries(byDate).map(([date, slots]) => (
                  <div key={date} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <p style={{ color: '#374151', fontSize: '13px', fontWeight: '700', margin: 0 }}>
                        {new Date(date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                      <button onClick={() => clearDate(date)}
                        style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#9ca3af', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
                        Clear day
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                      {(slots as any[]).map((slot: any) => {
                        const st = slotState(slot);
                        const appt = st === 'booked' ? apptForSlot(slot.id) : undefined;
                        const inRange = slotRangeIds.includes(slot.id);
                        const isOpenPopover = slotPopover?.slotId === slot.id;
                        const look = st === 'blocked'
                          ? { border: '2px dashed #d97706', bg: '#fffbeb', time: '#92400e' }
                          : st === 'booked'
                          ? { border: '2px solid #6b7280', bg: '#f3f4f6', time: '#065f46' }
                          : { border: '2px solid #00d4aa', bg: 'rgba(0,212,170,0.08)', time: '#374151' };
                        return (
                        <div key={slot.id} data-slot-id={slot.id} title={st === 'blocked' ? 'Busy' + (slot.blocked_note ? ': ' + slot.blocked_note : '') : undefined}
                          style={{ position: 'relative' as const, padding: '8px 14px', borderRadius: '8px', border: look.border, backgroundColor: look.bg, cursor: 'pointer', outline: inRange || isOpenPopover ? '2px solid #0f2318' : 'none', outlineOffset: '2px', userSelect: 'none' as const }}
                          onClick={e => onSlotClick(e, slot)}>
                          <p style={{ color: look.time, fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{slot.time_slot}</p>
                          {st === 'blocked' ? (
                            <div style={{ maxWidth: '140px' }}>
                              <p style={{ color: '#92400e', fontSize: '11px', fontWeight: '700', margin: 0 }}>Busy</p>
                              {slot.blocked_note && <p style={{ color: '#92400e', fontSize: '11px', margin: '1px 0 0 0', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{slot.blocked_note}</p>}
                            </div>
                          ) : st === 'booked' ? (
                            appt ? (<div><p style={{ color: '#065f46', fontSize: '11px', fontWeight: '700', margin: '0 0 1px 0' }}>{appt.business_name}</p><p style={{ color: '#065f46', fontSize: '11px', margin: '0 0 1px 0' }}>{appt.contact_name} · {appt.trade}</p><p style={{ color: '#065f46', fontSize: '10px', margin: 0 }}>{appt.phone}</p></div>) : <span style={{ color: '#065f46', fontSize: '11px', fontWeight: '600' }}>Booked</span>
                          ) : (
                            <div style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>Open</div>
                          )}
                          {isOpenPopover && (
                            <CalendarSlotPopover
                              key={slot.id + '|' + (slotPopover!.rangeFromId || '')}
                              slot={slot}
                              allSlots={availSlots}
                              rangeFromId={slotPopover!.rangeFromId}
                              apptForSlot={apptForSlot}
                              alignRight={slotPopover!.alignRight}
                              onRangeChange={setSlotRangeIds}
                              onClose={() => { setSlotPopover(null); setSlotRangeIds([]); }}
                              onDone={onSlotPopoverDone}
                              onOpenDetails={a => { setSlotPopover(null); setSlotRangeIds([]); setSelectedAppt(a); }}
                            />
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

{apptDeleteNotice && (
          <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 300, maxWidth: '560px', backgroundColor: apptDeleteNotice.kind === 'warning' ? '#fef3c7' : '#fee2e2', border: '1px solid ' + (apptDeleteNotice.kind === 'warning' ? '#f59e0b' : '#ef4444'), color: apptDeleteNotice.kind === 'warning' ? '#92400e' : '#991b1b', borderRadius: '10px', padding: '14px 20px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span>{'⚠ ' + apptDeleteNotice.text}</span>
            <button onClick={() => setApptDeleteNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}
{selectedAppt && (
          <div style={{ position: 'fixed', top: 0, right: 0, width: '420px', height: '100vh', backgroundColor: '#fff', boxShadow: '-4px 0 32px rgba(0,0,0,0.15)', zIndex: 200, padding: '32px 28px', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h2 style={{ color: '#0a1f13', fontSize: '18px', fontWeight: '800', margin: 0 }}>Appointment Detail</h2>
              <button onClick={() => { setSelectedAppt(null); setConfirmDeleteAppt(false); }} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Close</button>
            </div>
            <div style={{ backgroundColor: '#f0f4f1', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
              <p style={{ color: '#0a1f13', fontSize: '18px', fontWeight: '800', margin: '0 0 6px 0' }}>{selectedAppt.business_name}</p>
              <p style={{ color: '#374151', fontSize: '14px', margin: '0 0 2px 0' }}>{selectedAppt.contact_name}</p>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 2px 0' }}>{selectedAppt.trade}</p>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{selectedAppt.phone}</p>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Scheduled</p>
              <p style={{ color: '#0a1f13', fontSize: '15px', fontWeight: '700', margin: 0 }}>{selectedAppt.scheduled_date} at {selectedAppt.scheduled_time}</p>
            </div>
            {selectedAppt.calendar_sync_failed && (
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>⚠ No calendar invite sent</p>
                <p style={{ color: '#991b1b', fontSize: '13px', margin: 0 }}>The Google Calendar invite and Meet link failed to send after 2 attempts. The client has not been notified — create and send the invite manually.</p>
              </div>
            )}
            {selectedAppt.meet_link && (
              <div style={{ marginBottom: '16px' }}>
                <a href={selectedAppt.meet_link} target="_blank" rel="noopener noreferrer" style={{display:'block',backgroundColor:'#1a73e8',color:'#fff',padding:'13px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',textDecoration:'none',textAlign:'center' as const}}>Join Google Meet</a>
              </div>
            )}
            {selectedAppt.notes && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Notes from Setter</p>
                <p style={{ color: '#374151', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>{selectedAppt.notes}</p>
              </div>
            )}
            {selectedAppt.assigned_to && (
              <div style={{ backgroundColor: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                <p style={{ color: '#065f46', fontSize: '13px', fontWeight: '600', margin: 0 }}>
                  Assigned to {allReps.find((r: any) => r.id === selectedAppt.assigned_to)?.full_name || 'a rep'}
                </p>
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Assign To</p>
              <select value={assigningTo} onChange={e => setAssigningTo(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff', marginBottom: '8px', boxSizing: 'border-box' as const }}>
                <option value="">— Select rep —</option>
                {allReps.filter((r: any) => r.role === 'rep' || r.role === 'vp_sales').map((r: any) => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </select>
              <button onClick={() => assigningTo && reassignAppointment(selectedAppt.id, assigningTo)} disabled={!assigningTo}
                style={{ width: '100%', backgroundColor: '#0f2318', color: '#fff', padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: assigningTo ? 'pointer' : 'not-allowed', border: 'none', opacity: assigningTo ? 1 : 0.5, marginBottom: '8px', boxSizing: 'border-box' as const }}>
                Assign
              </button>
              <button onClick={() => reassignAppointment(selectedAppt.id, currentUserId)}
                style={{ width: '100%', backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: '1px solid #00d4aa', boxSizing: 'border-box' as const }}>
                Take This Call Myself
              </button>
            </div>
            {selectedAppt.status === 'Scheduled' && isPastAppointment(selectedAppt.scheduled_date, selectedAppt.scheduled_time) ? (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button onClick={() => markAdminAppointmentOutcome(selectedAppt.id, 'Showed')}
                  style={{ flex: 1, backgroundColor: '#d1fae5', color: '#065f46', padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: '1px solid #86efac', boxSizing: 'border-box' as const }}>
                  Mark Showed
                </button>
                <button onClick={() => markAdminAppointmentOutcome(selectedAppt.id, 'No Show')}
                  style={{ flex: 1, backgroundColor: '#fee2e2', color: '#991b1b', padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fca5a5', boxSizing: 'border-box' as const }}>
                  Mark No Show
                </button>
              </div>
            ) : selectedAppt.status !== 'Scheduled' ? (
              <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 14px', marginBottom: '10px', textAlign: 'center' as const }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0 }}>Outcome: {selectedAppt.status}</p>
              </div>
            ) : null}
            {ADMIN_UI_ROLES.includes(currentUserRole) && (
              confirmDeleteAppt ? (
                <div style={{ border: '1px solid #fca5a5', backgroundColor: '#fef2f2', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                  <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '700', margin: '0 0 10px 0' }}>Delete this appointment? This can't be undone.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => deleteAppointmentFully(selectedAppt.id)} disabled={deletingAppt}
                      style={{ flex: 1, backgroundColor: '#b91c1c', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: deletingAppt ? 'wait' : 'pointer', border: 'none', opacity: deletingAppt ? 0.6 : 1 }}>
                      {deletingAppt ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmDeleteAppt(false)} disabled={deletingAppt}
                      style={{ flex: 1, backgroundColor: '#fff', color: '#6b7280', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: '1px solid #e5e7eb' }}>
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteAppt(true)}
                  style={{ width: '100%', backgroundColor: 'transparent', color: '#b91c1c', padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', border: '1px solid #fca5a5', marginBottom: '10px', boxSizing: 'border-box' as const }}>
                  Delete appointment
                </button>
              )
            )}
            {selectedAppt.status === 'Scheduled' && (
              // Same flow as the Calendar popover: deletes the Google event first (no ghost events).
              <CancelDemo key={selectedAppt.id} wide appt={selectedAppt} phone={selectedAppt.contact_phone || selectedAppt.phone || ''}
                onDone={result => { setSelectedAppt(null); setConfirmDeleteAppt(false); onSlotPopoverDone(result); }} />
            )}
          </div>
        )}
        {/* ATTRIBUTION AUDIT TAB — paid deals from a setter-sourced client
            whose sale is missing or has drifted from that setter's own
            record. Should normally be empty; any row here means a broken
            tag is silently under-counting someone's progress. Read-only —
            fixing a row means correcting the underlying sale by hand and
            re-running the audit, not a bulk mutation from here. */}
        {tab==='attribution-audit'&&(
          <div>
            <div style={{marginBottom:'24px'}}>
              <h1 style={{color:'#0a1f13',fontSize:'24px',fontWeight:'800',margin:'0 0 4px 0'}}>Attribution Audit</h1>
              <p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>Paid deals from a setter-sourced client whose sale record is missing or doesn&apos;t match that setter&apos;s own attribution. Should be empty.</p>
            </div>
            {attributionAudit.length===0?(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'32px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',textAlign:'center' as const}}>
                <p style={{color:'#10b981',fontSize:'14px',fontWeight:'700',margin:0}}>✓ No attribution gaps found.</p>
              </div>
            ):(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'8px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                {attributionAudit.map(row=>(
                  <div key={row.sale_id} style={{padding:'16px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:'0 0 4px 0'}}>{row.business_name}</p>
                      <p style={{color:'#6b7280',fontSize:'12px',margin:0}}>{row.plan_slug} · ${row.plan_price.toLocaleString()} · sold {formatDate(row.sold_at)}</p>
                      <p style={{color:'#ef4444',fontSize:'12px',fontWeight:'600',margin:'4px 0 0 0'}}>
                        Client&apos;s setter on file: {repNames[row.client_booked_by_setter_id||'']||row.client_booked_by_setter_id||'—'} · Sale attribution: {row.sale_booked_by_setter_id?(repNames[row.sale_booked_by_setter_id]||row.sale_booked_by_setter_id):'MISSING'}
                      </p>
                    </div>
                    <span style={{backgroundColor:'#fee2e2',color:'#991b1b',fontSize:'11px',padding:'4px 10px',borderRadius:'20px',fontWeight:'700'}}>Needs review</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* JOB PROSPECTS TAB */}
        {tab==='overflow'&&<OverflowEarlyAccess />}
        {tab==='job-prospects'&&(
          <>
            {jobProspectView==='list'&&(
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'28px'}}>
                  <div><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Job Prospects</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{jobProspects.length+' applicant'+(jobProspects.length===1?'':'s')+' — hiring pipeline, separate from sales prospects'}</p></div>
                  <button onClick={()=>{setJobProspectForm(EMPTY_JOB_PROSPECT_FORM);setJobProspectView('add');}} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>+ Add Job Prospect</button>
                </div>
                <div style={{display:'flex',gap:'12px',marginBottom:'20px'}}>
                  <input style={{...inp,backgroundColor:'#fff',flex:1}} placeholder="Search by name, position, or email..." value={jobProspectSearchQuery} onChange={e=>setJobProspectSearchQuery(e.target.value)}/>
                  <select value={jobProspectStatusFilter} onChange={e=>setJobProspectStatusFilter(e.target.value)} style={{padding:'10px 14px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',backgroundColor:'#fff',outline:'none',cursor:'pointer',fontFamily:'Inter, sans-serif',minWidth:'200px'}}>
                    <option value="All">All Statuses</option>
                    {JOB_STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1fr 1.2fr 1.2fr',padding:'14px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                    {['Name','Position','Source','Applied','Status'].map(col=><p key={col} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>)}
                  </div>
                  {(() => {
                    const q=jobProspectSearchQuery.toLowerCase();
                    const filtered=jobProspects.filter(j=>((j.full_name||'').toLowerCase().includes(q)||(j.position||'').toLowerCase().includes(q)||(j.email||'').toLowerCase().includes(q))&&(jobProspectStatusFilter==='All'||j.status===jobProspectStatusFilter));
                    if (filtered.length===0) return <p style={{color:'#9ca3af',fontSize:'14px',padding:'48px',textAlign:'center'}}>{jobProspects.length===0?'No job prospects yet.':'No results for that filter.'}</p>;
                    return filtered.map(j=>(
                      <div key={j.id} onClick={()=>openJobProspectDetail(j)} style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1fr 1.2fr 1.2fr',padding:'15px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                        <div><p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:0}}>{j.full_name}</p>{j.location&&<p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{j.location}</p>}</div>
                        <p style={{color:'#374151',fontSize:'13px',margin:0}}>{j.position||'-'}</p>
                        <p style={{color:'#374151',fontSize:'13px',margin:0}}>{j.application_source||'-'}</p>
                        <p style={{color:'#374151',fontSize:'13px',margin:0}}>{j.application_date||'-'}</p>
                        <span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{j.status}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
            {jobProspectView==='add'&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'32px'}}>
                  <button onClick={()=>setJobProspectView('list')} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div><h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 2px 0'}}>Add Job Prospect</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>New applicant — hiring pipeline</p></div>
                </div>
                <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'28px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',maxWidth:'640px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                    <div><label style={lbl}>Full Name *</label><input style={inp} value={jobProspectForm.full_name} onChange={e=>setJobProspectForm({...jobProspectForm,full_name:e.target.value})}/></div>
                    <div><label style={lbl}>Position Applied For</label><input style={inp} value={jobProspectForm.position} onChange={e=>setJobProspectForm({...jobProspectForm,position:e.target.value})}/></div>
                    <div><label style={lbl}>Email</label><input style={inp} value={jobProspectForm.email} onChange={e=>setJobProspectForm({...jobProspectForm,email:e.target.value})}/></div>
                    <div><label style={lbl}>Phone</label><input style={inp} value={jobProspectForm.phone} onChange={e=>setJobProspectForm({...jobProspectForm,phone:e.target.value})}/></div>
                    <div><label style={lbl}>Location</label><input style={inp} value={jobProspectForm.location} onChange={e=>setJobProspectForm({...jobProspectForm,location:e.target.value})}/></div>
                    <div><label style={lbl}>Application Source</label><input style={inp} placeholder="e.g. LinkedIn" value={jobProspectForm.application_source} onChange={e=>setJobProspectForm({...jobProspectForm,application_source:e.target.value})}/></div>
                    <div><label style={lbl}>LinkedIn / Profile URL</label><input style={inp} value={jobProspectForm.profile_url} onChange={e=>setJobProspectForm({...jobProspectForm,profile_url:e.target.value})}/></div>
                    <div><label style={lbl}>Resume URL / Reference</label><input style={inp} value={jobProspectForm.resume_url} onChange={e=>setJobProspectForm({...jobProspectForm,resume_url:e.target.value})}/></div>
                  </div>
                  <div style={{marginBottom:'20px'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:'80px',resize:'vertical' as const}} value={jobProspectForm.notes} onChange={e=>setJobProspectForm({...jobProspectForm,notes:e.target.value})}/></div>
                  <div style={{display:'flex',gap:'10px'}}>
                    <button onClick={submitJobProspect} disabled={jobProspectSaving||!jobProspectForm.full_name} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:(jobProspectSaving||!jobProspectForm.full_name)?0.6:1}}>{jobProspectSaving?'Saving...':'Add Job Prospect'}</button>
                    <button onClick={()=>setJobProspectView('list')} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {jobProspectView==='detail'&&selectedJobProspect&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'28px'}}>
                  <button onClick={()=>{setJobProspectView('list');setSelectedJobProspect(null);setEditingJobProspect(false);setShowScheduleInterviewPanel(false);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',cursor:'pointer',fontWeight:'500'}}>Back</button>
                  <div style={{flex:1}}><h1 style={{color:'#0a1f13',fontSize:'26px',fontWeight:'800',margin:'0 0 2px 0'}}>{selectedJobProspect.full_name}</h1><p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{[selectedJobProspect.position,selectedJobProspect.location].filter(Boolean).join(' / ')}</p></div>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap' as const}}>
                    <button onClick={()=>setShowScheduleInterviewPanel(!showScheduleInterviewPanel)} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#8b5cf6',color:'#fff'}}>📅 Schedule Interview</button>
                    <button onClick={openJobProspectEdit} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#0f2318',color:'#00d4aa'}}>✎ Edit</button>
                    <select value={selectedJobProspect.status} onChange={e=>updateJobProspectStatus(selectedJobProspect.id,e.target.value)} style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',backgroundColor:'#fff',fontWeight:'600',cursor:'pointer',outline:'none'}}>
                      {JOB_STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
                    </select>
                    <button onClick={()=>setJobProspectToDelete({id:selectedJobProspect.id,name:selectedJobProspect.full_name})} style={{padding:'7px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none',backgroundColor:'#fee2e2',color:'#991b1b'}}>Delete</button>
                  </div>
                </div>

                {showScheduleInterviewPanel&&(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px',border:'1px solid #ede9fe'}}>
                    <p style={{color:'#0a1f13',fontSize:'15px',fontWeight:'700',margin:'0 0 16px 0'}}>Schedule Interview</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                      <div><label style={lbl}>Date</label><input type="date" style={inp} value={interviewDate} onChange={e=>setInterviewDate(e.target.value)}/></div>
                      <div><label style={lbl}>Time</label><input style={inp} placeholder="10:00 AM" value={interviewTime} onChange={e=>setInterviewTime(e.target.value)}/></div>
                      <div><label style={lbl}>Interviewer</label><input style={inp} value={interviewer} onChange={e=>setInterviewer(e.target.value)}/></div>
                    </div>
                    <p style={{color:'#9ca3af',fontSize:'12px',margin:'0 0 16px 0'}}>Creates a Google Calendar event + Meet link on the demos calendar and emails the candidate the invite, same as a sales demo booking.</p>
                    <div style={{display:'flex',gap:'10px'}}>
                      <button onClick={scheduleInterview} disabled={interviewLoading||!interviewDate||!interviewTime} style={{backgroundColor:'#8b5cf6',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:(interviewLoading||!interviewDate||!interviewTime)?0.6:1}}>{interviewLoading?'Scheduling...':'Confirm & Create Meet Link'}</button>
                      <button onClick={()=>setShowScheduleInterviewPanel(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}

                {editingJobProspect?(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'28px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',maxWidth:'640px',marginBottom:'24px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                      <div><label style={lbl}>Full Name</label><input style={inp} value={jobProspectEditForm.full_name} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,full_name:e.target.value})}/></div>
                      <div><label style={lbl}>Position Applied For</label><input style={inp} value={jobProspectEditForm.position} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,position:e.target.value})}/></div>
                      <div><label style={lbl}>Email</label><input style={inp} value={jobProspectEditForm.email} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,email:e.target.value})}/></div>
                      <div><label style={lbl}>Phone</label><input style={inp} value={jobProspectEditForm.phone} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,phone:e.target.value})}/></div>
                      <div><label style={lbl}>Location</label><input style={inp} value={jobProspectEditForm.location} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,location:e.target.value})}/></div>
                      <div><label style={lbl}>Application Source</label><input style={inp} value={jobProspectEditForm.application_source} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,application_source:e.target.value})}/></div>
                      <div><label style={lbl}>LinkedIn / Profile URL</label><input style={inp} value={jobProspectEditForm.profile_url} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,profile_url:e.target.value})}/></div>
                      <div><label style={lbl}>Resume URL / Reference</label><input style={inp} value={jobProspectEditForm.resume_url} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,resume_url:e.target.value})}/></div>
                    </div>
                    <div style={{marginBottom:'20px'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:'80px',resize:'vertical' as const}} value={jobProspectEditForm.notes} onChange={e=>setJobProspectEditForm({...jobProspectEditForm,notes:e.target.value})}/></div>
                    <div style={{display:'flex',gap:'10px'}}>
                      <button onClick={saveJobProspectEdit} disabled={actionLoading} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Saving...':'Save Changes'}</button>
                      <button onClick={()=>setEditingJobProspect(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'28px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:'24px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'20px',marginBottom:'20px'}}>
                      <div><p style={lbl}>Email</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.email||'-'}</p></div>
                      <div><p style={lbl}>Phone</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.phone||'-'}</p></div>
                      <div><p style={lbl}>Location</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.location||'-'}</p></div>
                      <div><p style={lbl}>Application Source</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.application_source||'-'}</p></div>
                      <div><p style={lbl}>LinkedIn / Profile</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0,wordBreak:'break-all' as const}}>{selectedJobProspect.profile_url?<a href={selectedJobProspect.profile_url} target="_blank" rel="noreferrer" style={{color:'#00d4aa'}}>{selectedJobProspect.profile_url}</a>:'-'}</p></div>
                      <div><p style={lbl}>Resume</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0,wordBreak:'break-all' as const}}>{selectedJobProspect.resume_url?<a href={selectedJobProspect.resume_url} target="_blank" rel="noreferrer" style={{color:'#00d4aa'}}>View Resume</a>:'-'}</p></div>
                      <div><p style={lbl}>Application Date</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.application_date||'-'}</p></div>
                    </div>
                    {selectedJobProspect.notes&&(<div><p style={lbl}>Notes</p><p style={{color:'#374151',fontSize:'14px',margin:0,whiteSpace:'pre-wrap' as const}}>{selectedJobProspect.notes}</p></div>)}
                  </div>
                )}

                {(selectedJobProspect.interview_date||selectedJobProspect.meet_link)&&(
                  <div style={{backgroundColor:'#f5f3ff',borderRadius:'14px',padding:'24px',border:'1px solid #ede9fe'}}>
                    <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',margin:'0 0 16px 0',textTransform:'uppercase',letterSpacing:'0.05em'}}>Interview</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'20px'}}>
                      <div><p style={lbl}>Date & Time</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.interview_date||'-'}{selectedJobProspect.interview_time?' at '+selectedJobProspect.interview_time:''}</p></div>
                      <div><p style={lbl}>Interviewer</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0}}>{selectedJobProspect.interviewer||'-'}</p></div>
                      <div><p style={lbl}>Meet Link</p><p style={{color:'#0a1f13',fontSize:'14px',margin:0,wordBreak:'break-all' as const}}>{selectedJobProspect.meet_link?<a href={selectedJobProspect.meet_link} target="_blank" rel="noreferrer" style={{color:'#00d4aa'}}>Join Meet</a>:'Not generated'}</p></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {/* RESOURCES TAB */}
        {tab === 'resources' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Resources</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Everything you need to sell Setera, send the right documents, collect payment, submit clients, and follow the process without guessing.</p>
            </div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px' }}>💡</span>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0, fontWeight: '500' }}>If Alex is asleep, busy, driving, in a meeting, or unavailable — this page should help you do the next right thing.</p>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>The Setera Rep Path</p>
              <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '24px' }}>
                <p style={{ color: '#fff', fontSize: '15px', fontWeight: '700', margin: '0 0 4px 0' }}>Five things every rep needs to know.</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '0 0 20px 0' }}>Each stage below names the section and card where you will find it on this page. Before your first call, complete all five stages.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {SETERA_REP_PATH_STAGES.map((s, i) => (
                    <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 6px 0' }}>{s.num}</p>
                      <p style={{ color: '#fff', fontSize: '12px', fontWeight: '700', margin: '0 0 5px 0' }}>{s.title}</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0, lineHeight: '1.5' }}>{s.desc}</p>
                    </div>
                  ))}
                </div>
                <div style={{ backgroundColor: 'rgba(0,212,170,0.1)', borderRadius: '8px', padding: '12px 16px', border: '1px solid rgba(0,212,170,0.2)' }}>
                  <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 2px 0' }}>The standard does not lower. The rep rises.</p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: 0 }}>After every call — closed or not — identify which phase broke down. Come back to it. Run the next call better.</p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>Quick Start</p>
              <RCard title="Quick Start Guide" badge="Rep Only" description="Start here. The essentials every rep needs before their first call." buttonLabel="Start Here" defaultOpen={true}>
                <div>
                  {['Read the Setera Product Guide.','Read The Setera Method.','Read What Not To Promise.','Know the demo flow.','Know where payment links are.','Know how to submit a new client.','Know how to report a problem.','Know how to submit a cancellation.','Do not guess.','If urgent, text Alex too.'].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#00d4aa', fontWeight: '800', fontSize: '13px', flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ color: '#374151', fontSize: '13px', lineHeight: '1.5' }}>{item}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px', backgroundColor: '#0f2318', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Default Safe Answer</p>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0, lineHeight: '1.5', fontStyle: 'italic' }}>That is a good question. I do not want to guess and give you the wrong answer. I will confirm with Alex and get back to you.</p>
                    </div>
                    <CopyButton text="That is a good question. I do not want to guess and give you the wrong answer. I will confirm with Alex and get back to you." />
                  </div>
                </div>
              </RCard>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>Sales Training</p>

              <RCard title="The Setera Method" badge="Rep Only" description="The complete sales framework. Emotion Over Logic — a psychographic approach to the contractor sale. Read this before every call until it becomes natural." buttonLabel="Open Framework">
                <div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 10px 0' }}>Read This First</p>
                    <p style={{ color: '#fff', fontSize: '15px', fontWeight: '700', margin: '0 0 8px 0' }}>This is not a beginner script. This is the Setera standard.</p>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px 0' }}>You are not here to memorize lines, repeat features, or sound like a salesperson. You are here to learn how to think, diagnose, and lead a contractor through a decision they may already know they need to make.</p>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px 0' }}>Setera is not sold by explaining software. Setera is sold by understanding the contractor in front of you — what they are trying to build, what they are afraid of losing, what keeps slipping through their business, and what level they are trying to operate at next.</p>
                    {['When we say funding, we say funding on purpose.','When we diagnose before we demo, we do that on purpose.','When we let the contractor build their own loss number, we do that on purpose.','When we close on identity instead of features, we do that on purpose.'].map((line, i) => (
                      <p key={i} style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '600', margin: '0 0 4px 0' }}>{line}</p>
                    ))}
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', lineHeight: '1.7', margin: '10px 0 0 0' }}>This method is not meant to be performed like a script. It is meant to train your lens. If you only memorize the words, you will sound fake. If you understand the psychology, the conversation becomes natural.</p>
                    <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '14px' }}>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '0 0 4px 0' }}>Setera reps are not order takers. They are not feature sellers. They are not chasing contractors hoping someone says yes.</p>
                      <p style={{ color: '#fff', fontSize: '13px', fontWeight: '700', margin: 0 }}>Setera reps are diagnostic closers.</p>
                    </div>
                  </div>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>The Value Level Diagnostic</p>
                  <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6', margin: '0 0 12px 0' }}>Everyone in business operates at one of four levels. Identify where the contractor is in the first two minutes and you know exactly how to anchor the conversation. Most contractors are stuck at Level 1. Setera moves them to Level 4.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    {SETERA_VALUE_LEVELS.map((level, i) => (
                      <div key={i} style={{ backgroundColor: level.active ? 'rgba(0,212,170,0.07)' : '#f9fafb', borderRadius: '8px', padding: '12px', border: '1px solid ' + (level.active ? 'rgba(0,212,170,0.3)' : '#e5e7eb') }}>
                        <p style={{ color: level.active ? '#00d4aa' : '#9ca3af', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 4px 0' }}>{level.level}</p>
                        <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>{level.name}</p>
                        <p style={{ color: '#6b7280', fontSize: '11px', margin: 0, lineHeight: '1.5' }}>{level.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', borderLeft: '3px solid #00d4aa' }}>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>"Right now you are doing $20 an hour work — answering calls, chasing voicemails — and it is costing you $2,000 jobs. Setera handles the implementation so you can operate at a higher level."</p>
                  </div>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>The Psychographic Read</p>
                  <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6', margin: '0 0 10px 0' }}>Before every call, answer these three questions. Demographics tell you what a business looks like. Psychographics tell you what drives the person running it.</p>
                  {[
                    { q: 'What is their identity?', a: 'Grinder doing everything themselves? Growth-focused owner trying to scale? Burned by tech before? Read their Google reviews, website, and how they answered when you called.' },
                    { q: 'What do they fear most?', a: 'Losing jobs to competitors. Looking unprofessional. Wasting money. Giving up control. Identify the fear early and you know exactly where to anchor.' },
                    { q: 'What legacy are they building?', a: 'Something to hand to their kids. The biggest name in their city. Freedom from the 80-hour grind. The answer changes how you close.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 3px 0' }}>{item.q}</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{item.a}</p>
                    </div>
                  ))}

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '20px 0 4px 0' }}>The Opening</p>
                  <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6', margin: '0 0 8px 0' }}>No "how is your day going." No "thanks so much for taking the time." Thanking someone for showing up to a call they booked positions you as the person who needed the meeting — not the person who can help them.</p>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', borderLeft: '3px solid #00d4aa' }}>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>"Hey [First Name] — looks like you booked today about possibly getting some help with capturing missed calls, so you could stop losing jobs to voicemail, or even worse, just nothing. But we are here today to start closing more of the work that is already coming to you."</p>
                  </div>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>The 7 Phases</p>
                  {SETERA_METHOD_PHASES.map((phase, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '12px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none', userSelect: 'none' as const }}>
                        <span style={{ color: '#00d4aa', fontWeight: '700', fontSize: '11px', backgroundColor: 'rgba(0,212,170,0.1)', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{phase.num}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0a1f13', flex: 1 }}>{phase.name}</span>
                        <span style={{ color: '#9ca3af', fontSize: '11px' }}>{phase.tag}</span>
                      </summary>
                      <div style={{ padding: '14px 16px', backgroundColor: '#fff' }}>
                        <p style={{ color: '#374151', fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px 0' }}>{phase.content}</p>
                        {phase.quote && (
                          <div style={{ backgroundColor: '#f9fafb', borderLeft: '2px solid #d1d5db', padding: '8px 12px', marginBottom: '10px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{phase.quote}</div>
                        )}
                        {phase.bullets.length > 0 && (
                          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px 0' }}>
                            {phase.bullets.map((bullet, j) => (
                              <li key={j} style={{ padding: '5px 0 5px 16px', position: 'relative', fontSize: '13px', fontStyle: 'italic', color: '#374151', borderBottom: '1px solid #f3f4f6', lineHeight: '1.5' }}>
                                <span style={{ position: 'absolute', left: 0, top: '12px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'block' }} />
                                {bullet}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div style={{ backgroundColor: 'rgba(0,212,170,0.07)', borderLeft: '2px solid #00d4aa', padding: '8px 12px', fontSize: '12px', color: '#374151', lineHeight: '1.6' }}>{phase.tip}</div>
                      </div>
                    </details>
                  ))}

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '20px 0 8px 0' }}>The Funding Conversation</p>
                  <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6', margin: '0 0 8px 0' }}>Never say cost, price, or fee. The word is funding. Businesses get funded to grow. When you say "the funding you will need" — the contractor hears growth, not expense.</p>
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
                    <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 6px 0' }}>The math behind the number</p>
                    <p style={{ color: '#374151', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>A contractor missing just 5 calls a day is missing 150 calls a month. At an 8% close rate — which is conservative — that is 12 jobs a month. At an average profit of $3,000 per job, that is $36,000 a month walking out the door. Over 12 months that is $432,000 a year. Not because the leads were not there. Because nobody picked up.</p>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6', margin: '0 0 8px 0' }}>Lead high. Anchor against the annual pain, not the monthly price. If the calculator showed serious monthly loss, $26,964 a year — Starter, annualized — reframes itself. Three-month if they are more cautious. Never lead with monthly.</p>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', borderLeft: '3px solid #00d4aa' }}>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>"So based on what you have shared — you are losing roughly $7,500 a month in calls that never get answered. Over your busy season that is north of $60,000 that is already gone. The investment to make sure that does not happen again is $26,964 for the year, so we can get Emily answering every call, capturing every lead, and building you a pipeline you can actually see and choose from. Any questions on that? On the funding you need?"</p>
                  </div>
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '600', margin: 0 }}>Then say nothing. Wait. The rep who flinches on the number trains the prospect to flinch too. Your certainty on the funding is part of the close.</p>
                  </div>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 8px 0' }}>The Guarantee</p>
                  <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: '1.6', margin: '0 0 8px 0' }}>When they ask what the guarantee is — do not deflect and do not oversell. Meet them exactly where they are.</p>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', borderLeft: '3px solid #00d4aa' }}>
                    <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 8px 0', fontStyle: 'italic' }}>"I can promise you this — if you do not do anything, it is not that nothing changes. Things get worse. Nothing ever stays the same. Your competitors are answering calls right now."</p>
                    <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 8px 0', fontStyle: 'italic' }}>"So the question really becomes — where do you want to be a year from now? And do you believe, knowing what you know now, that this could help get you there?"</p>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>"Because imagine for a second that you actually captured all of those calls. Not some of them — all of them. And imagine you could see every one of them before you called back — the big job, the urgent job, the one that turns into five more. What would that do for your business? What would that do for you personally, if you just had the opportunity to capture that call?"</p>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 20px 0' }}>Stop talking. The answer they give you is the close. They are describing their own future out loud. And once someone owns their future out loud, they own the decision.</p>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Objection Handling</p>
                  <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 10px 0' }}>Never defend, always redirect. Answer every objection with a question that makes them solve it themselves.</p>
                  {SETERA_METHOD_OBJECTIONS.map((obj, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '11px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#374151', listStyle: 'none', userSelect: 'none' as const }}>
                        "{obj.obj}"
                      </summary>
                      <div style={{ padding: '12px 16px', backgroundColor: '#fff' }}>
                        <div style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '8px 12px', marginBottom: '8px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{obj.response}</div>
                        <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>{obj.note}</p>
                      </div>
                    </details>
                  ))}

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '20px 0 10px 0' }}>The Principles</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {SETERA_METHOD_PRINCIPLES.map((p, i) => (
                      <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderTop: '2px solid #00d4aa', borderRadius: '8px', padding: '12px 14px' }}>
                        <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 4px 0' }}>{p.title}</p>
                        <p style={{ color: '#6b7280', fontSize: '12px', margin: 0, lineHeight: '1.6' }}>{p.body}</p>
                      </div>
                    ))}
                  </div>

                  <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px 20px', textAlign: 'center' as const }}>
                    <p style={{ color: 'rgba(0,212,170,0.7)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 6px 0' }}>The One Truth</p>
                    <p style={{ color: '#fff', fontSize: '16px', fontWeight: '700', margin: 0 }}>Everyone else sold them software. We sell them continuity.</p>
                  </div>
                </div>
              </RCard>

              <RCard title="The Front Door Bridge" badge="Rep Only" description="Get from a cold opening into a genuine business conversation. Context → Observation → Curiosity → Transition — a structure, not a script." buttonLabel="Open">
                <MarkdownResource markdown={FRONT_DOOR_BRIDGE_MD} />
              </RCard>

              <RCard title="Ask About the Change" badge="Rep Only" description="Ask about the change, not just the current state. How to turn the Setera Method into a real conversation — current states give you facts, transitions give you stories." buttonLabel="Open">
                <MarkdownResource markdown={ASK_ABOUT_THE_CHANGE_MD} />
              </RCard>

              <RCard title="Setera Overflow Network" badge="Rep Only" description="What to do when a prospect isn't ready for Emily — the second way a 'no' becomes a Setera relationship." buttonLabel="Open">
                <div>
                  {OVERFLOW_NETWORK_SECTIONS.map((section, i) => (
                    <details key={i} style={{ marginBottom: '4px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                      <summary style={{ padding: '10px 14px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#0a1f13', listStyle: 'none', userSelect: 'none' as const }}>{section.title}</summary>
                      <div style={{ padding: '12px 14px', backgroundColor: '#fff' }}>
                        {section.body.map((p, j) => (
                          <p key={j} style={{ color: '#374151', fontSize: '13px', lineHeight: '1.6', margin: j === section.body.length - 1 ? 0 : '0 0 8px 0' }}>{p}</p>
                        ))}
                      </div>
                    </details>
                  ))}
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px', marginTop: '10px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Never guarantee Overflow volume, jobs, or revenue. Never call these "free leads." If you're unsure whether a business should be considered, bring Alex in — Setera makes the final approval decision on who enters the network.</p>
                  </div>
                </div>
              </RCard>

              <RCard title="Demo Flow" badge="Rep Only" description="Two-call close. Call 1 sparks intrigue and books the meeting. Call 2 is the demo and decision. Goal is a clear yes or a clear no." buttonLabel="View Demo Flow">
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ backgroundColor: '#f0f4f1', borderRadius: '10px', padding: '16px' }}>
                      <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Call 1 — Spark</p>
                      <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 10px 0', lineHeight: '1.5' }}>Do not try to sell everything. Spark intrigue. Book the meeting.</p>
                      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '10px 12px' }}>
                        <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 6px 0', fontStyle: 'italic' }}>You spend money to make the phone ring. What happens when nobody answers?</p>
                        <p style={{ color: '#374151', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>Worth taking 15 minutes so I can show you what this looks like live?</p>
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px' }}>
                      <p style={{ color: '#00d4aa', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Call 2 — Demo and Decision</p>
                      <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', margin: '0 0 8px 0' }}>Zoom, Google Meet, or in person. Walk through:</p>
                      {['The opening — results-based, no pleasantries','Diagnostic questions — situation map, awareness shift','The calculator at heysetera.com — let them build their number','Emily live — let her run 60 to 90 seconds, do not narrate','The dashboard — "let me show you where that call shows up"','Walk through the client view lightly — lead, transcript, urgency, callback info','Cherry-pick reframe — you are choosing, not reacting','The funding conversation — annual first, calm and certain','The guarantee — cost of inaction','The identity close'].map((item, i) => (
                        <p key={i} style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', margin: '2px 0' }}>{'- ' + item}</p>
                      ))}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>Demo sequence inside the call</p>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Pull up Emily and let her run for 60 to 90 seconds. Do not talk over her. After she finishes, say: "Okay — so after a call like that has been made to your business, let me show you where it shows up." Then switch to the demo account and walk through the dashboard lightly. You are not onboarding them — you are showing them the experience. Then say: "You do not have to call everyone back in the order they came in. You see what is waiting. That big job — you see that first. You are not reacting anymore. You are choosing."</p>
                  </div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Discovery Questions</p>
                  {['How many calls do you think you miss in a day?','What is an average job worth to you?','What happens after hours?','Who answers when your team is busy?','Do missed calls go to voicemail, or does someone call them back right away?','Do you know how many calls you missed last month?','If your call volume increased by 30% next month, would your business be set up to handle it?'].map((q, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ backgroundColor: '#0f2318', color: '#00d4aa', fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>{'Q' + (i + 1)}</span>
                      <p style={{ color: '#374151', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>{q}</p>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px', backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>10 No Rule</p>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Work toward getting 10 clear no answers in a row. If you get a yes on the 9th contact, restart the count. A rep who chases the no finds the yes faster.</p>
                  </div>
                </div>
              </RCard>

              <RCard title="The Setera Cold Call" badge="Rep Only" description="Diagnose the phone problem or pivot to Overflow. Either road leads to the demo." buttonLabel="Open Cold Call">
                <div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 10px 0' }}>The Goal</p>
                    <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', lineHeight: '1.7', margin: '0 0 14px 0' }}>{COLD_CALL_OVERVIEW.goal}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      {COLD_CALL_OVERVIEW.twoRoads.map((road, i) => (
                        <div key={i} style={{ backgroundColor: 'rgba(0,212,170,0.08)', borderRadius: '8px', padding: '10px 12px' }}>
                          <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>{road.label}</p>
                          {road.steps.map((s, j) => (
                            <p key={j} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', margin: '0 0 3px 0' }}>{'→ ' + s}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>{COLD_CALL_OVERVIEW.twoRoadsNote}</p>
                  </div>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>The 7 Steps</p>

                  {COLD_CALL_STEPS.map((item, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '12px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none', userSelect: 'none' as const }}>
                        <span style={{ color: '#00d4aa', fontWeight: '700', fontSize: '11px', backgroundColor: 'rgba(0,212,170,0.1)', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{item.phase}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0a1f13', flex: 1 }}>{item.title}</span>
                      </summary>
                      <div style={{ padding: '14px 16px', backgroundColor: '#fff' }}>
                        <div style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '10px 14px', marginBottom: '10px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.7' }}>{item.script}</div>
                        {item.note && <p style={{ color: '#6b7280', fontSize: '13px', margin: item.guardrails ? '0 0 14px 0' : 0, lineHeight: '1.6' }}>{item.note}</p>}
                        {item.guardrails && (
                          <div>
                            <div style={{ backgroundColor: '#0f2318', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
                              <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 8px 0' }}>Proof Point</p>
                              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>{item.guardrails.proofPoint}</p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px 12px' }}>
                                <p style={{ color: '#065f46', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Say This</p>
                                {item.guardrails.doSay.map((line, j) => (
                                  <p key={j} style={{ color: '#065f46', fontSize: '12px', margin: '0 0 5px 0', lineHeight: '1.5' }}>{'— ' + line}</p>
                                ))}
                              </div>
                              <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '10px 12px' }}>
                                <p style={{ color: '#991b1b', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Never Say</p>
                                {item.guardrails.neverSay.map((line, j) => (
                                  <p key={j} style={{ color: '#991b1b', fontSize: '12px', margin: '0 0 5px 0', lineHeight: '1.5' }}>{'— ' + line}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}

                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '14px 16px', marginTop: '10px' }}>
                    <p style={{ color: '#92400e', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Remember</p>
                    {COLD_CALL_OVERVIEW.reminders.map((r, i) => (
                      <p key={i} style={{ color: '#92400e', fontSize: '13px', margin: '0 0 4px 0', lineHeight: '1.5' }}>{'— ' + r}</p>
                    ))}
                  </div>
                </div>
              </RCard>

              <RCard title="Objection Handling" badge="Rep Only" description="The most common pushbacks and exactly what to say. Learn these cold." buttonLabel="Open">
                <div>
                  {COLD_CALL_OBJECTIONS.map((item, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '11px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#374151', listStyle: 'none', userSelect: 'none' as const }}>{item.obj}</summary>
                      <div style={{ padding: '12px 16px', backgroundColor: '#fff' }}>
                        <div style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '8px 12px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{item.resp}</div>
                      </div>
                    </details>
                  ))}
                </div>
              </RCard>

              <RCard title="Voicemail Script" badge="Rep Only" description="Short, curious, no company name. Leave it and move on." buttonLabel="Open">
                <div>
                  <div style={{ backgroundColor: '#f0f4f1', borderLeft: '3px solid #00d4aa', padding: '14px 16px', marginBottom: '12px', fontStyle: 'italic', fontSize: '14px', color: '#374151', lineHeight: '1.7' }}>
                    {COLD_CALL_VOICEMAIL_SCRIPT.script}
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{COLD_CALL_VOICEMAIL_SCRIPT.note}</p>
                </div>
              </RCard>

              <RCard title="Before You Dial" badge="Rep Only" description="State before strategy. Two things have to be true before the first number is dialed." buttonLabel="Open">
                <div>
                  <p style={{ color: '#374151', fontSize: '13px', lineHeight: '1.7', margin: '0 0 12px 0' }}>Two things have to be true before the first number is dialed. If either is missing, hang up and reset.</p>
                  {[
                    { title: 'State', body: 'Your emotional state travels through the phone before a single word registers. Stand up. Shoulders back. Smile — not because it is cute, because it physically changes your vocal tone. You are not calling to ask for anything. You are calling because you know something this contractor does not, and that knowledge is worth money to them. Call from that place.' },
                    { title: 'No need', body: 'You are okay if this call goes nowhere. There are 50 contractors in this city losing jobs to missed calls right now. This one is one of them. If they do not want to know about it, someone else will. The rep who needs the meeting sounds like they need the meeting. The rep who does not — sounds like the person worth talking to.' },
                    { title: '30 seconds of prep', body: 'Before you dial, know their trade, their city, and one thing about their business. That is it. You are not writing a thesis. You just need enough to sound like a human being who did their homework.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 3px 0' }}>{item.title}</p>
                      <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>{item.body}</p>
                    </div>
                  ))}
                </div>
              </RCard>

              <RCard title="Pre-Meeting Confirmation & Post-Call" badge="Rep Only" description="Night before, morning of, and what to do based on how the call went." buttonLabel="Open">
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Pre-Meeting Confirmation</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '16px', border: '1px solid #e5e7eb' }}>
                      <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Night Before</p>
                      <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 10px 0', lineHeight: '1.6', fontStyle: 'italic' }}>"Hey [First Name] — just wanted to reach out the night before our call tomorrow. Spoke with a [trade] company in [their area] recently in a very similar position — phones going unanswered during peak season, crew out in the field, and 85% of those callers never leaving a message, never calling back, just gone. What they found after getting set up changed how they look at every single call. Looking forward to showing you the same thing tomorrow at [time]."</p>
                      <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>Send as a voice note if you have their number. Personal always outperforms text.</p>
                    </div>
                    <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px' }}>
                      <p style={{ color: '#00d4aa', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Morning Of</p>
                      <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: '0 0 10px 0', lineHeight: '1.6', fontStyle: 'italic' }}>"Hey [First Name] — looking forward to connecting today at [time]. See you then."</p>
                      <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', margin: '0 0 10px 0', lineHeight: '1.6', fontStyle: 'italic' }}>Then: "Does that time still work for you?"</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>One question. Forces a micro-commitment. If they confirm — they show up. If they reschedule — you still have them. Silence is the only loss.</p>
                    </div>
                  </div>

                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Post-Call</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[
                      { label: 'They Booked', color: '#10b981', body: 'Send the calendar invite before you hang up. Log the activity in the portal immediately. Night before — voice note. Morning of — voice note. Show up two minutes early, everything open and ready.' },
                      { label: 'They Stalled', color: '#d97706', body: ['No problem — I have tomorrow afternoon or [day after] morning open. Which one works better?', 'Two specific options within 48 hours. Log the follow up in the portal. Send the no-response email template same day so you are in their inbox before the follow up call.'] },
                      { label: 'They Said No', color: '#ef4444', body: 'Log it. Move on. One follow up in 90 days — seasons change, a bad week can make a contractor ready to talk. After that, done. A clean no is not a failure. It is a decision. Both are movement.' },
                    ].map((item, i) => (
                      <div key={i} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '14px', border: '1px solid #e5e7eb', borderTop: '3px solid ' + item.color }}>
                        <p style={{ color: item.color, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 8px 0' }}>{item.label}</p>
                        {Array.isArray(item.body)
                          ? item.body.map((line, j) => <p key={j} style={{ color: '#374151', fontSize: '13px', margin: '0 0 6px 0', lineHeight: '1.6', fontStyle: j === 0 ? 'italic' : 'normal' }}>{j === 0 ? '"' + line + '"' : line}</p>)
                          : <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>{item.body}</p>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              </RCard>

              <RCard title="Demo Prep and Demo Login" badge="Rep Only" description="Have everything ready before the call starts. No scrambling. No dead air." buttonLabel="View Demo Prep">
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Open These Before the Call</p>
                  {['Google Meet link open and ready — this is the platform for every demo','Calendly link ready to send the moment the meeting is booked','Setera website','ROI calculator section','Talk to Emily widget','Demo client dashboard already logged in','Service Agreement ready','Correct Stripe link only after plan is confirmed'].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid #d1d5db', flexShrink: 0 }} />
                      <span style={{ color: '#374151', fontSize: '13px' }}>{item}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px', backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px 18px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '12px', fontWeight: '700', margin: '0 0 12px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Demo Client Login</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '0 0 6px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Email</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: 0, fontFamily: 'monospace' }}>client@example.com</p>
                          <CopyButton text="client@example.com" />
                        </div>
                      </div>
                      <div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '0 0 6px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Password</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: 0, fontFamily: 'monospace' }}>Test1234!</p>
                          <CopyButton text="Test1234!" />
                        </div>
                      </div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '10px 12px' }}>
                      {['Do not send this login to clients or prospects.','Do not let prospects log in themselves.','Do not show real client data.','Reps do not have access to The High Table.'].map((item, i) => (
                        <p key={i} style={{ color: '#fca5a5', fontSize: '12px', margin: '0 0 2px 0' }}>{'- ' + item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </RCard>

              <RCard title="Follow-Up Templates" badge="Rep Only" description="Copy-ready email templates for every stage. Personalize the first line. Only send payment links after the plan is confirmed." buttonLabel="View Templates">
                <div>
                  {FOLLOW_UP_TEMPLATES.map((template, i) => (
                    <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' }}>
                        <div>
                          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 2px 0' }}>{template.name}</p>
                          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>Subject: {template.subject}</p>
                        </div>
                        <CopyButton text={'Subject: ' + template.subject + '\n\n' + template.body} label="Copy Template" />
                      </div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '10px 12px' }}>
                        <pre style={{ color: '#374151', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap' as const, fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>{template.body}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </RCard>
              <div style={{ marginTop: '28px', backgroundColor: '#0f2318', borderRadius: '12px', padding: '32px 36px', position: 'relative', overflow: 'hidden' }}>
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle at 80% 50%, rgba(0,212,170,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.2em', margin: '0 0 24px 0' }}>From the founder</p>
  <p style={{ color: '#fff', fontSize: '22px', fontWeight: '700', lineHeight: '1.7', margin: '0 0 8px 0', fontStyle: 'italic' }}>
    "If the dream matters… why haven't you done it yet?
  </p>
  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '20px', fontWeight: '500', lineHeight: '1.7', margin: '0 0 8px 0', fontStyle: 'italic' }}>
    Not about to. Not working towards. Done it.
  </p>
  <p style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 28px 0' }}>
    Go fast, don't die… Phuck it."
  </p>
  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', margin: 0, fontWeight: '600', letterSpacing: '0.05em' }}>— Alex Rivera, Setera</p>
</div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>Legal Documents</p>
              <RCard title="Service Agreement" badge="Client Safe" description="Send to the client once they choose a plan and before payment is finalized. Covers services, pricing, payment terms, cancellation, data handling, liability, and signatures.">
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '14px 16px' }}>
                  <p style={{ color: '#166534', fontSize: '13px', margin: 0, fontWeight: '500' }}>Alex will send you this document directly. Do not send a draft or unofficial version. Only send the approved, finalized agreement.</p>
                </div>
              </RCard>
              <RCard title="Privacy Policy" badge="Client Safe" description="Client-facing policy explaining what Setera collects, how Emily captures caller information, where data is stored, third-party providers, PIPEDA rights, and data retention.">
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '14px 16px' }}>
                  <p style={{ color: '#166534', fontSize: '13px', margin: 0, fontWeight: '500' }}>Alex will send you this document directly. Client and caller data is not sold.</p>
                </div>
              </RCard>
              <RCard title="Cancellation Policy Summary" badge="Rep Only" description="Quick guide for cancellation rules based on go-live status. Reps do not cancel clients in the backend and do not promise refunds." buttonLabel="View Summary">
                <div>
                  {[
                    { plan: 'Before Go-Live', rule: 'No refund of amounts already paid. No further payments will be charged.' },
                    { plan: 'After Go-Live', rule: 'No long-term contract. Cancel anytime with 30 days\' written notice. No termination fees. A final monthly payment may become due during the notice period depending on billing date. Service remains available through the paid period. Amounts already paid are non-refundable except where required by law.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{item.plan}</p>
                      <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{item.rule}</p>
                    </div>
                  ))}
                  <div style={{ marginTop: '12px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0, fontWeight: '600' }}>All setup fees are non-refundable. Reps do not cancel anything in the backend. Collect confirmation, record the reason, screenshot proof, submit to Alex.</p>
                  </div>
                </div>
              </RCard>
              <RCard title="AI Disclosure and Recording Summary" badge="Rep Only" description="How Emily discloses she is AI, how recording consent works, and when to direct clients to their own lawyer." buttonLabel="View Summary">
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Approved Rep Explanation</p>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5', fontStyle: 'italic' }}>Emily introduces herself as a virtual receptionist at the beginning of the call. She lets callers know she is there to help capture their information and make sure the right person gets back to them. The call can be recorded and summarized so the business has the caller name, number, reason for calling, urgency, and best callback time.</p>
                    <CopyButton text="Emily introduces herself as a virtual receptionist at the beginning of the call. She lets callers know she is there to help capture their information and make sure the right person gets back to them. The call can be recorded and summarized so the business has the caller name, number, reason for calling, urgency, and best callback time." />
                  </div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>If Client Asks Is This Legal</p>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5', fontStyle: 'italic' }}>Setera has AI disclosure built into Emily's opening line, and our service agreement and privacy policy explain how calls and caller information are handled. Because call recording and consent rules can vary by location, we recommend clients confirm their own requirements with their lawyer if they have specific legal concerns.</p>
                    <CopyButton text="Setera has AI disclosure built into Emily's opening line, and our service agreement and privacy policy explain how calls and caller information are handled. Because call recording and consent rules can vary by location, we recommend clients confirm their own requirements with their lawyer if they have specific legal concerns." />
                  </div>
                  <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#991b1b', fontSize: '12px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase' as const }}>Do Not Say</p>
                    {['Do not say Emily is a human receptionist.','Do not say callers will not know she is AI.','Do not say Setera guarantees legal compliance in every province.','Do not give legal advice about recording laws.','Do not edit Emily opening script without Alex approval.'].map((item, i) => (
                      <p key={i} style={{ color: '#991b1b', fontSize: '13px', margin: '0 0 2px 0' }}>{'- ' + item}</p>
                    ))}
                  </div>
                </div>
              </RCard>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>Setera Payment Links (CAD)</p>
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px' }}>
                <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>Read before sending a payment link</p>
                <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Only send after the client has chosen a plan and the agreement is ready. Do not send multiple links. Do not discount without Alex approval. Do not promise refunds. If the wrong link is used, notify Alex immediately.</p>
              </div>
              {planLinks.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No payment links added yet.</p>
              ) : planLinks.map((link) => {
                const badge = link.link_type === 'no_setup_fee' ? { label: 'No Setup Fee', bg: '#d1fae5', color: '#065f46' }
                  : link.link_type === 'standard' ? { label: link.setup_fee ? '+ $' + link.setup_fee.toLocaleString() + ' Setup Fee' : '+ Setup Fee', bg: '#fef3c7', color: '#92400e' }
                  : link.link_type === 'promo' ? { label: 'Promo', bg: '#fdeee3', color: '#F26A1B' }
                  : { label: 'Add-On', bg: '#dbeafe', color: '#1e40af' };
                return (
                  <div key={link.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' as const }}>
                        <span style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700' }}>{link.label}</span>
                        <span style={{ backgroundColor: badge.bg, color: badge.color, fontSize: '12px', fontWeight: '700', padding: '2px 10px', borderRadius: '20px' }}>{badge.label}</span>
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0, fontFamily: 'monospace' }}>{link.url || 'Link not yet added'}</p>
                    </div>
                    {link.url && <CopyButton text={link.url} label="Copy Link" />}
                  </div>
                );
              })}
              <PaymentPackageLinks />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>Processes</p>
              <RCard title="How to Handle a Cancellation Request" badge="Rep Only" description="Step-by-step process for handling client cancellation requests without promising refunds or touching the backend." buttonLabel="View Process">
                <div>
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: 0 }}>Reps do not cancel clients in the backend. Reps do not promise refunds. Collect confirmation, capture the reason, screenshot proof, and submit through the Cancellations tab.</p>
                  </div>
                  {[
                    { step: 'Step 1', title: 'Client says they want to cancel.', content: 'Pause before saying anything about refunds, backend changes, or immediate cancellation. Send the confirmation message below.' },
                    { step: 'Step 2', title: 'Client replies YES.', content: 'Screenshot the confirmation. Must show: cancellation request, your confirmation message, client replying YES, and business name or context if visible.' },
                    { step: 'Step 3', title: 'Capture the reason.', content: 'If unclear, ask: Understood. Before I send this to admin, what would you say is the main reason for cancelling? It helps us improve the service.' },
                    { step: 'Step 4', title: 'Submit through the Cancellations tab.', content: 'Go to the Cancellations tab and fill out the form. Select the client, enter the reason, category, plan, and effective date. No email needed.' },
                    { step: 'Step 5', title: 'Admin handles backend.', content: 'Alex marks client as non-renewing, updates The High Table, schedules Stripe changes, sets Emily deactivation date, and reviews refund eligibility.' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <span style={{ backgroundColor: '#0f2318', color: '#00d4aa', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>{item.step}</span>
                        <span style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700' }}>{item.title}</span>
                      </div>
                      <p style={{ color: '#374151', fontSize: '13px', margin: '4px 0 0 50px', lineHeight: '1.5' }}>{item.content}</p>
                    </div>
                  ))}
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Cancellation Confirmation Message</p>
                    <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.6', fontStyle: 'italic' }}>Just confirming, do you wish to cancel your Setera service? If yes, please reply YES. Your cancellation takes effect after the 30-day notice period, there are no termination fees, and your service will remain active through the end of the notice period.</p>
                      <CopyButton text="Just confirming, do you wish to cancel your Setera service? If yes, please reply YES. Your cancellation takes effect after the 30-day notice period, there are no termination fees, and your service will remain active through the end of the notice period." />
                    </div>
                  </div>
                </div>
              </RCard>

              <RCard title="How to Report a Problem" badge="Rep Only" description="Every issue goes through the Problems tab. Not just text messages. If it matters, log it. If urgent, text Alex too." buttonLabel="View Process">
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Severity Levels</p>
                  {[
                    { level: 'Low', color: '#6b7280', bg: '#f3f4f6', desc: 'Small issue, no immediate client impact.' },
                    { level: 'Medium', color: '#d97706', bg: '#fef3c7', desc: 'Client is affected but the business is still operating.' },
                    { level: 'High', color: '#f97316', bg: '#fff7ed', desc: 'Client experience is being affected and needs attention soon.' },
                    { level: 'Urgent', color: '#ef4444', bg: '#fee2e2', desc: 'Revenue, calls, SMS, dashboard access, or go-live is at risk. Submit AND text Alex.' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ backgroundColor: item.bg, color: item.color, fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>{item.level}</span>
                      <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{item.desc}</p>
                    </div>
                  ))}
                  <div style={{ marginTop: '12px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#991b1b', fontSize: '12px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase' as const }}>Urgent Examples</p>
                    {['Emily is not answering live client calls.','SMS notifications are not firing.','A live client cannot access their dashboard.','A call is not logging during active use.','A go-live test failed.','A client is angry and threatening to cancel.','Payment or Stripe issue is blocking launch.'].map((item, i) => (
                      <p key={i} style={{ color: '#991b1b', fontSize: '13px', margin: '0 0 2px 0' }}>{'- ' + item}</p>
                    ))}
                  </div>
                </div>
              </RCard>

              <RCard title="New Client Onboarding Checklist" badge="Rep Only" description="Everything to collect before submitting a new client. Do not text Alex random client details — submit through the New Client form." buttonLabel="View Checklist">
                <div>
                  {['Client chose a plan.','Service Agreement sent.','Payment link sent.','Payment received or pending confirmation.','Business name collected.','Owner name collected.','Owner phone number collected.','Owner email collected.','Main business phone number collected.','Business website collected.','Business address collected.','Service area collected.','Business hours collected.','After-hours instructions collected.','Emergency or urgent call types collected.','SMS notification contact collected.','Backup notification contact collected.','Dashboard login email collected.','Preferred go-live date collected.','Special notes added.','Signed agreement uploaded.','Client submitted through New Client form.'].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid #d1d5db', flexShrink: 0 }} />
                      <span style={{ color: '#374151', fontSize: '13px' }}>{item}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '14px', backgroundColor: '#0f2318', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '12px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Emily Pricing Rule</p>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Emily never gives pricing. No quotes, ballparks, estimates, or timelines tied to price. If a caller asks, Emily captures the question and routes it to the business.</p>
                  </div>
                </div>
              </RCard>

              <RCard title="What Happens After a New Client Is Submitted" badge="Rep Only" description="Reps submit the client. Alex handles all configuration, go-live, and setup inside The High Table." buttonLabel="View Process">
                <div>
                  <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                    <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '700', margin: 0 }}>Reps do not configure Emily, Twilio, call forwarding, dashboard access, payment settings, or go-live status unless specifically approved by Alex.</p>
                  </div>
                  {['Agreement signed and uploaded.','Payment received.','Plan confirmed.','Business website reviewed for Emily knowledge base.','Services, areas, and hours confirmed.','After-hours instructions and urgent call types confirmed.','SMS notification and backup contacts confirmed.','Dashboard login email confirmed.','Emily agent configured and greeting approved.','Emily pricing rule confirmed.','Call forwarding setup confirmed and instructions sent.','Test call completed and logged.','Transcript and AI summary generated.','SMS notification fired.','Client confirms dashboard access and understands how to view calls.','Go-live date confirmed.','Admin marks account as live.'].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#00d4aa', fontSize: '14px', flexShrink: 0 }}>✓</span>
                      <span style={{ color: '#374151', fontSize: '13px' }}>{item}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '12px', backgroundColor: '#0f2318', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: 0 }}>Hard Rule: No client goes live until a successful test call is completed and logged.</p>
                  </div>
                </div>
              </RCard>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb' }}>Knowledge and Rules</p>
              <RCard title="Setera Product Guide" badge="Rep Only" description="Everything you need to know about Setera, Emily, and how to answer every question a prospect or client could ask. Read this before your first call." buttonLabel="Open Guide">
                <div>
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>V1 Market Rule</p>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Setera V1 is for the trades. Roofing is the spearhead. Any non-trade business must be approved by Alex before being pitched. Do not pitch medical, dental, legal, finance, insurance, or real estate without approval.</p>
                  </div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 6px 0' }}>The one-line positioning statement every rep knows cold:</p>
                    <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: '0 0 4px 0', fontStyle: 'italic' }}>Setera is not an answering service — it is a revenue recovery system built for the trades.</p>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', margin: 0 }}>And the positioning line from the client side: "Everyone else sold me software. Setera sold me continuity."</p>
                  </div>
                  {SETERA_PRODUCT_GUIDE_QA.map((item, i) => (
                    <details key={i} style={{ marginBottom: '4px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                      <summary style={{ padding: '10px 14px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#0a1f13', listStyle: 'none', userSelect: 'none' as const }}>{item.q}</summary>
                      <div style={{ padding: '10px 14px', backgroundColor: '#fff' }}>
                        <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>{item.a}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </RCard>

              <RCard title="Setera Sales & Rep Cheat Sheet" badge="Rep Only" description="Know Setera cold: what it is, who it's for, discovery questions, pricing, objections, and the Overflow pivot. Overlaps with the Product Guide and Cold Call script above — kept as a single condensed reference." buttonLabel="Open Cheat Sheet">
                <div>
                  {SALES_CHEAT_SHEET.map((item, i) => (
                    <details key={i} style={{ marginBottom: '4px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                      <summary style={{ padding: '10px 14px', cursor: 'pointer', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none', userSelect: 'none' as const }}>
                        <span style={{ color: '#00d4aa', fontWeight: '700', fontSize: '11px', backgroundColor: 'rgba(0,212,170,0.1)', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{item.num}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0a1f13' }}>{item.title}</span>
                      </summary>
                      <div style={{ padding: '12px 14px', backgroundColor: '#fff' }}>
                        {item.body.map((p, j) => (
                          <p key={j} style={{ color: '#374151', fontSize: '13px', lineHeight: '1.6', margin: '0 0 8px 0' }}>{p}</p>
                        ))}
                        {item.bullets && item.bullets.length > 0 && (
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {item.bullets.map((b, j) => (
                              <li key={j} style={{ padding: '5px 0 5px 16px', position: 'relative', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6', lineHeight: '1.5' }}>
                                <span style={{ position: 'absolute', left: 0, top: '12px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'block' }} />
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </RCard>

              <RCard title="What Not To Promise" badge="Important" description="Keep every rep inside the current V1 offer. If it is not confirmed live, do not promise it." buttonLabel="View Guardrails">
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <p style={{ color: '#991b1b', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Never Promise</p>
                      {['Emily is human.','Callers will not know she is AI.','Every call captured under all circumstances.','Guaranteed revenue, jobs, or close rates.','Custom pricing without approval.','Refunds.','Same-day go-live without approval.','V2 or V3 features as live.','Website chat, Messenger, or WhatsApp as V1.','Calendar booking unless confirmed live.','CRM or software integrations unless approved.','Pricing, quotes, or estimates from Emily.','Legal compliance advice.'].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <span style={{ color: '#ef4444', fontWeight: '800', fontSize: '13px', flexShrink: 0 }}>x</span>
                          <span style={{ color: '#374151', fontSize: '12px', lineHeight: '1.4' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p style={{ color: '#065f46', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Emily Can Do</p>
                      {['Answer inbound calls.','Disclose she is an AI virtual receptionist.','Capture caller name, phone, reason, urgency, address, callback time.','Summarize and categorize calls.','Log call details in the client dashboard.','Notify the right person by SMS.','Use client business info to sound informed.'].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <span style={{ color: '#10b981', fontWeight: '800', fontSize: '13px', flexShrink: 0 }}>✓</span>
                          <span style={{ color: '#374151', fontSize: '12px', lineHeight: '1.4' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Default Safe Answer</p>
                      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>That is a good question. I do not want to give you the wrong answer, so I will confirm with Alex and get back to you.</p>
                    </div>
                    <CopyButton text="That is a good question. I do not want to give you the wrong answer, so I will confirm with Alex and get back to you." />
                  </div>
                </div>
              </RCard>

              <RCard title="Commission Rules" badge="Rep Only" description="Your rate is a percentage of what the client actually pays — it changes based on your track, not a flat per-close fee." buttonLabel="View Compensation">
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>15% Commission — By Plan</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    {[{ plan: 'Launch', price: '$697', cad: '$104.55 CAD' },{ plan: 'Grow', price: '$1,348', cad: '$202.20 CAD' },{ plan: 'Starter', price: '$2,247', cad: '$337.05 CAD' }].map((item, i) => (
                      <div key={i} style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px', textAlign: 'center' as const }}>
                        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{item.plan} ({item.price}/mo)</p>
                        <p style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: 0 }}>{item.cad}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Rep Track</p>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>Training (first 6 clients)</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>15% of the client's first monthly payment, excluding tax. Alex closes while the rep finds the business, gets the decision-maker, and books the opportunity. Bonuses below are active during this stage.</p>
                    </div>
                    <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>After client #6 — the rep chooses one path</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 8px 0', lineHeight: '1.5' }}>A real decision point, not automatic — Alex makes the call with them.</p>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>Permanent Setter</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 8px 0', lineHeight: '1.5' }}>Commission drops to 5%. No bonuses of any kind going forward — anything already earned before this point stands.</p>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>Advance toward Closer</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Stays at 15%, shadows the close through clients 7–14, keeps every bonus below. By 15+ clients they're expected to run the full deal themselves.</p>
                    </div>
                  </div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Bonuses (Training & Closer Track Only)</p>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 3px 0' }}>{"Monthly MRR Sprint — up to $4,000 every month."}</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{"Each performance period runs from your start date to the day before the same date next month. Add up the first monthly plan of every new client you bring in during the period. A client counts once they've paid their first month: $4,182 → $1,000, $8,088 → $2,000, $13,482 → $4,000. You're paid the highest tier you reach (not all three), within 7 days of the period closing. Upgrades and repeat sales on an existing client don't count as new MRR. A client who later cancels still counts."}</p>
                    </div>
                    <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 3px 0' }}>{"Every 10th Client of Each Plan."}</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{"Each plan has its own count: your 10th, 20th, 30th… Launch client, your 10th, 20th, 30th… Grow client, and your 10th, 20th, 30th… Starter client each pay you their full first monthly payment instead of the standard 15%: Launch $697, Grow $1,348, Starter $2,247. That client only; it replaces the 15%, it isn't added to it. Your first 6 clients count toward these totals. A client counts once they've paid their first month, and keeps counting even if they cancel later. Each client counts once (upgrades don't count again)."}</p>
                    </div>
                    <div style={{ padding: '10px 0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 3px 0' }}>12-Month Milestones</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Cumulative new monthly revenue in the rep's first 12 months: $89,880 → $30,000. $179,760 → additional $60,000. $269,640 → additional $100,000.</p>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#f0f4f1', borderRadius: '10px', padding: '16px' }}>
                    <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 6px 0' }}>Rate and bonus eligibility depend on track</p>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Check Setter Management in Rep Management for a rep's current track before answering a compensation question — do not guess.</p>
                  </div>
                </div>
              </RCard>            </div>

          </div>
        )}

      </div>

      {promoting&&<PromotePanel person={promoting} paidClients={paidClients[promoting.id]||0}
        compTrackLabel={({setter_training:'Training (15%)',setter:'Setter (5%)',setter_closer:'Setter → Closer (15%)',closer:'Closer (15%)'} as Record<string,string>)[repCompensation[promoting.id]?.comp_track||'']||'not started'}
        onClose={()=>setPromoting(null)} onDone={async msg=>{setPromoting(null);setSaveError('');setSaveSuccess(msg);setTimeout(()=>setSaveSuccess(''),10000);await reloadPeople();}}/>}
      {showAllocate&&<AllocatePanel prospectIds={allocateIds} reserveName={reserveName} onClose={()=>setShowAllocate(false)} onDone={finishBulk}/>}
      {showPullBack&&<PullBackPanel reserveName={reserveName} onClose={()=>setShowPullBack(false)} onDone={finishBulk}/>}
      {prospectToDelete&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'460px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #ef4444'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Confirm Delete</p>
              <button onClick={()=>setProspectToDelete(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
            </div>
            <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Are you sure you want to delete {prospectToDelete.name}? This cannot be undone.</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>deleteProspect(prospectToDelete.id)} disabled={actionLoading} style={{backgroundColor:'#ef4444',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Deleting...':'Delete'}</button>
              <button onClick={()=>setProspectToDelete(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {jobProspectToDelete&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'460px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #ef4444'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Confirm Delete</p>
              <button onClick={()=>setJobProspectToDelete(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
            </div>
            <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Are you sure you want to delete {jobProspectToDelete.name}? This cannot be undone.</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>deleteJobProspect(jobProspectToDelete.id)} disabled={actionLoading} style={{backgroundColor:'#ef4444',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Deleting...':'Delete'}</button>
              <button onClick={()=>setJobProspectToDelete(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {clientToDelete&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'460px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #ef4444'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Confirm Delete</p>
              <button onClick={()=>setClientToDelete(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
            </div>
            <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Are you sure you want to delete {clientToDelete.name}? This cannot be undone.</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>deleteClient(clientToDelete.id)} disabled={actionLoading} style={{backgroundColor:'#ef4444',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Deleting...':'Delete'}</button>
              <button onClick={()=>setClientToDelete(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {prospectToMove&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'460px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #3b82f6'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Confirm Move</p>
              <button onClick={()=>setProspectToMove(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
            </div>
            <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Are you sure you want to move {prospectToMove.company_name} to Signups? This creates a new client record (Plan: Starter Monthly, Status: Onboarding) and permanently deletes the original prospect. This cannot be undone.</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>moveProspectToSignup(prospectToMove)} disabled={actionLoading} style={{backgroundColor:'#3b82f6',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Moving...':'Move to Signups'}</button>
              <button onClick={()=>setProspectToMove(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {clientToMove&&(
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'24px',width:'460px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',border:'2px solid #3b82f6'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:0}}>Confirm Move</p>
              <button onClick={()=>setClientToMove(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'6px 12px',borderRadius:'6px',fontSize:'12px',cursor:'pointer'}}>Cancel</button>
            </div>
            <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:'0 0 20px 0'}}>Are you sure you want to move {clientToMove.business_name} to Prospects? This creates a new prospect record (Status: Not Contacted, Tier: Starter, Term: 1 Month) and permanently deletes the original signup. This cannot be undone.</p>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>moveClientToProspect(clientToMove)} disabled={actionLoading} style={{backgroundColor:'#3b82f6',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading?0.6:1}}>{actionLoading?'Moving...':'Move to Prospects'}</button>
              <button onClick={()=>setClientToMove(null)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'11px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}