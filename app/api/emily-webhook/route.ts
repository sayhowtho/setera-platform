import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { classifyCall } from '@/lib/classify-call';
import { claimWebhookEvent, completeWebhookEvent, releaseWebhookEvent } from '@/lib/webhook-idempotency';
import { verifyEmilyWebhook } from '@/lib/emily-signature';

export const dynamic = 'force-dynamic';

// Ledger source name for this webhook's deliveries (lib/webhook-idempotency.ts).
const EVENT_SOURCE = 'elevenlabs_post_call';

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Set once this delivery has claimed its conversation_id; every 2xx path
  // below completes it and every 5xx path releases it.
  let claimedId: string | null = null;
  const done = async (outcome: string, res: NextResponse) => {
    if (claimedId) await completeWebhookEvent(supabaseAdmin, EVENT_SOURCE, claimedId, outcome);
    return res;
  };
  const failed = async (res: NextResponse) => {
    if (claimedId) await releaseWebhookEvent(supabaseAdmin, EVENT_SOURCE, claimedId);
    return res;
  };

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    if (body.type !== 'post_call_transcription') {
      return NextResponse.json({ received: true });
    }

    const data = body.data || {};
    const analysis = data.analysis || {};
    const dataCollection = analysis.data_collection_results || {};
    const transcript = data.transcript || [];

    const agent_id = data.agent_id || body.agent_id || null;
    const conversation_id = data.conversation_id || null;
    const summary = analysis.transcript_summary || null;
    const duration = data.metadata?.call_duration_secs || null;

    let business_id: string | null = null;

    if (agent_id) {
      const { data: agentRow } = await supabaseAdmin
        .from('business_agents')
        .select('business_id')
        .eq('agent_id', agent_id)
        .maybeSingle();

      if (agentRow) business_id = agentRow.business_id;
    }

    // Signed with this client's workspace secret (Setera's own when the agent
    // has no business)? See lib/emily-signature.ts. Nothing is written before
    // this point — including the idempotency claim below, so an unsigned
    // request can never claim (and thereby suppress) a real call's id.
    const sig = await verifyEmilyWebhook(supabaseAdmin, req.headers.get('elevenlabs-signature'), rawBody, business_id);
    console.log('[emily-webhook] signature:', sig.result, 'mode:', sig.mode, 'workspace:', business_id ?? 'setera');
    if (!sig.ok) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Deduplicate retried deliveries of the same call before writing anything
    // (migrations/041). If the ledger is unavailable the call is processed
    // anyway, exactly as before this existed.
    const claim = await claimWebhookEvent(supabaseAdmin, EVENT_SOURCE, conversation_id);
    if (claim === 'duplicate') {
      console.log('[emily-webhook] duplicate delivery ignored:', conversation_id);
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim === 'claimed') claimedId = conversation_id;

    if (business_id) {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('status')
        .eq('business_id', business_id)
        .maybeSingle();

      if (clientRow?.status === 'Paused') {
        return done('skipped_client_paused', NextResponse.json({ received: true, skipped: 'client_paused', business_id }));
      }

      // A lock unassigns the agent from the number, so this shouldn't fire —
      // it's the backstop in case a call was already in progress at lock time.
      const { data: bizRow } = await supabaseAdmin
        .from('businesses')
        .select('status, industry, services')
        .eq('id', business_id)
        .maybeSingle();

      if (bizRow?.status === 'locked') {
        return done('skipped_business_locked', NextResponse.json({ received: true, skipped: 'business_locked', business_id }));
      }

      const caller_name = dataCollection?.caller_name?.value || dataCollection?.name?.value || null;
      const caller_number =
        data.metadata?.phone_call?.external_number ||
        dataCollection?.caller_phone?.value ||
        dataCollection?.phone?.value ||
        null;
      const reason = dataCollection?.reason?.value || summary || null;
      const urgency = dataCollection?.urgency?.value || null;
      const callback_time = dataCollection?.callback_time?.value || null;
      const mood = dataCollection?.mood?.value || null;
      const city = dataCollection?.city?.value || null;
      const property_address = dataCollection?.property_address?.value || null;

      let status = 'green';
      if (urgency) {
        const u = urgency.toLowerCase();
        if (u.includes('urgent') || u.includes('emergency') || u.includes('high')) status = 'red';
        else if (u.includes('medium') || u.includes('follow')) status = 'yellow';
      }

      const { data: insertedCall, error } = await supabaseAdmin.from('calls').insert({
        caller_name,
        caller_number,
        reason,
        urgency,
        callback_time,
        mood,
        city,
        property_address,
        status,
        transcript,
        summary,
        duration,
        business_id,
        call_sid: conversation_id,
        pipeline_stage: 'new',
        channel: 'phone',
      }).select('id').single();

      if (error) {
        console.error('Supabase error (calls):', error);
        return failed(NextResponse.json({ error: error.message }, { status: 500 }));
      }

      // Best-effort auto-classification, same prompt/logic as the one-time
      // backfill (lib/classify-call.ts). Never let a classification failure
      // affect the webhook's response — the call row above is already saved
      // either way, just without a classification (same as today).
      try {
        const result = await classifyCall({ caller_name, reason, urgency, mood, duration, summary, transcript, business_industry: bizRow?.industry, business_services: bizRow?.services });
        const { error: classifyError } = await supabaseAdmin.from('calls').update({
          classification: result.classification,
          classification_confidence: result.confidence,
          classification_source: 'ai_auto',
        }).eq('id', insertedCall.id);
        if (classifyError) console.error('Auto-classification write failed for call', insertedCall.id, classifyError);
      } catch (classifyErr) {
        console.error('Auto-classification failed for call', insertedCall.id, classifyErr);
      }

      return done('call_saved', NextResponse.json({ success: true, routed_to: 'calls', business_id }));

    } else {
      const name = dataCollection?.name?.value || null;
      const phone = dataCollection?.phone?.value || null;
      const email = dataCollection?.email?.value || null;
      const business_type = dataCollection?.business_type?.value || null;
      const reason = analysis?.transcript_summary || null;

      const { error } = await supabaseAdmin.from('leads').insert({
        conversation_id,
        name,
        phone,
        email,
        business_type,
        reason,
        transcript,
        status: 'new',
      });

      if (error) {
        console.error('Supabase error (leads):', error);
        return failed(NextResponse.json({ error: error.message }, { status: 500 }));
      }

      return done('lead_saved', NextResponse.json({ success: true, routed_to: 'leads' }));
    }

  } catch (err) {
    console.error('Webhook error:', err);
    return failed(NextResponse.json({ error: 'Internal error' }, { status: 500 }));
  }
}
