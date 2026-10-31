// Single source of truth for the Setera cold call script, shared across the
// Setter, Rep, and Admin (High Table) portals. Each portal renders this data
// with its own JSX/styling — only the content lives here.

export interface ColdCallStep {
  phase: string;
  title: string;
  script: string;
  note: string;
  // Only populated on the Overflow Network pivot step — the language rules
  // are compliance-sensitive (never name a company, never promise volume),
  // so portals should render these as a distinct callout rather than folding
  // them into `note`.
  guardrails?: {
    doSay: string[];
    neverSay: string[];
    proofPoint: string;
  };
}

export const COLD_CALL_OVERVIEW = {
  goal: 'The goal of the cold call is not to explain every feature of Setera or close the entire deal on the phone. The goal is to create enough interest to book the demo. There are two reasons a contractor may want to see Setera: they have an incoming-call problem (Emily), or their phones are already handled and they might be a fit for the Setera Overflow Network. Either road can lead to the demo.',
  twoRoads: [
    { label: 'Phone Problem', steps: ['Explore missed calls', 'Establish what those opportunities could be worth', 'Introduce Emily', 'Book demo'] },
    { label: 'Phones Already Handled', steps: ['Agree with them', 'Introduce Overflow Network', 'Explain why they need to see how Setera captures opportunities', 'Book demo'] },
  ],
  twoRoadsNote: 'Sometimes both apply. A contractor might come to the demo because they want Overflow and realize they want Emily answering their calls too — or come for Emily and realize Setera could do something with the opportunities they can’t take. That’s why we show the whole ecosystem.',
  coreMessage: 'Setera isn’t valuable because an AI answers the phone. The phone call is where the opportunity enters the system. We capture it. We figure out what the caller actually needs. We filter the noise. We make sure the opportunity doesn’t disappear simply because someone was on a ladder, in a basement, driving, quoting a job, dealing with a customer, or couldn’t answer their phone at that exact moment. And when one of our clients legitimately can’t take an opportunity, the Overflow Network gives us another potential path for that opportunity instead of simply letting it die.',
  reminders: [
    'Don’t pitch for five straight minutes.',
    'Don’t dump features.',
    'Don’t manufacture pain.',
    'Don’t promise Overflow jobs.',
    'Don’t argue when someone says their current system works.',
    'Don’t name any client or company tied to Overflow, ever — ours or theirs.',
    'Ask questions. Use their business, their missed-call estimate, their average job profit — let them realize what those calls may be worth. Then show them Setera.',
  ],
};

export const COLD_CALL_STEPS: ColdCallStep[] = [
  {
    phase: 'Step 1',
    title: 'The Opener',
    script: ['"Hey, is this [Name]?"', '"Hey [Name], it\'s [Your Name] from Setera. Quick question for you — when you guys are on a job and the phone rings, who normally answers it?"'].join(' '),
    note: 'Then stop talking. Let them answer — that question tells you which road to take.',
  },
  {
    phase: 'Step 2',
    title: 'Diagnose Who Answers',
    script: '"Okay, that\'s actually why I called. What happens when you\'re in the middle of something and can\'t grab it?"',
    note: 'Follow naturally — don’t interrogate, have a conversation: "Does it usually go to voicemail?" "Do people actually leave messages?" "How often would you say you miss a call on an average day?" If someone else answers instead (wife, office manager, receptionist): "Gotcha. Are they covering the phones the entire day, or are there still times when nobody’s available?" If there are gaps, ask the same questions above — you’re looking for the gap. If they say the phones are fully covered (including "I have a receptionist") — don’t argue or try to manufacture a gap that isn’t there. Move straight to Step 6, the Overflow Network pivot.',
  },
  {
    phase: 'Step 3',
    title: 'If They Use Voicemail',
    script: '"That\'s actually something we talk about a lot. A lot of people calling contractors aren\'t going to keep leaving voicemails and waiting around. If they need somebody and nobody answers, they can just move down the list and call another company."',
    note: 'Then ask: "Have you ever actually worked out what a missed call could potentially be worth to you?" This leads straight into the missed-call math in Step 4.',
  },
  {
    phase: 'Step 4',
    title: 'The Missed-Call Value Conversation',
    script: ['"Let\'s say you only miss three calls a day. Nothing crazy."', '"You guys work about six days a week?"', '"Okay. Give that enough time — say 90 days — and three missed calls a day, six days a week, adds up to around 231 missed calls."'].join(' '),
    note: 'Do not throw a giant revenue claim at them — use their numbers. Immediately qualify it: "Obviously I’m not saying every one of those is a job. Some are junk calls, existing customers, sales calls, wrong numbers — whatever. But even if only 10% of those missed calls represented real jobs you could have taken, now we’re talking about roughly 23 jobs." Then ask: "What would you say you actually make on an average job after your costs? Not the total invoice — roughly what’s left for you?" Let them give the number. If they say $3,000: "So even using only 10%, that’s roughly $69,000 in potential profit represented by those jobs." Pause — let it land. "And that’s using three missed calls a day and only assuming 10% turn into jobs." If appropriate: "At 15%, the same example is around 35 jobs. At 20%, it’s around 46." (At $3,000 avg profit: 10% ≈ $69,000, 15% ≈ $104,000, 20% ≈ $139,000.) These are illustrative examples based on assumptions, NOT promises of what Setera will make them — always work off the prospect’s own missed-call estimate and real average job profit, never recite the figures above as a script. The point: a missed call isn’t just a missed phone call — there could be an opportunity sitting on the other end of it.',
  },
  {
    phase: 'Step 5',
    title: 'Transition Into Setera',
    script: '"That\'s really why we built Setera. It\'s not just about having something answer the phone. It\'s about making sure the opportunity on the other end actually gets captured. Emily can answer the call, figure out what the person actually needs, filter out the junk, capture the information and then book or route things based on how your business actually operates."',
    note: 'Don’t spend ten minutes explaining Emily — show her. "I could explain this all day, but honestly it makes way more sense when you actually see Emily handle a call live." Move toward booking the demo in Step 7.',
  },
  {
    phase: 'Step 6',
    title: 'If Phones Are Already Handled → Overflow Network',
    script: ['"Okay, sounds like you guys actually have the phones handled pretty well. The other reason I called is we\'re building out our Setera Overflow Network."', '"When one of our clients gets an opportunity they can\'t take — maybe they\'re already booked, it\'s outside their service area, they don\'t do that particular type of work, or it\'s simply a job they don\'t want — instead of just letting that opportunity die, we can potentially route it to another reputable contractor."', '"We don\'t just throw random companies onto that network though. We want companies to go through a Setera demo first because I want you to actually see where these opportunities come from, how Setera captures them, what information we collect, and why this is different from somebody selling you a name and phone number off the internet."', '"Would you be open to taking 20 minutes to see how the whole thing works? Does tonight work for you, or would tomorrow be better — morning or afternoon?"'].join(' '),
    note: 'This is NOT a dead end. Do not argue with them or try to convince someone with good phone coverage that they secretly have a problem — agree with them, then pivot. If asked "how many leads would I actually get," the honest answer is that it’s subjective — it depends on their industry, city, region, and service area. Frame it as potential, never a number. Until the full Overflow system is finished and operating, never promise inventory or volume.',
    guardrails: {
      doSay: [
        'We’re building out the network.',
        'We’re looking for reputable contractors in the area.',
        'You could potentially receive opportunities.',
        'We vet companies before bringing them into the network.',
        'These are opportunities our clients aren’t able to take.',
        'You’ll see how these opportunities are actually captured during the demo.',
        'It really depends on your industry, city, and service area — but the potential is there.',
      ],
      neverSay: [
        'We’ll send you jobs.',
        'You’re guaranteed leads.',
        'We’ll make you X amount.',
        'We have X number of jobs waiting for you.',
        'We guarantee you’ll get work.',
        'Any company name — ours or theirs — tied to Overflow participation. Never confirm or name which companies are in the network. If another company wants to disclose their own participation, that’s their call to make — we don’t do it for them.',
      ],
      proofPoint: 'You can use a real, anonymized proof point to illustrate potential without naming anyone: "We had a small roofing company we work with pull in 62 real high-intent leads over about a two-and-a-half-month span — more than a small crew could realistically handle on their own. That’s part of why we’re building Overflow." Never name the client — keep it generic ("a small roofing company we work with"), never a company name.',
    },
  },
  {
    phase: 'Step 7',
    title: 'The Booking Ask',
    script: '"Does tonight work for you, or would tomorrow be better? If tomorrow, does morning or afternoon work best?"',
    note: 'Same-day, next-day, or up to two days out max — never further out than that. If tomorrow, always narrow it to morning or afternoon — never leave it open ended. (The Overflow road’s ask — in Step 6 — uses this same same-day/next-day, morning-or-afternoon framing.) The cold call has one destination: book the demo.',
  },
];

export const COLD_CALL_OBJECTIONS = [
  { obj: ['"I\'m not interested"'].join(''), resp: ['"That\'s fair — most guys say that before I even get to what it is. I haven\'t actually told you yet. It\'s not what you\'re thinking — give me 30 seconds?"'].join('') },
  { obj: '"What are you selling?"', resp: 'Fair question. We built Setera for contractors. It handles incoming calls, figures out what the person actually needs, filters out the junk, captures real opportunities and can book or route them based on how the company operates. We’re also building an Overflow Network around those opportunities for situations where one of our clients can’t take the job. But I’m not trying to sell you the whole thing on a cold call. I’m really trying to figure out whether either side of this would even make sense for your business. Then get them talking again: "How are you guys handling incoming calls right now?"' },
  { obj: '"We don\'t miss calls"', resp: 'Perfect. Then honestly, Emily might not be the interesting part for you right now. Pause. The Overflow side might be. Then transition into the Overflow Network explanation. Don’t fight them — we do NOT need to manufacture pain that isn’t there.' },
  { obj: '"We\'re too busy already"', resp: 'That’s interesting because being booked up is actually one of the reasons we’re building the Overflow Network. If one of our clients is slammed and another legitimate opportunity comes in that they simply can’t take, we’d rather have a reputable company we can potentially send it to than let that opportunity disappear. That’s part of why we’re talking to contractors now. Move toward the demo.' },
  { obj: '"Just send me information"', resp: 'Absolutely, I can send you the website. The only problem is it’s hard to understand what makes this different just from reading about it. The live call is really the part that clicks for people. Why don’t we find 20 minutes, I’ll show you the call itself, show you what information gets captured, and then you can decide whether it’s even worth another conversation.' },
  { obj: '"How much does it cost?"', resp: 'We have different tiers depending on what the business actually needs. I’m happy to go through pricing with you. I’d rather show you what the system actually does first so the numbers have some context. Don’t hide pricing, but don’t turn the cold call into a pricing presentation either — move toward the demo.' },
  { obj: ['"I need to think about it"'].join(''), resp: ['"Totally — what specifically are you thinking through? Maybe I can help right now."'].join('') },
];

export const COLD_CALL_VOICEMAIL_SCRIPT = {
  script: "\"Hey [Name] — it's [Your name], I work with [trade] contractors specifically. Had a quick question about how you handle missed calls on site. I'll try you again — talk soon.\"",
  note: "No number. No company name. Just enough curiosity that if they're in pain they'll pick up next time or call back.",
};
