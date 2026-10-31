// Reseeds Demo Roofing Co (client@example.com) with a single, coherent
// storyline: "Spring Thaw Damage Discovery" — April 1, 2026, the first warm
// day of spring, when homeowners walk their roofs for the first time since
// winter and start finding damage. Emily fields 9 calls that day.
//
// Gated to Demo Roofing Co's fixed business_id (same constant as
// lib/demo-account.ts DEMO_ROOFING_CO_BUSINESS_ID) plus a runtime name check
// before any delete — this must never be able to touch a real client.
//
// Idempotent: deletes all existing `calls` rows for this business_id, then
// inserts exactly the 9 rows below. Safe to re-run before every demo.
//
// Usage:
//   node --env-file=.env.local scripts/seed-demo-roofing-co.mjs           # dry run — prints the plan, writes nothing
//   node --env-file=.env.local scripts/seed-demo-roofing-co.mjs --apply   # clears old rows and inserts the 9 below
//
// Date is hardcoded to April 1, 2026 throughout — never derived from
// Date.now()/NOW(). Note: this puts every seeded row outside the app's
// rolling 7/30/90-day windows (Dashboard KPIs, Analytics tab, Call Volume
// chart all filter off the real clock), so those views will read as empty
// when opened today. Demo this account via Pipeline, Call Log, and
// Calendar (navigate back to April 2026) instead — see reseed spec.

import { createClient } from '@supabase/supabase-js';

const DEMO_ROOFING_CO_BUSINESS_ID = '00000000-0000-4000-8000-0000000000d1';
const EXPECTED_BUSINESS_NAME = 'Demo Roofing Co';

const APPLY = process.argv.includes('--apply');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/seed-demo-roofing-co.mjs');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Regina, SK (the business's own 306 area code) is UTC-6 year-round — no
// DST — so these UTC timestamps map to the stated local wall-clock times
// exactly, no seasonal drift.
const REGINA_UTC_OFFSET_HOURS = 6;
function reginaLocalToUtcIso(month, day, hour, minute) {
  const d = new Date(Date.UTC(2026, month - 1, day, hour + REGINA_UTC_OFFSET_HOURS, minute, 0));
  return d.toISOString();
}

const CALLS = [
  {
    seed_tag: 'demo-seed-2026-04-01-01',
    caller_name: 'Michael Test',
    caller_number: '(555) 555-0142',
    reason: 'Found a hole in the roof and gutters pulling away on the north side — damage from over the winter, just noticed today',
    urgency: 'urgent',
    mood: 'anxious',
    city: 'Regina, SK',
    property_address: '482 Elm Crescent, Regina, SK',
    status: 'red', // Urgent
    classification: 'opportunity',
    classification_source: 'ai_auto',
    classification_confidence: 0.94,
    duration: 420, // 7 min
    created_at: reginaLocalToUtcIso(4, 1, 8, 30),
    pipeline_stage: 'new', // Call Captured
    summary: "Michael Test called after his first walk-around of the season, once the snow finally cleared. He found a hole in his roof and noticed the gutters pulling away from the fascia on the north side of the house. No active leak yet, but the deck is exposed and he's worried about the next rain. Emily captured his address and callback number and flagged this urgent — same-day or next-day inspection recommended before more moisture gets in.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help you today?" },
      { role: 'user', message: "Hey, yeah, I was up checking my roof now that the snow's melted and I found an actual hole up there. And the gutters on the north side are kind of pulling away from the house." },
      { role: 'agent', message: "Oh no, I'm sorry to hear that. Is there any active water coming in right now, or is it just exposed?" },
      { role: 'user', message: "No water yet, but it looks bad. I don't want it raining before someone takes a look." },
      { role: 'agent', message: "Totally understandable — let's get someone out to you quickly. Can I grab your address and a good callback number?" },
      { role: 'user', message: "Sure, it's 482 Elm Crescent, and this number's fine, it's my cell." },
      { role: 'agent', message: "Got it, Michael. I'm flagging this as urgent given the exposed hole — someone from the team will call you back shortly to get an inspection on the calendar as soon as possible." },
      { role: 'user', message: "Great, thank you." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-02',
    caller_name: 'Sarah Sample',
    caller_number: '(555) 555-0187',
    reason: 'Ice damage discovered along the roofline, requesting a spring inspection',
    urgency: 'medium',
    mood: 'concerned',
    city: 'Regina, SK',
    property_address: '1210 Cameron Street, Regina, SK',
    status: 'green', // Captured
    classification: 'opportunity',
    classification_source: 'ai_auto',
    classification_confidence: 0.91,
    duration: 240, // 4 min
    created_at: reginaLocalToUtcIso(4, 1, 9, 45),
    pipeline_stage: 'new', // Call Captured
    summary: "Sarah Sample noticed ice damage along her roofline while cleaning up the yard for spring — visible cracking in the shingles near the eaves. No active leak reported. She'd like a full spring inspection booked and is comfortable being contacted anytime to schedule.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help?" },
      { role: 'user', message: "Hi, I was out doing some spring cleanup and noticed some cracking in the shingles near the edge of my roof — I think it's from the ice this winter." },
      { role: 'agent', message: "Thanks for catching that. Is there any leaking inside right now, or is it just visible damage from the outside?" },
      { role: 'user', message: "Just visible so far, nothing inside that I've noticed." },
      { role: 'agent', message: "Good to know. I'd recommend getting a full spring inspection booked so we can check it properly before it gets worse. Can I get your address to pass along?" },
      { role: 'user', message: "Yep, 1210 Cameron Street." },
      { role: 'agent', message: "Perfect, I've got you down — someone will reach out to schedule the inspection." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-03',
    caller_name: 'David Placeholder',
    caller_number: '(555) 555-0119',
    reason: "Existing customer confirming their spring maintenance visit",
    urgency: 'low',
    mood: 'friendly',
    city: 'Regina, SK',
    property_address: '77 Pasqua Street, Regina, SK',
    status: 'green', // Captured
    classification: 'customer',
    classification_source: 'ai_auto',
    classification_confidence: 0.88,
    duration: 180, // 3 min
    created_at: reginaLocalToUtcIso(4, 1, 10, 30),
    pipeline_stage: null, // not an opportunity — doesn't flow into Pipeline
    summary: "David Placeholder, an existing customer, called to confirm his scheduled spring maintenance visit is still on for this week. No new issues reported — just confirming the appointment window and whether the crew needs anything prepped beforehand.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help?" },
      { role: 'user', message: "Hi, just double-checking — I've got a spring maintenance visit booked this week, wanted to confirm that's still happening." },
      { role: 'agent', message: "Let me check that for you... yes, that's still on the books. Is there anything you need from our side before the crew arrives?" },
      { role: 'user', message: "Nope, just wanted to confirm. Thanks!" },
      { role: 'agent', message: "Of course, David — see you then." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-04',
    caller_name: 'Jennifer Demo',
    caller_number: '(555) 555-0173',
    reason: 'Gutters sagging and pulling away from the fascia after heavy snow load',
    urgency: 'medium',
    mood: 'concerned',
    city: 'Regina, SK',
    property_address: '356 Angus Street, Regina, SK',
    status: 'yellow', // Follow Up
    classification: 'opportunity',
    classification_source: 'ai_auto',
    classification_confidence: 0.90,
    duration: 300, // 5 min
    created_at: reginaLocalToUtcIso(4, 1, 11, 15),
    pipeline_stage: 'estimate_booked',
    summary: "Jennifer Demo reported her gutters are visibly sagging and pulling away from the fascia after a heavy snow load over the winter. She's worried they could fully detach before spring rains pick up. Wants an assessment booked as soon as possible — flagged as a follow-up to lock in a visit date.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help today?" },
      { role: 'user', message: "Hi, my gutters are sagging pretty badly on one side — I think the snow this winter was just too heavy for them. I'm worried they're going to come off." },
      { role: 'agent', message: "That's definitely worth getting looked at before the spring rains start. Can I get your address so we can get an assessment scheduled?" },
      { role: 'user', message: "356 Angus Street. Could someone come out this week if possible?" },
      { role: 'agent', message: "I'll flag this for a prompt follow-up so we can get that booked for you as soon as possible." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-05',
    caller_name: 'Robert Example',
    caller_number: '(555) 555-0155',
    reason: "Subcontractor confirming availability for spring install season",
    urgency: 'low',
    mood: 'professional',
    city: null,
    property_address: null,
    status: 'blue', // In Progress
    classification: 'trade_partner',
    classification_source: 'ai_auto',
    classification_confidence: 0.93,
    duration: 240, // 4 min
    created_at: reginaLocalToUtcIso(4, 1, 12, 40),
    pipeline_stage: null, // trade/partner — not an opportunity, doesn't flow into Pipeline
    summary: "Robert Example, a subcontractor, called to confirm his crew's availability heading into spring install season and check on the current job queue. Not a homeowner call — logged for scheduling reference only.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help?" },
      { role: 'user', message: "Hey, it's Robert — just calling to confirm my crew's still on for the spring install season and see what's queued up so far." },
      { role: 'agent', message: "Thanks Robert, I'll pass this along to the team so they can confirm the schedule with you directly." },
      { role: 'user', message: "Sounds good, appreciate it." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-06',
    caller_name: 'Lisa Test',
    caller_number: '(555) 555-0134',
    reason: 'Shingles curling and missing granules after winter, wants an estimate',
    urgency: 'medium',
    mood: 'concerned',
    city: 'Regina, SK',
    property_address: '88 Wascana Gate, Regina, SK',
    status: 'green', // Captured
    classification: 'opportunity',
    classification_source: 'ai_auto',
    classification_confidence: 0.89,
    duration: 240, // 4 min
    created_at: reginaLocalToUtcIso(4, 1, 13, 50),
    pipeline_stage: 'called_back',
    summary: "Lisa Test noticed her shingles curling with visible granule loss after a rough winter and wants an estimate for repair or partial replacement. No active leak yet, but she's concerned it will worsen. Provided her address and a preferred callback window.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help?" },
      { role: 'user', message: "Hi, I noticed a bunch of my shingles are curling up and there's granules all over the ground near my downspout. Winter really did a number on my roof." },
      { role: 'agent', message: "That's good to catch now. Is it isolated to one section, or spread across the whole roof?" },
      { role: 'user', message: "Mostly the south-facing side, but I'd like someone to check the whole thing and give me an estimate." },
      { role: 'agent', message: "Absolutely — I'll get your info over to the team to follow up and get an estimate scheduled. Address?" },
      { role: 'user', message: "88 Wascana Gate." },
      { role: 'agent', message: "Got it, thanks Lisa — someone will call you back shortly." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-07',
    caller_name: 'James Sample',
    caller_number: '(555) 555-0198',
    reason: "Following up on last week's estimate, ready to schedule the repair",
    urgency: 'medium',
    mood: 'eager',
    city: 'Regina, SK',
    property_address: '245 Victoria Avenue, Regina, SK',
    status: 'yellow', // Follow Up
    classification: 'opportunity',
    classification_source: 'ai_auto',
    classification_confidence: 0.95,
    duration: 300, // 5 min
    created_at: reginaLocalToUtcIso(4, 1, 15, 15),
    pipeline_stage: 'estimate_done',
    summary: "James Sample called following up on the estimate he received last week and confirmed he's ready to move forward with scheduling the repair. He wants to lock in a date soon before the spring booking calendar fills up.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help?" },
      { role: 'user', message: "Hi, I got an estimate from you guys last week and I'm ready to go ahead and get it scheduled." },
      { role: 'agent', message: "That's great to hear, James! I'll flag this so the team can reach out and get a repair date locked in for you." },
      { role: 'user', message: "Perfect, the sooner the better — I know spring gets busy." },
      { role: 'agent', message: "Understood, I'll make sure that's a priority follow-up." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-08',
    caller_name: 'Amanda Placeholder',
    caller_number: '(555) 555-0166',
    reason: 'Insurance approved the claim for winter roof damage, ready to sign',
    urgency: 'low',
    mood: 'relieved',
    city: 'Regina, SK',
    property_address: '19 Sherwood Drive, Regina, SK',
    status: 'green', // Captured
    classification: 'opportunity',
    classification_source: 'ai_auto',
    classification_confidence: 0.97,
    duration: 360, // 6 min
    created_at: reginaLocalToUtcIso(4, 1, 16, 30),
    pipeline_stage: 'job_signed',
    // Optional Calendar flourish per spec: an "Install Start" dot ~April 6-8,
    // once materials/crew are lined up. Doesn't move her out of Job Signed —
    // just a forward-looking calendar marker, set independently of pipeline_stage.
    install_date: '2026-04-07',
    summary: "Amanda Placeholder's insurance company approved her claim for winter roof damage and she's ready to sign the contract to get the repair scheduled. She asked how quickly a crew could get on the calendar once she signs.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help?" },
      { role: 'user', message: "Hi! Great news — my insurance approved my claim for the roof damage from this winter, and I'm ready to sign and get this moving." },
      { role: 'agent', message: "That's wonderful news, congratulations! I'll get this flagged right away so the team can send over the contract and get you signed." },
      { role: 'user', message: "Thank you! How soon could a crew get out once I sign?" },
      { role: 'agent', message: "Once the paperwork's back, the team will confirm a install window with you directly — I'll make sure this moves quickly." },
      { role: 'user', message: "Perfect, thanks so much." },
    ],
  },
  {
    seed_tag: 'demo-seed-2026-04-01-09',
    caller_name: 'Unknown Caller',
    caller_number: '(555) 555-0121',
    reason: 'Call dropped mid-sentence, unclear reason',
    urgency: 'unknown',
    mood: 'unclear',
    city: null,
    property_address: null,
    status: 'yellow', // counts toward Needs Attention alongside the urgent call
    classification: 'other',
    classification_source: 'ai_auto',
    classification_confidence: 0.35, // below the 0.70 threshold → surfaces as "Needs Review"
    duration: 120, // 2 min
    created_at: reginaLocalToUtcIso(4, 1, 21, 15),
    pipeline_stage: null,
    summary: "Call connected late in the evening and the caller began describing an issue with their roof, but the line dropped mid-sentence before Emily could capture specifics or a callback number. Possibly weather- or connection-related. Flagged for manual review since no reason could be confirmed.",
    transcript: [
      { role: 'agent', message: "Thanks for calling Demo Roofing Co, this is Emily. How can I help you tonight?" },
      { role: 'user', message: "Hi, yeah, so I was looking at my roof earlier and there's this—" },
      { role: 'agent', message: "I'm sorry, it looks like the call dropped there. Could you tell me a bit more about what you—" },
    ],
  },
];

function summarizePlan() {
  const byClassification = CALLS.reduce((acc, c) => {
    acc[c.classification] = (acc[c.classification] || 0) + 1;
    return acc;
  }, {});
  const totalDurationMin = CALLS.reduce((s, c) => s + c.duration, 0) / 60;
  console.log(`Business: ${EXPECTED_BUSINESS_NAME} (${DEMO_ROOFING_CO_BUSINESS_ID})`);
  console.log(`Calls to insert: ${CALLS.length}`);
  console.log('By classification:', byClassification);
  console.log(`Total duration: ${totalDurationMin} min`);
  console.log('');
  for (const c of CALLS) {
    const time = new Date(c.created_at).toLocaleString('en-US', { timeZone: 'America/Regina', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    console.log(`  [${time}] ${c.caller_name.padEnd(20)} ${c.caller_number}  ${c.classification ?? '(none)'}${c.classification === 'other' && c.classification_confidence < 0.7 ? ' → needs review' : ''}  stage=${c.pipeline_stage ?? '—'}`);
  }
}

async function main() {
  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', DEMO_ROOFING_CO_BUSINESS_ID)
    .maybeSingle();

  if (bizErr) {
    console.error('Failed to look up business:', bizErr);
    process.exit(1);
  }
  if (!business || business.name !== EXPECTED_BUSINESS_NAME) {
    console.error(`Safety check failed: business_id ${DEMO_ROOFING_CO_BUSINESS_ID} did not resolve to "${EXPECTED_BUSINESS_NAME}" (got ${JSON.stringify(business)}). Refusing to touch this data.`);
    process.exit(1);
  }

  summarizePlan();

  if (!APPLY) {
    console.log('\nDry run only — no changes made. Re-run with --apply to clear old demo calls and insert the above.');
    return;
  }

  console.log(`\nClearing existing calls for ${EXPECTED_BUSINESS_NAME}...`);
  const { error: deleteErr, count } = await supabase
    .from('calls')
    .delete({ count: 'exact' })
    .eq('business_id', DEMO_ROOFING_CO_BUSINESS_ID);
  if (deleteErr) {
    console.error('Delete failed:', deleteErr);
    process.exit(1);
  }
  console.log(`Deleted ${count ?? '?'} existing call(s).`);

  const rows = CALLS.map(({ seed_tag, ...c }) => ({
    ...c,
    business_id: DEMO_ROOFING_CO_BUSINESS_ID,
    call_sid: seed_tag,
    channel: 'phone',
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('calls')
    .insert(rows)
    .select('id, caller_name');
  if (insertErr) {
    console.error('Insert failed:', insertErr);
    process.exit(1);
  }
  console.log(`Inserted ${inserted.length} call(s).`);
}

main();
