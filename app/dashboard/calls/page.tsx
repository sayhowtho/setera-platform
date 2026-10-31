'use client';
import Link from 'next/link';
import Sidebar from '@/app/components/sidebar';

export default function CallDetail() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', color: '#00d4aa', fontSize: '14px', fontWeight: '500' }}>← Back to Dashboard</Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Jacob Thompson</h1>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>(306) 555-0198 · May 8, 2026 · 7:42 PM</p>
          </div>
          <span style={{ backgroundColor: '#fee2e2', color: '#ef4444', fontSize: '13px', padding: '6px 16px', borderRadius: '20px', fontWeight: '600' }}>Urgent</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>Call Transcript</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { speaker: 'AI', text: 'Thank you for calling. This call may be recorded for quality purposes. How can I help you today?', color: '#0f2318' },
                { speaker: 'Caller', text: 'Yeah hi, we had a big storm last night and my roof is leaking bad. Water is coming into my living room.', color: '#ef4444' },
                { speaker: 'AI', text: 'I am sorry to hear that. Can I get your name and the best number to reach you?', color: '#0f2318' },
                { speaker: 'Caller', text: 'Jacob Thompson. This number is fine, 306-555-0198.', color: '#ef4444' },
                { speaker: 'AI', text: 'Thank you Jacob. How urgent is the situation — is water actively coming in right now?', color: '#0f2318' },
                { speaker: 'Caller', text: 'Yes it is dripping right now. I need someone out today if possible.', color: '#ef4444' },
                { speaker: 'AI', text: 'Understood. I have flagged this as urgent and someone will call you back within the hour.', color: '#0f2318' },
                { speaker: 'Caller', text: 'No that is it. Thank you.', color: '#ef4444' },
              ].map((line, i) => (
                <div key={i} style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '10px', borderLeft: '3px solid ' + line.color }}>
                  <p style={{ color: line.color, fontSize: '11px', fontWeight: '700', margin: '0 0 4px 0', textTransform: 'uppercase' }}>{line.speaker}</p>
                  <p style={{ color: '#374151', margin: 0, fontSize: '13px', lineHeight: '1.6' }}>{line.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>AI Summary</h3>
              {[
                { label: 'Reason', value: 'Active roof leak from storm damage' },
                { label: 'Urgency', value: 'High — water actively entering home' },
                { label: 'Callback', value: 'Any time, prefers within the hour' },
                { label: 'Mood', value: 'Calm but stressed' },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ color: '#9ca3af', fontSize: '12px', minWidth: '70px', paddingTop: '1px' }}>{row.label}</span>
                  <span style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '500' }}>{row.value}</span>
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
                  <div key={s.label} style={{ backgroundColor: s.color + '18', border: '1px solid ' + s.color + '44', borderRadius: '8px', padding: '10px', textAlign: 'center', cursor: 'pointer', color: s.color, fontSize: '13px', fontWeight: '600' }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>Notes</h3>
              <textarea placeholder="Add internal notes here..." style={{ width: '100%', minHeight: '100px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', color: '#374151', fontSize: '13px', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
              <div style={{ marginTop: '10px', textAlign: 'right' }}>
                <span style={{ backgroundColor: '#0f2318', color: '#fff', fontSize: '13px', fontWeight: '600', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer' }}>Save Note</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}