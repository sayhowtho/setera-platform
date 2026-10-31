'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '../../../components/sidebar';
import { supabase } from '../../../../lib/supabase';

type Call = {
  id: string;
  caller_name: string | null;
  caller_number: string;
  reason: string | null;
  status: string;
  urgency: string | null;
  callback_time: string | null;
  mood: string | null;
  transcript: string | null;
  notes: string | null;
  created_at: string;
};

function getColor(status: string) {
  if (status === 'Urgent') return '#ef4444';
  if (status === 'Follow Up') return '#f59e0b';
  if (status === 'Captured') return '#10b981';
  return '#3b82f6';
}

export default function CallDetailPage() {
  const { id } = useParams();
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchCall() {
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('id', id)
        .single();
      if (data) {
        setCall(data);
        setNotes(data.notes || '');
      }
      setLoading(false);
    }
    if (id) fetchCall();
  }, [id]);

  const updateStatus = async (status: string) => {
    await supabase.from('calls').update({ status }).eq('id', id);
    setCall((prev) => prev ? { ...prev, status } : prev);
  };

  const saveNote = async () => {
    setSaving(true);
    await supabase.from('calls').update({ notes }).eq('id', id);
    setSaving(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: '#6b7280' }}>Loading call...</p>
    </div>
  );

  if (!call) return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: '#6b7280' }}>Call not found.</p>
    </div>
  );

  const statusColor = getColor(call.status);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', color: '#00d4aa', fontSize: '14px', fontWeight: '500' }}>← Back to Dashboard</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>{call.caller_name || call.caller_number}</h1>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>
              {call.caller_number} · {new Date(call.created_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })} · {new Date(call.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span style={{ backgroundColor: statusColor + '20', color: statusColor, fontSize: '13px', padding: '6px 16px', borderRadius: '20px', fontWeight: '600' }}>{call.status}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>Call Transcript</h3>
            {call.transcript ? (
              <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{call.transcript}</p>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '14px' }}>No transcript available.</p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>AI Summary</h3>
              {[
                { label: 'Reason', value: call.reason },
                { label: 'Urgency', value: call.urgency },
                { label: 'Callback', value: call.callback_time },
                { label: 'Mood', value: call.mood },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ color: '#9ca3af', fontSize: '12px', minWidth: '70px', paddingTop: '1px' }}>{row.label}</span>
                  <span style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '500' }}>{row.value || '—'}</span>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>Update Status</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Urgent', color: '#ef4444' },
                  { label: 'Follow Up', color: '#f59e0b' },
                  { label: 'Captured', color: '#10b981' },
                  { label: 'Handled', color: '#3b82f6' },
                ].map((s) => (
                  <div key={s.label} onClick={() => updateStatus(s.label)}
                    style={{ backgroundColor: call.status === s.label ? s.color : s.color + '18', border: '1px solid ' + s.color + '44', borderRadius: '8px', padding: '10px', textAlign: 'center', cursor: 'pointer', color: call.status === s.label ? '#fff' : s.color, fontSize: '13px', fontWeight: '600' }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add internal notes here..."
                style={{ width: '100%', minHeight: '100px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', color: '#374151', fontSize: '13px', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
              />
              <div style={{ marginTop: '10px', textAlign: 'right' }}>
                <span onClick={saveNote} style={{ backgroundColor: '#0f2318', color: '#fff', fontSize: '13px', fontWeight: '600', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer' }}>
                  {saving ? 'Saving...' : 'Save Note'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}