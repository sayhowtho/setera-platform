import Anthropic from '@anthropic-ai/sdk';

// Originally ported from the one-time AI classification backfill script
// (setera-backups/ai-backfill-clone-20260905-011540/backfill.mjs). The prompt
// has since been generalized for all clients: calls are classified by what
// the caller wants rather than who they are, and the business's own stated
// services are passed in so out-of-scope requests can be told apart from
// opportunities. classification_source is 'ai_backfill' for the historical
// run and 'ai_auto' for live calls.

export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.70;

export const CLASSIFICATION_VALUES = ['opportunity', 'out_of_scope', 'customer', 'trade_partner', 'other'] as const;

const SYSTEM_PROMPT = `You are classifying phone calls answered by Emily, the AI receptionist for a service or trades business. You are given the business's industry and stated services (when available), plus the call's summary and metadata. Classify the call into exactly one of five categories.

Classify by what the caller wants, not by who they are. Whether the caller is new or has used the business before does not decide the category — the request does.

- opportunity: The caller wants work done that this business offers — revenue potential for the business. This includes:
  - Any new prospect asking for work, a quote, or an estimate.
  - A returning or past customer asking for NEW work — an inspection, check-up, estimate, new repair, replacement, or another project. Repeat business is an opportunity.
  - Anyone who says they were referred by another person, customer, or business (e.g. "my neighbour told me to call you", "[name] recommended you", "I heard about you from..."). Referrals are hot leads: always classify them as opportunity, even if the call is short, vague, or low on details.
  - Another business (e.g. a restoration company, property manager, insurer, or other partner) bringing a job for its own client, or referring a customer to this business.
  - A callback request or follow-up where it is unclear whether new work is involved, but only if the caller left a name, an address, or a stated reason.
- out_of_scope: The caller wants work that this business does not offer — the request is clearly outside the business's stated services, or Emily told the caller the business doesn't do that kind of work. Use this instead of opportunity so the business can route the job elsewhere (e.g. a referral partner or overflow network). If the stated services are missing or too general to tell, and Emily did not say the work isn't offered, treat the request as in scope.
- customer: Only when the call is about work already done or already in progress — a warranty claim or problem with completed work, a cancellation, payments/invoices, rescheduling, or checking the status of an already-booked job.
- trade_partner: Businesses selling something to this business — suppliers, subcontractors looking for work, vendors, and sales pitches — and businesses or professionals (e.g. a law firm or real-estate office) calling without bringing a job and without a stated purpose, even if they leave a name. A business that brings a job or a customer is an opportunity, not a trade_partner.
- other: Only silence, hang-ups, wrong numbers, spam/robocalls, and callback requests where the caller left no name, no address, and no stated reason. If a real person spoke and none of these apply, never use other. A scripted request to call back a toll-free number (800, 833, 844, 855, 866, 877, 888) about an unspecified "important matter" is spam, even if a name is given.

Examples:
- A past customer of the owner calls to book a roof check-up → opportunity (new work from a returning customer).
- "My neighbour/friend/[name] told me to call you" and asks for a quote → opportunity (referral).
- A restoration company calls asking for an estimate on behalf of their client → opportunity (partner bringing a job).
- A caller gives their name and asks the owner to call them back, without saying why → opportunity (unclear callback with a name).
- A roofing business is asked to repair a flat commercial roof, and Emily says they don't do flat roofs → out_of_scope.
- A roofing/siding/windows business is asked to fix structural trusses or install snow guards, which aren't among its stated services → out_of_scope.
- A supplier calls to pitch materials or a subcontractor asks if there is work for their crew → trade_partner.
- A law firm asks for the owner without saying why → trade_partner.
- A past customer calls because the repair done last month is leaking again → customer (work already done).
- A caller wants to move their already-booked install to next week → customer (already-booked job).
- "Hi, this is Hazel, please call me back at 1-888-... about an important matter" → other (toll-free callback spam).
- A caller says "have him call me" and hangs up without a name or reason → other.

Respond with ONLY strict JSON, no markdown fences, no prose: {"classification": "opportunity|out_of_scope|customer|trade_partner|other", "confidence": 0.00-1.00, "reason": "one sentence"}

confidence should reflect your genuine certainty — a short, generic, or ambiguous summary should score low, not be forced into a guess.`;

export type ClassifiableCall = {
  caller_name: string | null;
  reason: string | null;
  urgency: string | null;
  mood: string | null;
  duration: number | null;
  summary: string | null;
  transcript: unknown;
  // From businesses.industry / businesses.services — used to tell
  // opportunity from out_of_scope. Optional; the prompt treats missing
  // services as "in scope unless Emily said otherwise".
  business_industry?: string | null;
  business_services?: string | null;
};

export type ClassificationResult = {
  classification: typeof CLASSIFICATION_VALUES[number];
  confidence: number;
  reason: string;
};

function parseTranscript(t: unknown): { role: string; message?: string; text?: string }[] {
  if (Array.isArray(t)) return t as { role: string; message?: string; text?: string }[];
  if (typeof t === 'string') {
    try {
      const p = JSON.parse(t);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function transcriptToText(t: unknown, maxLines = 12): string {
  return parseTranscript(t).slice(0, maxLines).map(l => `${l.role}: ${l.message || l.text || ''}`).join('\n');
}

function buildUserMessage(call: ClassifiableCall): string {
  const summaryLen = (call.summary || '').trim().split(/\s+/).filter(Boolean).length;
  const needsTranscriptFallback = !call.summary || summaryLen < 15;
  let msg = `Business industry: ${call.business_industry || 'unknown'}\nBusiness's stated services: ${call.business_services || 'not provided'}\n\nCaller name: ${call.caller_name || 'unknown'}\nReason (as captured): ${call.reason || 'none'}\nUrgency: ${call.urgency || 'none'}\nMood: ${call.mood || 'none'}\nDuration (sec): ${call.duration ?? 'unknown'}\nSummary: ${call.summary || '(no summary)'}\n`;
  if (needsTranscriptFallback) {
    const t = transcriptToText(call.transcript);
    if (t) msg += `\nSummary was thin/missing — here is the transcript for context:\n${t}\n`;
  }
  return msg;
}

function parseModelJson(text: string): ClassificationResult {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  if (!(CLASSIFICATION_VALUES as readonly string[]).includes(parsed.classification)) {
    throw new Error(`Invalid classification value: ${parsed.classification}`);
  }
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`Invalid confidence value: ${parsed.confidence}`);
  }
  return parsed;
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export async function classifyCall(call: ClassifiableCall): Promise<ClassificationResult> {
  const response = await getAnthropicClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(call) }],
  });
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text block in response');
  return parseModelJson(textBlock.text);
}
