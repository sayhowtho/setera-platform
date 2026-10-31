'use client';
import Sidebar from '@/app/components/sidebar';

export default function Settings() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f0f4f1', fontFamily: 'Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ marginLeft: '220px', flex: 1, padding: '32px 36px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#0a1f13', fontSize: '28px', fontWeight: '800', margin: '0 0 4px 0' }}>Settings</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>Manage your business profile and preferences</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>Business Profile</h3>
            {[
              { label: 'Business Name', value: 'Platinum Roofing Regina', type: 'text' },
              { label: 'Phone Number', value: '(306) 555-0100', type: 'text' },
              { label: 'Email', value: 'info@example.com', type: 'email' },
              { label: 'Address', value: '123 Main St, Regina SK', type: 'text' },
            ].map((field) => (
              <div key={field.label} style={{ marginBottom: '16px' }}>
                <p style={{ color: '#6b7280', fontSize: '12px', fontWeight: '500', margin: '0 0 6px 0' }}>{field.label}</p>
                <input type={field.type} defaultValue={field.value} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
              </div>
            ))}
            <div style={{ marginTop: '20px' }}>
              <div style={{ backgroundColor: '#0f2318', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-block' }}>Save Changes</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>On-Call Settings</h3>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 16px 0' }}>When an urgent call comes in during these hours, Setera will forward directly to the on-call number.</p>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ color: '#6b7280', fontSize: '12px', fontWeight: '500', margin: '0 0 6px 0' }}>On-Call Phone Number</p>
                <input type="text" defaultValue="(306) 555-0101" style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <p style={{ color: '#6b7280', fontSize: '12px', fontWeight: '500', margin: '0 0 6px 0' }}>From</p>
                  <input type="text" defaultValue="9:00 PM" style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
                </div>
                <div>
                  <p style={{ color: '#6b7280', fontSize: '12px', fontWeight: '500', margin: '0 0 6px 0' }}>To</p>
                  <input type="text" defaultValue="7:00 AM" style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
                </div>
              </div>
              <div style={{ backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <p style={{ color: '#ef4444', fontSize: '12px', fontWeight: '600', margin: '0 0 4px 0' }}>Urgent Call Types That Trigger Forwarding</p>
                <p style={{ color: '#374151', fontSize: '12px', margin: 0 }}>Active leaks, no heat with children, gas concerns, flooding, electrical emergencies</p>
              </div>
              <div style={{ backgroundColor: '#0f2318', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-block' }}>Save On-Call Settings</div>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>Notifications</h3>
              {[
                { label: 'SMS alerts for urgent calls', enabled: true },
                { label: 'SMS alerts for all new calls', enabled: false },
                { label: 'Daily summary email', enabled: true },
                { label: 'Weekly performance report', enabled: true },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f9fafb' }}>
                  <span style={{ color: '#374151', fontSize: '13px', fontWeight: '500' }}>{item.label}</span>
                  <div style={{ width: '44px', height: '24px', borderRadius: '12px', backgroundColor: item.enabled ? '#00d4aa' : '#e5e7eb', cursor: 'pointer', position: 'relative' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', left: item.enabled ? '22px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ color: '#0a1f13', margin: '0 0 20px 0', fontSize: '15px', fontWeight: '700' }}>AI Voice</h3>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 16px 0' }}>Choose the voice that answers your calls.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { name: 'George', desc: 'Male — Professional', selected: true },
                  { name: 'Betty', desc: 'Female — Warm English', selected: false },
                ].map((voice) => (
                  <div key={voice.name} style={{ border: '2px solid ' + (voice.selected ? '#00d4aa' : '#e5e7eb'), borderRadius: '10px', padding: '14px', cursor: 'pointer', backgroundColor: voice.selected ? '#f0fdf4' : '#fff' }}>
                    <p style={{ color: '#0a1f13', fontSize: '14px', fontWeight: '700', margin: '0 0 4px 0' }}>{voice.name}</p>
                    <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>{voice.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}