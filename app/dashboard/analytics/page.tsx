import Link from 'next/link';
import Sidebar from '@/app/components/sidebar';

export default function Analytics() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Analytics</h1>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Performance overview and call trends</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {['Today', '7 Days', '30 Days', '90 Days'].map((range) => (
              <div key={range} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', color: range === 'Today' ? '#fff' : '#374151', backgroundColor: range === 'Today' ? '#0f2318' : '#fff', fontWeight: '500', cursor: 'pointer' }}>{range}</div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Calls', value: '1,284', change: '+12%', color: '#00d4aa' },
            { label: 'Leads Captured', value: '847', change: '+18%', color: '#10b981' },
            { label: 'Avg Response Time', value: '1.2s', change: '-0.3s', color: '#0ea5e9' },
            { label: 'Conversion Rate', value: '66%', change: '+4%', color: '#f59e0b' },
          ].map((stat) => (
            <div key={stat.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '3px solid ' + stat.color }}>
              <p style={{ color: '#9ca3af', fontSize: '11px', margin: '0 0 10px 0', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</p>
              <p style={{ color: '#0a1f13', fontSize: '32px', fontWeight: '800', margin: '0 0 6px 0' }}>{stat.value}</p>
              <p style={{ color: '#10b981', fontSize: '12px', margin: 0, fontWeight: '500' }}>{'↑ ' + stat.change + ' vs last period'}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>Call Volume — Last 7 Days</h3>
            <svg viewBox="0 0 500 140" style={{ width: '100%', height: '140px' }}>
              <defs>
                <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4aa" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#00d4aa" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 50, 80, 110].map((y) => (
                <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#f3f4f6" strokeWidth="1" />
              ))}
              <path d="M0,110 C40,100 70,80 110,70 C150,60 180,85 220,65 C260,45 290,35 330,25 C370,15 400,30 440,20 C465,15 480,18 500,15" stroke="#00d4aa" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M0,110 C40,100 70,80 110,70 C150,60 180,85 220,65 C260,45 290,35 330,25 C370,15 400,30 440,20 C465,15 480,18 500,15 L500,140 L0,140 Z" fill="url(#ag1)" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d} style={{ color: '#9ca3af', fontSize: '11px', fontWeight: '500' }}>{d}</span>
              ))}
            </div>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>Calls by Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Urgent', value: 142, total: 847, color: '#ef4444' },
                { label: 'Follow Up', value: 198, total: 847, color: '#f59e0b' },
                { label: 'Captured', value: 312, total: 847, color: '#10b981' },
                { label: 'Handled', value: 195, total: 847, color: '#3b82f6' },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500' }}>{item.label}</span>
                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>{item.value + ' calls'}</span>
                  </div>
                  <div style={{ backgroundColor: '#f3f4f6', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: item.color, height: '100%', width: Math.round((item.value / item.total) * 100) + '%', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>Peak Call Hours</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100px' }}>
              {[{hour:'8AM',height:30},{hour:'9AM',height:55},{hour:'10AM',height:85},{hour:'11AM',height:70},{hour:'12PM',height:45},{hour:'1PM',height:50},{hour:'2PM',height:65},{hour:'3PM',height:90},{hour:'4PM',height:75},{hour:'5PM',height:40},{hour:'6PM',height:25},{hour:'7PM',height:35}].map((bar) => (
                <div key={bar.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '100%', backgroundColor: '#00d4aa', borderRadius: '4px 4px 0 0', height: bar.height + 'px', opacity: bar.height === 90 ? 1 : 0.5 }} />
                  <span style={{ color: '#9ca3af', fontSize: '9px', fontWeight: '500' }}>{bar.hour}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>Top Call Reasons</h3>
            {[
              { reason: 'Roof leak or storm damage', count: 284, color: '#ef4444' },
              { reason: 'New installation quote', count: 198, color: '#10b981' },
              { reason: 'No heat or AC issues', count: 167, color: '#f59e0b' },
              { reason: 'General inquiry', count: 143, color: '#3b82f6' },
              { reason: 'Emergency plumbing', count: 98, color: '#8b5cf6' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < 4 ? '1px solid #f9fafb' : 'none' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                <p style={{ color: '#374151', fontSize: '13px', margin: 0, flex: 1 }}>{item.reason}</p>
                <span style={{ color: '#0a1f13', fontSize: '13px', fontWeight: '600' }}>{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}