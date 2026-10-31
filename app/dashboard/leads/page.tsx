'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '../../components/sidebar';
import { supabase } from '../../../lib/supabase';

type Call = {
  id: string;
  caller_name: string | null;
  caller_number: string;
  reason: string | null;
  status: string;
  created_at: string;
};

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return diff + 'm ago';
  return Math.floor(diff / 60) + 'h ago';
}

function getColor(status: string) {
  if (status === 'Urgent') return '#ef4444';
  if (status === 'Follow Up') return '#f59e0b';
  if (status === 'Captured') return '#10b981';
  return '#3b82f6';
}

function getBg(status: string) {
  if (status === 'Urgent') return '#fee2e2';
  if (status === 'Follow Up') return '#fef3c7';
  if (status === 'Captured') return '#d1fae5';
  return '#dbeafe';
}

function getInitials(name: string | null, number: string) {
  if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return number.slice(-2);
}

function getPriority(status: string) {
  if (status === 'Urgent') return { label: 'High', color: '#ef4444' };
  if (status === 'Follow Up') return { label: 'Medium', color: '#f59e0b' };
  return { label: 'Low', color: '#9ca3af' };
}

export default function Leads() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    async function fetchCalls() {
      const { data } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setCalls(data);
      setLoading(false);
    }
    fetchCalls();
  }, []);

  const filtered = filter === 'All' ? calls : calls.filter(c => c.status === filter);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Leads</h1>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>All captured leads from inbound calls</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { label: 'All', bg: '#0f2318', text: '#fff', border: '#0f2318' },
              { label: 'Urgent', bg: '#fee2e2', text: '#ef4444', border: '#ef4444' },
              { label: 'Follow Up', bg: '#fef3c7', text: '#f59e0b', border: '#f59e0b' },
              { label: 'Captured', bg: '#d1fae5', text: '#10b981', border: '#10b981' },
              { label: 'Handled', bg: '#dbeafe', text: '#3b82f6', border: '#3b82f6' },
            ].map((f) => (
              <div key={f.label} onClick={() => setFilter(f.label)}
                style={{ border: '1px solid ' + f.border, borderRadius: '8px', padding: '7px 14px', fontSize: '12px', color: f.text, backgroundColor: filter === f.label ? f.bg : '#fff', fontWeight: '600', cursor: 'pointer' }}>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '14px 24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
            {['Caller', 'Reason', 'Status', 'Priority', 'Time', 'Action'].map((col) => (
              <p key={col} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col}</p>
            ))}
          </div>

          {loading && (
            <p style={{ color: '#9ca3af', fontSize: '14px', padding: '40px', textAlign: 'center' }}>Loading leads...</p>
          )}

          {!loading && filtered.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '14px', padding: '40px', textAlign: 'center' }}>No leads yet.</p>
          )}

          {filtered.map((call) => {
            const color = getColor(call.status);
            const bg = getBg(call.status);
            const priority = getPriority(call.status);
            return (
              <div key={call.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '16px 24px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color, flexShrink: 0 }}>
                    {getInitials(call.caller_name, call.caller_number)}
                  </div>
                  <div>
                    <p style={{ color: '#0a1f13', margin: '0 0 2px 0', fontSize: '13px', fontWeight: '600' }}>{call.caller_name || call.caller_number}</p>
                    <p style={{ color: '#9ca3af', margin: 0, fontSize: '11px' }}>{call.caller_number}</p>
                  </div>
                </div>
                <p style={{ color: '#374151', fontSize: '13px', margin: 0, paddingRight: '16px' }}>{call.reason || '—'}</p>
                <span style={{ backgroundColor: color + '18', color, fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: '600', display: 'inline-block' }}>{call.status}</span>
                <span style={{ color: priority.color, fontSize: '12px', fontWeight: '600' }}>{priority.label}</span>
                <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{timeAgo(call.created_at)}</p>
                <Link href={'/dashboard/calls/' + call.id} style={{ textDecoration: 'none', color: '#0f2318', fontSize: '12px', fontWeight: '600' }}>View</Link>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Showing {filtered.length} of {calls.length} leads</p>
        </div>
      </div>
    </div>
  );
}