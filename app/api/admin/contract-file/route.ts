import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { NextResponse } from 'next/server';

const FIELD_COLUMNS = {
  sent: 'contract_sent_file_path',
  signed: 'contract_signed_file_path',
} as const;

export async function GET(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabaseAdmin = auth.admin;

  const { searchParams } = new URL(req.url);
  const historyId = searchParams.get('historyId');
  const field = searchParams.get('field');

  if (!historyId || (field !== 'sent' && field !== 'signed')) {
    return NextResponse.json({ error: 'Missing or invalid historyId or field' }, { status: 400 });
  }

  const column = FIELD_COLUMNS[field];
  const { data, error } = await supabaseAdmin
    .from('rep_compensation_history')
    .select(column)
    .eq('id', historyId)
    .single();

  if (error || !data || !(data as any)[column]) {
    return NextResponse.json({ error: 'No file on record for this transition' }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from('contracts')
    .createSignedUrl((data as any)[column], 300);

  if (signError || !signed) return NextResponse.json({ error: signError?.message || 'Failed to sign URL' }, { status: 400 });
  return NextResponse.json({ url: signed.signedUrl });
}
