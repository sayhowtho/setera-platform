// Province for a prospect, from what we're given or from its city.
//
// Province used to default to 'SK' everywhere, so prospects from across
// Canada were filed under SK (fixed 2026-10-01, migrations/024). The rule
// now: a valid province someone gives us wins; otherwise infer it from the
// city; if that isn't certain, leave it blank rather than guess.
//
// "Certain" means the city is on the list below and, for names that exist in
// more than one province (Victoria, London, Windsor...), the phone's area
// code agrees. An area code that points somewhere else also blocks a guess
// (a Calgary company with a 519 number stays blank for a human to check).

export const PROVINCE_CODES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;
export type ProvinceCode = typeof PROVINCE_CODES[number];

const PROVINCE_NAMES: Record<string, ProvinceCode> = {
  'alberta': 'AB', 'british columbia': 'BC', 'b.c.': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB',
  'newfoundland': 'NL', 'newfoundland and labrador': 'NL', 'labrador': 'NL', 'nova scotia': 'NS',
  'northwest territories': 'NT', 'nunavut': 'NU', 'ontario': 'ON', 'prince edward island': 'PE', 'pei': 'PE',
  'quebec': 'QC', 'québec': 'QC', 'saskatchewan': 'SK', 'yukon': 'YT',
};

const CITIES: Record<ProvinceCode, string[]> = {
  AB: ['calgary', 'edmonton', 'red deer', 'red deer county', 'airdrie', 'sherwood park', 'grande prairie', 'medicine hat', 'lethbridge', 'canmore', 'cochrane', 'st. albert', 'st albert', 'olds', 'two hills', 'diamond valley', 'fort mcmurray', 'spruce grove', 'leduc', 'okotoks', 'chestermere', 'strathmore', 'camrose', 'brooks', 'cold lake', 'banff', 'high river', 'beaumont', 'stony plain', 'sylvan lake'],
  BC: ['vancouver', 'north vancouver', 'west vancouver', 'metro vancouver', 'lower mainland', 'bc lower mainland', 'fraser valley', 'victoria', 'surrey', 'kelowna', 'west kelowna', 'kamloops', 'nanaimo', 'abbotsford', 'delta', 'chilliwack', 'white rock', 'maple ridge', 'pitt meadows', 'vernon', 'sidney', 'langley', 'burnaby', 'coquitlam', 'port coquitlam', 'port moody', 'new westminster', 'richmond', 'prince george', 'quesnel', 'armstrong', 'enderby', 'bonnington', 'courtenay', 'comox', 'campbell river', 'tobiano', 'fort st. john', 'fort st john', 'port hardy', 'squamish', 'whistler', 'brentwood bay', 'duncan', 'vancouver island', 'penticton', 'salmon arm', 'cranbrook', 'nelson', 'mission', 'parksville', 'saanich', 'langford', 'terrace', 'williams lake', 'dawson creek', 'kitimat', 'prince rupert'],
  MB: ['winnipeg', 'brandon', 'steinbach', 'morden', 'winkler', 'niverville', 'east st. paul', 'west st. paul', 'st. françois xavier', 'selkirk', 'portage la prairie', 'thompson', 'dauphin', 'oakbank', 'stonewall'],
  NB: ['moncton', 'greater moncton', 'saint john', 'fredericton', 'dieppe', 'riverview', 'campbellton', 'hanwell', 'quispamsis', 'rothesay', 'napan', 'miramichi', 'bathurst', 'edmundston', 'shediac', 'sussex', 'oromocto'],
  NL: ["st. john's", "st john's", 'mount pearl', 'corner brook', 'gander', 'paradise', 'conception bay south', 'grand falls-windsor', 'happy valley-goose bay'],
  NS: ['halifax', 'dartmouth', 'bedford', 'sackville', 'lower sackville', 'lunenburg', 'lunenburg county', 'hacketts cove', 'lewis lake', 'hubley', 'petite rivière', 'truro', 'new glasgow', 'kentville', 'wolfville', 'bridgewater', 'antigonish', 'sydney', 'cape breton', 'amherst', 'yarmouth', 'timberlea', 'fall river'],
  NT: ['yellowknife', 'hay river', 'inuvik'],
  NU: ['iqaluit', 'rankin inlet'],
  ON: ['toronto', 'gta', 'greater toronto area', 'ottawa', 'mississauga', 'brampton', 'oakville', 'london', 'barrie', 'cambridge', 'windsor', 'ajax', 'pickering', 'oshawa', 'scarborough', 'etobicoke', 'north york', 'fergus', 'guelph', 'burlington', 'hamilton', 'stoney creek', 'vaughan', 'concord', 'woodbridge', 'maple', 'richmond hill', 'markham', 'newmarket', 'aurora', 'port perry', 'durham region', 'york region', 'kitchener', 'waterloo', 'whitby', 'thunder bay', 'brantford', 'aylmer', 'georgetown', 'kingston', 'napanee', 'essex', 'owen sound', 'allenford', 'chatsworth', 'tara', 'embrun', 'niagara-on-the-lake', 'niagara falls', 'st. catharines', 'st catharines', 'welland', 'south bruce peninsula', 'orillia', 'milton', 'peterborough', 'stratford', 'cornwall', 'neustadt', 'port franks', 'binbrook', 'strathroy', 'port hope', 'belleville', 'tamworth', 'millbrook', 'sudbury', 'greater sudbury', 'sault ste. marie', 'north bay', 'timmins', 'sarnia', 'chatham', 'woodstock', 'st. thomas', 'collingwood', 'bowmanville', 'cobourg', 'kanata', 'nepean', 'orleans', 'halton hills', 'caledon', 'bolton', 'innisfil', 'bradford', 'keswick', 'uxbridge', 'grimsby', 'lindsay', 'midland', 'huntsville', 'bracebridge'],
  PE: ['charlottetown', 'summerside'],
  QC: ['montreal', 'montréal', 'greater montreal', 'laval', 'longueuil', 'brossard', 'saint-laurent', 'gatineau', 'quebec city', 'québec city', 'sherbrooke', 'trois-rivières', 'trois-rivieres', 'terrebonne', 'saguenay', 'lévis', 'levis', 'drummondville', 'saint-jérôme', 'granby', 'blainville', 'mirabel', 'repentigny', 'boucherville', 'dorval', 'pointe-claire', 'kirkland', 'beaconsfield', 'vaudreuil-dorion'],
  SK: ['saskatoon', 'regina', 'prince albert', 'moose jaw', 'warman', 'martensville', 'swift current', 'yorkton', 'north battleford', 'estevan', 'weyburn', 'humboldt', 'melfort', 'kindersley', 'white city', 'emerald park', 'pilot butte', 'osler', 'lumsden', 'balgonie', 'meadow lake', 'tisdale', 'nipawin', 'la ronge'],
  YT: ['whitehorse', 'dawson city'],
};

// Same name exists in another province (or the name is common enough that
// it might): only inferred when the area code agrees.
const AMBIGUOUS = new Set(['windsor', 'victoria', 'richmond', 'delta', 'kingston', 'bedford', 'concord', 'milton', 'stratford', 'millbrook', 'cochrane', 'aylmer', 'georgetown', 'armstrong', 'cornwall', 'london', 'sidney', 'essex', 'tara', 'riverview', 'campbellton', 'duncan', 'olds', 'sydney', 'paradise', 'maple', 'mission', 'nelson', 'lunenburg', 'sackville', 'waterloo', 'woodstock', 'chatham', 'perth', 'amherst', 'sussex']);
// Spans two provinces: never inferred.
const NEVER = new Set(['lloydminster', 'flin flon']);

const AREA_CODES: Partial<Record<ProvinceCode, number[]>> = {
  BC: [236, 250, 257, 604, 672, 778], AB: [368, 403, 587, 780, 825], SK: [306, 474, 639], MB: [204, 431, 584],
  ON: [226, 249, 289, 343, 365, 382, 387, 416, 437, 519, 548, 613, 647, 683, 705, 742, 753, 807, 905, 942],
  QC: [263, 354, 367, 418, 438, 450, 468, 514, 579, 581, 819, 873], NB: [428, 506], NS: [782, 902], PE: [782, 902],
  NL: [709, 879], NT: [867], NU: [867], YT: [867],
};

const CITY_TO_PROVINCE = new Map<string, ProvinceCode>();
for (const [prov, list] of Object.entries(CITIES) as [ProvinceCode, string[]][]) for (const c of list) CITY_TO_PROVINCE.set(c, prov);

const clean = (s: string | null | undefined) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// 'ab', ' AB ', 'Alberta', 'B.C.' -> code; anything else -> null.
export function normalizeProvince(input: string | null | undefined): ProvinceCode | null {
  const s = clean(input);
  if (!s) return null;
  const upper = s.toUpperCase();
  if ((PROVINCE_CODES as readonly string[]).includes(upper)) return upper as ProvinceCode;
  return PROVINCE_NAMES[s] ?? null;
}

function areaCode(phone: string | null | undefined): number | null {
  const d = (phone || '').replace(/\D/g, '');
  const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (n.length !== 10 || /^8(00|33|44|55|66|77|88)/.test(n)) return null; // toll-free says nothing about location
  return Number(n.slice(0, 3));
}

function phoneProvinces(phones: (string | null | undefined)[]): Set<ProvinceCode> {
  const out = new Set<ProvinceCode>();
  for (const code of phones.map(areaCode)) {
    if (code === null) continue;
    for (const [prov, codes] of Object.entries(AREA_CODES) as [ProvinceCode, number[]][]) if (codes.includes(code)) out.add(prov);
  }
  return out;
}

// Province implied by a city string, or null when not certain (see top).
export function inferProvince(city: string | null | undefined, phones: (string | null | undefined)[] = []): ProvinceCode | null {
  const c = clean(city);
  if (!c || NEVER.has(c)) return null;
  // "BC", "Ontario", "Sudbury, Ontario", "Sherwood Park / Edmonton"
  let target: ProvinceCode | null = normalizeProvince(c) ?? CITY_TO_PROVINCE.get(c) ?? null;
  if (!target) {
    const parts = c.split(/\s*[,/]\s*|\s+-\s+/).filter(Boolean);
    const found = new Set(parts.map(p => normalizeProvince(p) ?? CITY_TO_PROVINCE.get(p) ?? null).filter((p): p is ProvinceCode => !!p));
    if (found.size === 1) target = [...found][0];
    else if (found.size === 0) {
      const trailing = Object.keys(PROVINCE_NAMES).find(name => c.endsWith(' ' + name));
      if (trailing) target = PROVINCE_NAMES[trailing];
    }
  }
  if (!target) return null;
  const fromPhone = phoneProvinces(phones);
  if (fromPhone.size > 0 && !fromPhone.has(target)) return null;
  if (AMBIGUOUS.has(c) && !fromPhone.has(target)) return null;
  return target;
}

// What to store: a valid given province, else one inferred from the city, else null.
export function resolveProvince(given: string | null | undefined, city: string | null | undefined, phones: (string | null | undefined)[] = []): { province: ProvinceCode | null; source: 'given' | 'inferred' | 'none' } {
  const g = normalizeProvince(given);
  if (g) return { province: g, source: 'given' };
  const inferred = inferProvince(city, phones);
  return inferred ? { province: inferred, source: 'inferred' } : { province: null, source: 'none' };
}
