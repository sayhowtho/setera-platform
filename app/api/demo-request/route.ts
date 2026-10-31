import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { inferProvince } from '@/lib/canada-places';

export const dynamic = 'force-dynamic';

// Website demo-request submissions have no logged-in rep to attribute the
// lead to, so they land with the owner for manual triage/reassignment.
const WEBSITE_LEAD_REP_ID = '00000000-0000-4000-8000-000000000001' // the owner's profile id in production;

// Same table/function /api/overflow/join uses (migrations/009) — it's
// already generic (bucket/window/max, nothing overflow-specific), so this
// reuses it as-is under a different bucket prefix rather than adding a
// parallel rate-limit table for one more form.
const RATE_MAX = 5;            // requests per IP per window; the 6th gets 429
const RATE_WINDOW = '1 hour';

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await req.json();
    const { name, businessName, industry, location, phone, email, notes } = body;

    // Rate limit per IP (hashed; the raw IP is never stored) — mirrors
    // /api/overflow/join/route.ts exactly.
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    const bucket = 'demo_request:' + createHash('sha256').update(ip + ':' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')).digest('hex').slice(0, 32);
    const { data: allowed, error: rlError } = await supabaseAdmin.rpc('overflow_rate_limit_hit', {
      p_bucket: bucket, p_window: RATE_WINDOW, p_max: RATE_MAX,
    });
    if (rlError) return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

    // Honeypot: real users never see or fill this field (see app/demo/page.tsx).
    // Bots get the same success response and nothing is written — checked
    // before the required-field validation below so a bot can't distinguish
    // behavior based on which other fields it did or didn't fill.
    if (typeof body.company_website === 'string' && body.company_website.trim() !== '') {
      return NextResponse.json({ success: true });
    }

    if (!name || !businessName || !industry || !location || !phone || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: prospect, error: insertError } = await supabaseAdmin
      .from('prospects')
      .insert({
        rep_id: WEBSITE_LEAD_REP_ID,
        company_name: businessName,
        contact_name: name,
        trade: industry,
        city: location,
        // From the city the visitor typed (and their area code); blank if unsure.
        province: inferProvince(location, [phone]),
        phone,
        contact_phone: phone,
        email,
        contact_email: email,
        notes: notes || null,
        source: 'Website — Demo Request',
        status: 'Not Contacted',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Supabase error (prospects insert):', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: stageError } = await supabaseAdmin.from('prospect_stage_history').insert({
      prospect_id: prospect.id,
      rep_id: WEBSITE_LEAD_REP_ID,
      stage: 'New',
      entered_at: new Date().toISOString(),
    });
    if (stageError) console.error('Supabase error (prospect_stage_history insert):', stageError);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Demo request error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
