// Verifies the setter compensation/attribution pipeline (migration 008 +
// lib/compensation.ts) end-to-end against a single gated test account,
// before it's trusted against any real setter's live dashboard.
//
// Creates (or reuses) setter.test@example.com as a real but obviously
// fictional Supabase auth user + profile, gives them a fresh
// rep_compensation row on setter_training, creates one fake client
// ("Test Fictional Roofing Co") with that setter as booked_by_setter_id,
// records a sale against it, and prints the resulting compensation
// progress snapshot — the same shape the setter dashboard renders — so you
// can eyeball that Training Progress, MRR Progress, the 30-Day Sprint, and
// the relevant every-10th-sale tracker all moved together.
//
// Every write here is scoped to EXPECTED_EMAIL/EXPECTED_BUSINESS_NAME —
// this must never be able to touch a real setter or a real client.
//
// Usage:
//   node --env-file=.env.local scripts/test-setter-attribution.mjs           # dry run — prints the plan, writes nothing
//   node --env-file=.env.local scripts/test-setter-attribution.mjs --apply   # creates the test account/rows, records one sale, prints progress
//   node --env-file=.env.local scripts/test-setter-attribution.mjs --cleanup # deletes everything this script created

import { createClient } from '@supabase/supabase-js';

const EXPECTED_EMAIL = 'setter.test@example.com';
const EXPECTED_BUSINESS_NAME = 'Test Fictional Roofing Co';

const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local scripts/test-setter-attribution.mjs');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findTestSetter() {
  const { data } = await supabase.from('profiles').select('*').eq('email', EXPECTED_EMAIL).maybeSingle();
  return data;
}

async function cleanup() {
  const setter = await findTestSetter();
  if (!setter) { console.log('Nothing to clean up — no profile found for', EXPECTED_EMAIL); return; }

  const { data: client } = await supabase.from('clients').select('id').eq('business_name', EXPECTED_BUSINESS_NAME).eq('rep_id', setter.id).maybeSingle();
  if (client) {
    const { data: sales } = await supabase.from('sales').select('id').eq('client_id', client.id);
    for (const s of sales || []) {
      await supabase.from('commission_earnings').delete().eq('sale_id', s.id);
      await supabase.from('sales').delete().eq('id', s.id);
    }
    await supabase.from('clients').delete().eq('id', client.id);
    console.log('Deleted test client + its sales/commission_earnings.');
  }
  await supabase.from('bonus_awards').delete().eq('rep_id', setter.id);
  await supabase.from('rep_compensation_history').delete().eq('rep_id', setter.id);
  await supabase.from('rep_compensation').delete().eq('rep_id', setter.id);
  await supabase.from('profiles').delete().eq('id', setter.id);
  await supabase.auth.admin.deleteUser(setter.id);
  console.log('Deleted test setter profile + auth user:', EXPECTED_EMAIL);
}

async function plan() {
  const existing = await findTestSetter();
  console.log('DRY RUN — would do the following:');
  console.log(existing ? `- Reuse existing profile ${existing.id} for ${EXPECTED_EMAIL}` : `- Create a new auth user + profile for ${EXPECTED_EMAIL} (role: setter)`);
  console.log(`- Ensure a rep_compensation row exists on comp_track=setter_training, rep_started_at=now`);
  console.log(`- Create client "${EXPECTED_BUSINESS_NAME}" with rep_id = that setter (booked_by_setter_id should auto-fill via migration 008's trigger)`);
  console.log(`- Record one sale (plan: launch) against that client, credited to the test setter`);
  console.log(`- Print getCompensationProgress() for the test setter — confirm Training Progress, MRR Progress, Sprint, and the Launch 10th-sale tracker all reflect it`);
  console.log('\nRun with --apply to actually do this, or --cleanup to remove a previous run.');
}

async function apply() {
  let setter = await findTestSetter();
  if (!setter) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: EXPECTED_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: 'Setter Testface' },
    });
    if (createErr) throw new Error(`Failed to create auth user: ${createErr.message}`);
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .upsert({ id: created.user.id, email: EXPECTED_EMAIL, full_name: 'Setter Testface', role: 'setter' })
      .select()
      .single();
    if (profErr) throw new Error(`Failed to create profile: ${profErr.message}`);
    setter = prof;
    console.log('Created test setter:', setter.id, EXPECTED_EMAIL);
  } else {
    console.log('Reusing existing test setter:', setter.id, EXPECTED_EMAIL);
  }

  const { data: existingComp } = await supabase.from('rep_compensation').select('*').eq('rep_id', setter.id).maybeSingle();
  if (!existingComp) {
    const { error } = await supabase.from('rep_compensation').insert({
      rep_id: setter.id,
      comp_track: 'setter_training',
      rep_started_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Failed to create rep_compensation: ${error.message}`);
    console.log('Created rep_compensation on setter_training.');
  } else {
    console.log('rep_compensation already exists:', existingComp.comp_track);
  }

  let { data: client } = await supabase.from('clients').select('*').eq('business_name', EXPECTED_BUSINESS_NAME).eq('rep_id', setter.id).maybeSingle();
  if (!client) {
    const { data: created, error } = await supabase
      .from('clients')
      .insert({
        business_name: EXPECTED_BUSINESS_NAME,
        owner_name: 'Testy McTestface',
        phone: '',
        email: '',
        city: '',
        province: 'SK',
        website: '',
        rep_id: setter.id,
        status: 'Onboarding',
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create test client: ${error.message}`);
    client = created;
    console.log('Created test client:', client.id, '— booked_by_setter_id:', client.booked_by_setter_id ?? '(migration 008 not applied yet — see below)');
  } else {
    console.log('Reusing existing test client:', client.id, '— booked_by_setter_id:', client.booked_by_setter_id ?? 'null');
  }

  if (!client.booked_by_setter_id) {
    console.warn('\n⚠ client.booked_by_setter_id is null — migration 008 has probably not been run yet, or this client predates it. Apply the migration before trusting this test.');
  }

  const { recordSale, checkAndAwardBonuses, getCompensationProgress } = await import('../lib/compensation.ts');

  const { sale, commissionEarning } = await recordSale({
    clientId: client.id,
    repId: setter.id,
    planSlug: 'launch',
    setterId: setter.id,
  });
  console.log('\nRecorded sale:', sale.id, '— commission:', commissionEarning.commission_amount, commissionEarning.currency);

  const newAwards = await checkAndAwardBonuses(setter.id);
  console.log('New bonus awards from this sale:', newAwards.length ? newAwards : 'none (expected — 1 sale during training)');

  const progress = await getCompensationProgress(setter.id);
  console.log('\n=== Compensation progress for test setter ===');
  console.log(JSON.stringify(progress, null, 2));
}

if (CLEANUP) {
  await cleanup();
} else if (APPLY) {
  await apply();
} else {
  await plan();
}
