// Trade landing pages (/roofers, /plumbers, /hvac, /electricians).
// Same structure, different substance: every field below is written for
// that trade's real call patterns. Emily capability claims must stay within
// the approved list in lib/site-content.ts (answers 24/7, captures name /
// need / urgency, pipeline, urgent routing, transcripts + summaries,
// appointments on your terms). No guaranteed results, no stats.
import { EMERGENCY_ESCALATION, SAFETY_CHECK_QUESTION, SAFETY_NOTE, SHUTOFF_HELP, type Faq } from './site-content';

export type TradeSlug = 'roofers' | 'plumbers' | 'hvac' | 'electricians';

export type Trade = {
  slug: TradeSlug;
  label: string; // "Roofing"
  audience: string; // "roofers"
  keyword: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string; // first paragraph, contains the keyword
  pains: { title: string; body: string }[];
  sample: {
    business: string;
    time: string;
    lines: { who: 'Emily' | 'Caller'; text: string }[];
    captured: { label: string; value: string }[];
    entryTitle: string;
    entryNote: string;
    escalation?: string[];
    next: string;
  };
  /** Optional: show the emergency-escalation note + FAQ on this page. */
  emergency?: { note: string };
  urgent: string[];
  routine: string[];
  season: { eyebrow: string; heading: string; paragraphs: string[] };
  leaks: { top: string; bottom: string };
  seoAngle: string;
  faq: Faq[];
};

export const TRADES: Record<TradeSlug, Trade> = {
  roofers: {
    slug: 'roofers',
    label: 'Roofing',
    audience: 'roofers',
    keyword: 'AI phone answering for roofers',
    metaTitle: 'AI Phone Answering for Roofers in Canada | Setera',
    metaDescription:
      'AI phone answering for roofers across Canada. Emily answers every call while you’re on a roof, captures storm leads and routes active leaks to you.',
    h1: 'AI phone answering for roofers who can’t pick up on a roof.',
    intro:
      'Setera gives roofers across Canada AI phone answering that works while you’re on a roof. Emily answers every call, 24/7, captures who’s calling, what the damage is and how urgent it is, and puts it straight into your pipeline. When a storm rolls through and the phone won’t stop, every caller still gets an answer.',
    pains: [
      {
        title: 'You can’t answer from a roof.',
        body: 'Tear-offs, steep pitches, a harness and a nail gun in your hand. Pulling out a phone isn’t safe, and by the time you’re back on the ground the caller has already moved on to the next roofer on Google.',
      },
      {
        title: 'Storms bring a week of calls in a weekend.',
        body: 'A hailstorm in Calgary or a windstorm on the coast can turn a quiet week into more calls than you can return. Homeowners call several roofers at once, and the first one to answer usually gets the inspection.',
      },
      {
        title: 'Quotes go cold.',
        body: 'A roof is a big decision. Homeowners collect two or three quotes and take their time. The roofer who stays in touch tends to win; the one who sent a quote and waited often doesn’t hear back.',
      },
    ],
    sample: {
      business: 'Ridgeline Roofing',
      time: '9:04 PM',
      lines: [
        { who: 'Emily', text: 'Thanks for calling Ridgeline Roofing, this is Emily. How can I help?' },
        { who: 'Caller', text: 'Hi, the hail last night cracked a skylight and there’s water dripping into the upstairs hallway.' },
        { who: 'Emily', text: 'That sounds stressful. Is it still dripping right now, or did it stop with the rain?' },
        { who: 'Caller', text: 'It’s still dripping. I’ve got a bucket under it.' },
      ],
      captured: [
        { label: 'Caller', value: 'Lauren K.' },
        { label: 'Need', value: 'Hail damage, cracked skylight, leak upstairs' },
        { label: 'Urgency', value: 'Active leak: flagged urgent' },
      ],
      entryTitle: 'Lauren K. · hail damage + active leak',
      entryNote: 'Transcript and summary attached. Routed to you as urgent.',
      next: 'Next: call back, book the inspection, move to Estimate Booked.',
    },
    urgent: [
      'Water actively coming in through the roof or ceiling',
      'Storm damage that’s left an opening in the roof',
      'A tree or large branch down on the roof',
      'Anything else you tell us counts as urgent for your business',
    ],
    routine: [
      'Full re-roof estimates',
      'Inspections before a home sale',
      'Eavestrough, flashing and small repair quotes',
      'Homeowners you’ve already quoted calling back with questions',
    ],
    season: {
      eyebrow: 'Storm season',
      heading: 'Storm season doesn’t wait for you to get off the roof.',
      paragraphs: [
        'Roofing demand doesn’t arrive evenly. Alberta’s hail season, windstorms on the BC coast and in the Maritimes, and the spring rush after a heavy snow load all come in bursts, and the calls bunch up exactly when your crews are busiest.',
        'Emily answers every one of those calls the same way at 2 PM on a Tuesday as at 9 PM on a long weekend. Active leaks get routed to you as urgent. Everyone else goes straight into your pipeline with the damage described, so you can decide who to call back first instead of digging through voicemail.',
        'When the storm passes, you have a list instead of a guess: every homeowner who called, what they need and how urgent it was.',
      ],
    },
    leaks: {
      top: 'Every unanswered call during a storm is an inspection another roofer does.',
      bottom: 'Roofing quotes are big decisions. If nobody follows up, the homeowner signs with whoever did.',
    },
    seoAngle: 'After a storm, homeowners search for a roofer nearby and call whoever shows up first with good reviews.',
    faq: [
      {
        q: 'Can Emily keep up with storm-season call volume?',
        a: 'Emily answers every call, 24/7, so a surge after a storm doesn’t send homeowners to voicemail. Each caller’s name, what they need and how urgent it is goes straight into your pipeline.',
      },
      {
        q: 'What counts as an urgent roofing call?',
        a: 'You decide. Most roofers treat active leaks and storm openings as urgent. Emily captures how urgent each call is, and urgent calls get routed to you right away.',
      },
      {
        q: 'Can Emily book roof inspections?',
        a: 'Emily can set appointments on your terms, so inspection requests can be booked without you coming down off the roof.',
      },
      {
        q: 'Does this make sense for a one-truck roofing company?',
        a: 'Yes. Setera is built for owner-operators. If you’re the one on the roof and the one answering the phone, Emily covers the phone so you can stay on the roof.',
      },
    ],
  },

  plumbers: {
    slug: 'plumbers',
    label: 'Plumbing',
    audience: 'plumbers',
    keyword: 'plumber AI receptionist',
    metaTitle: 'Plumber AI Receptionist for After-Hours Calls | Setera',
    metaDescription:
      'A plumber AI receptionist for plumbing businesses across Canada. Emily answers every after-hours call, captures the emergency and routes it to you.',
    h1: 'A plumber AI receptionist for the calls that come at midnight.',
    intro:
      `Setera is a plumber AI receptionist built for plumbing businesses across Canada. Emily answers every call, 24/7, captures who’s calling, what’s wrong and how urgent it is, and urgent calls get routed to you right away. If you turn on emergency escalation, she can also ${SHUTOFF_HELP} and reach your on-call plumber. The burst pipe at 11 PM gets a real answer instead of your voicemail.`,
    pains: [
      {
        title: 'Emergencies don’t keep business hours.',
        body: 'Burst pipes, sewer backups and leaking water heaters happen at night, on weekends and on holidays. A homeowner with water on the floor isn’t leaving a message; they’re calling the next plumber.',
      },
      {
        title: 'You’re under a sink when the phone rings.',
        body: 'Hands wet, head in a cabinet, torch lit. Answering means stopping the job you’re being paid for. Not answering can mean losing the one you aren’t.',
      },
      {
        title: 'A drip and a flood look the same on a missed-call alert.',
        body: 'A dripping tap at 10 PM and a flooded basement at 10 PM show up as the same missed call. Without knowing which is which, you either get up for everything or risk sleeping through the one that matters.',
      },
    ],
    sample: {
      business: 'Northshore Plumbing',
      time: '11:08 PM',
      lines: [
        { who: 'Emily', text: 'Thanks for calling Northshore Plumbing, this is Emily. What’s going on?' },
        { who: 'Caller', text: 'There’s water spraying from a pipe in our basement. It’s all over the floor.' },
        { who: 'Emily', text: `Okay, I’m going to help. First: ${SAFETY_CHECK_QUESTION}` },
        { who: 'Caller', text: 'No, everyone’s fine. It’s in the laundry corner. The panel is upstairs.' },
        { who: 'Emily', text: 'Good. Can you get to your main water shut-off without walking through any water?' },
        { who: 'Caller', text: 'Yes, it’s by the stairs and it’s dry there.' },
        { who: 'Emily', text: 'Then I’ll talk you through turning it off. Stay out of the water.' },
        { who: 'Caller', text: 'Okay, it’s off.' },
        { who: 'Emily', text: 'Thank you. I’m reaching our on-call plumber for you now. Please stay on the line.' },
      ],
      captured: [
        { label: 'Caller', value: 'Sam D.' },
        { label: 'Need', value: 'Burst pipe in basement, water spraying' },
        { label: 'Safety check', value: 'No one hurt, no water near electrical' },
        { label: 'Urgency', value: 'Active flooding: flagged urgent' },
      ],
      entryTitle: 'Sam D. · burst pipe, active flooding',
      entryNote: 'Full transcript and summary attached. Safety check clear; caller closed the main shut-off from a dry spot.',
      escalation: [
        'Called and texted the on-call plumber at 11:08 PM',
        'Stayed on the line until they picked up, then hung up',
        'Call recorded and logged',
      ],
      next: 'Connected to on-call. Next: book the repair.',
    },
    emergency: {
      note: `${EMERGENCY_ESCALATION.summary} It’s optional for each business and only active if you turn it on.`,
    },
    urgent: [
      'Burst or leaking pipes with water actively flowing',
      'Sewer or drain backups into the home',
      'No water to the house at all',
      'A water heater leaking onto the floor',
      'Anything else you tell us counts as urgent for your business',
    ],
    routine: [
      'Water heater replacement quotes',
      'Fixture installs and bathroom or kitchen renos',
      'Slow drains and dripping taps',
      'Booking a regular service visit',
    ],
    season: {
      eyebrow: 'Winter and thaw',
      heading: 'In Canada, winter is plumbing emergency season.',
      paragraphs: [
        'Frozen and burst pipes when the temperature drops across Manitoba, Saskatchewan and the rest of the Prairies. Basements flooding in the spring thaw in Ontario and Quebec. Long weekends when other shops have their phones off. The busiest nights for emergencies are the ones you least want to be answering the phone.',
        `Emily answers those calls with real emotion behind every word, which matters when someone is standing in an inch of water. She captures what’s happening and how urgent it is, and urgent calls get routed to you right away. If you’ve turned on emergency escalation, she can ${SHUTOFF_HELP} and call and text your on-call plumber until they pick up. Routine calls wait in your pipeline, with a transcript and summary, until the morning.`,
        'You choose which calls get you out of bed, and you know exactly why before you call back.',
      ],
    },
    leaks: {
      top: 'An emergency caller who reaches voicemail usually calls the next plumber within minutes.',
      bottom: 'That same homeowner may need a new water heater or a bathroom reno later. If nobody follows up, the bigger job goes elsewhere too.',
    },
    seoAngle: 'When a pipe bursts, homeowners search for an emergency plumber nearby and call the first number that looks trustworthy.',
    faq: [
      {
        q: 'Does Emily answer after-hours plumbing calls?',
        a: 'Yes. Emily answers every call, 24/7, including nights, weekends and holidays. Urgent calls get routed to you right away, and everything else goes into your pipeline with a transcript and summary.',
      },
      {
        q: 'How does Emily tell an emergency from a routine call?',
        a: 'Emily captures how urgent each call is from what the caller tells her, based on what you’ve said counts as urgent for your business. A dripping tap and a flooded basement don’t get treated the same way.',
      },
      {
        q: 'Can Emily book service appointments?',
        a: 'Emily can set appointments on your terms, so routine work like a water heater quote or a slow drain can be booked without you picking up the phone.',
      },
      {
        q: 'Is Setera only for big plumbing companies?',
        a: 'No. It’s built for owner-operators and small crews, the shops where the person fixing the pipe is often the person who’d otherwise answer the phone.',
      },
    ],
  },

  hvac: {
    slug: 'hvac',
    label: 'HVAC',
    audience: 'HVAC companies',
    keyword: 'HVAC answering service',
    metaTitle: 'HVAC Answering Service with AI, 24/7 | Setera',
    metaDescription:
      'An AI HVAC answering service for heating and cooling companies across Canada. Emily answers every call, 24/7, and routes no-heat calls to you.',
    h1: 'An HVAC answering service built for the first cold snap.',
    intro:
      'Setera is an AI HVAC answering service for heating and cooling companies across Canada. Emily answers every call, 24/7, captures who’s calling, what’s wrong and how urgent it is, and no-heat or no-cool emergencies get routed to you right away. Tune-ups and quotes go straight into your pipeline or get booked on your terms.',
    pains: [
      {
        title: 'Demand arrives all at once.',
        body: 'The first truly cold night of fall and the first heat wave of summer bring a wave of calls within days. Your schedule is full, your techs are out, and the phone keeps ringing.',
      },
      {
        title: 'No heat isn’t a call-back-tomorrow problem.',
        body: 'A family with no heat in January or an older homeowner with no cooling in a heat wave needs a fast answer. Voicemail tells them to try someone else.',
      },
      {
        title: 'Maintenance and quotes get buried.',
        body: 'Tune-ups, heat pump quotes and replacement estimates are steady, valuable work, but they get lost under the emergencies when everyone is stretched.',
      },
    ],
    sample: {
      business: 'True North Heating & Cooling',
      time: '7:12 AM',
      lines: [
        { who: 'Emily', text: 'Thanks for calling True North Heating and Cooling, this is Emily. How can I help?' },
        { who: 'Caller', text: 'Our furnace stopped working overnight and the house is down to fourteen degrees. We have a baby at home.' },
        { who: 'Emily', text: 'I’m sorry, that’s a hard morning. Is the furnace making any sound at all, or is it completely off?' },
        { who: 'Caller', text: 'Completely off. The thermostat says it’s calling for heat.' },
      ],
      captured: [
        { label: 'Caller', value: 'Mei W.' },
        { label: 'Need', value: 'Furnace not running, house at 14°C' },
        { label: 'Urgency', value: 'No heat, infant at home: flagged urgent' },
      ],
      entryTitle: 'Mei W. · no heat, infant at home',
      entryNote: 'Transcript and summary attached. Routed to you as urgent at 7:12 AM.',
      next: 'Next: call back and schedule the visit.',
    },
    urgent: [
      'No heat in cold weather',
      'No cooling in extreme heat, especially with vulnerable people at home',
      'Burning smells or alarming noises from equipment',
      'Anything else you tell us counts as urgent for your business',
    ],
    routine: [
      'Furnace and AC tune-ups',
      'Heat pump and replacement quotes',
      'Thermostat and filter questions',
      'Seasonal maintenance bookings',
    ],
    season: {
      eyebrow: 'Two peak seasons',
      heading: 'Two peak seasons a year, and both arrive overnight.',
      paragraphs: [
        'Canadian HVAC runs on extremes: deep cold across the Prairies and Ontario in winter, and summer heat waves that now reach as far as the BC coast. The shoulder seasons bring the maintenance and heat pump quotes that keep your techs busy in between.',
        'Emily answers every call through all of it, 24/7. She captures how urgent each call is, so a no-heat call at 7 AM gets routed to you right away while a tune-up request gets booked on your terms.',
        'When the peak passes, the quotes and maintenance calls you couldn’t get to are already waiting in your pipeline.',
      ],
    },
    leaks: {
      top: 'During a cold snap, a homeowner who can’t get through calls the next HVAC company on the list.',
      bottom: 'A no-heat call can turn into a furnace replacement or a heat pump install. Without follow-up, that quote goes to whoever called back.',
    },
    seoAngle: 'When the furnace quits, homeowners search for furnace repair nearby and call the first company with solid reviews.',
    faq: [
      {
        q: 'How is Emily different from a traditional HVAC answering service?',
        a: 'Emily answers every call, 24/7, like an answering service. She also captures the caller’s name, what they need and how urgent it is, and puts it straight into your pipeline with a transcript and summary, so nothing sits on a message pad.',
      },
      {
        q: 'How are no-heat and no-cool calls handled?',
        a: 'You decide what counts as urgent. When a caller has no heat in the cold or no cooling in the heat, Emily captures that it’s urgent and the call gets routed to you right away.',
      },
      {
        q: 'Can Emily book tune-ups and maintenance?',
        a: 'Emily can set appointments on your terms, so seasonal maintenance can be booked without anyone on your team picking up the phone.',
      },
      {
        q: 'What about heat pump and replacement quotes?',
        a: 'Every quote request goes straight into your pipeline with the caller’s name, what they need and how urgent it is, so you can follow up when you’re ready.',
      },
    ],
  },

  electricians: {
    slug: 'electricians',
    label: 'Electrical',
    audience: 'electricians',
    keyword: 'AI receptionist for electricians',
    metaTitle: 'AI Receptionist for Electricians in Canada | Setera',
    metaDescription:
      'An AI receptionist for electricians across Canada. Emily answers every call, flags urgent problems and puts panel and EV charger quotes in your pipeline.',
    h1: 'An AI receptionist for electricians, for urgent calls and scheduled work.',
    intro:
      'Setera gives electricians across Canada an AI receptionist that answers every call, 24/7. Emily captures who’s calling, what they need and how urgent it is, so a possible hazard gets routed to you right away while panel upgrades, EV chargers and reno work go straight into your pipeline.',
    pains: [
      {
        title: 'Two very different kinds of call.',
        body: 'Electrical calls split into urgent problems (a burning smell, sparking, a dead circuit in winter) and scheduled projects (panel upgrades, EV chargers, renos). They need completely different responses, and they all ring the same phone.',
      },
      {
        title: 'You’re mid rough-in with your hands full.',
        body: 'On a ladder, in a ceiling or in a panel, you can’t stop for every call. Each missed one is either someone who needed help fast or a project quote that went to another electrician.',
      },
      {
        title: 'A voicemail doesn’t tell you much.',
        body: '“Call me back about a charger” could be a quick install or a service upgrade. Without knowing what the caller actually needs, every callback starts from scratch.',
      },
    ],
    sample: {
      business: 'Bright Line Electric',
      time: '2:37 PM',
      lines: [
        { who: 'Emily', text: 'Thanks for calling Bright Line Electric, this is Emily. How can I help?' },
        { who: 'Caller', text: 'Hi, we’re getting an EV next month and need a charger put in the garage. Can someone give me a quote?' },
        { who: 'Emily', text: 'Congratulations on the new car. Is the garage attached to the house?' },
        { who: 'Caller', text: 'Yes, it’s attached.' },
      ],
      captured: [
        { label: 'Caller', value: 'Andre B.' },
        { label: 'Need', value: 'Level 2 EV charger install, attached garage' },
        { label: 'Urgency', value: 'Scheduled project: not urgent' },
      ],
      entryTitle: 'Andre B. · EV charger quote',
      entryNote: 'Transcript and summary attached.',
      next: 'Next: call back to quote, move to Estimate Booked.',
    },
    urgent: [
      'A burning smell or scorch marks near outlets or the panel',
      'Sparking, buzzing or a breaker that won’t stay on',
      'Loss of power to part of the home, especially in winter',
      'Anything else you tell us counts as urgent for your business',
    ],
    routine: [
      'Panel upgrades',
      'EV charger installs',
      'Renovation and basement wiring',
      'Pot lights, fixtures and added outlets',
    ],
    season: {
      eyebrow: 'Projects and emergencies',
      heading: 'Steady project work, sudden emergencies.',
      paragraphs: [
        'Electrical demand in Canada is driven by projects: EV chargers as more drivers switch, panel upgrades to make room for heat pumps and new appliances, and renovation wiring through the building season. Emergencies come without warning, from ice-storm damage in Ontario and Quebec to a breaker that trips every time the heat comes on.',
        'Emily answers every call, 24/7, and captures how urgent each one is. Possible hazards are flagged urgent and routed to you right away. Project calls go straight into your pipeline with a transcript and summary, so you can quote them once you’re off the tools.',
        'You stop choosing between finishing the job in front of you and answering the next one.',
      ],
    },
    leaks: {
      top: 'A missed EV charger or panel quote rarely calls back. They call the next electrician.',
      bottom: 'Project quotes are where the bigger jobs are. If quotes aren’t followed up, they don’t turn into work.',
    },
    seoAngle: 'Homeowners planning a panel upgrade or an EV charger search for an electrician nearby and compare reviews before they call.',
    faq: [
      {
        q: 'How does Emily handle a possible electrical hazard?',
        a: `You decide what counts as urgent. When a caller describes something like a burning smell or sparking, Emily captures that it’s urgent and the call gets routed to you right away. ${SAFETY_NOTE}`,
      },
      {
        q: 'Can Emily take EV charger and panel upgrade inquiries?',
        a: 'Yes. She captures the caller’s name, what they need and how urgent it is, and puts each inquiry straight into your pipeline with a transcript and summary.',
      },
      {
        q: 'Can Emily book estimates?',
        a: 'Emily can set appointments on your terms, so estimate visits for scheduled work can be booked without you stopping what you’re doing.',
      },
      {
        q: 'I’m a one-person shop. Does this make sense for me?',
        a: 'Setera is built for owner-operators. If you’re the electrician and the receptionist, Emily takes the phone so you can stay on the job.',
      },
    ],
  },
};

export const TRADE_LIST: Trade[] = [TRADES.roofers, TRADES.plumbers, TRADES.hvac, TRADES.electricians];
