'use client';
import { useState, useEffect, useRef } from 'react';
import { PaymentPackageLinks } from '@/components/PaymentPackageLinks';
import { supabase, switchPortal } from '@/lib/supabase';
import { getMilestoneProgress, getCompensationProgress, type MilestoneProgress as MilestoneProgressData, type CompensationProgress } from '@/lib/compensation';
import SprintProgress from '@/components/SprintProgress';
import MilestoneProgress from '@/components/MilestoneProgress';
import { useRouter } from 'next/navigation';
import { clientMonthlyRevenue } from '@/lib/client-revenue';
import OverflowQuickAdd from '@/components/OverflowQuickAdd';
import AddProspectForm, { EMPTY_PROSPECT_FORM, type ProspectFormValue } from '@/components/AddProspectForm';
import { TRADE_OPTIONS } from '@/lib/trade-options';
import { useBusinessMatches, BusinessMatchList } from '@/components/BusinessMatches';
import { parseBusinessPhone } from '@/lib/business-normalize';
import { firstPaymentCommission, fmtCommission } from '@/lib/first-payment';
import { COLD_CALL_OVERVIEW, COLD_CALL_STEPS, COLD_CALL_OBJECTIONS, COLD_CALL_VOICEMAIL_SCRIPT } from '@/lib/coldCallScript';
import { ASK_ABOUT_THE_CHANGE_MD } from '@/lib/askAboutTheChange';
import { FRONT_DOOR_BRIDGE_MD } from '@/lib/frontDoorBridge';
import { CancelDemo, type PopoverResult } from '@/components/admin/CalendarSlotPopover';
import MarkdownResource from '@/components/MarkdownResource';
import { clientTierAndPlan } from '@/lib/client-tier';
import { CALL_OUTCOMES, withCallOutcome, prospectUpdateForActivity } from '@/lib/callOutcomes';
import { PROSPECTS_PAGE_SIZE, filtersKey, type ProspectFilters } from '@/lib/prospect-search';
import { fetchAllPages, prospectsQuery, fetchProspectStats, statusCounts, sumStatuses, type ProspectStatRow } from '@/lib/prospect-queries';
import { localDateStr, lastContactLabel } from '@/lib/local-date';
import { FOLLOWUP_EXCLUDED_IN, isOverdue } from '@/lib/followups';
import { saveStatusChange } from '@/lib/stage-change';
import { sortSlots, newSlotsOnly, claimSlot, releaseSlot, generationDates, SLOT_TAKEN_MESSAGE, type SlotLike } from '@/lib/slots';
import { isAfterHours, isPastAppointment } from '@/lib/local-date'; // local time, not UTC

type UserProfile = {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  probation_start: string | null;
};

type PlanLink = { id: string; plan_slug: string | null; link_type: string; label: string; url: string | null; setup_fee: number | null; active: boolean; };

type Client = {
  id: string;
  tier: string | null;
  payment_type: string | null;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  city: string;
  province: string;
  plan: string;
  status: string;
  contract_signed: boolean;
  payment_collected: boolean;
  created_at: string;
};

type Business = {
  id: string;
  name: string;
  phone: string;
  email: string;
  industry: string;
  plan: string;
  status: string;
  created_at: string;
};

type CallRecord = {
  id: string;
  caller_name: string;
  caller_phone: string;
  reason: string;
  status: string;
  created_at: string;
  summary: string;
  business_id: string;
};

type Problem = {
  id: string;
  business_name: string;
  issue: string;
  status: string;
  created_at: string;
};

type Prospect = {
  id: string;
  rep_id: string;
  company_name: string;
  trade: string;
  province: string;
  city: string;
  website: string;
  phone: string;
  email: string;
  contact_name: string;
  contact_position: string;
  contact_phone: string;
  contact_email: string;
  source: string;
  status: string;
  notes: string;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  do_not_contact: boolean; bad_number?: boolean;
  last_contacted_at: string | null;
  tier?: string | null;
};

type Appointment = {
  id: string;
  business_name: string;
  contact_name: string | null;
  trade: string | null;
  phone: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  notes: string | null;
  meet_link: string | null;
  availability_id: string | null;
  setter_id: string | null;
  assigned_to: string | null;
  created_at: string;
};

type RepProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

type Activity = {
  id: string;
  prospect_id: string;
  rep_id: string;
  type: string;
  outcome: string;
  notes: string;
  follow_up_date: string;
  created_at: string;
};

type StageHistory = {
  id: string;
  prospect_id: string;
  stage: string;
  entered_at: string;
  left_at: string | null;
  days_in_stage: number | null;
};

type Cancellation = {
  id: string;
  client_id: string | null;
  business_name: string;
  rep_id: string;
  reason: string;
  category: string;
  plan_type: string;
  mrr_lost: number | null;
  effective_date: string | null;
  final_month: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = [
  'Not Contacted','Attempted','Contacted','Follow Up Required',
  'Interested','Demo Scheduled','Proposal Sent','Closed Won','Closed Lost','Future Opportunity',
];

const ACTIVITY_TYPES = ['Call','Email','Demo','Meeting','Note','Proposal'];

const PIPELINE_COLUMNS = [
  { id: 'new', label: 'New', statuses: ['Not Contacted','Attempted','Contacted','Follow Up Required'], defaultStatus: 'Not Contacted', color: '#6b7280', accent: '#f3f4f6', stale: 3 },
  { id: 'meeting', label: 'Meeting', statuses: ['Interested','Demo Scheduled'], defaultStatus: 'Interested', color: '#8b5cf6', accent: '#ede9fe', stale: 5 },
  { id: 'proposal', label: 'Proposal', statuses: ['Proposal Sent'], defaultStatus: 'Proposal Sent', color: '#f59e0b', accent: '#fef3c7', stale: 3 },
  { id: 'won', label: 'Won', statuses: ['Closed Won'], defaultStatus: 'Closed Won', color: '#10b981', accent: '#d1fae5', stale: 999 },
];

const CANCELLATION_CATEGORIES = [
  { value: 'price', label: 'Pricing' },
  { value: 'no_show', label: 'No Show / Ghosted' },
  { value: 'competitor', label: 'Went with Competitor' },
  { value: 'seasonal', label: 'Seasonal / Slow Period' },
  { value: 'dissatisfied', label: 'Dissatisfied with Service' },
  { value: 'going_out_of_business', label: 'Going Out of Business' },
  { value: 'term_ended', label: 'Term Ended (fixed term, not renewed)' },
  { value: 'other', label: 'Other' },
];

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

function getColumnForStatus(status: string) {
  return PIPELINE_COLUMNS.find(c => c.statuses.includes(status)) || PIPELINE_COLUMNS[0];
}

function getStatusStyle(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    'Not Contacted':      { bg: '#f3f4f6', color: '#6b7280' },
    'Attempted':          { bg: '#fef3c7', color: '#92400e' },
    'Contacted':          { bg: '#dbeafe', color: '#1e40af' },
    'Follow Up Required': { bg: '#fed7aa', color: '#9a3412' },
    'Interested':         { bg: '#d1fae5', color: '#065f46' },
    'Demo Scheduled':     { bg: '#ede9fe', color: '#5b21b6' },
    'Proposal Sent':      { bg: '#e0f2fe', color: '#0c4a6e' },
    'Closed Won':         { bg: '#ccfbf1', color: '#065f46' },
    'Closed Lost':        { bg: '#fee2e2', color: '#991b1b' },
    'Future Opportunity': { bg: '#f0fdf4', color: '#166534' },
  };
  return map[status] || { bg: '#f3f4f6', color: '#6b7280' };
}

function getCancellationStatusStyle(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    'pending':   { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
    'reviewed':  { bg: '#dbeafe', color: '#1e40af', label: 'Reviewed' },
    'confirmed': { bg: '#fee2e2', color: '#991b1b', label: 'Confirmed' },
  };
  return map[status] || { bg: '#f3f4f6', color: '#6b7280', label: status };
}

function getCategoryLabel(value: string) {
  const cat = CANCELLATION_CATEGORIES.find(c => c.value === value);
  return cat ? cat.label : value;
}

// ─── COMP MATRIX V2 ───────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  launch: 'Launch',
  grow: 'Grow',
  starter: 'Starter',
  pro: 'Pro',
  regional: 'Regional',
  enterprise: 'Enterprise',
  national: 'National',
};

const PAYMENT_LABEL: Record<string, string> = {
  monthly: 'Monthly',
  '3_month': '3-Month',
  '6_month': '6-Month',
  annual_full: 'Annual (Full Pay)',
  annual_two_pay: 'Annual (2-Pay)',
  custom: 'Custom',
};

function getTierLabel(tier: string | null): string {
  if (!tier) return '—';
  return TIER_LABEL[tier] || tier;
}

function getPaymentTypeLabel(paymentType: string | null): string {
  if (!paymentType) return '—';
  return PAYMENT_LABEL[paymentType] || paymentType;
}


function getCallColor(status: string) {
  if (status === 'red') return '#ef4444';
  if (status === 'yellow') return '#f59e0b';
  if (status === 'green') return '#10b981';
  if (status === 'blue') return '#3b82f6';
  return '#6b7280';
}

function getCallLabel(status: string) {
  if (status === 'red') return 'Urgent';
  if (status === 'yellow') return 'Follow Up';
  if (status === 'green') return 'Captured';
  if (status === 'blue') return 'In Progress';
  return status;
}

function getTopReasons(calls: CallRecord[]) {
  const counts: Record<string, number> = {};
  calls.forEach(c => { if (c.reason) counts[c.reason] = (counts[c.reason] || 0) + 1; });
  return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5);
}

function daysAsClient(business: Business) {
  return Math.floor((Date.now() - new Date(business.created_at).getTime()) / (1000 * 60 * 60 * 24));
}

function getPlanProgress(plan: string | null, business: Business) {
  const days = daysAsClient(business);
  const p = (plan || '').toLowerCase();
  if (p.includes('3 month') || p.includes('3-month')) return { days, total: 90, label: '3-Month' };
  if (p.includes('annual')) return { days, total: 365, label: 'Annual' };
  return null;
}

// Date-only fields (follow_up_date, sold_at, ...) are stored as UTC
// midnight of the picked calendar date. Converting that through the
// viewer's local timezone rolls it back a day (e.g. the 21st displays as
// the 20th in America/Regina, UTC-6). Extracting the UTC calendar-date
// components directly avoids that. Genuine timestamps essentially never
// land on exactly UTC midnight, so they still display in local time, which
// is correct for "when did this actually happen."
function formatDate(dateStr: string) {
  if (!dateStr) return '';
  if (dateStr.length === 10) {
    const [y, m, day] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const dt = new Date(dateStr);
  if (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0) {
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

function buildSubtitle(trade: string, city: string, province: string) {
  return [trade, city, province].filter(Boolean).join(' / ');
}

function totalDays(prospect: Prospect) {
  const start = new Date(prospect.created_at).getTime();
  const end = prospect.status === 'Closed Won' && prospect.updated_at
    ? new Date(prospect.updated_at).getTime()
    : Date.now();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

function getRoleLabel(role: string) {
  if (role === 'owner') return 'Founder';
  if (role === 'vp_sales') return 'VP of Sales';
  if (role === 'rep') return 'Sales Rep';
  if (role === 'admin') return 'Admin';
  return 'Sales Rep';
}

function getAvatarInitial(name: string | null, email: string) {
  if (name && name.trim()) return name.trim()[0].toUpperCase();
  return email[0].toUpperCase();
}




function getProbationStatus(startDate: string | null) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const daysPassed = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, 90 - daysPassed);
  const completed = daysPassed >= 90;
  const pct = Math.min(100, Math.round((daysPassed / 90) * 100));
  const monthsElapsed = parseFloat((Math.min(daysPassed, 90) / 30).toFixed(2));
  return { daysPassed: Math.min(daysPassed, 90), daysLeft, completed, pct, monthsElapsed };
}
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

export default function RepPortal() {
  const [tab, setTab] = useState('overview');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [clientView, setClientView] = useState<'list' | 'detail'>('list');
  const [prospectView, setProspectView] = useState<'list' | 'add' | 'detail'>('list');
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [clients, setClients] = useState<Client[]>([]);
  const [milestones, setMilestones] = useState<MilestoneProgressData | null | undefined>(undefined); // undefined = loading
  const [compProgress, setCompProgress] = useState<CompensationProgress | null>(null);
  const [firstSaleSlugByClient, setFirstSaleSlugByClient] = useState<Record<string, string>>({}); // first recorded sale's plan per client the rep owns (migrations/028)
  const [planLinks, setPlanLinks] = useState<PlanLink[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [clientCalls, setClientCalls] = useState<CallRecord[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistory[]>([]);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [draggedProspectId, setDraggedProspectId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [allRepProfiles, setAllRepProfiles] = useState<RepProfile[]>([]);
  const [prospectError, setProspectError] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availSlots, setAvailSlotsRaw] = useState<any[]>([]);
  const setAvailSlots = <T extends SlotLike>(s: T[]) => setAvailSlotsRaw(sortSlots(s)); // date, then real clock time (lib/slots.ts)
  const [slotError, setSlotError] = useState('');
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [rescheduleEventMissing, setRescheduleEventMissing] = useState(false); // offer "Reschedule in Setera anyway"
  const [rescheduleSlotId, setRescheduleSlotId] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelingApptId, setCancelingApptId] = useState<string | null>(null); // Cancel demo panel open under this appointment
  const [repAllSlots, setRepAllSlotsRaw] = useState<any[]>([]);
  const setRepAllSlots = <T extends SlotLike>(s: T[]) => setRepAllSlotsRaw(sortSlots(s));
  const [genRepDays, setGenRepDays] = useState(5);
  const [genRepStartTime, setGenRepStartTime] = useState('10:00 AM');
  const [genRepEndTime, setGenRepEndTime] = useState('3:00 PM');
  const [genRepInterval, setGenRepInterval] = useState(60);
  const [generatingRepSlots, setGeneratingRepSlots] = useState(false);
  const [showBookPanel, setShowBookPanel] = useState(false);
  const [bookForm, setBookForm] = useState({ business_name: '', contact_name: '', email: '', trade: 'Roofing', phone: '', notes: '' });
  const [bookSlotId, setBookSlotId] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookMeetLink, setBookMeetLink] = useState('');
  const [showMineOnly, setShowMineOnly] = useState(false);
  // Server-side Prospects (migrations/035): `prospects` holds only the table
  // rows loaded so far; prospectCount is the exact match count for the
  // filters it was fetched under. Counts elsewhere come from prospect_stats().
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [prospectCount, setProspectCount] = useState<{ key: string; n: number } | null>(null);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [prospectsReload, setProspectsReload] = useState(0);
  const [prospectStats, setProspectStats] = useState<ProspectStatRow[]>([]);
  const [boardCols, setBoardCols] = useState<Record<string, Prospect[]>>({});
  const [followUpsDueToday, setFollowUpsDueToday] = useState<Prospect[]>([]);
  const prospectsReq = useRef(0);
  const boardReq = useRef(0);
  const [setterAccess, setSetterAccess] = useState(false);
  const [availabilitySchedule, setAvailabilitySchedule] = useState<Record<string, {enabled: boolean; start: string; end: string}>>({
  mon: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
  tue: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
  wed: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
  thu: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
  fri: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
  sat: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
  sun: { enabled: false, start: '7:00 AM', end: '12:00 AM' },
});
const [savingAvailability, setSavingAvailability] = useState(false);
  const router = useRouter();


  const [form, setForm] = useState({
    business_name: '', owner_name: '', phone: '', email: '', city: '', province: '',
    website: '', calls_per_day: '', current_phone_system: '', secondary_contact: '',
    plan: 'Starter', how_they_heard: '', referred_by: '',
    best_time_to_reach: '', contract_signed: false, payment_collected: false, notes: '',
  });
  const [planTier, setPlanTier] = useState('Starter');

  const [problemForm, setProblemForm] = useState({ business_name: '', issue: '' });

  const [prospectForm, setProspectForm] = useState<ProspectFormValue>(EMPTY_PROSPECT_FORM);
  // Live duplicate check while Add Prospect is open (same as /setter): a phone
  // match blocks Save; a name-only match is a "Possible match" warning.
  const dupCheck = useBusinessMatches(prospectView === 'add'
    ? { name: prospectForm.company_name, phone: prospectForm.phone, contactPhone: prospectForm.contact_phone, city: prospectForm.city, trade: prospectForm.trade, mode: 'add' }
    : { name: '' });
  const invalidPhoneFields = ([['phone', 'Phone'], ['contact_phone', 'Direct Phone']] as const)
    .filter(([f]) => parseBusinessPhone(prospectForm[f]).status === 'invalid').map(([, label]) => label);

  const [activityForm, setActivityForm] = useState({
    type: 'Call', outcome: '', notes: '', follow_up_date: '',
  });

  const [cancellationForm, setCancellationForm] = useState({
    client_id: '',
    business_name: '',
    reason: '',
    category: 'other',
    plan_type: 'monthly',
    mrr_lost: 0,
    effective_date: '',
    final_month: '',
    notes: '',
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/auth/login'); return; }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (!profile || !['rep', 'vp_sales', 'owner', 'admin'].includes(profile.role)) { router.push('/auth/login'); return; }
setUserProfile(profile); // dropped by 67f8e1a; Mine only, ownership and role checks need it
setSetterAccess(profile.setter_access || false);
if (profile.availability_schedule && Object.keys(profile.availability_schedule).length > 0) {
  setAvailabilitySchedule(prev => ({ ...prev, ...profile.availability_schedule }));
}
    const { data: c } = await supabase.from('clients').select('*').eq('rep_id', session.user.id).order('created_at', { ascending: false });
    if (c) setClients(c);
    // 12-month milestones (display only; lib/compensation.ts getMilestoneProgress). null = tracking not started.
    getMilestoneProgress(session.user.id).then(setMilestones).catch(() => setMilestones(null));
    getCompensationProgress(session.user.id).then(setCompProgress).catch(() => setCompProgress(null)); // throws when tracking hasn't started
    supabase.rpc('my_clients_first_plan').then(({ data }) => {
      setFirstSaleSlugByClient(Object.fromEntries(((data || []) as { client_id: string; plan_slug: string }[]).map(r => [r.client_id, r.plan_slug])));
    });
    const { data: planLinkRows } = await supabase.from('plan_links').select('*').eq('active', true).order('created_at');
    if (planLinkRows) setPlanLinks(planLinkRows);
    const { data: pr } = await supabase.from('problems').select('*').eq('rep_id', session.user.id).order('created_at', { ascending: false });
    if (pr) setProblems(pr);
    refreshProspectData(session.user.id);
    const { data: rpd } = await supabase.from('profiles').select('id, full_name, email');
    if (rpd) setAllRepProfiles(rpd);
    const { data: canc } = await supabase.from('cancellations').select('*').eq('rep_id', session.user.id).order('created_at', { ascending: false });
    if (canc) setCancellations(canc);
    const { data: appts } = await supabase.from('appointments').select('*').eq('assigned_to', session.user.id).order('scheduled_date', { ascending: true });
    if (appts) setAppointments(appts);
    const { data: slots } = await supabase.from('setter_availability').select('*').eq('is_booked', false).eq('owned_by', rescheduleAppt?.assigned_to).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (slots) setAvailSlots(slots);
    const { data: allSlots } = await supabase.from('setter_availability').select('*').eq('owned_by', rescheduleAppt?.assigned_to).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (allSlots) setRepAllSlots(allSlots);
  }

  async function openClientDetail(client: Client) {
    setSelectedClient(client);
    setClientLoading(true);
    setClientView('detail');
    setSelectedBusiness(null);
    setClientCalls([]);
    const { data: bizData } = await supabase.from('businesses').select('*').ilike('name', client.business_name).maybeSingle();
    if (bizData) {
      setSelectedBusiness(bizData);
      const { data: callData } = await supabase.from('calls').select('*').eq('business_id', bizData.id).order('created_at', { ascending: false });
      if (callData) setClientCalls(callData);
    }
    setClientLoading(false);
  }

  async function fetchActivities(prospectId: string) {
    const { data } = await supabase.from('prospect_activities').select('*').eq('prospect_id', prospectId).order('created_at', { ascending: false });
    if (data) setActivities(data);
  }

  async function fetchStageHistory(prospectId: string) {
    const { data } = await supabase.from('prospect_stage_history').select('*').eq('prospect_id', prospectId).order('entered_at', { ascending: true });
    if (data) setStageHistory(data);
  }

  async function submitIntake() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    // Current plans only (Launch / Grow / Starter); tier saved lowercase (lib/client-tier.ts).
    const { error } = await supabase.from('clients').insert({ ...form, province: form.province || null, tier: clientTierAndPlan(form.plan).tier, rep_id: session.user.id, status: 'Onboarding' });
    if (!error) {
      setSuccess('Client submitted. Alex has been notified.');
      setForm({ business_name: '', owner_name: '', phone: '', email: '', city: '', province: '', website: '', calls_per_day: '', current_phone_system: '', secondary_contact: '', plan: 'Starter', how_they_heard: '', referred_by: '', best_time_to_reach: '', contract_signed: false, payment_collected: false, notes: '' });
      setPlanTier('Starter');
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    }
    setLoading(false);
  }

  async function submitProblem() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('problems').insert({ ...problemForm, rep_id: session.user.id, status: 'Open' });
    if (!error) {
      setSuccess('Problem flagged. Alex has been notified.');
      setProblemForm({ business_name: '', issue: '' });
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    }
    setLoading(false);
  }

  // Through the duplicate-checked route, same as /setter: the phone check and
  // the insert happen under one lock (create_prospect_checked, migrations/018),
  // and province is filled from the city (lib/canada-places.ts).
  async function submitProspect() {
    setLoading(true);
    setProspectError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const initialStage = getColumnForStatus(prospectForm.status).label;
    const r = await fetch('/api/prospects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ prospect: prospectForm, stage: initialStage }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      setSuccess('Prospect added.');
      setProspectForm(EMPTY_PROSPECT_FORM);
      fetchData();
      setProspectView('list');
      setTimeout(() => setSuccess(''), 4000);
    } else if (r?.status === 409) {
      if (Array.isArray(j.matches)) dupCheck.setMatches(j.matches);
      setProspectError('Not saved — this phone number is already in Setera.');
    } else {
      setProspectError(j.error || 'Could not save prospect.');
    }
    setLoading(false);
  }


  async function submitCancellation() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('cancellations').insert({
      client_id: cancellationForm.client_id && cancellationForm.client_id !== 'manual' ? cancellationForm.client_id : null,
      business_name: cancellationForm.business_name,
      rep_id: session.user.id,
      reason: cancellationForm.reason,
      category: cancellationForm.category,
      plan_type: cancellationForm.plan_type,
      mrr_lost: cancellationForm.mrr_lost,
      effective_date: cancellationForm.effective_date || null,
      final_month: cancellationForm.final_month || null,
      notes: cancellationForm.notes || null,
      status: 'pending',
      created_by: session.user.id,
    });
    if (!error) {
      setSuccess('Cancellation submitted. Alex has been notified.');
      setCancellationForm({ client_id: '', business_name: '', reason: '', category: 'other', plan_type: 'monthly', mrr_lost: 0, effective_date: '', final_month: '', notes: '' });
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    }
    setLoading(false);
  }

  // Counts, follow-ups due, and whichever Prospects view is showing.
  function refreshProspectData(ownerId = userProfile?.id) {
    fetchProspectStats().then(rows => { if (rows) setProspectStats(rows); });
    loadFollowUpsDue(ownerId);
    setProspectsReload(n => n + 1);
  }
  // The rep's own follow-ups due (reps can read every prospect, so rep_id is
  // required): today's first, then overdue oldest-first, skipping Closed
  // Won/Lost and Do Not Contact — same rules as the setter portal.
  async function loadFollowUpsDue(ownerId = userProfile?.id) {
    if (!ownerId) return;
    const today = localDateStr(); // local date: toISOString() is already tomorrow from 6 pm in Regina
    const due = (a: number, b: number, overdue: boolean) => {
      const q = supabase.from('prospects').select('*').eq('rep_id', ownerId).not('status', 'in', FOLLOWUP_EXCLUDED_IN).not('do_not_contact', 'is', true);
      return (overdue ? q.lt('follow_up_date', today).order('follow_up_date', { ascending: true }) : q.eq('follow_up_date', today))
        .order('created_at', { ascending: false }).order('id').range(a, b);
    };
    const [todayRows, overdueRows] = await Promise.all([fetchAllPages<Prospect>((a, b) => due(a, b, false)), fetchAllPages<Prospect>((a, b) => due(a, b, true))]);
    if (todayRows && overdueRows) setFollowUpsDueToday([...todayRows, ...overdueRows]);
  }
  // reset: page 1 + exact count for the current filters; else the next page.
  async function loadProspectsPage(reset: boolean) {
    const req = ++prospectsReq.current;
    const key = prospectFiltersKey;
    const from = reset ? 0 : prospects.length;
    setProspectsLoading(true);
    const { data, error, count } = await prospectsQuery('*', reset ? { count: 'exact' } : undefined, prospectFilters)
      .order('created_at', { ascending: false }).order('id').range(from, from + PROSPECTS_PAGE_SIZE - 1);
    if (req !== prospectsReq.current) return;
    setProspectsLoading(false);
    if (error || !data) { console.error('Supabase error (prospects page):', error); setProspectError('Failed to load prospects: ' + (error?.message || 'no data')); return; }
    if (reset) { setProspects(data); setProspectCount({ key, n: count ?? data.length }); }
    else setProspects(prev => { const seen = new Set(prev.map(p => p.id)); return [...prev, ...data.filter((p: Prospect) => !seen.has(p.id))]; });
  }
  // Board: newest PROSPECTS_PAGE_SIZE per column (counts from prospect_stats); `more` appends the next page.
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

  async function updateProspectStatus(prospectId: string, newStatus: string, repId?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const rid = repId || session.user.id;
    const prospect = prospects.find(p => p.id === prospectId) || Object.values(boardCols).flat().find(p => p.id === prospectId)
      || followUpsDueToday.find(p => p.id === prospectId) || (selectedProspect?.id === prospectId ? selectedProspect : undefined);
    if (!prospect) return;
    const oldColumn = getColumnForStatus(prospect.status);
    const newColumn = getColumnForStatus(newStatus);
    const now = new Date().toISOString();
    const daysSpent = Math.floor((Date.now() - new Date(prospect.updated_at || prospect.created_at).getTime()) / (1000 * 60 * 60 * 24));
    // lib/stage-change.ts: reports a status that didn't save (e.g. someone else's prospect) or history that wasn't recorded.
    const saved = await saveStatusChange(supabase, { prospectId, newStatus, now, columnChanged: oldColumn.id !== newColumn.id, newStage: newColumn.label, historyRepId: rid, daysInStage: daysSpent });
    if (saved.status === 'not_saved') { setSlotError(saved.message); if (viewMode === 'board') loadBoard(); return; }
    if (saved.status === 'history_failed') setSlotError(saved.message);
    setSelectedProspect(prev => prev ? { ...prev, status: newStatus, updated_at: now } : null);
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, status: newStatus, updated_at: now } : p));
    fetchProspectStats().then(rows => { if (rows) setProspectStats(rows); });
    if (viewMode === 'board') loadBoard();
    if (selectedProspect?.id === prospectId) fetchStageHistory(prospectId);
  }

  // Wrong Number flagged it (lib/callOutcomes.ts); clear once a working number is found.
  async function clearBadNumber(prospectId: string) {
    const { error } = await supabase.from('prospects').update({ bad_number: false }).eq('id', prospectId);
    if (error) return;
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, bad_number: false } : p));
    setSelectedProspect(prev => prev ? { ...prev, bad_number: false } : prev);
  }

  async function logActivity() {
    if (!selectedProspect || !activityForm.outcome.trim()) return; // outcome required (migrations/026)
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const now = new Date().toISOString();
    // Blank date must be null (Postgres rejects ''). A date entered here also
    // becomes the prospect's follow-up — what callbacks-due and the Follow-Up
    // column read; left blank, the prospect's existing date is kept.
    const followUp = activityForm.follow_up_date || null;
    const { error } = await supabase.from('prospect_activities').insert({ ...activityForm, follow_up_date: followUp, prospect_id: selectedProspect.id, rep_id: session.user.id });
    if (!error) {
      const prospectUpdate = prospectUpdateForActivity(activityForm.type, activityForm.outcome, followUp, now); // lib/callOutcomes.ts: Wrong Number also flags bad_number
      await supabase.from('prospects').update(prospectUpdate).eq('id', selectedProspect.id);
      setProspects(prev => prev.map(p => p.id === selectedProspect.id ? { ...p, ...prospectUpdate } : p));
      setSelectedProspect(prev => prev ? { ...prev, ...prospectUpdate } : prev);
      setActivityForm({ type: 'Call', outcome: '', notes: '', follow_up_date: '' });
      fetchActivities(selectedProspect.id);
      loadFollowUpsDue();
    }
    setLoading(false);
  }

  function openDetail(prospect: Prospect) {
    setSelectedProspect(prospect);
    fetchActivities(prospect.id);
    fetchStageHistory(prospect.id);
    setProspectView('detail');
  }

  function getRepName(repId: string) {
    if (repId === userProfile?.id) return 'You';
    const rep = allRepProfiles.find(r => r.id === repId);
    return rep?.full_name || rep?.email?.split('@')[0] || 'Rep';
  }



  function isStale(prospect: Prospect) {
    const ref = prospect.last_contacted_at || prospect.created_at;
    return Date.now() - new Date(ref).getTime() > 21 * 86400000 && !['Closed Won', 'Closed Lost'].includes(prospect.status);
  }

  // Local calendar days, not 24-hour periods (lib/local-date.ts).
  const timeAgoShort = (dateStr: string | null) => lastContactLabel(dateStr);

  function mapPaymentTypeToPlanType(paymentType: string | null): string {
    if (paymentType === '3_month') return '3_month';
    if (paymentType === 'annual_full' || paymentType === 'annual_two_pay') return 'annual';
    if (paymentType === 'custom') return 'custom';
    return 'monthly';
  }

  function handleClientSelect(clientId: string) {
    if (!clientId) {
      setCancellationForm(prev => ({ ...prev, client_id: '', business_name: '', plan_type: 'monthly', mrr_lost: 0 }));
      return;
    }
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const mrr = clientMonthlyRevenue(client, { saleSlug: firstSaleSlugByClient[client.id] }); // current plans at current prices (lib/client-revenue.ts)
    setCancellationForm(prev => ({ ...prev, client_id: clientId, business_name: client.business_name, plan_type: mapPaymentTypeToPlanType(client.payment_type), mrr_lost: mrr }));
  }

  function handlePlanTypeChange(planType: string) {
    setCancellationForm(prev => ({ ...prev, plan_type: planType }));
  }

  const handleSignOut = async () => { await supabase.auth.signOut({ scope: 'local' }); router.push('/auth/login'); };
  async function toggleSetterAccess() {
  const newVal = !setterAccess;
  setSetterAccess(newVal);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('profiles').update({ setter_access: newVal }).eq('id', session.user.id);
  setSuccess(newVal ? 'Setter access enabled — setters can now book your calendar.' : 'Setter access disabled — setters cannot book your calendar.');
  setTimeout(() => setSuccess(''), 3000);
}

async function saveAvailabilitySettings() {
  setSavingAvailability(true);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('profiles').update({ availability_schedule: availabilitySchedule }).eq('id', session.user.id);
  setSuccess('Weekly schedule saved.');
  setTimeout(() => setSuccess(''), 3000);
  setSavingAvailability(false);
}

  function timeToMins(t: string) { const [time, period] = t.split(' '); const [h, m] = time.split(':').map(Number); let hr = h; if (period === 'PM' && h !== 12) hr += 12; if (period === 'AM' && h === 12) hr = 0; return hr * 60 + m; }
  function minsToTime(mins: number) { const h = Math.floor(mins / 60); const m = mins % 60; const period = h >= 12 ? 'PM' : 'AM'; const hour = h > 12 ? h - 12 : h === 0 ? 12 : h; return hour + ':' + m.toString().padStart(2, '0') + ' ' + period; }

  // Same feature as High Table's generateSlots() (app/admin/page.tsx), writing
  // the same setter_availability rows. Both skip any time that already has a
  // slot that day, booked or open (lib/slots.ts newSlotsOnly), and
  // migrations/030 adds a unique index on (owned_by, date, time_slot), so
  // running either (or both) can't create duplicate slots any more.
  async function generateRepSlots() {
    setGeneratingRepSlots(true);
    const { data: { session } } = await supabase.auth.getSession();
    const inserts: any[] = [];
    const startMins = timeToMins(genRepStartTime);
    const endMins = timeToMins(genRepEndTime);
    for (const dateStr of generationDates(genRepDays)) { // Regina dates, starting today
      for (let m = startMins; m < endMins; m += genRepInterval) {
        inserts.push({ date: dateStr, time_slot: minsToTime(m), is_booked: false, created_by: session?.user.id, owned_by: session?.user.id });
      }
    }
    // Skip every time that already has a slot that day, booked or open (lib/slots.ts).
    const dates = inserts.map(i => i.date);
    const { data: existing } = dates.length ? await supabase.from('setter_availability').select('owned_by, date, time_slot').eq('owned_by', session?.user.id).gte('date', dates[0]).lte('date', dates[dates.length - 1]) : { data: [] };
    const toInsert = newSlotsOnly(inserts, existing || []);
    if (toInsert.length) await supabase.from('setter_availability').insert(toInsert);
    setSuccess(`Added ${toInsert.length} slot${toInsert.length === 1 ? '' : 's'}` + (inserts.length > toInsert.length ? `; skipped ${inserts.length - toInsert.length} that already had a slot.` : '.'));
    setTimeout(() => setSuccess(''), 5000);
    const { data: s } = await supabase.from('setter_availability').select('*').eq('owned_by', session?.user.id).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (s) setRepAllSlots(s);
    const { data: avail } = await supabase.from('setter_availability').select('*').eq('is_booked', false).eq('owned_by', session?.user.id).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (avail) setAvailSlots(avail);
    setGeneratingRepSlots(false);
  }

  async function bookRepDemo() {
    if (!bookSlotId || !bookForm.business_name) return;
    setBookingLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const slot = availSlots.find((s: any) => s.id === bookSlotId);
    if (!slot) { setBookingLoading(false); return; }
    setSlotError('');
    // Claim the slot first: if someone else just booked it, stop before creating a Meet invite (lib/slots.ts).
    if (!(await claimSlot(supabase, slot.id))) {
      setSlotError(SLOT_TAKEN_MESSAGE); setBookSlotId('');
      const { data: avail } = await supabase.from('setter_availability').select('*').eq('is_booked', false).eq('owned_by', session?.user.id);
      if (avail) setAvailSlots(avail);
      setBookingLoading(false); return;
    }
    let meetLink = '';
    try {
      const meetRes = await fetch('/api/create-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
        body: JSON.stringify({
          title: 'Setera Demo — ' + bookForm.business_name,
          date: slot.date,
          time: slot.time_slot,
          attendeeName: bookForm.contact_name || bookForm.business_name,
          attendeeEmail: bookForm.email,
          notes: bookForm.notes || '',
        }),
      });
      const meetData = await meetRes.json();
      meetLink = meetData.meetLink || '';
    } catch (e) { console.error('Meet link failed:', e); }
    const { error: apptError } = await supabase.from('appointments').insert({
      business_name: bookForm.business_name,
      trade: bookForm.trade,
      phone: bookForm.phone,
      contact_name: bookForm.contact_name || '',
      contact_phone: bookForm.phone,
      scheduled_date: slot.date,
      scheduled_time: slot.time_slot,
      availability_id: slot.id,
      assigned_to: session?.user.id,
      setter_id: session?.user.id,
      status: 'Scheduled',
      source: 'rep_self_booked',
      notes: bookForm.notes || '',
      meet_link: meetLink,
    });
    if (apptError) { await releaseSlot(supabase, slot.id); setSlotError('Could not save the booking: ' + apptError.message); setBookingLoading(false); return; }
    const { data: appts } = await supabase.from('appointments').select('*').eq('assigned_to', session?.user.id).order('scheduled_date', { ascending: true });
    if (appts) setAppointments(appts);
    const { data: avail } = await supabase.from('setter_availability').select('*').eq('is_booked', false).eq('owned_by', session?.user.id).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (avail) setAvailSlots(avail);
    const { data: allSlots } = await supabase.from('setter_availability').select('*').eq('owned_by', session?.user.id).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (allSlots) setRepAllSlots(allSlots);
    setShowBookPanel(false);
    setBookForm({ business_name: '', contact_name: '', email: '', trade: 'Roofing', phone: '', notes: '' });
    setBookSlotId('');
    setBookMeetLink(meetLink);
    setSuccess('Demo booked' + (meetLink ? ' — Meet link generated!' : '') + ' for ' + slot.date + ' at ' + slot.time_slot + '.');
    setTimeout(() => setSuccess(''), 4000);
    setBookingLoading(false);
  }

  async function deleteRepSlot(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('setter_availability').delete().eq('id', id).eq('is_booked', false); // never a booked slot
    const { data: s } = await supabase.from('setter_availability').select('*').eq('owned_by', session?.user.id).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (s) setRepAllSlots(s);
    const { data: avail } = await supabase.from('setter_availability').select('*').eq('is_booked', false).eq('owned_by', session?.user.id).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (avail) setAvailSlots(avail);
  }

  // Cancel goes through /api/admin/cancel-demo (components/admin/CalendarSlotPopover.tsx
  // CancelDemo): Google event deleted first, then Cancelled + slot reopened.
  function onDemoCancelled(apptId: string, result: PopoverResult) {
    setCancelingApptId(null);
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: 'Cancelled' } : a));
    if (result.warning) { setSlotError(result.message); setSuccess(''); }
    else { setSuccess(result.message); setTimeout(() => setSuccess(''), 8000); }
  }

  async function markAppointmentOutcome(appt: Appointment, outcome: 'Showed' | 'No Show') {
    await supabase.from('appointments').update({ status: outcome }).eq('id', appt.id);
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: outcome } : a));
  }

  // Server-side (/api/admin/reschedule-demo): claims the new slot, moves the
  // same Google event (Meet link unchanged, Google emails the invitee), then the
  // appointment. Any Google failure changes nothing. force = "Reschedule in
  // Setera anyway" after "no Google event found".
  async function rescheduleAppointment(force = false) {
    if (!rescheduleAppt || !rescheduleSlotId) return;
    setCancelLoading(true);
    setSlotError('');
    setRescheduleEventMissing(false);
    const { data: { session } } = await supabase.auth.getSession();
    let body: any = {}, ok = false;
    try {
      const res = await fetch('/api/admin/reschedule-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
        body: JSON.stringify({ appointmentId: rescheduleAppt.id, newSlotId: rescheduleSlotId, force }),
      });
      body = await res.json().catch(() => ({}));
      ok = res.ok;
    } catch (e: any) {
      body = { error: 'Could not reach the server: ' + (e?.message || 'network error') + '. Check the demo\'s time before trying again.' };
    }
    const { data: slots } = await supabase.from('setter_availability').select('*').eq('is_booked', false).eq('owned_by', rescheduleAppt.assigned_to).order('date', { ascending: true }).order('time_slot', { ascending: true });
    if (slots) setAvailSlots(slots);
    if (!ok) {
      setSlotError(body.error || 'Could not reschedule.');
      setRescheduleEventMissing(body.code === 'event_not_found');
      if (body.error === SLOT_TAKEN_MESSAGE) setRescheduleSlotId('');
      setCancelLoading(false);
      return;
    }
    const { data: appts } = await supabase.from('appointments').select('*').eq('assigned_to', rescheduleAppt.assigned_to).order('scheduled_date', { ascending: true });
    if (appts) setAppointments(appts);
    setRescheduleAppt(null);
    setRescheduleSlotId('');
    setCancelLoading(false);
    const msg = 'Rescheduled to ' + body.newDate + ' at ' + body.newTime + '.'
      + (body.googleEventMoved ? ' Google Calendar updated (same Meet link)' + (body.notifiedEmails?.length ? '; ' + body.notifiedEmails.join(', ') + ' was emailed the new time.' : '; nobody was on the invite, so let them know yourself.') : '')
      + (body.warnings?.length ? ' ' + body.warnings.join(' ') : '');
    if (body.warnings?.length || (body.googleEventMoved && !body.notifiedEmails?.length)) setSlotError(msg);
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 8000); }
  }

  // Search, Status and Mine-only are applied in the query (lib/prospect-search.ts).
  const prospectFilters: ProspectFilters = { search: debouncedSearch, status: statusFilter, rep: showMineOnly && userProfile?.id ? userProfile.id : 'All', province: 'All', city: 'All' };
  const prospectFiltersKey = filtersKey(prospectFilters);
  const prospectMatchCount = prospectCount?.key === prospectFiltersKey ? prospectCount.n : null;
  const prospectsTotal = sumStatuses(statusCounts(prospectStats));
  const myProspectsCount = userProfile?.id ? sumStatuses(statusCounts(prospectStats, userProfile.id)) : 0;
  const allStatusCounts = statusCounts(prospectStats);
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchQuery), 250); return () => clearTimeout(t); }, [searchQuery]);
  useEffect(() => {
    if (tab !== 'prospects' || !userProfile) return;
    if (viewMode === 'table') loadProspectsPage(true); else loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, viewMode, prospectFiltersKey, prospectsReload, userProfile?.id]);
  const isOwnProspect = selectedProspect ? selectedProspect.rep_id === userProfile?.id : false;

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
  const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const sec: React.CSSProperties = { color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '28px 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' };

  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'prospects', label: 'Prospects' },
    { id: 'intake', label: 'New Client' },
    { id: 'clients', label: 'My Clients' },
    { id: 'earnings', label: 'Earnings' },
    { id: 'cancellations', label: 'Cancellations' },
    { id: 'problems', label: 'Problems' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'overflow', label: 'Overflow' },
    { id: 'resources', label: 'Resources' },
  ];

  const openProblems = problems.filter(p => p.status === 'Open').length;
  const avatarInitial = userProfile ? getAvatarInitial(userProfile.full_name, userProfile.email) : 'R';
  const displayName = userProfile?.full_name || 'Rep';
  const roleLabel = userProfile ? getRoleLabel(userProfile.role) : 'Sales Rep';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>

      <div style={{ width: '220px', backgroundColor: '#0f2318', display: 'flex', flexDirection: 'column', padding: '28px 16px', position: 'fixed', height: '100vh', boxShadow: '4px 0 24px rgba(0,0,0,0.15)', zIndex: 100 }}>
        <div style={{ marginBottom: '40px', padding: '0 8px' }}>
          <h2 style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 3px 0' }}>Setera</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rep Portal</p>
        </div>
        {navItems.map((item) => (
          <div key={item.id} onClick={() => { setTab(item.id); if (item.id === 'prospects') setProspectView('list'); if (item.id === 'clients') setClientView('list'); }}
            style={{ padding: '11px 12px', borderRadius: '10px', marginBottom: '4px', color: tab === item.id ? '#fff' : 'rgba(255,255,255,0.45)', backgroundColor: tab === item.id ? 'rgba(0,212,170,0.18)' : 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: tab === item.id ? '600' : '400', borderLeft: tab === item.id ? '3px solid #00d4aa' : '3px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {item.label}
            {item.id === 'prospects' && myProspectsCount > 0 && tab !== 'prospects' && (
              <span style={{ backgroundColor: 'rgba(0,212,170,0.25)', color: '#00d4aa', fontSize: '11px', padding: '1px 7px', borderRadius: '20px', fontWeight: '700' }}>{myProspectsCount}</span>
            )}

            {item.id === 'problems' && openProblems > 0 && tab !== 'problems' && (
              <span style={{ backgroundColor: 'rgba(239,68,68,0.25)', color: '#ef4444', fontSize: '11px', padding: '1px 7px', borderRadius: '20px', fontWeight: '700' }}>{openProblems}</span>
            )}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: '14px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#000', flexShrink: 0 }}>{avatarInitial}</div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
              <p style={{ color: 'rgba(204, 58, 58, 0.35)', fontSize: '11px', margin: 0 }}>{roleLabel}</p>
            </div>
          </div>
          {/* Setter tools (call log, lead requests, setter earnings) stay available to reps, e.g. after a promotion. */}
          <button onClick={() => switchPortal('setter')} style={{ width: '100%', backgroundColor: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.35)', color: '#00d4aa', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Setter tools →</button>
          <button onClick={handleSignOut} style={{ width: '100%', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Sign out</button>
        </div>
      </div>

      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>

        {slotError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <span>{slotError}</span>
            <button onClick={() => setSlotError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {success && (
          <div style={{ backgroundColor: '#d1fae5', border: '1px solid #10b981', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', color: '#065f46', fontSize: '14px', fontWeight: '600' }}>
            {'✓ ' + success}
          </div>
        )}

        {tab === 'overview' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>
                {'Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening') + ', ' + (userProfile?.full_name?.split(' ')[0] || 'Rep')}
              </h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Here is where things stand today.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              {[
                { label: 'Total Prospects', value: prospectsTotal, color: '#8b5cf6' },
                { label: 'Active Clients', value: clients.filter(c => c.status === 'Active' || c.status === 'Onboarding').length, color: '#00d4aa' },
                { label: 'Deals Won', value: allStatusCounts['Closed Won'] || 0, color: '#10b981' },
                { label: 'Open Problems', value: openProblems, color: openProblems > 0 ? '#ef4444' : '#9ca3af' },
              ].map(stat => (
                <div key={stat.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '3px solid ' + stat.color }}>
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{stat.label}</p>
                  <p style={{ color: stat.color, fontSize: '34px', fontWeight: '800', margin: 0 }}>{stat.value}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
              {PIPELINE_COLUMNS.map(col => {
                const count = sumStatuses(allStatusCounts, col.statuses);
                return (
                  <div key={col.id} onClick={() => { setTab('prospects'); setViewMode('board'); }}
                    style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', cursor: 'pointer', borderLeft: '3px solid ' + col.color }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}>
                    <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{col.label}</p>
                    <p style={{ color: col.color, fontSize: '26px', fontWeight: '800', margin: '0 0 2px 0' }}>{count}</p>
                  </div>
                );
              })}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Follow-ups Due</p>
                {followUpsDueToday.length > 0 && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '12px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700' }}>{followUpsDueToday.length} due</span>}
              </div>
              {followUpsDueToday.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Nothing due today.</p>
              ) : followUpsDueToday.map(p => {
                const st = getStatusStyle(p.status);
                const overdue = !!p.follow_up_date && isOverdue(p.follow_up_date, localDateStr());
                return (
                  <div key={p.id} onClick={() => { setTab('prospects'); openDetail(p); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{p.company_name}</p>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{p.contact_name || 'No contact'} · {p.city || p.province}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ backgroundColor: st.bg, color: st.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>{p.status}</span>
                      <span style={{ backgroundColor: overdue ? '#fee2e2' : '#fef3c7', color: overdue ? '#991b1b' : '#92400e', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700', whiteSpace: 'nowrap' }}>{overdue ? 'OVERDUE · ' + formatDate(p.follow_up_date || '') : 'TODAY'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {clients.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Clients</p>
                  <span onClick={() => setTab('clients')} style={{ color: '#00d4aa', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>View all</span>
                </div>
                {clients.slice(0, 4).map(c => (
                  <div key={c.id} onClick={() => { setTab('clients'); openClientDetail(c); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{c.business_name}</p>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{c.plan}</p>
                    </div>
                    <span style={{ backgroundColor: c.status === 'Active' ? '#d1fae5' : '#fef3c7', color: c.status === 'Active' ? '#065f46' : '#92400e', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
            {userProfile?.role === 'rep' && (() => {
  const totalEarned = Math.round(clients.reduce((sum, c) => sum + firstPaymentCommission(c, firstSaleSlugByClient[c.id]).amount, 0) * 100) / 100;
  const activeClients = clients.filter(c => c.status === 'Active').length;
  return (
    <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Earnings</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Earned', value: '$' + totalEarned.toLocaleString(), color: '#00d4aa' },
          { label: 'Closes', value: String(clients.length), color: '#fff' },
          { label: 'Active Clients', value: String(activeClients), color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: '28px', fontWeight: '800', margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '20px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '14px 16px' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>15% during Training · 5% or 15%+bonuses depending on your track · <span style={{ color: '#00d4aa', cursor: 'pointer', fontWeight: '600' }} onClick={() => setTab('earnings')}>View full breakdown →</span></p>
      </div>
    </div>
  );
})()}
{milestones !== undefined && (
  <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: '20px' }}>
    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>12-Month Milestones</p>
    <MilestoneProgress progress={milestones} dark />
  </div>
)}
{compProgress?.sprint && (
  <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: '20px' }}>
    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Sprint</p>
    <SprintProgress sprint={compProgress.sprint} dark />
  </div>
)}
{compProgress && compProgress.planMilestones.length > 0 && (
  <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: '20px' }}>
    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Every 10th Paying Client</p>
    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', margin: '0 0 12px 0' }}>That client pays you the full first month instead of 15%. {compProgress.qualifyingClientCount} client(s) so far{compProgress.bonusEligible ? '' : ` · payable once you're past your first ${compProgress.trainingClientCount}`}.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
      {compProgress.planMilestones.map(m => (
        <div key={m.planSlug} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px' }}>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', fontWeight: 700, margin: 0 }}>{m.displayName}</p>
          <p style={{ color: '#fff', fontSize: '16px', fontWeight: 800, margin: 0 }}>{m.countTowardNext} / 10</p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', margin: 0 }}>{m.remaining} to a full ${m.payoutAmount.toLocaleString()}</p>
        </div>
      ))}
    </div>
  </div>
)}
{userProfile?.role === 'vp_sales' && (
  <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Earnings</p>
    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>Commission tracking and override earnings coming soon.</p>
  </div>
)}
          </div>
        )}

        {tab === 'intake' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>New Client</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Fill this out the moment they sign</p>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: '800px' }}>
              <p style={sec}>Business Info</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div><label style={lbl}>Business Name *</label><input style={inp} placeholder="Apex Roofing" value={form.business_name} onChange={e => setForm({...form, business_name: e.target.value})} /></div>
                <div><label style={lbl}>Owner Name *</label><input style={inp} placeholder="John Smith" value={form.owner_name} onChange={e => setForm({...form, owner_name: e.target.value})} /></div>
                <div><label style={lbl}>Phone *</label><input style={inp} placeholder="(306) 555-0100" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div><label style={lbl}>Email *</label><input style={inp} placeholder="john@example.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
                <div><label style={lbl}>City</label><input style={inp} placeholder="Regina" value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
                <div><label style={lbl}>Province</label>
                  <select style={{...inp, backgroundColor: '#fff'}} value={form.province} onChange={e => setForm({...form, province: e.target.value})}>
                    <option value=''>Not set</option>
                    {['SK','AB','BC','MB','ON','QC','NS','NB','NL','PE','YT','NT','NU'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Website</label><input style={inp} placeholder="www.apexroofing.ca" value={form.website} onChange={e => setForm({...form, website: e.target.value})} /></div>
                <div><label style={lbl}>Secondary Contact</label><input style={inp} placeholder="Name and number" value={form.secondary_contact} onChange={e => setForm({...form, secondary_contact: e.target.value})} /></div>
              </div>
              <p style={sec}>Call Volume and Setup</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div><label style={lbl}>Estimated Calls Per Day</label><input style={inp} placeholder="e.g. 15" value={form.calls_per_day} onChange={e => setForm({...form, calls_per_day: e.target.value})} /></div>
                <div><label style={lbl}>Current Phone System</label><input style={inp} placeholder="Cell, landline, VOIP..." value={form.current_phone_system} onChange={e => setForm({...form, current_phone_system: e.target.value})} /></div>
                <div><label style={lbl}>Best Time to Reach</label><input style={inp} placeholder="e.g. Mornings before 10am" value={form.best_time_to_reach} onChange={e => setForm({...form, best_time_to_reach: e.target.value})} /></div>
              </div>
              <p style={sec}>Deal Info</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Plan *</label>
                  <select style={{...inp, backgroundColor: '#fff'}} value={planTier} onChange={e => { setPlanTier(e.target.value); setForm({...form, plan: e.target.value}); }}>
                    <option value='Launch'>Launch — $697/mo</option>
                    <option value='Grow'>Grow — $1,348/mo</option>
                    <option value='Starter'>Starter — $2,247/mo</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0, fontWeight: '600' }}>Talking to an Enterprise or National-sized prospect? Those tiers are not set up in the portal yet — contact Alex directly instead of submitting through this form.</p>
                  </div>
                </div>
                <div><label style={lbl}>How Did They Hear About Us?</label><input style={inp} placeholder="Referral, cold call, LinkedIn..." value={form.how_they_heard} onChange={e => setForm({...form, how_they_heard: e.target.value})} /></div>
                <div><label style={lbl}>Referred By</label><input style={inp} placeholder="Name of referrer if applicable" value={form.referred_by} onChange={e => setForm({...form, referred_by: e.target.value})} /></div>
              </div>
              <p style={sec}>Confirm Before Submitting</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.contract_signed} onChange={e => setForm({...form, contract_signed: e.target.checked})} style={{ width: '18px', height: '18px', accentColor: '#0f2318', cursor: 'pointer' }} />
                  <span style={{ color: '#374151', fontSize: '14px', fontWeight: '500' }}>Contract has been signed</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.payment_collected} onChange={e => setForm({...form, payment_collected: e.target.checked})} style={{ width: '18px', height: '18px', accentColor: '#0f2318', cursor: 'pointer' }} />
                  <span style={{ color: '#374151', fontSize: '14px', fontWeight: '500' }}>Payment has been collected</span>
                </label>
              </div>
              <div style={{ marginBottom: '28px' }}>
                <label style={lbl}>Notes</label>
                <textarea placeholder="Anything else Alex should know..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  style={{ width: '100%', minHeight: '100px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
              </div>
              <button onClick={submitIntake} disabled={loading || !form.business_name || !form.owner_name || !form.phone}
                style={{ backgroundColor: '#0f2318', color: '#fff', padding: '14px 40px', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: loading || !form.business_name || !form.owner_name || !form.phone ? 0.6 : 1 }}>
                {loading ? 'Submitting...' : 'Submit New Client'}
              </button>
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <>
            {clientView === 'list' && (
              <div>
                <div style={{ marginBottom: '32px' }}>
                  <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>My Clients</h1>
                  <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{clients.length} client{clients.length !== 1 ? 's' : ''} signed</p>
                </div>
                <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', padding: '14px 24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                    {['Business','Owner','Plan','Contract','Payment','Status'].map(col => (
                      <p key={col} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col}</p>
                    ))}
                  </div>
                  {clients.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', padding: '40px', textAlign: 'center' }}>No clients yet. Go close some deals.</p>
                  ) : clients.map(client => (
                    <div key={client.id} onClick={() => openClientDetail(client)}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', padding: '16px 24px', borderBottom: '1px solid #f9fafb', alignItems: 'center', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <div>
                        <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{client.business_name}</p>
                        <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{client.city}, {client.province}</p>
                      </div>
                      <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>{client.owner_name}</p>
                      <p style={{ color: '#374151', fontSize: '12px', margin: 0 }}>{client.plan}</p>
                      <span style={{ color: client.contract_signed ? '#10b981' : '#ef4444', fontSize: '12px', fontWeight: '600' }}>{client.contract_signed ? 'Yes' : 'No'}</span>
                      <span style={{ color: client.payment_collected ? '#10b981' : '#ef4444', fontSize: '12px', fontWeight: '600' }}>{client.payment_collected ? 'Yes' : 'No'}</span>
                      <span style={{ backgroundColor: '#d1fae5', color: '#065f46', fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '600', display: 'inline-block' }}>{client.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {clientView === 'detail' && selectedClient && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <button onClick={() => { setClientView('list'); setSelectedClient(null); setSelectedBusiness(null); setClientCalls([]); }}
                    style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Back</button>
                  <div style={{ flex: 1 }}>
                    <h1 style={{ color: '#0a1f13', fontSize: '26px', fontWeight: '800', margin: '0 0 4px 0' }}>{selectedClient.business_name}</h1>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{selectedClient.owner_name} · {selectedClient.city}, {selectedClient.province}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {selectedBusiness && <span style={{ backgroundColor: '#d1fae5', color: '#065f46', fontSize: '12px', padding: '5px 12px', borderRadius: '20px', fontWeight: '700' }}>{daysAsClient(selectedBusiness) === 0 ? 'Day 1' : daysAsClient(selectedBusiness) + ' days as client'}</span>}
                    <span style={{ backgroundColor: '#e0f2fe', color: '#0c4a6e', fontSize: '12px', padding: '5px 12px', borderRadius: '20px', fontWeight: '700' }}>{selectedClient.plan}</span>
                    <span style={{ backgroundColor: selectedClient.status === 'Onboarding' ? '#fef3c7' : '#d1fae5', color: selectedClient.status === 'Onboarding' ? '#92400e' : '#065f46', fontSize: '12px', padding: '5px 12px', borderRadius: '20px', fontWeight: '700' }}>{selectedClient.status}</span>
                  </div>
                </div>
                {selectedBusiness && (() => {
                  const progress = getPlanProgress(selectedClient.plan, selectedBusiness);
                  if (!progress) return null;
                  const pct = Math.min(100, Math.round((progress.days / progress.total) * 100));
                  const remaining = Math.max(0, progress.total - progress.days);
                  const isNearEnd = remaining <= 14;
                  return (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px 24px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <span style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700' }}>{'Day ' + progress.days + ' of ' + progress.total}</span>
                          <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}>{progress.label + ' commitment'}</span>
                        </div>
                        <span style={{ color: isNearEnd ? '#ef4444' : '#6b7280', fontSize: '12px', fontWeight: '700', backgroundColor: isNearEnd ? '#fee2e2' : '#f3f4f6', padding: '3px 10px', borderRadius: '20px' }}>
                          {remaining === 0 ? 'Commitment complete' : remaining + ' days remaining'}
                        </span>
                      </div>
                      <div style={{ backgroundColor: '#f3f4f6', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: isNearEnd ? '#ef4444' : '#00d4aa', height: '100%', width: pct + '%', borderRadius: '99px' }} />
                      </div>
                    </div>
                  );
                })()}
                {clientLoading ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading client data...</div>
                ) : (
                  <>
                    {!selectedBusiness && (
                      <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
                        <p style={{ color: '#92400e', fontSize: '14px', margin: 0, fontWeight: '500' }}>This client is not yet live on the platform. Once Alex sets up their Emily account the call data will appear here.</p>
                      </div>
                    )}
                    {selectedBusiness && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                          {[
                            { label: 'Total Calls', value: clientCalls.length, color: '#00d4aa' },
                            { label: 'Urgent', value: clientCalls.filter(c => c.status === 'red').length, color: '#ef4444' },
                            { label: 'Follow Up', value: clientCalls.filter(c => c.status === 'yellow').length, color: '#f59e0b' },
                            { label: 'After Hours', value: clientCalls.filter(c => isAfterHours(c.created_at)).length, color: '#8b5cf6' },
                          ].map(stat => (
                            <div key={stat.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '3px solid ' + stat.color }}>
                              <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{stat.label}</p>
                              <p style={{ color: stat.color, fontSize: '32px', fontWeight: '800', margin: 0 }}>{stat.value}</p>
                            </div>
                          ))}
                        </div>
                        {clientCalls.length > 0 && getTopReasons(clientCalls).length > 0 && (
                          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                            <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Top Call Reasons</p>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              {getTopReasons(clientCalls).map(([reason, count]) => (
                                <div key={reason} style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '500' }}>{reason}</span>
                                  <span style={{ backgroundColor: '#0f2318', color: '#00d4aa', fontSize: '11px', padding: '1px 6px', borderRadius: '10px', fontWeight: '700' }}>{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '24px' }}>
                          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
                            <h3 style={{ color: '#0a1f13', fontSize: '15px', fontWeight: '700', margin: 0 }}>Recent Calls</h3>
                          </div>
                          {clientCalls.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: '14px', padding: '40px', textAlign: 'center' }}>No calls yet. Emily is standing by.</p>
                          ) : clientCalls.slice(0, 20).map(call => (
                            <div key={call.id} style={{ padding: '14px 24px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getCallColor(call.status), flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{call.caller_name || 'Unknown caller'}</p>
                                <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{call.reason || 'No reason provided'}</p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ backgroundColor: getCallColor(call.status) + '18', color: getCallColor(call.status), fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '600' }}>{getCallLabel(call.status)}</span>
                                <p style={{ color: '#9ca3af', fontSize: '11px', margin: '3px 0 0' }}>{formatDate(call.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Submission Info</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {([['Owner', selectedClient.owner_name],['Phone', selectedClient.phone],['Email', selectedClient.email],['Plan', selectedClient.plan],['Contract Signed', selectedClient.contract_signed ? 'Yes' : 'No'],['Payment Collected', selectedClient.payment_collected ? 'Yes' : 'No'],['Submitted', formatDate(selectedClient.created_at)]] as [string, string][]).map(([label, value]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span>
                            <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500' }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'prospects' && (
          <>
            {prospectView === 'list' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                  <div>
                    <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Prospect Directory</h1>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{(statusFilter !== 'All' || debouncedSearch.trim() ? (prospectMatchCount === null ? '…' : prospectMatchCount.toLocaleString()) + ' of ' : '') + (showMineOnly ? myProspectsCount.toLocaleString() + ' in your pipeline' : prospectsTotal.toLocaleString() + ' across all reps')}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button onClick={() => setShowMineOnly(!showMineOnly)} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: showMineOnly ? '#0f2318' : '#fff', color: showMineOnly ? '#00d4aa' : '#6b7280' }}>{showMineOnly ? 'Mine Only' : 'All Reps'}</button>
                    <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <button onClick={() => setViewMode('table')} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', backgroundColor: viewMode === 'table' ? '#0f2318' : '#fff', color: viewMode === 'table' ? '#00d4aa' : '#6b7280' }}>Table</button>
                      <button onClick={() => setViewMode('board')} style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', backgroundColor: viewMode === 'board' ? '#0f2318' : '#fff', color: viewMode === 'board' ? '#00d4aa' : '#6b7280', borderLeft: '1px solid #e5e7eb' }}>Board</button>
                    </div>
                    <button onClick={() => { setProspectError(''); setProspectView('add'); }} style={{ backgroundColor: '#0f2318', color: '#fff', padding: '11px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none' }}>+ Add Prospect</button>
                  </div>
                </div>
                {viewMode === 'table' && (
                  <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                      <input style={{ ...inp, backgroundColor: '#fff', flex: 1 }} placeholder="Search by company, contact, phone, city, or trade..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', minWidth: '200px' }}>
                        <option value="All">All Statuses</option>
                        {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr 1.2fr 1fr', padding: '14px 24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                        {['Company','Trade','Contact','Owner','Status','Last Contact'].map(col => (
                          <p key={col} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col}</p>
                        ))}
                      </div>                      {prospects.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: '14px', padding: '48px', textAlign: 'center' }}>{prospectsLoading || prospectMatchCount === null ? 'Loading…' : prospectsTotal === 0 ? 'No prospects yet. Hit Add Prospect to start building your pipeline.' : 'No results for that filter.'}</p>
                      ) : prospects.map(p => {
                        const st = getStatusStyle(p.status);
                        const isOwn = p.rep_id === userProfile?.id;
                        const stale = isStale(p);
                        return (
                          <div key={p.id} onClick={() => openDetail(p)}
                            style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr 1.2fr 1fr', padding: '15px 24px', borderBottom: '1px solid #f9fafb', alignItems: 'center', cursor: 'pointer', backgroundColor: p.do_not_contact ? '#fff5f5' : 'transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = p.do_not_contact ? '#fee2e2' : '#f9fafb')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = p.do_not_contact ? '#fff5f5' : 'transparent')}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                {!isOwn && <span style={{ fontSize: '11px' }}>🔒</span>}
                                {p.do_not_contact && <span style={{ fontSize: '11px' }}>🚫</span>}
                                {p.bad_number && <span title="Bad number (Wrong Number logged)" style={{ fontSize: '11px' }}>📵</span>}
                                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: 0 }}>{p.company_name}</p>
                              </div>
                              {p.city && <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{p.city}</p>}
                            </div>
                            <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>{p.trade || '-'}</p>
                            <div>
                              <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 1px 0' }}>{p.contact_name || '-'}</p>
                              {p.contact_position && <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{p.contact_position}</p>}
                            </div>
                            <span style={{ backgroundColor: isOwn ? '#d1fae5' : '#f3f4f6', color: isOwn ? '#065f46' : '#6b7280', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600', display: 'inline-block' }}>{getRepName(p.rep_id)}</span>
                            <span style={{ backgroundColor: st.bg, color: st.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600', display: 'inline-block' }}>{p.status}</span>
                            <span style={{ backgroundColor: stale ? '#fee2e2' : '#f3f4f6', color: stale ? '#991b1b' : '#6b7280', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600', display: 'inline-block' }}>{timeAgoShort(p.last_contacted_at)}</span>
                          </div>
                        );
                      })}
                      {prospects.length > 0 && prospectMatchCount !== null && prospects.length < prospectMatchCount && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px' }}>
                          <span style={{ color: '#9ca3af', fontSize: '13px' }}>Showing {prospects.length.toLocaleString()} of {prospectMatchCount.toLocaleString()}</span>
                          <button onClick={() => loadProspectsPage(false)} disabled={prospectsLoading} style={{ backgroundColor: '#fff', color: '#0f2318', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: prospectsLoading ? 'default' : 'pointer', border: '1px solid #e5e7eb' }}>{prospectsLoading ? 'Loading…' : 'Load ' + Math.min(PROSPECTS_PAGE_SIZE, prospectMatchCount - prospects.length) + ' more'}</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {viewMode === 'board' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    {PIPELINE_COLUMNS.map(column => {
                      const columnProspects = boardCols[column.id] || [];
                      const columnCount = sumStatuses(allStatusCounts, column.statuses);
                      return (
                        <div key={column.id}
                          onDragOver={e => { e.preventDefault(); setDragOverColumnId(column.id); }}
                          onDragLeave={() => setDragOverColumnId(null)}
                          onDrop={e => { e.preventDefault(); if (draggedProspectId) { updateProspectStatus(draggedProspectId, column.defaultStatus); setDraggedProspectId(null); setDragOverColumnId(null); } }}
                          style={{ backgroundColor: dragOverColumnId === column.id ? column.accent : '#f9fafb', borderRadius: '12px', padding: '14px', border: '2px dashed ' + (dragOverColumnId === column.id ? column.color : 'transparent'), minHeight: '480px', transition: 'all 0.15s' }}>
                          <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid ' + column.color + '30' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '15px', fontWeight: '800', color: '#0a1f13' }}>{column.label}</span>
                              <span style={{ backgroundColor: column.accent, color: column.color, fontSize: '12px', padding: '2px 10px', borderRadius: '20px', fontWeight: '700', border: '1px solid ' + column.color + '40' }}>{columnCount.toLocaleString()}</span>
                            </div>
                          </div>
                          {columnProspects.map(p => {
                            const days = totalDays(p);
                            const isClosed = p.status === 'Closed Won';
                            return (
                              <div key={p.id} draggable onDragStart={() => setDraggedProspectId(p.id)} onDragEnd={() => { setDraggedProspectId(null); setDragOverColumnId(null); }} onClick={() => openDetail(p)}
                                style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'grab', opacity: draggedProspectId === p.id ? 0.4 : 1, border: '0.5px solid #e5e7eb' }}>
                                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>{p.company_name}</p>
                                {p.contact_name && <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 2px 0' }}>{p.contact_name}</p>}
                                {(p.contact_phone || p.phone) && <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 8px 0' }}>{p.contact_phone || p.phone}</p>}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>{p.province || ''}</span>
                                  <span style={{ backgroundColor: isClosed ? '#d1fae5' : '#f3f4f6', color: isClosed ? '#065f46' : '#374151', fontSize: '10px', padding: '2px 7px', borderRadius: '20px', fontWeight: '700' }}>{days === 0 ? 'Today' : days + 'd total'}</span>
                                </div>
                              </div>
                            );
                          })}
                          {columnProspects.length > 0 && columnProspects.length < columnCount && <button onClick={() => loadBoardColumn(column.id, true)} style={{ width: '100%', backgroundColor: 'transparent', color: '#6b7280', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px dashed #d1d5db' }}>{'Show more (' + (columnCount - columnProspects.length).toLocaleString() + ' not shown)'}</button>}
                          {columnProspects.length === 0 && <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9ca3af', fontSize: '13px', border: '1.5px dashed #e5e7eb', borderRadius: '8px' }}>Drop here</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {prospectView === 'add' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                  <button onClick={() => setProspectView('list')} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Back</button>
                  <div>
                    <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 2px 0' }}>Add Prospect</h1>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Enter company info before or after the call</p>
                  </div>
                </div>
                <AddProspectForm
                  value={prospectForm}
                  onChange={v => { setProspectForm(v); setProspectError(''); }}
                  onSubmit={submitProspect}
                  onCancel={() => { setProspectView('list'); setProspectError(''); }}
                  loading={loading}
                  submitLabel={dupCheck.checking ? 'Checking...' : dupCheck.phoneMatches.length > 0 ? 'Already in Setera' : 'Save Prospect'}
                  submitDisabled={dupCheck.checking || dupCheck.phoneMatches.length > 0 || invalidPhoneFields.length > 0}
                  warning={<>
                    {prospectError && <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 12px 0' }}>{prospectError}</p>}
                    {invalidPhoneFields.length > 0 && <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 12px 0' }}>{invalidPhoneFields.join(' and ')} must be a 10-digit CA/US number (extensions like &quot;ext 12&quot; are fine).</p>}
                    <BusinessMatchList variant="block" matches={dupCheck.phoneMatches} onRequested={() => dupCheck.refresh()}
                      title="This phone number is already in Setera — you can't add it. Request it if it's gone stale." />
                    <BusinessMatchList variant="warn" matches={dupCheck.nameMatches} onRequested={() => dupCheck.refresh()}
                      title="Possible match by name — make sure this isn't the same business. You can still save." />
                  </>}
                />
              </div>
            )}
            {prospectView === 'detail' && selectedProspect && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                  <button onClick={() => { setProspectView('list'); setSelectedProspect(null); setActivities([]); setStageHistory([]); }}
                    style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Back</button>
                  <div style={{ flex: 1 }}>
                    <h1 style={{ color: '#0a1f13', fontSize: '26px', fontWeight: '800', margin: '0 0 2px 0' }}>{selectedProspect.company_name}</h1>
                    <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{buildSubtitle(selectedProspect.trade, selectedProspect.city, selectedProspect.province)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ backgroundColor: '#f3f4f6', color: '#374151', fontSize: '12px', padding: '5px 12px', borderRadius: '20px', fontWeight: '700' }}>{totalDays(selectedProspect) === 0 ? 'Day 1' : totalDays(selectedProspect) + ' days total'}</span>
                    <label style={{ ...lbl, margin: 0 }}>Status</label>
                    {isOwnProspect ? (
                      <select value={selectedProspect.status} onChange={e => updateProspectStatus(selectedProspect.id, e.target.value)} style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', backgroundColor: '#fff', fontWeight: '600', cursor: 'pointer', outline: 'none' }}>
                        {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span style={{ backgroundColor: getStatusStyle(selectedProspect.status).bg, color: getStatusStyle(selectedProspect.status).color, fontSize: '12px', padding: '5px 12px', borderRadius: '20px', fontWeight: '700' }}>{selectedProspect.status}</span>
                    )}
                  </div>
                </div>
                {!selectedProspect.do_not_contact && <div style={{ marginBottom: '20px' }}><OverflowQuickAdd collapsible compact showRecent={false} defaults={{ email: selectedProspect.contact_email || selectedProspect.email || '', businessName: selectedProspect.company_name || '', contactName: selectedProspect.contact_name || '' }} /></div>}
                {selectedProspect.do_not_contact && (
                  <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>🚫</span>
                    <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '700', margin: 0 }}>Do Not Contact — this prospect has been marked off limits by admin. Do not reach out.</p>
                  </div>
                )}
                {selectedProspect.bad_number && (
                  <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>📵</span>
                    <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '700', margin: 0 }}>Bad number — a Wrong Number call was logged. Find a working number before calling again.</p>
                    {isOwnProspect && <button onClick={() => clearBadNumber(selectedProspect.id)} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#991b1b', flexShrink: 0 }}>Clear</button>}
                  </div>
                )}
                {!isOwnProspect && (
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '10px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '18px' }}>🔒</span>
                    <div>
                      <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 2px 0' }}>Claimed by {getRepName(selectedProspect.rep_id)}</p>
                      <p style={{ color: '#92400e', fontSize: '12px', margin: 0 }}>This prospect is being actively worked. You can view the history but cannot log activities or change the status.</p>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                    <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>Company</p>
                    {([['Phone', selectedProspect.phone],['Email', selectedProspect.email],['Website', selectedProspect.website],['Source', selectedProspect.source]] as [string, string][]).filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span>
                        <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                    <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>Contact</p>
                    {([['Name', selectedProspect.contact_name],['Position', selectedProspect.contact_position],['Direct Phone', selectedProspect.contact_phone],['Direct Email', selectedProspect.contact_email]] as [string, string][]).filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span>
                        <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500' }}>{value}</span>
                      </div>
                    ))}
                    {selectedProspect.follow_up_date && (
                      <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                        <p style={{ color: '#166534', fontSize: '12px', fontWeight: '600', margin: '0 0 2px 0' }}>Follow Up</p>
                        <p style={{ color: '#166534', fontSize: '13px', margin: 0 }}>{formatDate(selectedProspect.follow_up_date)}</p>
                      </div>
                    )}
                    {selectedProspect.notes && (
                      <div style={{ marginTop: '14px', padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <p style={{ color: '#6b7280', fontSize: '12px', fontWeight: '600', margin: '0 0 4px 0' }}>Notes</p>
                        <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{selectedProspect.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
                {stageHistory.length > 0 && (
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                    <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Stage Breakdown</p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {stageHistory.map((h, i) => {
                        const col = PIPELINE_COLUMNS.find(c => c.label === h.stage) || PIPELINE_COLUMNS[0];
                        const daysShown = h.days_in_stage !== null ? h.days_in_stage : Math.floor((Date.now() - new Date(h.entered_at).getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={i} style={{ backgroundColor: col.accent, borderRadius: '10px', padding: '12px 16px', border: '1px solid ' + col.color + '30' }}>
                            <p style={{ color: col.color, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>{h.stage}</p>
                            <p style={{ color: '#0a1f13', fontSize: '20px', fontWeight: '800', margin: 0 }}>{daysShown === 0 ? '< 1' : daysShown}<span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginLeft: '3px' }}>days</span></p>
                            {!h.left_at && <p style={{ color: col.color, fontSize: '10px', margin: '4px 0 0 0', fontWeight: '600' }}>current</p>}
                          </div>
                        );
                      })}
                      <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '12px 16px' }}>
                        <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>Total</p>
                        <p style={{ color: '#fff', fontSize: '20px', fontWeight: '800', margin: 0 }}>{totalDays(selectedProspect)}<span style={{ fontSize: '12px', fontWeight: '500', color: 'rgba(255,255,255,0.5)', marginLeft: '3px' }}>days</span></p>
                      </div>
                    </div>
                  </div>
                )}
                {isOwnProspect && <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                  <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 20px 0' }}>Log Activity</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div><label style={lbl}>Type</label>
                      <select style={{...inp, backgroundColor: '#fff'}} value={activityForm.type} onChange={e => setActivityForm({...activityForm, type: e.target.value})}>
                        {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Outcome</label>{activityForm.type==='Call'?(<select style={{...inp,backgroundColor:'#fff'}} value={activityForm.outcome} onChange={e => setActivityForm(withCallOutcome(activityForm, e.target.value))}><option value="">— Select —</option>{CALL_OUTCOMES.map(o=><option key={o}>{o}</option>)}</select>):(<input style={inp} placeholder="Spoke with owner, sent proposal..." value={activityForm.outcome} onChange={e => setActivityForm({...activityForm, outcome: e.target.value})} />)}</div>
                    <div><label style={lbl}>Follow Up Date</label><input type="date" style={inp} value={activityForm.follow_up_date} onChange={e => setActivityForm({...activityForm, follow_up_date: e.target.value})} /></div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={lbl}>Notes</label>
                    <textarea placeholder="What happened? What did they say? Next steps?" value={activityForm.notes} onChange={e => setActivityForm({...activityForm, notes: e.target.value})}
                      style={{ width: '100%', minHeight: '80px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
                  </div>
                  {!activityForm.outcome.trim() && <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 8px 0' }}>Add an outcome to log this activity.</p>}
                  <button onClick={logActivity} disabled={loading || !activityForm.outcome.trim()}
                    style={{ backgroundColor: '#0f2318', color: '#fff', padding: '11px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: (loading || !activityForm.outcome.trim()) ? 0.6 : 1 }}>
                    {loading ? 'Logging...' : 'Log Activity'}
                   </button>
                </div>}
                <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 20px 0' }}>Activity Timeline</p>
                  {activities.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>No activity logged yet. Make the call and log it above.</p>
                  ) : (
                    <div style={{ position: 'relative', paddingLeft: '24px' }}>
                      <div style={{ position: 'absolute', left: '7px', top: 0, bottom: 0, width: '1px', backgroundColor: '#e5e7eb' }} />
                      {activities.map((activity, i) => (
                        <div key={activity.id} style={{ position: 'relative', marginBottom: i < activities.length - 1 ? '24px' : 0 }}>
                          <div style={{ position: 'absolute', left: '-21px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#00d4aa', border: '2px solid #fff', boxShadow: '0 0 0 1px #00d4aa' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ backgroundColor: '#0f2318', color: '#00d4aa', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>{activity.type}</span>
                              {activity.outcome && <span style={{ color: '#374151', fontSize: '13px', fontWeight: '600' }}>{activity.outcome}</span>}
                            </div>
                            <span style={{ color: '#9ca3af', fontSize: '11px', whiteSpace: 'nowrap', marginLeft: '12px' }}>{formatTime(activity.created_at)}</span>
                          </div>
                          {activity.notes && <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 4px 0', lineHeight: '1.5' }}>{activity.notes}</p>}
                          {activity.follow_up_date && <p style={{ color: '#059669', fontSize: '12px', margin: 0, fontWeight: '500' }}>{'Follow up: ' + formatDate(activity.follow_up_date)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'earnings' && (
  <div>
    <div style={{ marginBottom: '32px' }}>
      <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Earnings</h1>
      <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Training: 15% of plan price. Your track after client #6 determines your ongoing rate.</p>
    </div>
    <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '28px', marginBottom: '24px' }}>
      <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 20px 0', textTransform: 'uppercase' as const }}>My Numbers</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {[
          { label: 'Total Earned', value: fmtCommission(Math.round(clients.reduce((sum, cl) => sum + firstPaymentCommission(cl, firstSaleSlugByClient[cl.id]).amount, 0) * 100) / 100), color: '#00d4aa' },
          { label: 'Closes', value: String(clients.length), color: '#fff' },
          { label: 'Active Clients', value: String(clients.filter(cl => cl.status === 'Active').length), color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' as const, margin: '0 0 8px 0' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: '28px', fontWeight: '800', margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase' as const }}>Client Breakdown</p>
      {clients.length === 0 ? <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No clients yet. Go close some deals.</p> : clients.map(cl => { const fp = firstPaymentCommission(cl, firstSaleSlugByClient[cl.id]); return (
        <div key={cl.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
          <div>
            <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{cl.business_name}</p>
            <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{fp.basis === 'current' ? `${fp.planLabel} · Monthly` : fp.basis === 'unknown' ? 'Plan not set' : `${getTierLabel(cl.tier)} · ${getPaymentTypeLabel(cl.payment_type)}`}</p>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <p style={{ color: '#00d4aa', fontSize: '14px', fontWeight: '700', margin: 0 }}>{fmtCommission(fp.amount)}</p>
            <p style={{ color: '#9ca3af', fontSize: '11px', margin: '2px 0 0 0' }}>15% of first payment{fp.basis === 'legacy' ? ' · legacy plan' : ''}</p>
          </div>
        </div>
      ); })}
    </div>
  </div>
)}{tab === 'cancellations' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Cancellations</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Submit a request — never process in the backend</p>
            </div>
            <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '14px 20px', marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>Reps do not cancel clients in the backend.</p>
                <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Get written confirmation from the client first. Screenshot it. Then submit this form. Alex handles everything after that.</p>
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: '760px', marginBottom: '32px' }}>
              <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 24px 0', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>Cancellation Request</p>
              <div style={{ marginBottom: '20px' }}>
                <label style={lbl}>Client *</label>
                {clients.length > 0 && cancellationForm.client_id !== 'manual' ? (
                  <>
                    <select style={{...inp, backgroundColor: '#fff'}} value={cancellationForm.client_id} onChange={e => handleClientSelect(e.target.value)}>
                      <option value="">Select a client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
                    </select>
                    <p style={{ color: '#9ca3af', fontSize: '12px', margin: '6px 0 0 0' }}>
                      Not in the list?{' '}
                      <span style={{ color: '#00d4aa', cursor: 'pointer', fontWeight: '600' }} onClick={() => setCancellationForm(prev => ({ ...prev, client_id: 'manual', business_name: '' }))}>Type manually</span>
                    </p>
                  </>
                ) : (
                  <>
                    <input style={inp} placeholder="Business name" value={cancellationForm.business_name} onChange={e => setCancellationForm(prev => ({ ...prev, business_name: e.target.value }))} />
                    {clients.length > 0 && (
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: '6px 0 0 0' }}>
                        <span style={{ color: '#00d4aa', cursor: 'pointer', fontWeight: '600' }} onClick={() => setCancellationForm(prev => ({ ...prev, client_id: '', business_name: '' }))}>Back to dropdown</span>
                      </p>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={lbl}>Plan Type *</label>
                  <select style={{...inp, backgroundColor: '#fff'}} value={cancellationForm.plan_type} onChange={e => handlePlanTypeChange(e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="3_month">3-Month</option>
                    <option value="annual">Annual</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>MRR Lost (CAD/mo)</label>
                  <input style={inp} type="number" value={cancellationForm.mrr_lost} onChange={e => setCancellationForm(prev => ({ ...prev, mrr_lost: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={lbl}>Category *</label>
                  <select style={{...inp, backgroundColor: '#fff'}} value={cancellationForm.category} onChange={e => setCancellationForm(prev => ({ ...prev, category: e.target.value }))}>
                    {CANCELLATION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Effective Date</label>
                  <input type="date" style={inp} value={cancellationForm.effective_date} onChange={e => setCancellationForm(prev => ({ ...prev, effective_date: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Final Billing Month</label>
                  <input style={inp} placeholder="e.g. June 2026" value={cancellationForm.final_month} onChange={e => setCancellationForm(prev => ({ ...prev, final_month: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={lbl}>Reason for Cancellation *</label>
                <textarea placeholder="What did the client say? Copy their exact words if possible." value={cancellationForm.reason} onChange={e => setCancellationForm(prev => ({ ...prev, reason: e.target.value }))}
                  style={{ width: '100%', minHeight: '90px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div style={{ marginBottom: '28px' }}>
                <label style={lbl}>Rep Notes</label>
                <textarea placeholder="Anything else Alex should know — save attempts, client sentiment, context..." value={cancellationForm.notes} onChange={e => setCancellationForm(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ width: '100%', minHeight: '80px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '14px 16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#6b7280', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px 0' }}>Summary</p>
                  <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: 0 }}>
                    {cancellationForm.business_name || 'No client selected'} · {getPaymentTypeLabel(cancellationForm.plan_type)} · ${cancellationForm.mrr_lost.toLocaleString()} CAD/mo lost
                  </p>
                </div>
                <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700' }}>Pending Review</span>
              </div>
              <button onClick={submitCancellation} disabled={loading || !cancellationForm.reason || !cancellationForm.business_name}
                style={{ backgroundColor: '#ef4444', color: '#fff', padding: '13px 36px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: loading || !cancellationForm.reason || !cancellationForm.business_name ? 0.6 : 1 }}>
                {loading ? 'Submitting...' : 'Submit Cancellation Request'}
              </button>
            </div>
            {cancellations.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ color: '#0a1f13', fontSize: '15px', fontWeight: '700', margin: 0 }}>Submitted Cancellations</h3>
                  <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '12px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>{cancellations.length}</span>
                </div>
                {cancellations.map(c => {
                  const st = getCancellationStatusStyle(c.status);
                  return (
                    <div key={c.id} style={{ padding: '16px 24px', borderBottom: '1px solid #f9fafb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>{c.business_name}</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
                            <span style={{ backgroundColor: '#f3f4f6', color: '#374151', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{getPaymentTypeLabel(c.plan_type)}</span>
                            <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{'-$' + (c.mrr_lost ? c.mrr_lost.toLocaleString() : '0') + '/mo'}</span>
                            <span style={{ color: '#9ca3af', fontSize: '12px' }}>{getCategoryLabel(c.category)}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ backgroundColor: st.bg, color: st.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700' }}>{st.label}</span>
                          <span style={{ color: '#9ca3af', fontSize: '11px' }}>{formatDate(c.created_at)}</span>
                        </div>
                      </div>
                      {c.reason && <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{c.reason}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'problems' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Problems</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Flag an issue — if it is urgent, text Alex too</p>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: '700px', marginBottom: '32px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={lbl}>Business Name</label>
                <input style={inp} placeholder="Which client is having an issue?" value={problemForm.business_name} onChange={e => setProblemForm({...problemForm, business_name: e.target.value})} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={lbl}>What is the issue?</label>
                <textarea placeholder="Describe the problem in detail..." value={problemForm.issue} onChange={e => setProblemForm({...problemForm, issue: e.target.value})}
                  style={{ width: '100%', minHeight: '120px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
              </div>
              <button onClick={submitProblem} disabled={loading || !problemForm.business_name || !problemForm.issue}
                style={{ backgroundColor: '#ef4444', color: '#fff', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: loading || !problemForm.business_name || !problemForm.issue ? 0.6 : 1 }}>
                {loading ? 'Flagging...' : 'Flag Problem'}
              </button>
            </div>
            {problems.length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
                  <h3 style={{ color: '#0a1f13', fontSize: '15px', fontWeight: '700', margin: 0 }}>Flagged Issues</h3>
                </div>
                {problems.map(p => (
                  <div key={p.id} style={{ padding: '16px 24px', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 4px 0' }}>{p.business_name}</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{p.issue}</p>
                    </div>
                    <span style={{ backgroundColor: p.status === 'Open' ? '#fee2e2' : '#d1fae5', color: p.status === 'Open' ? '#ef4444' : '#065f46', fontSize: '11px', padding: '3px 8px', borderRadius: '20px', fontWeight: '600', flexShrink: 0, marginLeft: '16px' }}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'calendar' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>My Demos</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{appointments.filter(a => a.status === 'Scheduled').length} upcoming · {appointments.filter(a => a.status === 'Cancelled').length} cancelled</p>
            </div>

<div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '24px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <div>
    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Setter Access</p>
    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
      {setterAccess ? 'Setters can see your schedule and book demos for you.' : 'Setters cannot book your calendar. Turn this on when you are ready.'}
    </p>
  </div>
  <div onClick={toggleSetterAccess} style={{ width: '52px', height: '28px', borderRadius: '99px', backgroundColor: setterAccess ? '#00d4aa' : 'rgba(255,255,255,0.15)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
    <div style={{ position: 'absolute', top: '3px', left: setterAccess ? '27px' : '3px', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
  </div>
</div>

<div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
  <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Weekly Schedule</p>
  <p style={{ color: '#9ca3af', fontSize: '13px', margin: '0 0 20px 0' }}>Set your available days and hours. Setters can only book within these windows.</p>
  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px', marginBottom: '20px' }}>
    {([
      { key: 'mon', label: 'Monday' },
      { key: 'tue', label: 'Tuesday' },
      { key: 'wed', label: 'Wednesday' },
      { key: 'thu', label: 'Thursday' },
      { key: 'fri', label: 'Friday' },
      { key: 'sat', label: 'Saturday' },
      { key: 'sun', label: 'Sunday' },
    ] as { key: string; label: string }[]).map(day => {
      const d = availabilitySchedule[day.key];
      return (
        <div key={day.key} style={{ display: 'grid', gridTemplateColumns: '130px 44px 1fr 1fr', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', backgroundColor: d.enabled ? '#f0f4f1' : '#f9fafb', border: '1px solid ' + (d.enabled ? '#d1fae5' : '#e5e7eb') }}>
          <span style={{ color: d.enabled ? '#0a1f13' : '#9ca3af', fontSize: '14px', fontWeight: '600' }}>{day.label}</span>
          <div onClick={() => setAvailabilitySchedule(prev => ({ ...prev, [day.key]: { ...prev[day.key], enabled: !prev[day.key].enabled } }))}
            style={{ width: '40px', height: '22px', borderRadius: '99px', backgroundColor: d.enabled ? '#00d4aa' : '#e5e7eb', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: '2px', left: d.enabled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
          <select disabled={!d.enabled} value={d.start} onChange={e => setAvailabilitySchedule(prev => ({ ...prev, [day.key]: { ...prev[day.key], start: e.target.value } }))}
            style={{ ...inp, backgroundColor: d.enabled ? '#fff' : '#f3f4f6', color: d.enabled ? '#0a1f13' : '#9ca3af', cursor: d.enabled ? 'pointer' : 'not-allowed', opacity: d.enabled ? 1 : 0.5 }}>
            {['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM','11:00 PM'].map(t => <option key={t}>{t}</option>)}
          </select>
          <select disabled={!d.enabled} value={d.end} onChange={e => setAvailabilitySchedule(prev => ({ ...prev, [day.key]: { ...prev[day.key], end: e.target.value } }))}
            style={{ ...inp, backgroundColor: d.enabled ? '#fff' : '#f3f4f6', color: d.enabled ? '#0a1f13' : '#9ca3af', cursor: d.enabled ? 'pointer' : 'not-allowed', opacity: d.enabled ? 1 : 0.5 }}>
            {['7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM','11:00 PM','12:00 AM'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      );
    })}
  </div>
  <button onClick={saveAvailabilitySettings} disabled={savingAvailability}
    style={{ backgroundColor: '#0f2318', color: '#fff', padding: '11px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: savingAvailability ? 0.6 : 1 }}>
    {savingAvailability ? 'Saving...' : 'Save Schedule'}
  </button>
</div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
              <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>My Availability</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div><label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const }}>Days Out</label><select value={genRepDays} onChange={e => setGenRepDays(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>{[1,2,3,4,5,6,7].map(d => <option key={d} value={d} style={{ backgroundColor: '#0f2318' }}>{d} day{d > 1 ? 's' : ''}</option>)}</select></div>
                <div><label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const }}>Start Time</label><select value={genRepStartTime} onChange={e => setGenRepStartTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>{['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM'].map(t => <option key={t} style={{ backgroundColor: '#0f2318' }}>{t}</option>)}</select></div>
                <div><label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const }}>End Time</label><select value={genRepEndTime} onChange={e => setGenRepEndTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}>{['9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM'].map(t => <option key={t} style={{ backgroundColor: '#0f2318' }}>{t}</option>)}</select></div>
                <div><label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase' as const }}>Slot Length</label><select value={genRepInterval} onChange={e => setGenRepInterval(Number(e.target.value))} style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none', backgroundColor: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif' }}><option value={30} style={{ backgroundColor: '#0f2318' }}>30 min</option><option value={60} style={{ backgroundColor: '#0f2318' }}>60 min</option><option value={90} style={{ backgroundColor: '#0f2318' }}>90 min</option></select></div>
              </div>
              <button onClick={generateRepSlots} disabled={generatingRepSlots} style={{ backgroundColor: '#00d4aa', color: '#000', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: generatingRepSlots ? 'not-allowed' : 'pointer', border: 'none', opacity: generatingRepSlots ? 0.7 : 1, marginBottom: repAllSlots.length > 0 ? '20px' : '0' }}>
                {generatingRepSlots ? 'Generating...' : `Generate slots for next ${genRepDays} day${genRepDays > 1 ? 's' : ''}`}
              </button>
              {repAllSlots.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                  {repAllSlots.map((slot: any) => (
                    <div key={slot.id} style={{ padding: '8px 14px', borderRadius: '8px', border: slot.is_booked ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.2)', backgroundColor: slot.is_booked ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div><p style={{ color: slot.is_booked ? '#10b981' : '#fff', fontSize: '12px', fontWeight: '600', margin: '0 0 1px 0' }}>{slot.date}</p><p style={{ color: slot.is_booked ? '#10b981' : 'rgba(255,255,255,0.5)', fontSize: '11px', margin: 0 }}>{slot.time_slot} · {slot.is_booked ? 'Booked' : 'Open'}</p></div>
                      {!slot.is_booked && <button onClick={() => deleteRepSlot(slot.id)} style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>✕</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowBookPanel(!showBookPanel)} style={{ backgroundColor: '#8b5cf6', color: '#fff', padding: '11px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none' }}>
                {showBookPanel ? 'Cancel' : '+ Book a Demo'}
              </button>
            </div>

            {showBookPanel && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px', border: '2px solid #8b5cf6' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 20px 0' }}>Book a Demo</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div><label style={lbl}>Business Name *</label><input style={inp} placeholder="Atlas Roofing" value={bookForm.business_name} onChange={e => setBookForm({ ...bookForm, business_name: e.target.value })} /></div>
                  <div><label style={lbl}>Contact Name</label><input style={inp} placeholder="John Smith" value={bookForm.contact_name} onChange={e => setBookForm({ ...bookForm, contact_name: e.target.value })} /></div>
<div><label style={lbl}>Prospect Email</label><input style={inp} type="email" placeholder="john@example.com" value={bookForm.email} onChange={e => setBookForm({ ...bookForm, email: e.target.value })} /></div>
                  <div><label style={lbl}>Trade</label><select style={{ ...inp, backgroundColor: '#fff' }} value={bookForm.trade} onChange={e => setBookForm({ ...bookForm, trade: e.target.value })}>{TRADE_OPTIONS.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label style={lbl}>Phone</label><input style={inp} placeholder="(306) 555-0100" value={bookForm.phone} onChange={e => setBookForm({ ...bookForm, phone: e.target.value })} /></div>
                  <div><label style={lbl}>Pick a Slot *</label><select style={{ ...inp, backgroundColor: '#fff' }} value={bookSlotId} onChange={e => setBookSlotId(e.target.value)}><option value="">— Select a slot —</option>{availSlots.map((s: any) => <option key={s.id} value={s.id}>{s.date} at {s.time_slot}</option>)}</select></div>
                  <div><label style={lbl}>Notes</label><input style={inp} placeholder="Any context..." value={bookForm.notes} onChange={e => setBookForm({ ...bookForm, notes: e.target.value })} /></div>
                </div>
                {availSlots.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px', margin: '0 0 16px 0' }}>No open slots. Generate some in My Availability above first.</p>}
                <button onClick={bookRepDemo} disabled={bookingLoading || !bookForm.business_name || !bookSlotId} style={{ backgroundColor: '#8b5cf6', color: '#fff', padding: '11px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: bookingLoading || !bookForm.business_name || !bookSlotId ? 0.6 : 1 }}>
                  {bookingLoading ? 'Booking + Generating Meet Link...' : 'Confirm Demo'}
                </button>
              </div>
            )}

            {rescheduleAppt && (

              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px', border: '2px solid #8b5cf6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700', margin: 0 }}>Reschedule — {rescheduleAppt.business_name}</p>
                  <button onClick={() => { setRescheduleAppt(null); setRescheduleSlotId(''); setRescheduleEventMissing(false); }} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={lbl}>Pick a new slot</label>
                  <select value={rescheduleSlotId} onChange={e => { setRescheduleSlotId(e.target.value); setRescheduleEventMissing(false); }} style={{ ...inp, backgroundColor: '#fff' }}>
                    <option value="">— Select a slot —</option>
                    {availSlots.map(s => <option key={s.id} value={s.id}>{s.date} at {s.time_slot}</option>)}
                  </select>
                </div>
                {availSlots.length === 0 && <p style={{ color: '#9ca3af', fontSize: '13px', margin: '0 0 16px 0' }}>No open slots available. Ask Alex to generate more in the Calendar tab.</p>}
                <button onClick={() => rescheduleAppointment(rescheduleEventMissing)} disabled={cancelLoading || !rescheduleSlotId} style={{ backgroundColor: '#8b5cf6', color: '#fff', padding: '11px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: cancelLoading || !rescheduleSlotId ? 0.6 : 1 }}>
                  {cancelLoading ? 'Rescheduling...' : rescheduleEventMissing ? 'Reschedule in Setera anyway' : 'Confirm Reschedule'}
                </button>
              </div>
            )}

            {appointments.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '60px', textAlign: 'center' as const, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '700', margin: '0 0 8px 0' }}>No demos assigned yet</p>
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>When a setter books a demo and assigns it to you it will appear here.</p>
              </div>
            ) : (
              <>
                {appointments.filter(a => a.status === 'Scheduled').length > 0 && (
                  <div style={{ marginBottom: '32px' }}>
                    <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 16px 0', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>Upcoming</p>
                    {appointments.filter(a => a.status === 'Scheduled').map(appt => (
                      <div key={appt.id} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '12px', borderLeft: '4px solid #00d4aa' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <p style={{ color: '#0a1f13', fontSize: '16px', fontWeight: '800', margin: '0 0 4px 0' }}>{appt.business_name}</p>
                            <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{appt.contact_name} · {appt.trade} · {appt.phone}</p>
                          </div>
                          <span style={{ backgroundColor: '#d1fae5', color: '#065f46', fontSize: '12px', padding: '4px 12px', borderRadius: '20px', fontWeight: '700' }}>Scheduled</span>
                        </div>
                        <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                          <p style={{ color: '#0a1f13', fontSize: '15px', fontWeight: '700', margin: '0 0 2px 0' }}>{appt.scheduled_date} at {appt.scheduled_time}</p>
                          {appt.notes && <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0 0', fontStyle: 'italic' }}>{appt.notes}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          {appt.meet_link ? (
                            <a href={appt.meet_link} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#1a73e8', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', textDecoration: 'none', display: 'inline-block' }}>Join Meeting</a>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '13px' }}>No meet link yet</span>
                          )}
                          {isPastAppointment(appt.scheduled_date, appt.scheduled_time) ? (
                            <>
                              <button onClick={() => markAppointmentOutcome(appt, 'Showed')} style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: 'none' }}>Mark Showed</button>
                              <button onClick={() => markAppointmentOutcome(appt, 'No Show')} style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', border: 'none' }}>Mark No Show</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setRescheduleAppt(appt); setRescheduleSlotId(''); }} style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none' }}>Reschedule</button>
                              <button onClick={() => setCancelingApptId(cancelingApptId === appt.id ? null : appt.id)} style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none' }}>Cancel</button>
                            </>
                          )}
                        </div>
                        {cancelingApptId === appt.id && (
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginTop: '14px', maxWidth: '460px' }}>
                            <CancelDemo appt={appt} phone={appt.phone || ''} startConfirming onKeep={() => setCancelingApptId(null)} onDone={result => onDemoCancelled(appt.id, result)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {appointments.filter(a => a.status !== 'Scheduled').length > 0 && (
                  <div>
                    <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 16px 0', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>Past</p>
                    {appointments.filter(a => a.status !== 'Scheduled').map(appt => {
                      const statusColors: Record<string, { bg: string; color: string }> = {
                        Showed: { bg: '#d1fae5', color: '#065f46' },
                        'No Show': { bg: '#fee2e2', color: '#991b1b' },
                        Cancelled: { bg: '#f3f4f6', color: '#6b7280' },
                        Closed: { bg: '#ccfbf1', color: '#065f46' },
                      };
                      const st = statusColors[appt.status] || { bg: '#f3f4f6', color: '#6b7280' };
                      return (
                        <div key={appt.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '600', margin: '0 0 2px 0' }}>{appt.business_name}</p>
                            <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{appt.contact_name} · {appt.scheduled_date} at {appt.scheduled_time}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {appt.meet_link && <a href={appt.meet_link} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#1a73e8', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', textDecoration: 'none' }}>Join</a>}
                            <span style={{ backgroundColor: st.bg, color: st.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700' }}>{appt.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'overflow' && (
          <div>
            <h1 style={{ color: '#0a1f13', fontSize: '26px', fontWeight: '800', margin: '0 0 6px 0' }}>Overflow Early Access</h1>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>Overflow isn&apos;t live yet. Add contractors who want to hear when applications open.</p>
            <OverflowQuickAdd />
          </div>
        )}
        {tab === 'resources' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Resources</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Everything you need to sell Setera, send the right documents, collect payment, submit clients, and follow the process without guessing.</p>
            </div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px' }}>💡</span>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0, fontWeight: '500' }}>Can't reach Alex right away? This page should help you do the next right thing.</p>
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
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Your Track</p>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>Training (your first 6 clients)</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>15% of the client's first monthly payment, excluding tax. Alex closes while you find the business, get the decision-maker, and book the opportunity. Bonuses below are active during this stage.</p>
                    </div>
                    <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>After client #6 — you choose one path</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 8px 0', lineHeight: '1.5' }}>This is a real decision point, not automatic — Alex makes the call with you.</p>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>Stay a Setter</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 8px 0', lineHeight: '1.5' }}>Commission drops to 5%. No bonuses of any kind going forward — anything already earned before this point stands.</p>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>Advance toward Closer</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Stay at 15%, shadow the close through clients 7–14, keep every bonus below. By 15+ clients you're expected to run the full deal yourself.</p>
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
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Cumulative new monthly revenue in your first 12 months: $89,880 → $30,000. $179,760 → additional $60,000. $269,640 → additional $100,000.</p>
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Your commission and bonus eligibility depend on which track you're on — check with Alex if you're not sure where you stand.</p>
                  </div>
                </div>
              </RCard>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}