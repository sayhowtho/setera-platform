import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { NextResponse } from 'next/server';

const FIELD_COLUMNS = {
  sent: { date: 'contract_sent_at', file: 'contract_sent_file_path' },
  signed: { date: 'contract_signed_at', file: 'contract_signed_file_path' },
} as const;

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabaseAdmin = auth.admin;

  const formData = await req.formData();
  const historyId = formData.get('historyId');
  const field = formData.get('field');
  const date = formData.get('date');
  const file = formData.get('file');

  if (typeof historyId !== 'string' || (field !== 'sent' && field !== 'signed') || typeof date !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid historyId, field, or date' }, { status: 400 });
  }

  const columns = FIELD_COLUMNS[field];
  const update: Record<string, string> = { [columns.date]: new Date(date).toISOString() };

  if (file instanceof File) {
    const path = `${historyId}/${field}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contracts')
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream' });
    if (uploadError) return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 400 });
    update[columns.file] = path;
  }

  const { error: updateError } = await supabaseAdmin
    .from('rep_compensation_history')
    .update(update)
    .eq('id', historyId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
