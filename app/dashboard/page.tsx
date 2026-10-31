'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/app/components/sidebar';
import { supabase } from '@/lib/supabase';

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

function getInitials(name: string | null, number: string) {
  if (name) return name.split(' ').map(function(n) { return n[0]; }).join('').slice(0, 2).toUpperCase();

  return number.slice(-2);
}

export default function Dashboard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCalls() {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data) setCalls(data);
      setLoading(false);
    }
    fetchCalls();
  }, []);

  const urgent = calls.filter((c) => c.status === 'Urgent').length;
  const followUp = calls.filter((c) => c.status === 'Follow Up').length;
  const captured = calls.filter((c) => c.status === 'Captured').length;
  const handled = calls.filter((c) => c.status === 'Handled').length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Dashboard</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>AI Reception Command Center</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Total Calls', value: calls.length, top: '#00d4aa' },
            { label: 'Urgent', value: urgent, top: '#ef4444' },
            { label: 'Follow Ups', value: followUp, top: '#f59e0b' },
            { label: 'Captured', value: captured, top: '#10b981' },
            { label: 'Handled', value: handled, top: '#3b82f6' },
          ].map((stat) => (
            <div key={stat.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '3px solid ' + stat.top }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 10px 0', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
              <p style={{ color: '#0a1f13', fontSize: '34px', fontWeight: '800', margin: 0 }}>{loading ? '-' : stat.value}</p>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ color: '#0a1f13', margin: 0, fontSize: '15px', fontWeight: '700' }}>Live Call Feed</h3>
            <span style={{ backgroundColor: '#dcfce7', color: '#16a34a', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: '600' }}>Live</span>
          </div>

          {loading && <p style={{ color: '#9ca3af', fontSize: '14px' }}>Loading calls...</p>}

          {!loading && calls.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
              No calls yet. Once Emily answers her first call it will appear here.
            </p>
          )}

          {calls.map((call) => (
            <Link key={call.id} href={'/dashboard/calls/' + call.id} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: getColor(call.status) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: getColor(call.status) }}>
                    {getInitials(call.caller_name, call.caller_number)}
                  </div>
                  <div>
                    <p style={{ color: '#0a1f13', margin: '0 0 2px 0', fontSize: '13px', fontWeight: '600' }}>{call.caller_name || call.caller_number}</p>
                    <p style={{ color: '#9ca3af', margin: 0, fontSize: '11px' }}>{call.reason || 'No reason captured'}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ backgroundColor: getColor(call.status) + '18', color: getColor(call.status), fontSize: '10px', padding: '3px 8px', borderRadius: '20px', display: 'block', marginBottom: '3px', fontWeight: '600' }}>{call.status}</span>
                  <span style={{ color: '#9ca3af', fontSize: '10px' }}>{timeAgo(call.created_at)}</span>
                </div>
              </div>
            </Link>
          ))}

          {calls.length > 0 && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <Link href="/dashboard/calls" style={{ textDecoration: 'none', color: '#0f2318', fontSize: '13px', fontWeight: '600' }}>View All Calls</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}