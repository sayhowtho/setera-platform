'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase, switchPortal } from '@/lib/supabase';
import SprintProgress from '@/components/SprintProgress';
import { sortSlots, claimSlot, releaseSlot, SLOT_TAKEN_MESSAGE } from '@/lib/slots';
import { useRouter } from 'next/navigation';
import { getCompensationProgress, type CompensationProgress } from '@/lib/compensation';
import OverflowQuickAdd from '@/components/OverflowQuickAdd';
import AddProspectForm, { EMPTY_PROSPECT_FORM, STATUS_OPTIONS, type ProspectFormValue } from '@/components/AddProspectForm';
import { TRADE_OPTIONS } from '@/lib/trade-options';
import { useBusinessMatches, BusinessMatchList, BusinessCheck } from '@/components/BusinessMatches';
import { parseBusinessPhone } from '@/lib/business-normalize';
import { COLD_CALL_OVERVIEW, COLD_CALL_STEPS, COLD_CALL_OBJECTIONS, COLD_CALL_VOICEMAIL_SCRIPT } from '@/lib/coldCallScript';
import { ASK_ABOUT_THE_CHANGE_MD } from '@/lib/askAboutTheChange';
import { FRONT_DOOR_BRIDGE_MD } from '@/lib/frontDoorBridge';
import { CALL_OUTCOMES, withCallOutcome, prospectUpdateForActivity } from '@/lib/callOutcomes';
import MarkdownResource from '@/components/MarkdownResource';
import { CancelDemo, type PopoverResult } from '@/components/admin/CalendarSlotPopover';
import { FOLLOWUPS_PAGE_SIZE, FOLLOWUP_EXCLUDED_IN, isOverdue, followUpSlices } from '@/lib/followups';
import { isPastAppointment, localDateStr } from '@/lib/local-date'; // local time, not UTC
import { saveStatusChange } from '@/lib/stage-change';

type UserProfile = {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
};

type Assignee = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  availability_schedule?: Record<string, { enabled: boolean; start: string; end: string }> | null;
};

// Own lead requests, as returned by /api/lead-requests (setter-safe fields only).
type LeadRequest = { id: string; status: 'pending' | 'approved' | 'denied'; note: string | null; createdAt: string; decidedAt: string | null; seen: boolean; businessName: string; city: string | null; trade: string | null };

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

type Activity = { id: string; prospect_id: string; rep_id: string; type: string; outcome: string; notes: string; follow_up_date: string; created_at: string; };
type StageHistory = { id: string; prospect_id: string; stage: string; entered_at: string; left_at: string | null; days_in_stage: number | null; };

type Appointment = {
  id: string;
  setter_id: string;
  prospect_id: string | null;
  availability_id: string | null;
  contact_name: string | null;
  business_name: string;
  trade: string | null;
  phone: string | null;
  notes: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  status: string;
  assigned_to: string | null;
  meet_link: string | null;
  created_at: string;
  updated_at: string;
};

type SetterAvailability = {
  id: string;
  date: string;
  time_slot: string;
  is_booked: boolean;
  created_by: string | null;
  owned_by: string | null;
  created_at: string;
};

const WEEKLY_GOAL = 15;
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function shortTime(t: string): string {
  const [time, period] = t.split(' ');
  const [h, m] = time.split(':');
  return h + (m !== '00' ? ':' + m : '') + period.toLowerCase();
}
// time_slot strings ("10:00 AM", "1:00 PM") sort wrong as plain text —
// "10:00 AM" precedes "1:00 PM" numerically but not always lexically once
// mixed AM/PM hours are involved, so array position from a text ORDER BY
// can't be trusted for "earliest"/"latest". Parse to minutes-since-midnight
// and compare by actual value instead.
function timeSlotMins(t: string): number {
  const [time, period] = t.split(' ');
  const [h, m] = time.split(':').map(Number);
  let hr = h % 12;
  if (period === 'PM') hr += 12;
  return hr * 60 + m;
}
const ACTIVITY_TYPES = ['Call','Email','Demo','Meeting','Note','Proposal'];
const PIPELINE_COLUMNS = [
  { id: 'new', label: 'New', statuses: ['Not Contacted','Attempted','Contacted','Follow Up Required'], defaultStatus: 'Not Contacted', color: '#6b7280', accent: '#f3f4f6', stale: 3 },
  { id: 'meeting', label: 'Meeting', statuses: ['Interested','Demo Scheduled'], defaultStatus: 'Interested', color: '#8b5cf6', accent: '#ede9fe', stale: 5 },
  { id: 'proposal', label: 'Proposal', statuses: ['Proposal Sent'], defaultStatus: 'Proposal Sent', color: '#f59e0b', accent: '#fef3c7', stale: 3 },
  { id: 'won', label: 'Won', statuses: ['Closed Won'], defaultStatus: 'Closed Won', color: '#10b981', accent: '#d1fae5', stale: 999 },
];
function getColumnForStatus(status: string) { return PIPELINE_COLUMNS.find(c => c.statuses.includes(status)) || PIPELINE_COLUMNS[0]; }
function getPipelineStatusStyle(status: string) {
  const map: Record<string, { bg: string; color: string }> = { 'Not Contacted': {bg:'#f3f4f6',color:'#6b7280'}, 'Attempted': {bg:'#fef3c7',color:'#92400e'}, 'Contacted': {bg:'#dbeafe',color:'#1e40af'}, 'Follow Up Required': {bg:'#fed7aa',color:'#9a3412'}, 'Interested': {bg:'#d1fae5',color:'#065f46'}, 'Demo Scheduled': {bg:'#ede9fe',color:'#5b21b6'}, 'Proposal Sent': {bg:'#e0f2fe',color:'#0c4a6e'}, 'Closed Won': {bg:'#ccfbf1',color:'#065f46'}, 'Closed Lost': {bg:'#fee2e2',color:'#991b1b'}, 'Future Opportunity': {bg:'#f0fdf4',color:'#166534'} };
  return map[status] || {bg:'#f3f4f6',color:'#6b7280'};
}


const MINDSET_TIPS = [
  { title: 'Tonality', body: ['Curious, not pushy. Never go up in tone at the end of sentences \u2014 that sounds like a question. You\'re not asking for permission. You\'re checking if there\'s a problem worth solving.'].join('') },
  { title: 'You\'re not selling on this call', body: ['Your only job is to find out if there\'s a problem. If there isn\'t, move on fast \u2014 that\'s a win too. You\'re asking questions and letting the contractor decide.'].join('') },
  { title: '10 second reset between calls', body: 'Bad call? Stand up. Shake it off. Sit back down. New call, new energy. Never carry a bad call into the next one. Every number is a clean slate.' },
  { title: 'Operate from abundance', body: ['There are 50 contractors in every city losing jobs right now. This one is one of them. If they don\'t want to know about it, someone else will. Never call from need.'].join('') },
];

const CRM_STEPS = [
  { step: '1', title: 'Open Google, pick a trade, pick a city', body: 'No list. No tool. Type "roofing companies Calgary" and start calling. Every business you call gets logged here.' },
  { step: '2', title: 'Hit Add Prospect after every dial', body: 'Company name, trade, city, phone, contact name (if you get it), status, notes. 20 seconds. Non-negotiable.' },
  { step: '3', title: 'When they agree to a call — go to Calendar', body: 'Click the available slot that works for them. Fill in their info. Hit Book. Alex sees it in High Table automatically.' },
  { step: '4', title: 'Text Alex immediately', body: ['"Got one \u2705 [Name] \u2014 [Business] \u2014 [Trade]" \u2014 he sees the full details in High Table.'].join('') },
  { step: '5', title: 'Track your callbacks', body: 'Set outcome to Callback, Spoke with Reception (gatekeeper took your number), Referred (you got the owner\'s name or direct line) or Send Info (they asked you to email something). The follow-up date fills in 2 days out — change it if they gave you a time, and add the time in notes. Your callback queue shows on the dashboard. Don\'t let them expire.' },
  { step: '6', title: 'After the appointment time passes — mark the outcome', body: 'Once a booked appointment\'s time has come and gone, your Appointments list lets you Mark Showed or Mark No Show instead of Cancel. Do this for every one — it drives your Show Rate stat, and No Shows are exactly the leads worth a quick follow-up call.' },
];

const SETERA_REP_PATH_STAGES = [
  { num: '01', title: 'Know the Product', desc: 'Found under Sales Training → Setera Product Guide. Read the Setera Product Guide. Call Emily live at heysetera.com. Know the product cold before touching a script.' },
  { num: '02', title: 'Know the Method', desc: 'Found under Sales Training → The Setera Method, then The Front Door Bridge and Ask About the Change. Read The Setera Method from start to finish. Then read it again. Understand the psychology behind every move.' },
  { num: '03', title: 'Know the Booking', desc: 'Found under Setter Training → Cold Call Script, then How to Use the CRM. Setters book the demo, they don\'t run it. Know how to take a call from first dial to a booked slot on the calendar.' },
  { num: '04', title: 'Know the Numbers', desc: 'Found under Pricing Reference → Setera Pricing and Setter Training → Commission Structure. Know all three packages and exactly what you earn on each.' },
  { num: '05', title: 'Know the Process', desc: 'Found under Setter Training → How to Use the CRM and Sales Training → Follow-Up Templates. Log every dial, track your callbacks, and follow up. Onboarding, legal, and everything after a yes is handled once a deal moves to closing — not part of the setter role.' },
];

const SETERA_METHOD_PHASES = [
  { num: '01', name: 'The Authority Open', tag: 'Never open with Setera', content: 'Do not start with Setera. Open by positioning yourself as a consultant running a diagnosis — not a salesperson pitching a product.', quote: ['"Before I show you anything, I want to make sure this actually makes sense for your business. Mind if I ask you a few questions first?"'].join(''), bullets: [] as string[], tip: ['Tone is everything here \u2014 curious, not eager. You are qualifying them as much as they are evaluating you.'].join('') },
  { num: '02', name: 'The Situation Map', tag: 'Understand their world first', content: 'Neutral, curious questions. Build a picture of their current world. Let them talk. Then ask the qualifying question that tells you everything.', quote: '', bullets: ['"How are you currently handling calls when you are on a job or after hours?"','"On a busy day, how many calls would you say actually get answered versus go to voicemail?"','"When someone does leave a voicemail — what does your follow-up look like?"','"If your call volume increased by 30% next month — would your business be set up to handle it?"'], tip: ['The last question tells you everything. If they say probably not \u2014 capacity needs to come first. If they say absolutely, we just need leads \u2014 that is your person.'].join('') },
  { num: '03', name: 'The Awareness Shift', tag: 'Get them to name the problem', content: 'You never tell a contractor he has a problem. You ask questions until he tells you. The moment he calculates his own lost revenue out loud — the emotional case is made.', quote: '"Does that feel about right to you?"', bullets: ['"When a call goes unanswered, what typically happens?"','"Have you ever found out after the fact that someone called you first, then went with a competitor?"','"What is your average job value for a new customer?" [They answer.] "So if you are missing even two or three calls a week..." [Stop. Let them finish the math.]'], tip: 'Never do the math for them. Ask the question, then go quiet. That silence is where the sale happens.' },
  { num: '04', name: 'The Scar Tissue Questions', tag: 'Surface objections early', content: 'This is where you learn their objections before you pitch — and neutralize them before they become walls.', quote: '', bullets: ['"Have you tried anything to fix this before? Answering service, part-time help, anything like that?"','"What happened with that? Why did it not stick?"'], tip: ['Listen for the emotional words \u2014 "useless," "embarrassing," "waste of money." That is the scar. That is what you are healing.'].join('') },
  { num: '05', name: 'The Legacy Gap', tag: 'Make the cost of inaction real', content: 'These questions create urgency without pressure. You are illuminating the gap between where they are and where they want to be.', quote: '"The call you missed last Tuesday — do you know who answered it?"', bullets: ['"If this does not get solved in the next six months, what does that realistically cost you?"','"The contractor in your city who IS answering every call right now — what kind of advantage does that give them over you?"'], tip: 'They do not know who answered it. But they know someone did. A relationship worth $80,000 walked to a competitor because nobody picked up.' },
  { num: '06', name: 'The Reveal', tag: 'Now — and only now — show Emily', content: 'After they have named the problem, calculated the cost, and felt the weight of what has been slipping through — now you show the product.', quote: '"Okay — so after a call like that has been made to your business, let me show you where it shows up."', bullets: [], tip: ['Pull up Emily and let her run for 60 to 90 seconds. Do not narrate over her. Then walk the dashboard lightly. "You do not have to call everyone back in the order they came in. You can see what is waiting. That big job \u2014 you see that first. You are choosing."'].join('') },
  { num: '07', name: 'The Identity Close', tag: 'Close on who they are becoming', content: 'Do not close on features. Do not close on funding. Close on identity.', quote: '"Every contractor I talk to knows they are losing jobs to missed calls. Most accept it. The ones who do not — they are the ones who end up owning their market. Which one are you building?"', bullets: [], tip: 'Say it, then stop talking. The first person who speaks after this question loses. Let them close themselves.' },
];

const SETERA_METHOD_OBJECTIONS = [
  { obj: 'I need to think about it', response: ['"Absolutely \u2014 how long do you realistically need? A night? A week?" [They answer.] "Okay \u2014 let us double that. I want you to have all the time you need. But before we get off \u2014 the situation you described does not stay the same while you are thinking it over. It gets worse. You ran your own numbers today. You know exactly what a monthly call gap costs you. Has the habit of thinking it over helped you close gaps like this one in the past? Or is right now the moment to change that pattern?"'].join('') },
  { obj: 'I need to speak to my business partner first', response: ['"Of course. Let me ask you one thing before we wrap up. Flip this around \u2014 your partner had a day like today. Ran the numbers, found the gap, found the solution, funded it, and came back to you \u2014 not with a problem but with: I handled it. How would you feel? Frustrated they made the call without you \u2014 or grateful they took care of it?" [Let them answer.] "Right. So you already know what the right move looks like."'].join('') },
  { obj: 'Just tell me the price', response: ['"I totally get that \u2014 but honestly I would not even know where to start because we do not just have one thing. It would be like pulling into a mechanic, tossing him your keys, and saying hey fix my car, how much is this going to cost." [Pause.] "Right? So how should I look at you right now?"'].join('') },
  { obj: 'It is too expensive', response: ['"Well \u2014 I mean, it kind of just depends. You must have asked me that for a reason though. What is really going on?"'].join('') },
  { obj: 'My customers will not talk to an AI', response: ['"That is a real concern. Two things \u2014 most people genuinely cannot tell the difference. But more importantly, right now when you miss a call, they are not talking to anyone at all. Which is worse for your business?"'].join('') },
  { obj: 'I already have a receptionist', response: ['"That is great \u2014 she is valuable. What happens when she is at lunch? When she is tied up? When three calls come in at once? Emily is not replacing her \u2014 she is the coverage no human can provide. And she gives you the intel before you even pick up the phone."'].join('') },
  { obj: 'I have been burned by tech before', response: ['"Tell me about that \u2014 what happened?" [Let them talk.] "I hear that. The difference is Emily is not software you have to manage. She runs. You get notified when a lead comes in with everything you need. Nothing to learn, nothing to break."'].join('') },
];

const SETERA_METHOD_PRINCIPLES = [
  { title: 'Diagnose, do not pitch', body: 'A rep who pitches is a salesperson. A rep who diagnoses is a consultant. Contractors trust consultants. They resist salespeople. Your job is to find the revenue leak — not sell the patch.' },
  { title: 'Get them to a place of decision', body: 'Your job is not to convince them. Convincing is friction. Move them from thinking into a place of decision where a real choice has to be made. A yes is a decision. A no is a decision. Both are movement.' },
  { title: '70/30 — they talk more', body: 'If you are talking more than 30% of the time, you are pitching instead of diagnosing. Ask a question, then listen. The more they own the problem, the closer they are to solving it.' },
  { title: 'Certainty is contagious', body: 'The rep who fully believes Setera is the best decision a growing contractor can make will always outclose the rep who is still convincing themselves. Your belief is part of the product.' },
  { title: 'Sell the outcome identity', body: 'Not "Emily answers your calls." Instead: "You become the contractor in your market who sees every opportunity, chooses the best work, and never loses a job to a missed call again." Features are forgotten. Identity sticks.' },
  { title: 'Never chase', body: 'One follow-up after a ghost, then move on. Chasing signals that you need them more than they need you. Operate from abundance.' },
];

const FOLLOW_UP_TEMPLATES = [
  { name: 'Post-Demo Follow-Up', subject: 'Good talking today', body: ['Hey [First Name],','','Good talking with you today.','','The main thing we looked at was simple. Your business already spends time, money, and reputation making the phone ring. Setera makes sure those calls are captured when your team cannot answer.','','Next step:','','[Insert agreement link or payment link depending on stage]','','[Rep Name]','Setera','Nothing slips.'].join('\n') },
  { name: 'No Response Follow-Up', subject: 'Quick follow-up', body: ['Hey [First Name],','','Just wanted to follow up.','','The question is still the same:','','When your phone rings and nobody answers, what happens to that opportunity?','','If this is still worth looking at, reply here and we can walk through it quickly.','','[Rep Name]','Setera'].join('\n') },
  { name: 'Payment Link Email', subject: 'Setera payment link', body: ['Hey [First Name],','','Here is the payment link for the plan we discussed:','','Plan: [Plan Name]','Amount: [Amount]','Payment link: [Insert Link]','','[Rep Name]','Setera'].join('\n') },
];

const PRODUCT_GUIDE_QA = [
  { q: 'What is Setera?', a: 'Setera is an AI-powered inbound call capture and revenue recovery platform built for trade businesses across Canada. When a call comes in, Emily answers immediately, captures the caller\'s information, and logs everything in a private dashboard.' },
  { q: 'Who is Setera for?', a: 'Any trade business that loses revenue when calls go unanswered. Roofing, HVAC, plumbing, electrical, landscaping, general contractors, and more. If your business runs on inbound calls and your team is out in the field, Setera was built for you.' },
  { q: 'What makes Setera different?', a: ['Traditional answering services use human operators \u2014 limited hours, higher cost, no intelligence. Setera\'s AI works 24/7, captures more information faster, classifies urgency automatically, and delivers everything into a dashboard the owner can check from their phone on a job site. It is not an answering service \u2014 it is a revenue recovery system built for the trades.'].join('') },
  { q: 'Does Emily sound robotic?', a: ['Not at all. Emily has a natural, warm, and conversational voice. She discloses she is a virtual receptionist \u2014 professionally and naturally \u2014 and most callers simply move on and tell her exactly what they need.'].join('') },
  { q: 'We just use voicemail', a: 'Callers do not leave voicemails anymore. The majority of people who reach voicemail hang up and call the next company on the list. Voicemail is where leads go to die. Emily answers live every time.' },
  { q: 'We already have a receptionist', a: ['Setera is not a replacement for your team \u2014 it is a safety net for the calls your team cannot catch. After hours. When lines are busy. When everyone is in the field. Emily catches every one of them.'].join('') },
  { q: 'We are a seasonal business', a: ['That is exactly when you need it most. Peak season is when your phone rings the most and your team is stretched the thinnest. That is when the most calls get missed. Emily is most valuable when you are busiest.'].join('') },
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

function getInitial(name: string | null, email: string) {
  if (name && name.trim()) return name.trim()[0].toUpperCase();
  return email[0].toUpperCase();
}

// Date-only fields (scheduled_date, sold_at, follow_up_date, ...) are
// stored as UTC midnight of the picked calendar date. Converting that
// through the viewer's local timezone rolls it back a day (e.g. the 21st
// displays as the 20th in America/Regina, UTC-6). Extracting the UTC
// calendar-date components directly avoids that. Genuine timestamps
// essentially never land on exactly UTC midnight, so they still display in
// local time, which is correct for "when did this actually happen."
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

function isThisWeek(dateStr: string) {
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

function isToday(dateStr: string) {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

function getStatusStyle(s: string) {
  const m: Record<string, { bg: string; color: string }> = {
    'Scheduled': { bg: '#e0f2fe', color: '#0c4a6e' },
    'Showed': { bg: '#d1fae5', color: '#065f46' },
    'No Show': { bg: '#fee2e2', color: '#991b1b' },
    'Cancelled': { bg: '#f3f4f6', color: '#6b7280' },
    'Closed': { bg: '#ccfbf1', color: '#065f46' },
  };
  return m[s] || { bg: '#f3f4f6', color: '#6b7280' };
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ backgroundColor: copied ? '#10b981' : '#0f2318', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>
      {copied ? 'Copied' : label}
    </button>
  );
}

function RCard({ title, badge, badgeBg, badgeColor, description, buttonLabel = 'Open', defaultOpen = false, children }: {
  title: string; badge: string; badgeBg: string; badgeColor: string; description: string; buttonLabel?: string; defaultOpen?: boolean; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' as const }}>
            <span style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700' }}>{title}</span>
            <span style={{ backgroundColor: badgeBg, color: badgeColor, fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{badge}</span>
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

export default function SetterPortal() {
  const [tab, setTab] = useState('dashboard');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [callsToday, setCallsToday] = useState(0);
  // Follow-ups due (lib/followups.ts): loaded rows + exact count, from the server.
  const [followUpsDue, setFollowUpsDue] = useState<Prospect[]>([]);
  const [followUpsCount, setFollowUpsCount] = useState<number | null>(null);
  const followUpsTodayCount = useRef(0); // rows due today: they're listed before the overdue ones
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [prospectView, setProspectView] = useState<'list' | 'detail'>('list');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistory[]>([]);
  const [activityForm, setActivityForm] = useState({ type: 'Call', outcome: '', notes: '', follow_up_date: '' });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [compProgress, setCompProgress] = useState<CompensationProgress | null | undefined>(undefined);
  const [myEarnings, setMyEarnings] = useState<{ id: string; commission_amount: number; is_milestone_override: boolean; sales: { sold_at: string; plan_slug: string; clients: { business_name: string } | null } | null }[]>([]);
  const [availability, setAvailabilityRaw] = useState<SetterAvailability[]>([]);
  const setAvailability = (s: SetterAvailability[]) => setAvailabilityRaw(sortSlots(s)); // date, then real clock time (lib/slots.ts)
  const [slotError, setSlotError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<SetterAvailability | null>(null);
  const [showAddProspect, setShowAddProspect] = useState(false);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [cancelingApptId, setCancelingApptId] = useState<string | null>(null); // Cancel demo panel open under this appointment
  const router = useRouter();

  const [bookingForm, setBookingForm] = useState({ contact_name: '', email: '', business_name: '', trade: 'Roofing', phone: '', notes: '', assigned_to: '' });
  const [prospectForm, setProspectForm] = useState<ProspectFormValue>(EMPTY_PROSPECT_FORM);
  const [prospectError, setProspectError] = useState('');
  const [leadRequests, setLeadRequests] = useState<LeadRequest[]>([]);
  const leadRequestsRef = useRef<LeadRequest[] | null>(null);
  // Live duplicate check while Add Prospect is open. A phone match blocks
  // Save; a name-only match is a "Possible match" warning. The block is
  // re-enforced server-side under a lock (/api/prospects/create).
  const dupCheck = useBusinessMatches(showAddProspect
    ? { name: prospectForm.company_name, phone: prospectForm.phone, contactPhone: prospectForm.contact_phone, city: prospectForm.city, trade: prospectForm.trade, mode: 'add' }
    : { name: '' });
  const invalidPhoneFields = ([['phone', 'Phone'], ['contact_phone', 'Direct Phone']] as const)
    .filter(([f]) => parseBusinessPhone(prospectForm[f]).status === 'invalid').map(([, label]) => label);
  // Time-of-day greeting must not be computed inline in render — this page is
  // statically prerendered, so a build-time server value ("Good morning") almost
  // never matches the client's real local hour at load time, throwing a React
  // hydration error (#418, text mismatch). Compute it client-only, after mount.
  const [greeting, setGreeting] = useState('Hey');

  useEffect(() => { fetchData(); fetchLeadRequests(); }, []);
  // Poll so an approve/deny from High Table shows up without a reload.
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === 'visible') fetchLeadRequests(); }, 60000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  async function fetchData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/auth/login'); return; }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    // Reps/VPs keep the setter tools (lib/lead-requests.ts SETTER_PORTAL_ROLES), e.g. after a promotion.
    if (!profile || !['setter', 'rep', 'vp_sales', 'owner', 'admin'].includes(profile.role)) { router.push('/auth/login'); return; }
setUserProfile(profile);
    const { data: reps } = await supabase.from('profiles').select('*').in('role', ['owner', 'admin', 'vp_sales', 'rep']).order('role');
    if (reps) {
      const filteredReps = reps.filter((r: any) => ['owner', 'admin'].includes(r.role) || r.setter_access === true);
setAssignees(filteredReps);
      const owner = reps.find((r: Assignee) => r.role === 'owner');
      if (owner) setBookingForm(prev => ({ ...prev, assigned_to: owner.id }));
    }

    
    const { data: pros } = await supabase.from('prospects').select('*').eq('rep_id', session.user.id).order('created_at', { ascending: false });
    if (pros) setProspects(pros);
    loadFollowUps(false, session.user.id);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count: callCount } = await supabase.from('prospect_activities').select('id', { count: 'exact', head: true }).eq('rep_id', session.user.id).eq('type', 'Call').gte('created_at', todayStart.toISOString());
    setCallsToday(callCount || 0);
    const { data: appts } = await supabase.from('appointments').select('*').eq('setter_id', session.user.id).order('created_at', { ascending: false });
    if (appts) setAppointments(appts);

    try {
      const progress = await getCompensationProgress(session.user.id);
      setCompProgress(progress);
    } catch {
      setCompProgress(null); // no rep_compensation row yet — tracking hasn't started
    }
    const { data: earnings } = await supabase
      .from('commission_earnings')
      .select('id, commission_amount, is_milestone_override, sales(sold_at, plan_slug, clients(business_name))')
      .eq('rep_id', session.user.id)
      .order('created_at', { ascending: false });
    if (earnings) setMyEarnings(earnings as any);

    // Must load on every page visit, independent of bookingForm/prospectForm —
    // setters need to see open slots live on a call, before capturing any prospect info.
    const accessibleRepIds = (reps || []).filter((r: any) => ['owner', 'admin'].includes(r.role) || r.setter_access === true).map((r: any) => r.id);
    const { data: avail } = accessibleRepIds.length > 0
      ? await supabase.from('setter_availability').select('*').in('owned_by', accessibleRepIds).order('date', { ascending: true }).order('time_slot', { ascending: true })
      : { data: [] as SetterAvailability[] };
    if (avail) setAvailability(avail);
  }

  async function fetchLeadRequests() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const r = await fetch('/api/lead-requests', { headers: { Authorization: 'Bearer ' + session.access_token } }).catch(() => null);
    if (!r?.ok) return;
    const next: LeadRequest[] = (await r.json()).requests || [];
    // A newly approved request means a lead was just reassigned to us.
    const prev = leadRequestsRef.current;
    if (prev && next.some(n => n.status === 'approved' && !prev.some(p => p.id === n.id && p.status === 'approved'))) fetchData();
    leadRequestsRef.current = next;
    setLeadRequests(next);
  }

  async function dismissLeadRequestNotices(ids: string[]) {
    setLeadRequests(prev => prev.map(r => ids.includes(r.id) ? { ...r, seen: true } : r));
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch('/api/lead-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ ids }) }).catch(() => null);
  }

  // Goes through the server so the duplicate check and insert happen under one
  // lock (setters can't insert into prospects directly — migrations/018).
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
      setShowAddProspect(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } else if (r?.status === 409) {
      if (Array.isArray(j.matches)) dupCheck.setMatches(j.matches);
      setProspectError('Not saved — this phone number is already in Setera.');
    } else {
      setProspectError(j.error || 'Could not save prospect.');
    }
    setLoading(false);
  }

  // Today's follow-ups first, then overdue oldest-first: two queries read back
  // to back (lib/followups.ts followUpSlices). more=false: exact counts (also
  // the Call Log badge) + first page; more=true: next page.
  async function loadFollowUps(more: boolean, ownerId = userProfile?.id) {
    if (!ownerId) return;
    const today = localDateStr();
    const due = (segment: 'today' | 'overdue', opts?: { count: 'exact'; head: true }) => {
      const q = supabase.from('prospects').select('*', opts).eq('rep_id', ownerId)
        .not('status', 'in', FOLLOWUP_EXCLUDED_IN).not('do_not_contact', 'is', true);
      return segment === 'today' ? q.eq('follow_up_date', today) : q.lt('follow_up_date', today);
    };
    setFollowUpsLoading(true);
    let total = followUpsCount ?? 0;
    if (!more) {
      const [t, o] = await Promise.all([due('today', { count: 'exact', head: true }), due('overdue', { count: 'exact', head: true })]);
      if (t.error || o.error) { setFollowUpsLoading(false); console.error('Supabase error (follow-ups due count):', t.error || o.error); return; }
      followUpsTodayCount.current = t.count ?? 0;
      total = followUpsTodayCount.current + (o.count ?? 0);
    }
    const from = more ? followUpsDue.length : 0;
    const rows: Prospect[] = [];
    for (const sl of followUpSlices(from, Math.min(from + FOLLOWUPS_PAGE_SIZE, total) - 1, followUpsTodayCount.current)) {
      const q = sl.segment === 'today'
        ? due('today').order('created_at', { ascending: false }).order('id')
        : due('overdue').order('follow_up_date', { ascending: true }).order('created_at', { ascending: false }).order('id');
      const { data, error } = await q.range(sl.from, sl.to);
      if (error || !data) { setFollowUpsLoading(false); console.error('Supabase error (follow-ups due):', error); return; }
      rows.push(...data);
    }
    setFollowUpsLoading(false);
    if (more) setFollowUpsDue(prev => { const seen = new Set(prev.map(p => p.id)); return [...prev, ...rows.filter(p => !seen.has(p.id))]; });
    else { setFollowUpsDue(rows); setFollowUpsCount(total); }
  }

  function openDetail(prospect: Prospect) {
    setSelectedProspect(prospect);
    fetchActivities(prospect.id);
    fetchStageHistory(prospect.id);
    setProspectView('detail');
  }

  async function fetchActivities(prospectId: string) {
    const { data } = await supabase.from('prospect_activities').select('*').eq('prospect_id', prospectId).order('created_at', { ascending: false });
    if (data) setActivities(data);
  }

  async function fetchStageHistory(prospectId: string) {
    const { data } = await supabase.from('prospect_stage_history').select('*').eq('prospect_id', prospectId).order('entered_at', { ascending: true });
    if (data) setStageHistory(data);
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
    if (!session) { setLoading(false); return; }
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
      setCallsToday(c => activityForm.type === 'Call' ? c + 1 : c);
      loadFollowUps(false);
    }
    setLoading(false);
  }

  async function updateProspectStatus(pid: string, newStatus: string) {
    const prospect = prospects.find(p => p.id === pid);
    if (!prospect) return;
    const oldCol = getColumnForStatus(prospect.status);
    const newCol = getColumnForStatus(newStatus);
    const now = new Date().toISOString();
    const days = Math.floor((Date.now() - new Date(prospect.updated_at || prospect.created_at).getTime()) / 86400000);
    // lib/stage-change.ts: reports a status that didn't save or history that wasn't recorded.
    const saved = await saveStatusChange(supabase, { prospectId: pid, newStatus, now, columnChanged: oldCol.id !== newCol.id, newStage: newCol.label, historyRepId: prospect.rep_id, daysInStage: days });
    if (saved.status === 'not_saved') { setSlotError(saved.message); return; }
    if (saved.status === 'history_failed') setSlotError(saved.message);
    setSelectedProspect(prev => prev ? { ...prev, status: newStatus, updated_at: now } : null);
    setProspects(prev => prev.map(p => p.id === pid ? { ...p, status: newStatus, updated_at: now } : p));
    loadFollowUps(false);
    if (selectedProspect?.id === pid) fetchStageHistory(pid);
  }

  async function bookAppointment() {
    if (!selectedSlot || !bookingForm.business_name || !bookingForm.contact_name) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    setSlotError('');
    // Claim the slot first: if someone else just booked it, stop before creating a Meet invite (lib/slots.ts).
    if (!(await claimSlot(supabase, selectedSlot.id))) { setSlotError(SLOT_TAKEN_MESSAGE); setSelectedSlot(null); fetchData(); setLoading(false); return; }

    let meetLink: string | null = null;
    try {
      const meetResp = await fetch('/api/create-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
        body: JSON.stringify({
          title: bookingForm.business_name + ' — Setera Demo',
          date: selectedSlot.date,
          time: selectedSlot.time_slot,
          attendeeName: bookingForm.contact_name,
          attendeeEmail: bookingForm.email,
          notes: bookingForm.notes || '',
        }),
      });
      const meetData = await meetResp.json();
      if (meetData.meetLink) meetLink = meetData.meetLink;
    } catch (_) {}

    const assigneeName = assignees.find(a => a.id === bookingForm.assigned_to)?.full_name || 'Alex';

    const { error } = await supabase.from('appointments').insert({
      setter_id: session.user.id,
      availability_id: selectedSlot.id,
      contact_name: bookingForm.contact_name,
      business_name: bookingForm.business_name,
      notes: bookingForm.notes,
      scheduled_date: selectedSlot.date,
      scheduled_time: selectedSlot.time_slot,
      status: 'Scheduled',
      assigned_to: bookingForm.assigned_to || null,
      meet_link: meetLink,
    });
    if (error) { await releaseSlot(supabase, selectedSlot.id); setSlotError('Could not save the booking: ' + error.message); } // reopen the slot
    if (!error) {
      setSuccess('Got one ✅ ' + bookingForm.contact_name + ' — ' + bookingForm.business_name + ' — ' + bookingForm.trade + ' — Assigned: ' + assigneeName + (meetLink ? ' — Meet link saved ✓' : '') + ' — text Alex now');
      setSelectedSlot(null);
      setBookingForm(prev => ({ contact_name: '', email: '', business_name: '', trade: 'Roofing', phone: '', notes: '', assigned_to: prev.assigned_to }));
      fetchData();
      setTimeout(() => setSuccess(''), 15000);
    }
    setLoading(false);
  }

  // Cancel goes through /api/admin/cancel-demo (components/admin/CalendarSlotPopover.tsx
  // CancelDemo): Google event deleted first, then Cancelled + slot reopened.
  function onDemoCancelled(result: PopoverResult) {
    setCancelingApptId(null);
    if (result.warning) { setSlotError(result.message); setSuccess(''); }
    else { setSuccess(result.message); setTimeout(() => setSuccess(''), 8000); }
    fetchData();
  }

  async function markAppointmentOutcome(id: string, outcome: 'Showed' | 'No Show') {
    await supabase.from('appointments').update({ status: outcome }).eq('id', id);
    fetchData();
  }

  const dialsToday = callsToday;
  const bookedThisWeek = appointments.filter(a => isThisWeek(a.created_at) && a.status !== 'Cancelled').length;
  const todayStr = localDateStr();
  const unseenRequestOutcomes = leadRequests.filter(r => r.status !== 'pending' && !r.seen).length;
  const callbacksDue = followUpsCount ?? 0;
  const closedDeals = appointments.filter(a => a.status === 'Closed');
  const completedAppts = appointments.filter(a => a.status !== 'Scheduled' && a.status !== 'Cancelled'); // a cancelled demo isn't a no-show
  const showedAppts = completedAppts.filter(a => a.status === 'Showed' || a.status === 'Closed');
  const showRate = completedAppts.length > 0 ? Math.round((showedAppts.length / completedAppts.length) * 100) : 0;
  const weeklyPct = Math.min(100, Math.round((bookedThisWeek / WEEKLY_GOAL) * 100));
  const dealsClosedCount = myEarnings.length;
  const totalEarningsCAD = myEarnings.reduce((sum, e) => sum + e.commission_amount, 0);
  const planLabel = (slug: string) => ({ launch: 'Launch', grow: 'Grow', starter_v2: 'Starter' } as Record<string, string>)[slug] || slug;
  const avatarInitial = userProfile ? getInitial(userProfile.full_name, userProfile.email) : 'S';
  const displayName = userProfile?.full_name?.split(' ')[0] || 'Setter';
  // Reflects the actually-authenticated session's own role (userProfile is fetched
  // by session.user.id, not display data) — admin/owner accounts viewing this
  // portal must not be visually indistinguishable from a real setter account.
  const sessionRoleLabel = ({ setter: 'Setter', rep: 'Sales Rep', vp_sales: 'VP of Sales', owner: 'Owner', admin: 'Admin' } as Record<string, string>)[userProfile?.role || ''] || userProfile?.role || 'Setter';
  const availByDate = availability.reduce((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, SetterAvailability[]>);
  // Widget data source: real setter_availability rows (what "Generate slots for
  // next N days" on /rep actually writes, and what the Calendar tab books into) —
  // NOT profiles.availability_schedule, which is a separate, largely-unused
  // recurring Mon-Sun template that doesn't reflect what setters can actually book.
  const ownerId = assignees.find(a => a.role === 'owner')?.id;
  const next7Days = ownerId ? Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d); // local date, matching the day label (toISOString() is tomorrow from 6 pm in Regina)
    const daySlots = (availByDate[dateStr] || []).filter(s => s.owned_by === ownerId);
    const openSlots = daySlots.filter(s => !s.is_booked).sort((a, b) => timeSlotMins(a.time_slot) - timeSlotMins(b.time_slot));
    return { dateStr, label: DOW_LABELS[d.getDay()], isToday: i === 0, openSlots };
  }) : [];

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };
  const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const secLabel: React.CSSProperties = { color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px 0', paddingBottom: '8px', borderBottom: '2px solid #e5e7eb', display: 'block' };
  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'prospects', label: 'Call Log' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'earnings', label: 'Earnings' },
    { id: 'overflow', label: 'Overflow' },
    { id: 'resources', label: 'Resources' },
  ];
  const handleSignOut = async () => { await supabase.auth.signOut({ scope: 'local' }); router.push('/auth/login'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>

      <div style={{ width: '220px', backgroundColor: '#0f2318', display: 'flex', flexDirection: 'column', padding: '28px 16px', position: 'fixed', height: '100vh', boxShadow: '4px 0 24px rgba(0,0,0,0.15)', zIndex: 100 }}>
        <div style={{ marginBottom: '40px', padding: '0 8px' }}>
          <h2 style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 3px 0' }}>Setera</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Setter Portal</p>
        </div>
        {navItems.map(item => (
          <div key={item.id} onClick={() => setTab(item.id)}
            style={{ padding: '11px 12px', borderRadius: '10px', marginBottom: '4px', color: tab === item.id ? '#fff' : 'rgba(255,255,255,0.45)', backgroundColor: tab === item.id ? 'rgba(0,212,170,0.18)' : 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: tab === item.id ? '600' : '400', borderLeft: tab === item.id ? '3px solid #00d4aa' : '3px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {item.label}
            {item.id === 'prospects' && (callbacksDue > 0 || unseenRequestOutcomes > 0) && (
              <span style={{ display: 'flex', gap: '4px' }}>
                {unseenRequestOutcomes > 0 && <span title="Lead request decided" style={{ backgroundColor: 'rgba(0,212,170,0.25)', color: '#00d4aa', fontSize: '11px', padding: '1px 7px', borderRadius: '20px', fontWeight: '700' }}>{unseenRequestOutcomes}</span>}
                {callbacksDue > 0 && <span style={{ backgroundColor: 'rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '11px', padding: '1px 7px', borderRadius: '20px', fontWeight: '700' }}>{callbacksDue}</span>}
              </span>
            )}
          </div>
        ))}

        {/* Always-visible availability strip — setters need Alex's actual open
            slots (setter_availability, what Calendar books into) without leaving
            whatever tab (esp. Call Log) they're on. */}
        {next7Days.length > 0 && (
          <div style={{ marginTop: '20px', padding: '12px 14px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px 0' }}>Next 7 Days</p>
            {next7Days.map(day => (
              <div key={day.dateStr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                <span style={{ color: day.isToday ? '#00d4aa' : 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: day.isToday ? '700' : '500' }}>{day.label}</span>
                <span style={{ color: day.openSlots.length > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)', fontSize: '11px', fontWeight: day.openSlots.length > 0 ? '600' : '400' }}>
                  {day.openSlots.length > 0 ? shortTime(day.openSlots[0].time_slot) + '–' + shortTime(day.openSlots[day.openSlots.length - 1].time_slot) : 'None'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto', padding: '14px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#000', flexShrink: 0 }}>{avatarInitial}</div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ color: '#fff', fontSize: '13px', fontWeight: '600', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', margin: 0 }}>{sessionRoleLabel}</p>
            </div>
          </div>
          {['rep', 'vp_sales'].includes(userProfile?.role || '') && (
  <button onClick={() => switchPortal('rep')} style={{ width: '100%', backgroundColor: 'rgba(0,212,170,0.12)', border: '1px solid rgba(0,212,170,0.35)', color: '#00d4aa', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>← Rep portal</button>
          )}
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
          <div style={{ backgroundColor: success.includes('\u2705') ? '#0f2318' : '#d1fae5', border: success.includes('\u2705') ? '1px solid #00d4aa' : '1px solid #10b981', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', color: success.includes('\u2705') ? '#00d4aa' : '#065f46', fontSize: '14px', fontWeight: '600' }}>
            {success}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>
                {greeting + ', ' + displayName}
              </h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Pick a trade. Pick a city. Start dialing.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              {[
                { label: 'Dials Today', value: dialsToday, color: '#8b5cf6' },
                { label: 'Booked This Week', value: bookedThisWeek, color: '#00d4aa' },
                { label: 'Show Rate', value: showRate + '%', color: '#10b981' },
                { label: 'Callbacks Due', value: callbacksDue, color: callbacksDue > 0 ? '#f59e0b' : '#9ca3af' },
              ].map(stat => (
                <div key={stat.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '3px solid ' + stat.color }}>
                  <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{stat.label}</p>
                  <p style={{ color: stat.color, fontSize: '34px', fontWeight: '800', margin: 0 }}>{stat.value}</p>
                </div>
              ))}
            </div>
            {(() => {
              // Plan accent colors, used consistently everywhere a plan is
              // referenced (Sprint benchmarks, 10th-sale trackers).
              const PLAN_COLORS: Record<string, { solid: string; soft: string; gradient: string }> = {
                launch: { solid: '#8b5cf6', soft: 'rgba(139,92,246,0.12)', gradient: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' },
                grow: { solid: '#10b981', soft: 'rgba(16,185,129,0.12)', gradient: 'linear-gradient(90deg, #059669, #10b981)' },
                starter_v2: { solid: '#c9a876', soft: 'rgba(201,168,118,0.16)', gradient: 'linear-gradient(90deg, #b08d5a, #d9bd8c)' },
              };
              const planColor = (slug: string) => PLAN_COLORS[slug] || { solid: '#00d4aa', soft: 'rgba(0,212,170,0.12)', gradient: 'linear-gradient(90deg, #00b894, #00d4aa)' };
              const TEAL_GRADIENT = 'linear-gradient(90deg, #00b894, #00e6bb)';

              const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 6px 24px rgba(15,35,24,0.07), 0 1px 2px rgba(15,35,24,0.04)', marginBottom: '24px', border: '1px solid rgba(15,35,24,0.04)' };
              const cardHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' };
              const cardLabel: React.CSSProperties = { color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' };
              const fmtCAD = (n: number) => '$' + Math.round(n).toLocaleString();

              // Colored-track bar: visible even at 0% (a soft tint of the
              // accent color, not flat gray), animated gradient fill.
              const bar = (pct: number, gradient: string, soft: string, height = '12px') => (
                <div style={{ backgroundColor: soft, borderRadius: '99px', height, overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ background: gradient, height: '100%', width: Math.max(0, Math.min(100, pct)) + '%', borderRadius: '99px', transition: 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                </div>
              );

              // A "reward" callout — dark, glowing, distinct from the plain
              // data fields around it.
              const rewardBox = (label: string, value: string, glowColor: string): React.ReactNode => (
                <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '14px 16px', marginTop: '12px', boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 0 24px ' + glowColor }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>{label}</p>
                  <p style={{ color: '#00d4aa', fontSize: '20px', fontWeight: '800', margin: 0 }}>{value}</p>
                </div>
              );

              // ── MRR PROGRESS (replaces Weekly Appointments Goal) ──
              const mrrCard = (
                <div style={card}>
                  <div style={cardHead}><p style={cardLabel}>MRR Progress</p></div>
                  {compProgress === undefined ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Loading…</p>
                  ) : compProgress === null ? (
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Compensation tracking hasn&apos;t started yet — check with Alex.</p>
                  ) : !compProgress.mrrProgress ? (
                    <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>You&apos;re on the permanent Setter track — 5% commission per close, no MRR/bonus tracking.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                        <span style={{ color: '#0a1f13', fontSize: '24px', fontWeight: '800' }}>{fmtCAD(compProgress.mrrProgress.cumulativeMRR)}</span>
                        <span style={{ color: '#9ca3af', fontSize: '13px', fontWeight: '600' }}>
                          {compProgress.mrrProgress.nextMilestone ? 'of ' + fmtCAD(compProgress.mrrProgress.nextMilestone.threshold) + ' next milestone' : 'All milestones reached'}
                        </span>
                      </div>
                      {bar(compProgress.mrrProgress.percentComplete, TEAL_GRADIENT, 'rgba(0,212,170,0.12)')}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>{compProgress.mrrProgress.percentComplete}% complete</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                          {compProgress.mrrProgress.nextMilestone ? fmtCAD(compProgress.mrrProgress.remainingToNext) + ' MRR remaining' : 'Top milestone hit'}
                        </span>
                      </div>
                      {rewardBox('Next Bonus', compProgress.mrrProgress.nextMilestone ? fmtCAD(compProgress.mrrProgress.nextMilestone.amount) : '—', 'rgba(0,212,170,0.18)')}
                    </>
                  )}
                </div>
              );

              // ── TRAINING PROGRESS — kept as its own separate card ──
              const trainingCard = compProgress && compProgress.compTrack === 'setter_training' && (
                <div style={card}>
                  <div style={cardHead}>
                    <p style={cardLabel}>Training Progress</p>
                    <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: '700' }}>{compProgress.qualifyingClientCount} / {compProgress.trainingClientCount}</span>
                  </div>
                  {bar((compProgress.qualifyingClientCount / compProgress.trainingClientCount) * 100, TEAL_GRADIENT, 'rgba(0,212,170,0.12)')}
                  <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
                    {compProgress.bonusEligible
                      ? `Past training — MRR milestone and 10th-sale bonuses are now payable as you hit them, no separate step needed.`
                      : `These ${compProgress.trainingClientCount} clients earn full 15% commission and carry forward into MRR Progress and your 10th-sale trackers — bonuses on them start paying out from your next client onward.`}
                  </p>
                </div>
              );

              // ── MONTHLY SPRINT (components/SprintProgress, lib/compensation computeSprintPeriods) ──
              const sprintCard = compProgress && compProgress.sprint && (
                <div style={card}>
                  <div style={cardHead}><p style={cardLabel}>Monthly Sprint</p></div>
                  <SprintProgress sprint={compProgress.sprint} />
                </div>
              );

              // ── EVERY 10TH SALE — one independent tracker per plan ──
              const milestonesCard = compProgress && compProgress.planMilestones.length > 0 && (
                <div style={card}>
                  <p style={{ ...cardLabel, marginBottom: '16px' }}>Every 10th Sale</p>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '18px' }}>
                    {compProgress.planMilestones.map((m) => {
                      const c = planColor(m.planSlug);
                      return (
                        <div key={m.planSlug}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#374151', fontSize: '13px', fontWeight: '600' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: c.solid, flexShrink: 0 }} />
                              {m.displayName} — full {fmtCAD(m.payoutAmount)} payout
                            </span>
                            <span style={{ color: c.solid, fontSize: '13px', fontWeight: '700' }}>{m.countTowardNext} / 10</span>
                          </div>
                          {bar((m.countTowardNext / 10) * 100, c.gradient, c.soft)}
                          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
                            {m.remaining} more {m.displayName} close{m.remaining !== 1 ? 's' : ''} for a full {fmtCAD(m.payoutAmount)} payout instead of standard commission.
                            {!m.payable ? ' Payable once you’re past training — this count still carries forward.' : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );

              return (
                <>
                  {mrrCard}
                  {trainingCard}
                  {sprintCard}
                  {milestonesCard}
                </>
              );
            })()}
            <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
              <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Earnings To Date</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                {[
                  { label: 'Total CAD', value: '$' + totalEarningsCAD.toLocaleString(), color: '#00d4aa' },
                  { label: 'Deals Closed', value: dealsClosedCount.toString(), color: '#fff' },
                  { label: 'Total Booked', value: appointments.filter(a => a.status !== 'Cancelled').length.toString(), color: '#f59e0b' },
                  { label: 'No Shows', value: appointments.filter(a => a.status === 'No Show').length.toString(), color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px 0' }}>{s.label}</p>
                    <p style={{ color: s.color, fontSize: '28px', fontWeight: '800', margin: 0 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upcoming Appointments</p>
                <span onClick={() => setTab('calendar')} style={{ color: '#00d4aa', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>View calendar</span>
              </div>
              {appointments.filter(a => a.status === 'Scheduled').length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No appointments booked yet. Go to Calendar to book one.</p>
              ) : appointments.filter(a => a.status === 'Scheduled').map(appt => (
                <div key={appt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{appt.business_name}</p>
                    <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{appt.contact_name} · {appt.trade} · {formatDate(appt.scheduled_date || '')} at {appt.scheduled_time}</p>
                  </div>
                  <span style={{ backgroundColor: '#e0f2fe', color: '#0c4a6e', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>Scheduled</span>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Follow-ups Due</p>
                {callbacksDue > 0 && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '12px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700' }}>{callbacksDue}</span>}
              </div>
              {followUpsDue.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>{followUpsCount === null ? 'Loading…' : 'Nothing due today.'}</p>
              ) : followUpsDue.map(p => {
                const overdue = !!p.follow_up_date && isOverdue(p.follow_up_date, todayStr);
                return (
                  <div key={p.id} onClick={() => { setTab('prospects'); openDetail(p); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{p.company_name}</p>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{p.contact_name || 'No contact yet'} · {p.city} · {p.phone}</p>
                      {p.notes && <p style={{ color: '#6b7280', fontSize: '12px', margin: '2px 0 0 0', fontStyle: 'italic' }}>{p.notes}</p>}
                    </div>
                    <span style={{ backgroundColor: overdue ? '#fee2e2' : '#fef3c7', color: overdue ? '#991b1b' : '#92400e', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '700', whiteSpace: 'nowrap' }}>{overdue ? 'OVERDUE · ' + formatDate(p.follow_up_date || '') : 'TODAY'}</span>
                  </div>
                );
              })}
              {followUpsCount !== null && followUpsDue.length > 0 && followUpsDue.length < followUpsCount && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', paddingTop: '14px' }}>
                  <span style={{ color: '#9ca3af', fontSize: '13px' }}>Showing {followUpsDue.length} of {followUpsCount}</span>
                  <button onClick={() => loadFollowUps(true)} disabled={followUpsLoading} style={{ backgroundColor: '#fff', color: '#0f2318', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: followUpsLoading ? 'default' : 'pointer', border: '1px solid #e5e7eb' }}>{followUpsLoading ? 'Loading…' : 'Load ' + Math.min(FOLLOWUPS_PAGE_SIZE, followUpsCount - followUpsDue.length) + ' more'}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CALL LOG ── */}
        {tab === 'prospects' && prospectView === 'list' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
              <div>
                <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Call Log</h1>
                <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{prospects.length} businesses logged · {dialsToday} dials today</p>
              </div>
              <button onClick={() => { setShowAddProspect(!showAddProspect); setProspectError(''); }} style={{ backgroundColor: '#0f2318', color: '#fff', padding: '11px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none' }}>+ Add Prospect</button>
            </div>
            <BusinessCheck onRequested={fetchLeadRequests} />
            {leadRequests.filter(r => r.status !== 'pending' && !r.seen).map(r => (
              <div key={r.id} style={{ backgroundColor: r.status === 'approved' ? '#d1fae5' : '#fee2e2', border: '1px solid ' + (r.status === 'approved' ? '#10b981' : '#ef4444'), borderRadius: '10px', padding: '12px 18px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <p style={{ color: r.status === 'approved' ? '#065f46' : '#991b1b', fontSize: '13px', fontWeight: '600', margin: 0, flex: 1 }}>
                  {r.status === 'approved'
                    ? 'Lead request approved — ' + r.businessName + ' is now in your Call Log.'
                    : 'Lead request denied — ' + r.businessName + ' stays with its current owner.'}
                </p>
                <button onClick={() => dismissLeadRequestNotices([r.id])} style={{ backgroundColor: 'transparent', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Dismiss</button>
              </div>
            ))}
            {leadRequests.some(r => r.status === 'pending') && (
              <div style={{ backgroundColor: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '10px', padding: '12px 18px', marginBottom: '16px' }}>
                <p style={{ color: '#5b21b6', fontSize: '12px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending lead requests</p>
                {leadRequests.filter(r => r.status === 'pending').map(r => (
                  <p key={r.id} style={{ color: '#4c1d95', fontSize: '13px', margin: '2px 0' }}>{r.businessName}{r.city ? ' · ' + r.city : ''} — requested {formatDate(r.createdAt)}</p>
                ))}
              </div>
            )}
            {showAddProspect && (
              <div style={{ marginBottom: '24px' }}>
                <AddProspectForm
                  value={prospectForm}
                  onChange={v => { setProspectForm(v); setProspectError(''); }}
                  onSubmit={submitProspect}
                  onCancel={() => { setShowAddProspect(false); setProspectError(''); }}
                  loading={loading}
                  submitLabel={dupCheck.checking ? 'Checking...' : dupCheck.phoneMatches.length > 0 ? 'Already in Setera' : 'Save Prospect'}
                  submitDisabled={dupCheck.checking || dupCheck.phoneMatches.length > 0 || invalidPhoneFields.length > 0}
                  warning={<>
                    {prospectError && <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 12px 0' }}>{prospectError}</p>}
                    {invalidPhoneFields.length > 0 && <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 12px 0' }}>{invalidPhoneFields.join(' and ')} must be a 10-digit CA/US number (extensions like &quot;ext 12&quot; are fine).</p>}
                    <BusinessMatchList
                      variant="block"
                      matches={dupCheck.phoneMatches}
                      onRequested={() => { fetchLeadRequests(); dupCheck.refresh(); }}
                      title="This phone number is already in Setera — you can't add it. Request it if it's gone stale." />
                    <BusinessMatchList
                      variant="warn"
                      matches={dupCheck.nameMatches}
                      onRequested={() => { fetchLeadRequests(); dupCheck.refresh(); }}
                      title="Possible match by name — make sure this isn't the same business. You can still save." />
                  </>}
                />
              </div>
            )}
            {callbacksDue > 0 && (
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px 18px', marginBottom: '16px' }}>
                <p style={{ color: '#92400e', fontSize: '13px', fontWeight: '600', margin: 0 }}>{callbacksDue} follow-up{callbacksDue > 1 ? 's' : ''} due — don't let them slip.</p>
              </div>
            )}
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.3fr 1.5fr 1.2fr', padding: '14px 24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                {['Company', 'Trade & City', 'Status', 'Contact', 'Follow-Up'].map(col => (
                  <p key={col} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col}</p>
                ))}
              </div>
              {prospects.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', padding: '48px', textAlign: 'center' }}>No prospects yet. Hit Add Prospect to get started.</p>
              ) : prospects.map(p => {
                const st = getPipelineStatusStyle(p.status);
                return (
                  <div key={p.id} onClick={() => openDetail(p)} style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.3fr 1.5fr 1.2fr', padding: '14px 24px', borderBottom: '1px solid #f9fafb', alignItems: 'center', cursor: 'pointer' }}>
                    <div>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{p.bad_number && <span title="Bad number (Wrong Number logged)" style={{ fontSize: '11px', marginRight: '5px' }}>📵</span>}{p.company_name}</p>
                      {p.phone && <p style={{ color: '#9ca3af', fontSize: '11px', margin: 0 }}>{p.phone}</p>}
                    </div>
                    <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>{[p.trade, p.city].filter(Boolean).join(' · ') || '—'}</p>
                    <span style={{ backgroundColor: st.bg, color: st.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600', display: 'inline-block', width: 'fit-content' }}>{p.status}</span>
                    <p style={{ color: p.contact_name ? '#374151' : '#9ca3af', fontSize: '13px', margin: 0, fontStyle: p.contact_name ? 'normal' : 'italic' }}>{p.contact_name || 'Not captured'}</p>
                    <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{p.follow_up_date || '—'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab === 'prospects' && prospectView === 'detail' && selectedProspect && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
              <button onClick={() => { setProspectView('list'); setSelectedProspect(null); setActivities([]); setStageHistory([]); }} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Back</button>
              <div style={{ flex: 1 }}>
                <h1 style={{ color: '#0a1f13', fontSize: '26px', fontWeight: '800', margin: '0 0 2px 0' }}>{selectedProspect.company_name}</h1>
                <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{[selectedProspect.trade, selectedProspect.city].filter(Boolean).join(' / ')}</p>
              </div>
              <select value={selectedProspect.status} onChange={e => updateProspectStatus(selectedProspect.id, e.target.value)} style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', backgroundColor: '#fff', fontWeight: '600', cursor: 'pointer', outline: 'none' }}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {selectedProspect.bad_number && (
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>📵</span>
                <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '700', margin: 0 }}>Bad number — a Wrong Number call was logged. Find a working number before calling again.</p>
                <button onClick={() => clearBadNumber(selectedProspect.id)} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#991b1b', flexShrink: 0 }}>Clear</button>
              </div>
            )}
            <div style={{ marginBottom: '24px' }}><OverflowQuickAdd collapsible compact showRecent={false} defaults={{ email: selectedProspect.contact_email || selectedProspect.email || '', businessName: selectedProspect.company_name || '', contactName: selectedProspect.contact_name || '' }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>Company</p>
                {([['Phone', selectedProspect.phone], ['Email', selectedProspect.email], ['Website', selectedProspect.website], ['Source', selectedProspect.source]] as [string, string][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}><span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span><span style={{ color: '#374151', fontSize: '13px', fontWeight: '500', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span></div>
                ))}
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>Contact</p>
                {([['Name', selectedProspect.contact_name], ['Position', selectedProspect.contact_position], ['Direct Phone', selectedProspect.contact_phone], ['Direct Email', selectedProspect.contact_email], ['Follow Up Date', selectedProspect.follow_up_date]] as [string, string][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}><span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span><span style={{ color: '#374151', fontSize: '13px', fontWeight: '500', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span></div>
                ))}
              </div>
            </div>
            {selectedProspect.notes && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>Notes</p>
                <p style={{ color: '#374151', fontSize: '13px', margin: 0, whiteSpace: 'pre-wrap' }}>{selectedProspect.notes}</p>
              </div>
            )}
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
              <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 20px 0' }}>Log Activity</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div><label style={lbl}>Type</label><select style={inp} value={activityForm.type} onChange={e => setActivityForm({ ...activityForm, type: e.target.value })}>{ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={lbl}>Outcome</label>{activityForm.type === 'Call' ? (
                  <select style={inp} value={activityForm.outcome} onChange={e => setActivityForm(withCallOutcome(activityForm, e.target.value))}><option value="">— Select —</option>{CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}</select>
                ) : (
                  <input style={inp} placeholder="Spoke with owner, sent proposal..." value={activityForm.outcome} onChange={e => setActivityForm({ ...activityForm, outcome: e.target.value })} />
                )}</div>
                <div><label style={lbl}>Follow Up Date</label><input type="date" style={inp} value={activityForm.follow_up_date} onChange={e => setActivityForm({ ...activityForm, follow_up_date: e.target.value })} /></div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Notes</label>
                <textarea placeholder="What happened? What did they say? Next steps?" value={activityForm.notes} onChange={e => setActivityForm({ ...activityForm, notes: e.target.value })} style={{ width: '100%', minHeight: '80px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
              </div>
              {!activityForm.outcome.trim() && <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 8px 0' }}>Add an outcome to log this activity.</p>}
              <button onClick={logActivity} disabled={loading || !activityForm.outcome.trim()} style={{ backgroundColor: '#0f2318', color: '#fff', padding: '11px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: (loading || !activityForm.outcome.trim()) ? 0.6 : 1 }}>{loading ? 'Saving...' : 'Log Activity'}</button>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px 0' }}>Activity History</p>
              {activities.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>No activity logged yet.</p>
              ) : activities.map(a => (
                <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700' }}>{a.type}{a.outcome ? ' — ' + a.outcome : ''}</span>
                    <span style={{ color: '#9ca3af', fontSize: '11px' }}>{new Date(a.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  {a.notes && <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{a.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {tab === 'calendar' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Calendar</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Click an available slot to book an appointment with Alex</p>
            </div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '14px 20px', marginBottom: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', margin: 0 }}>
                After booking, text Alex: <span style={{ color: '#00d4aa', fontWeight: '700' }}>"Got one ✅ [Name] — [Business] — [Trade]"</span>
              </p>
            </div>
            {/* Slot list must render unconditionally — never gate this behind bookingForm/prospectForm
                being filled in. Prospect info is only required later, at the confirm-booking step below. */}
            {Object.keys(availByDate).length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '48px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' as const }}>
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No availability set yet. Alex will add time slots for you to book into.</p>
              </div>
            ) : Object.entries(availByDate).map(([date, slots]) => (
              <div key={date} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700', margin: '0 0 14px 0' }}>
                  {new Date(date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
                  {slots.map(slot => (
                    <div key={slot.id} onClick={() => { if (!slot.is_booked) setSelectedSlot(selectedSlot?.id === slot.id ? null : slot); }}
                      style={{ padding: '10px 20px', borderRadius: '8px', border: slot.is_booked ? '2px solid #e5e7eb' : selectedSlot?.id === slot.id ? '2px solid #0f2318' : '2px solid #00d4aa', backgroundColor: slot.is_booked ? '#f9fafb' : selectedSlot?.id === slot.id ? '#0f2318' : 'rgba(0,212,170,0.08)', cursor: slot.is_booked ? 'not-allowed' : 'pointer', minWidth: '130px', textAlign: 'center' as const }}>
                      <p style={{ color: slot.is_booked ? '#9ca3af' : selectedSlot?.id === slot.id ? '#00d4aa' : '#0a1f13', fontSize: '14px', fontWeight: '700', margin: '0 0 3px 0' }}>{slot.time_slot}</p>
                      <p style={{ color: slot.is_booked ? '#9ca3af' : selectedSlot?.id === slot.id ? 'rgba(255,255,255,0.6)' : '#00d4aa', fontSize: '11px', margin: 0, fontWeight: '600' }}>
                        {slot.is_booked ? 'Booked' : selectedSlot?.id === slot.id ? 'Selected' : 'Available'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {selectedSlot && (
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '2px solid #00d4aa', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Booking slot</p>
                    <h2 style={{ color: '#0a1f13', fontSize: '20px', fontWeight: '800', margin: 0 }}>
                      {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedSlot.time_slot}
                    </h2>
                  </div>
                  <button onClick={() => setSelectedSlot(null)} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#9ca3af', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Clear</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Contact Name *</label><input style={inp} placeholder="John Smith" value={bookingForm.contact_name} onChange={e => setBookingForm({ ...bookingForm, contact_name: e.target.value })} /></div>
<div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Prospect Email</label><input style={inp} type="email" placeholder="john@example.com" value={bookingForm.email} onChange={e => setBookingForm({ ...bookingForm, email: e.target.value })} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Business Name *</label><input style={inp} placeholder="Atlas Roofing Ltd." value={bookingForm.business_name} onChange={e => setBookingForm({ ...bookingForm, business_name: e.target.value })} /></div>
                  <div><label style={lbl}>Trade</label><select style={{ ...inp, backgroundColor: '#fff' }} value={bookingForm.trade} onChange={e => setBookingForm({ ...bookingForm, trade: e.target.value })}>{TRADE_OPTIONS.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label style={lbl}>Assign To</label><select style={{ ...inp, backgroundColor: '#fff' }} value={bookingForm.assigned_to} onChange={e => setBookingForm({ ...bookingForm, assigned_to: e.target.value })}>{assignees.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}</select></div>
                  <div><label style={lbl}>Phone</label><input style={inp} placeholder="(403) 555-0100" value={bookingForm.phone} onChange={e => setBookingForm({ ...bookingForm, phone: e.target.value })} /></div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={lbl}>Notes for Alex</label>
                  <textarea placeholder="Pain points, call volume, anything useful from the conversation..." value={bookingForm.notes} onChange={e => setBookingForm({ ...bookingForm, notes: e.target.value })} style={{ width: '100%', minHeight: '70px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'Inter, sans-serif' }} />
                </div>
                <div style={{ backgroundColor: '#f0f4f1', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
                  <p style={{ color: '#374151', fontSize: '12px', margin: '0 0 4px 0', fontWeight: '600' }}>After booking, text Alex this exact message:</p>
                  <p style={{ color: '#0f2318', fontSize: '13px', margin: 0, fontWeight: '700', fontStyle: 'italic' }}>
                    {'Got one ✅ ' + (bookingForm.contact_name || '[Name]') + ' — ' + (bookingForm.business_name || '[Business]') + ' — ' + bookingForm.trade + ' — Assigned: ' + (assignees.find(a => a.id === bookingForm.assigned_to)?.full_name || 'Alex')}
                  </p>
                </div>
                <button onClick={bookAppointment} disabled={loading || !bookingForm.business_name || !bookingForm.contact_name} style={{ backgroundColor: '#0f2318', color: '#fff', padding: '13px 36px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: loading || !bookingForm.business_name || !bookingForm.contact_name ? 0.6 : 1 }}>
                  {loading ? 'Booking...' : 'Book Appointment'}
                </button>
              </div>
            )}
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>All Appointments</p>
              {appointments.filter(a => a.status !== 'Cancelled').length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No appointments yet.</p>
              ) : appointments.filter(a => a.status !== 'Cancelled').map(appt => {
                const st = getStatusStyle(appt.status);
                return (
                  <div key={appt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{appt.business_name}</p>
                      <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 2px 0' }}>{appt.contact_name} · {appt.trade} · {formatDate(appt.scheduled_date || '')} at {appt.scheduled_time}</p>
                      {appt.notes && <p style={{ color: '#6b7280', fontSize: '12px', margin: 0, fontStyle: 'italic' }}>{appt.notes}</p>}
                      {cancelingApptId === appt.id && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', marginTop: '10px', maxWidth: '420px' }}>
                          <CancelDemo appt={appt} phone={appt.phone || ''} showPhone startConfirming onKeep={() => setCancelingApptId(null)} onDone={onDemoCancelled} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '16px' }}>
                      <span style={{ backgroundColor: st.bg, color: st.color, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '600' }}>{appt.status}</span>
                      {appt.meet_link && (
                        <a href={appt.meet_link} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#1a73e8', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', textDecoration: 'none' }}>Join</a>
                      )}
                      {appt.status === 'Scheduled' && (
                        isPastAppointment(appt.scheduled_date, appt.scheduled_time) ? (
                          <>
                            <button onClick={() => markAppointmentOutcome(appt.id, 'Showed')} style={{ backgroundColor: '#d1fae5', border: 'none', color: '#065f46', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>Mark Showed</button>
                            <button onClick={() => markAppointmentOutcome(appt.id, 'No Show')} style={{ backgroundColor: '#fee2e2', border: 'none', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}>Mark No Show</button>
                          </>
                        ) : (
                          <button onClick={() => setCancelingApptId(cancelingApptId === appt.id ? null : appt.id)} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#9ca3af', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── EARNINGS ── */}
        {tab === 'earnings' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Earnings</h1>
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Every close you set gets paid out here</p>
            </div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '14px', padding: '36px', marginBottom: '24px', textAlign: 'center' as const }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px 0' }}>Total Earned</p>
              <p style={{ color: '#00d4aa', fontSize: '56px', fontWeight: '800', margin: '0 0 4px 0', lineHeight: 1 }}>
                ${totalEarningsCAD.toLocaleString()} <span style={{ fontSize: '20px', color: 'rgba(255,255,255,0.4)', fontWeight: '400' }}>CAD</span>
              </p>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
              <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Closed Deals</p>
              {myEarnings.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No closed deals yet. Book quality appointments and Alex handles the close.</p>
              ) : myEarnings.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0' }}>{e.sales?.clients?.business_name || 'Client'}</p>
                    <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{e.sales ? planLabel(e.sales.plan_slug) : ''} · {e.sales ? formatDate(e.sales.sold_at) : ''}</p>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <p style={{ color: '#00d4aa', fontSize: '16px', fontWeight: '800', margin: 0 }}>${e.commission_amount.toLocaleString()} CAD</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weekly Demos Booked Goal</p>
                <span style={{ color: weeklyPct >= 100 ? '#10b981' : '#6b7280', fontSize: '13px', fontWeight: '700' }}>{bookedThisWeek} / {WEEKLY_GOAL}</span>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', borderRadius: '99px', height: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ backgroundColor: weeklyPct >= 100 ? '#10b981' : '#00d4aa', height: '100%', width: weeklyPct + '%', borderRadius: '99px' }} />
              </div>
              <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{weeklyPct >= 100 ? 'Goal hit. Keep going.' : (WEEKLY_GOAL - bookedThisWeek) + ' more demos to hit your goal of ' + WEEKLY_GOAL + ' this week.'}</p>
            </div>
          </div>
        )}

        {/* ── RESOURCES ── */}
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
              <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Everything you need to make calls, book appointments, and grow your skills.</p>
            </div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px' }}>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0 }}>Start with the Setter section. As you get comfortable, everything below that is your path to closing.</p>
            </div>
            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '16px 20px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px' }}>💡</span>
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0, fontWeight: '500' }}>Can't reach Alex right away? This page should help you do the next right thing.</p>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={secLabel}>Pricing Reference</p>
              <RCard title="Setera Pricing (Internal Reference)" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="For your own knowledge — not something to lead with on calls. The goal is still to get people to the demo." buttonLabel="Open Pricing">
                <div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {[
                      'Launch — $697 CAD/month — 200 minutes',
                      'Grow — $1,348 CAD/month — 1,000 minutes',
                      'Starter — $2,247 CAD/month — 3,000 minutes',
                      'Setup fee — $1,397 CAD',
                      'Top-up — $697 CAD — additional 200 minutes',
                      'Plus applicable taxes based on province',
                    ].map((b, j) => (
                      <li key={j} style={{ padding: '6px 0 6px 16px', position: 'relative', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6', lineHeight: '1.6' }}>
                        <span style={{ position: 'absolute', left: 0, top: '13px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'block' }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </RCard>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={secLabel}>Setter Training</p>
              <RCard title="Setera Sales & Rep Cheat Sheet" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Know Setera cold: what it is, who it's for, discovery questions, pricing, objections, and the Overflow pivot. Read this first." buttonLabel="Open Cheat Sheet">
                <div>
                  {SALES_CHEAT_SHEET.map((item, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '11px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none', userSelect: 'none' as const }}>
                        <span style={{ color: '#00d4aa', fontWeight: '700', fontSize: '11px', backgroundColor: 'rgba(0,212,170,0.1)', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{item.num}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0a1f13' }}>{item.title}</span>
                      </summary>
                      <div style={{ padding: '14px 16px', backgroundColor: '#fff' }}>
                        {item.body.map((p, j) => (
                          <p key={j} style={{ color: '#374151', fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px 0' }}>{p}</p>
                        ))}
                        {item.bullets && item.bullets.length > 0 && (
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {item.bullets.map((b, j) => (
                              <li key={j} style={{ padding: '6px 0 6px 16px', position: 'relative', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6', lineHeight: '1.6' }}>
                                <span style={{ position: 'absolute', left: 0, top: '13px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00d4aa', display: 'block' }} />
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
              <RCard title="Cold Call Script" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Diagnose the phone problem or pivot to Overflow. Either road leads to the demo." buttonLabel="Open Script">
                <div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '18px', marginBottom: '16px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 8px 0' }}>The Goal</p>
                    <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', lineHeight: '1.7', margin: '0 0 14px 0' }}>{COLD_CALL_OVERVIEW.goal}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      {COLD_CALL_OVERVIEW.twoRoads.map((road, i) => (
                        <div key={i} style={{ backgroundColor: 'rgba(0,212,170,0.08)', borderRadius: '8px', padding: '10px 12px' }}>
                          <p style={{ color: '#00d4aa', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>{road.label}</p>
                          {road.steps.map((s, j) => (
                            <p key={j} style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', margin: '0 0 3px 0' }}>{'\u2192 ' + s}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>{COLD_CALL_OVERVIEW.twoRoadsNote}</p>
                  </div>
                  {COLD_CALL_STEPS.map((item, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '11px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none', userSelect: 'none' as const }}>
                        <span style={{ color: '#00d4aa', fontWeight: '700', fontSize: '11px', backgroundColor: 'rgba(0,212,170,0.1)', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{item.phase}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0a1f13' }}>{item.title}</span>
                      </summary>
                      <div style={{ padding: '14px 16px', backgroundColor: '#fff' }}>
                        <div style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '10px 14px', marginBottom: '8px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{item.script}</div>
                        {item.note && <p style={{ color: '#9ca3af', fontSize: '12px', margin: item.guardrails ? '0 0 12px 0' : 0, lineHeight: '1.5' }}>{item.note}</p>}
                        {item.guardrails && (
                          <div>
                            <div style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '10px 12px', marginBottom: '10px' }}>
                              <p style={{ color: '#0a1f13', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Proof Point</p>
                              <p style={{ color: '#374151', fontSize: '12px', margin: 0, lineHeight: '1.6' }}>{item.guardrails.proofPoint}</p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px 12px' }}>
                                <p style={{ color: '#065f46', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Say This</p>
                                {item.guardrails.doSay.map((line, j) => (
                                  <p key={j} style={{ color: '#065f46', fontSize: '12px', margin: '0 0 5px 0', lineHeight: '1.5' }}>{'\u2014 ' + line}</p>
                                ))}
                              </div>
                              <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '10px 12px' }}>
                                <p style={{ color: '#991b1b', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px 0' }}>Never Say</p>
                                {item.guardrails.neverSay.map((line, j) => (
                                  <p key={j} style={{ color: '#991b1b', fontSize: '12px', margin: '0 0 5px 0', lineHeight: '1.5' }}>{'\u2014 ' + line}</p>
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
                      <p key={i} style={{ color: '#92400e', fontSize: '13px', margin: '0 0 4px 0', lineHeight: '1.5' }}>{'\u2014 ' + r}</p>
                    ))}
                  </div>
                </div>
              </RCard>
              <RCard title="Objection Handling" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="The most common pushbacks and exactly what to say. Learn these cold." buttonLabel="Open">
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
              <RCard title="Voicemail Script" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Short, curious, no company name. Leave it and move on." buttonLabel="Open">
                <div>
                  <div style={{ backgroundColor: '#f0f4f1', borderLeft: '3px solid #00d4aa', padding: '14px 16px', marginBottom: '12px', fontStyle: 'italic', fontSize: '14px', color: '#374151', lineHeight: '1.7' }}>
                    {COLD_CALL_VOICEMAIL_SCRIPT.script}
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>{COLD_CALL_VOICEMAIL_SCRIPT.note}</p>
                </div>
              </RCard>
              <RCard title="Mindset and Tonality" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="How to sound right, stay sharp all day, and reset between calls." buttonLabel="Open">
                <div>
                  {MINDSET_TIPS.map((item, i) => (
                    <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>{item.title}</p>
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{item.body}</p>
                    </div>
                  ))}
                </div>
              </RCard>
              <RCard title="Commission Structure" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Your rate is a percentage of what the client actually pays — it changes based on your track, not a flat per-close fee." buttonLabel="Open">
                <div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px 0' }}>15% Commission — By Plan</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    {[{ plan: 'Launch', price: '$697', cad: '$104.55 CAD' },{ plan: 'Grow', price: '$1,348', cad: '$202.20 CAD' },{ plan: 'Starter', price: '$2,247', cad: '$337.05 CAD' }].map((item, i) => (
                      <div key={i} style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px', textAlign: 'center' as const }}>
                        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.plan} ({item.price}/mo)</p>
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
                      <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>Stay at 15%, shadow Alex on the close through clients 7–14, and keep every bonus below. By 15+ clients you're expected to run the full deal yourself.</p>
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
              <RCard title="How to Use the CRM" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Logging calls, booking appointments, tracking your pipeline." buttonLabel="Open">
                <div>
                  {CRM_STEPS.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '14px', padding: '12px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'flex-start' }}>
                      <span style={{ backgroundColor: '#0f2318', color: '#00d4aa', fontSize: '13px', fontWeight: '800', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.step}</span>
                      <div>
                        <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 3px 0' }}>{item.title}</p>
                        <p style={{ color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{item.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </RCard>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <p style={secLabel}>Sales Training</p>
              <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
                <p style={{ color: '#fff', fontSize: '15px', fontWeight: '700', margin: '0 0 4px 0' }}>Five things every rep needs to know.</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '0 0 20px 0' }}>Each stage below names the section and card where you will find it on this page. Before your first call, complete all five stages.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                  {SETERA_REP_PATH_STAGES.map((s, i) => (
                    <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 6px 0' }}>{s.num}</p>
                      <p style={{ color: '#fff', fontSize: '12px', fontWeight: '700', margin: '0 0 5px 0' }}>{s.title}</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0, lineHeight: '1.5' }}>{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <RCard title="The Setera Method" badge="Rep" badgeBg="#dbeafe" badgeColor="#1e40af" description="The complete 7-phase sales framework. Emotion Over Logic — a psychographic approach to the contractor sale." buttonLabel="Open Framework">
                <div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
                    <p style={{ color: '#fff', fontSize: '15px', fontWeight: '700', margin: '0 0 8px 0' }}>This is not a beginner script. This is the Setera standard.</p>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px 0' }}>You are not here to memorize lines or sound like a salesperson. You are here to learn how to think, diagnose, and lead a contractor through a decision they may already know they need to make.</p>
                    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: 0 }}>Setera reps are diagnostic closers.</p>
                  </div>
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>The 7 Phases</p>
                  {SETERA_METHOD_PHASES.map((phase, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '12px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', gap: '10px', listStyle: 'none', userSelect: 'none' as const }}>
                        <span style={{ color: '#00d4aa', fontWeight: '700', fontSize: '11px', backgroundColor: 'rgba(0,212,170,0.1)', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{phase.num}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0a1f13', flex: 1 }}>{phase.name}</span>
                        <span style={{ color: '#9ca3af', fontSize: '11px' }}>{phase.tag}</span>
                      </summary>
                      <div style={{ padding: '14px 16px', backgroundColor: '#fff' }}>
                        <p style={{ color: '#374151', fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px 0' }}>{phase.content}</p>
                        {phase.quote && <div style={{ backgroundColor: '#f9fafb', borderLeft: '2px solid #d1d5db', padding: '8px 12px', marginBottom: '10px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{phase.quote}</div>}
                        {phase.bullets && phase.bullets.length > 0 && (
                          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px 0' }}>
                            {phase.bullets.map((bullet: string, j: number) => (
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
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 8px 0' }}>Objection Handling</p>
                  {SETERA_METHOD_OBJECTIONS.map((obj, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '11px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#374151', listStyle: 'none', userSelect: 'none' as const }}>"{obj.obj}"</summary>
                      <div style={{ padding: '12px 16px', backgroundColor: '#fff' }}>
                        <div style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '8px 12px', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>{obj.response}</div>
                      </div>
                    </details>
                  ))}
                  <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '20px 0 10px 0' }}>The Principles</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {SETERA_METHOD_PRINCIPLES.map((p, i) => (
                      <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderTop: '2px solid #00d4aa', borderRadius: '8px', padding: '12px 14px' }}>
                        <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', margin: '0 0 4px 0' }}>{p.title}</p>
                        <p style={{ color: '#6b7280', fontSize: '12px', margin: 0, lineHeight: '1.6' }}>{p.body}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '16px 20px', textAlign: 'center' as const }}>
                    <p style={{ color: '#fff', fontSize: '16px', fontWeight: '700', margin: 0 }}>Everyone else sold them software. We sell them continuity.</p>
                  </div>
                </div>
              </RCard>
              <RCard title="The Front Door Bridge" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Get from a cold opening into a genuine business conversation. Context → Observation → Curiosity → Transition — a structure, not a script." buttonLabel="Open">
                <MarkdownResource markdown={FRONT_DOOR_BRIDGE_MD} />
              </RCard>
              <RCard title="Ask About the Change" badge="Setter" badgeBg="#d1fae5" badgeColor="#065f46" description="Ask about the change, not just the current state. How to turn the Setera Method into a real conversation — current states give you facts, transitions give you stories." buttonLabel="Open">
                <MarkdownResource markdown={ASK_ABOUT_THE_CHANGE_MD} />
              </RCard>

              <RCard title="Setera Overflow Network" badge="Rep" badgeBg="#dbeafe" badgeColor="#1e40af" description="What to do when a prospect isn't ready for Emily — the second way a 'no' becomes a Setera relationship." buttonLabel="Open">
                <div>
                  {OVERFLOW_NETWORK_SECTIONS.map((section, i) => (
                    <details key={i} style={{ marginBottom: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <summary style={{ padding: '11px 16px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#0a1f13', listStyle: 'none', userSelect: 'none' as const }}>{section.title}</summary>
                      <div style={{ padding: '14px 16px', backgroundColor: '#fff' }}>
                        {section.body.map((p, j) => (
                          <p key={j} style={{ color: '#374151', fontSize: '13px', lineHeight: '1.7', margin: j === section.body.length - 1 ? 0 : '0 0 10px 0' }}>{p}</p>
                        ))}
                      </div>
                    </details>
                  ))}
                  <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 14px', marginTop: '10px' }}>
                    <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>Never guarantee Overflow volume, jobs, or revenue. Never call these "free leads." If you're unsure whether a business should be considered, bring Alex in — Setera makes the final approval decision on who enters the network.</p>
                  </div>
                </div>
              </RCard>
              <RCard title="Follow-Up Templates" badge="Rep" badgeBg="#dbeafe" badgeColor="#1e40af" description="Copy-ready email templates for every stage." buttonLabel="View Templates">
                <div>
                  {FOLLOW_UP_TEMPLATES.map((template, i) => (
                    <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' }}>
                        <div>
                          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 2px 0' }}>{template.name}</p>
                          <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>Subject: {template.subject}</p>
                        </div>
                        <CopyButton text={'Subject: ' + template.subject + '\n\n' + template.body} label="Copy" />
                      </div>
                      <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '10px 12px' }}>
                        <pre style={{ color: '#374151', fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap' as const, fontFamily: 'Inter, sans-serif', lineHeight: '1.6' }}>{template.body}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </RCard>
              <RCard title="Setera Product Guide" badge="Rep" badgeBg="#dbeafe" badgeColor="#1e40af" description="Everything to know about Setera and Emily. Read before your first sales call." buttonLabel="Open Guide">
                <div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                    <p style={{ color: '#00d4aa', fontSize: '13px', fontWeight: '700', margin: '0 0 4px 0' }}>The one-line positioning statement every rep knows cold:</p>
                    <p style={{ color: '#fff', fontSize: '14px', fontWeight: '600', margin: 0, fontStyle: 'italic' }}>Setera is not an answering service — it is a revenue recovery system built for the trades.</p>
                  </div>
                  {PRODUCT_GUIDE_QA.map((item, i) => (
                    <details key={i} style={{ marginBottom: '4px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                      <summary style={{ padding: '10px 14px', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '13px', fontWeight: '600', color: '#0a1f13', listStyle: 'none', userSelect: 'none' as const }}>{item.q}</summary>
                      <div style={{ padding: '10px 14px', backgroundColor: '#fff' }}>
                        <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>{item.a}</p>
                      </div>
                    </details>
                  ))}
                </div>
              </RCard>
              <RCard title="What Not To Promise" badge="Important" badgeBg="#fef3c7" badgeColor="#92400e" description="Keep every conversation inside the current V1 offer. If it is not confirmed live, do not promise it." buttonLabel="View Guardrails">
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <p style={{ color: '#991b1b', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Never Promise</p>
                      {['Emily is human.','Callers will not know she is AI.','Guaranteed revenue, jobs, or close rates.','Custom pricing without approval.','Refunds.','Same-day go-live without approval.','Calendar booking unless confirmed live.','Pricing or estimates from Emily.','Legal compliance advice.'].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <span style={{ color: '#ef4444', fontWeight: '800', fontSize: '13px', flexShrink: 0 }}>x</span>
                          <span style={{ color: '#374151', fontSize: '12px', lineHeight: '1.4' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p style={{ color: '#065f46', fontSize: '12px', fontWeight: '700', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Emily Can Do</p>
                      {['Answer inbound calls.','Disclose she is an AI virtual receptionist.','Capture caller name, phone, reason, urgency, callback time.','Summarize and categorize calls.','Log everything in the client dashboard.','Notify the owner by SMS.','Use client business info to sound informed.'].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <span style={{ color: '#10b981', fontWeight: '800', fontSize: '13px', flexShrink: 0 }}>✓</span>
                          <span style={{ color: '#374151', fontSize: '12px', lineHeight: '1.4' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#0f2318', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>That is a good question. I do not want to give you the wrong answer — I will confirm with Alex and get back to you.</p>
                    <CopyButton text="That is a good question. I do not want to give you the wrong answer — I will confirm with Alex and get back to you." />
                  </div>
                </div>
              </RCard>
            </div>

            <div style={{ backgroundColor: '#0f2318', borderRadius: '12px', padding: '32px 36px' }}>
              <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 24px 0' }}>From the founder</p>
              <p style={{ color: '#fff', fontSize: '22px', fontWeight: '700', lineHeight: '1.7', margin: '0 0 8px 0', fontStyle: 'italic' }}>"If the dream matters… why haven't you done it yet?</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '20px', fontWeight: '500', lineHeight: '1.7', margin: '0 0 8px 0', fontStyle: 'italic' }}>Not about to. Not working towards. Done it.</p>
              <p style={{ color: '#00d4aa', fontSize: '22px', fontWeight: '800', margin: '0 0 28px 0' }}>Go fast, don't die… Phuck it."</p>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', margin: 0, fontWeight: '600' }}>— Alex Rivera, Setera</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}