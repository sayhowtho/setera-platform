'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// High Table: Overflow Early Access (admin/owner only). Reads run under the
// admin's own session against overflow_waitlist_admin (RLS + role-filtered
// view); the CSV export and import go through admin-only API routes.

type Row = {
  id: string; email: string; business_name: string | null; contact_name: string | null; location: string | null; status: string; source: string;
  originating_rep_id: string | null; originating_rep_email_snapshot: string | null; originating_rep_name_snapshot: string | null;
  consent_basis: string; created_at: string; is_existing_client: boolean;
};
type Rep = { id: string; full_name: string | null; email: string | null };
type ImportReport = { counts: Record<string, number>; rows: { row_no: number; status: string }[] };

const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '14px', padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' };
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };
const btn: React.CSSProperties = { backgroundColor: '#00d4aa', color: '#0a1f13', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' };
const ghost: React.CSSProperties = { ...btn, backgroundColor: '#fff', border: '1px solid #e5e7eb', color: '#374151' };
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: 'Bearer ' + (session?.access_token ?? '') };
}

export default function OverflowEarlyAccess() {
  const [rows, setRows] = useState<Row[]>([]);
  const [reps, setReps] = useState<Record<string, Rep>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fRep, setFRep] = useState('');
  const [fSource, setFSource] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('overflow_waitlist_admin').select('*')
        .order('created_at', { ascending: false }).order('id').range(from, from + 999);
      if (error) { setErr(error.message); break; }
      all.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }
    setRows(all);
    const { data: profs } = await supabase.from('profiles').select('id, full_name, email');
    setReps(Object.fromEntries(((profs ?? []) as Rep[]).map(p => [p.id, p])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const repLabel = (r: Row) => {
    if (!r.originating_rep_id) return { name: '—', email: '' };
    const live = reps[r.originating_rep_id];
    return { name: live?.full_name || r.originating_rep_name_snapshot || '—', email: live?.email || r.originating_rep_email_snapshot || '' };
  };

  const repOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.originating_rep_id) m.set(r.originating_rep_id, repLabel(r).name || repLabel(r).email); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, reps]);

  const filtered = rows.filter(r => {
    if (fRep && r.originating_rep_id !== fRep) return false;
    if (fSource && r.source !== fSource) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (q) {
      const rep = repLabel(r);
      const hay = [r.email, r.business_name, r.contact_name, r.location, rep.name, rep.email].join(' ').toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const newToday = rows.filter(r => new Date(r.created_at) >= todayStart).length;

  async function downloadCsv() {
    setErr('');
    const res = await fetch('/api/admin/overflow/export', { headers: await authHeader() });
    if (!res.ok) { setErr('Export failed'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = 'overflow-early-access.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    setImporting(true); setErr(''); setReport(null);
    const res = await fetch('/api/admin/overflow/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ csv: csvText }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setErr(body.error || 'Import failed'); else { setReport(body); load(); }
    setImporting(false);
  }

  async function setStatus(id: string, status: 'unsubscribed' | 'removed') {
    if (!window.confirm(`Mark this contact as ${status}? This cannot be undone from the UI.`)) return;
    const res = await fetch('/api/admin/overflow/set-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ waitlistId: id, status }),
    });
    if (!res.ok) setErr('Update failed'); else load();
  }

  const stat = (label: string, value: number) => (
    <div style={{ ...card, flex: 1 }}>
      <p style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px 0' }}>{label}</p>
      <p style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: 0 }}>{value}</p>
    </div>
  );

  return (
    <div>
      <h1 style={{ color: '#0a1f13', fontSize: '26px', fontWeight: '800', margin: '0 0 6px 0' }}>Overflow Early Access</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>Contractors who asked to hear when Overflow applications open. Capture only — nothing is emailed from here.</p>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>{stat('Total on waitlist', rows.length)}{stat('New today', newToday)}</div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input style={{ ...inp, minWidth: '240px' }} placeholder="Search email, business, contact, location, rep" value={q} onChange={e => setQ(e.target.value)} />
        <select style={inp} value={fRep} onChange={e => setFRep(e.target.value)}><option value="">All reps</option>{repOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select style={inp} value={fSource} onChange={e => setFSource(e.target.value)}><option value="">All sources</option>{['sales_rep', 'website', 'existing_client', 'other', 'backfill'].map(s => <option key={s}>{s}</option>)}</select>
        <select style={inp} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">All statuses</option>{['waitlisted', 'invited', 'application_started', 'unsubscribed', 'removed'].map(s => <option key={s}>{s}</option>)}</select>
        <div style={{ flex: 1 }} />
        <button style={ghost} onClick={() => setShowImport(v => !v)}>{showImport ? 'Close import' : 'Bulk import'}</button>
        <button style={btn} onClick={downloadCsv}>Download CSV</button>
      </div>
      <p style={{ color: '#9ca3af', fontSize: '12px', margin: '-6px 0 14px 0' }}>The CSV always excludes unsubscribed and removed contacts, regardless of the filters above.</p>
      {err && <p style={{ color: '#b91c1c', fontSize: '13px', fontWeight: '600' }}>{err}</p>}

      {showImport && (
        <div style={{ ...card, marginBottom: '20px' }}>
          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '0 0 6px 0' }}>Bulk import (paper period)</p>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 12px 0' }}>Columns: rep email, prospect email, business, contact name, date added (YYYY-MM-DD), agreed_to_email, and optionally location. Existing records keep their original attribution; the claimed touch is logged instead.</p>
          <input type="file" accept=".csv,text/csv" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsvText(await f.text()); }} style={{ marginBottom: '10px', fontSize: '13px' }} />
          <textarea style={{ ...inp, width: '100%', boxSizing: 'border-box', minHeight: '110px', fontFamily: 'monospace' }} placeholder="…or paste CSV here" value={csvText} onChange={e => setCsvText(e.target.value)} />
          <div style={{ marginTop: '10px' }}><button style={{ ...btn, opacity: importing || !csvText.trim() ? 0.6 : 1 }} disabled={importing || !csvText.trim()} onClick={runImport}>{importing ? 'Importing…' : 'Run import'}</button></div>
          {report && (
            <div style={{ marginTop: '16px', fontSize: '13px', color: '#0a1f13' }}>
              <p style={{ fontWeight: '700', margin: '0 0 6px 0' }}>Import report</p>
              <p style={{ margin: '0 0 8px 0' }}>
                Imported {report.counts.imported} · Duplicates in file {report.counts.duplicates} · Historical touches logged {report.counts.historical_touches} · Skipped (no consent) {report.counts.skipped_no_consent} · Skipped (unsubscribed) {report.counts.skipped_unsubscribed} · Failed {report.counts.failed}
              </p>
              {report.rows.filter(r => r.status.startsWith('failed')).length > 0 && (
                <p style={{ color: '#b91c1c', margin: 0 }}>Failed rows: {report.rows.filter(r => r.status.startsWith('failed')).map(r => `#${r.row_no} (${r.status.replace('failed_', '').replace(/_/g, ' ')})`).join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.2fr 1fr 1.6fr 1fr 1fr 0.9fr', padding: '12px 20px', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Business / contact</span><span>Email</span><span>Location</span><span>Source</span><span>Originating rep</span><span>Added</span><span>Status</span><span />
        </div>
        {loading ? <p style={{ padding: '24px', color: '#9ca3af', margin: 0 }}>Loading…</p>
          : filtered.length === 0 ? <p style={{ padding: '24px', color: '#9ca3af', margin: 0 }}>No matching contacts.</p>
          : filtered.map(r => {
            const rep = repLabel(r);
            const suppressed = r.status === 'unsubscribed' || r.status === 'removed';
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.2fr 1fr 1.6fr 1fr 1fr 0.9fr', padding: '12px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'center', fontSize: '13px', color: '#0a1f13', gap: '8px' }}>
                <span>
                  <strong>{r.business_name || '—'}</strong>
                  {r.is_existing_client && <span style={{ marginLeft: '8px', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>SETERA CLIENT</span>}
                  <br /><span style={{ color: '#6b7280' }}>{r.contact_name || ''}</span>
                </span>
                <span style={{ wordBreak: 'break-all' }}>{r.email}</span>
                <span style={{ color: '#374151' }}>{r.location || '—'}</span>
                <span>{r.source}</span>
                <span>{rep.name}<br /><span style={{ color: '#6b7280', fontSize: '12px' }}>{rep.email}</span></span>
                <span>{fmt(r.created_at)}</span>
                <span style={{ color: suppressed ? '#b91c1c' : '#047857', fontWeight: '600' }}>{r.status}</span>
                <span style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {!suppressed && <button style={{ ...ghost, padding: '4px 8px', fontSize: '11px' }} onClick={() => setStatus(r.id, 'unsubscribed')}>Unsub</button>}
                  {r.status !== 'removed' && <button style={{ ...ghost, padding: '4px 8px', fontSize: '11px' }} onClick={() => setStatus(r.id, 'removed')}>Remove</button>}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
