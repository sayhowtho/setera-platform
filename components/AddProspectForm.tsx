'use client';
import { useState } from 'react';
import { inferProvince } from '@/lib/canada-places';
import { TRADE_OPTIONS } from '@/lib/trade-options';

export type ProspectFormValue = {
  company_name: string;
  trade: string;
  province: string;
  city: string;
  website: string;
  phone: string;
  email: string;
  contact_name: string;
  contact_position: string;
  contact_phone: string;
  contact_email: string;
  source: string;
  status: string;
  tier: string;
  follow_up_date: string;
  notes: string;
};

export const EMPTY_PROSPECT_FORM: ProspectFormValue = {
  company_name: '', trade: 'Roofing', province: '', city: '', website: '',
  phone: '', email: '', contact_name: '', contact_position: '', contact_phone: '',
  contact_email: '', source: '', status: 'Not Contacted', tier: 'Starter',
  follow_up_date: '', notes: '',
};

export const STATUS_OPTIONS = ['Not Contacted', 'Attempted', 'Contacted', 'Follow Up Required', 'Interested', 'Demo Scheduled', 'Proposal Sent', 'Closed Won', 'Closed Lost', 'Future Opportunity'];
export const TIER_OPTIONS = ['Launch', 'Grow', 'Starter'];
const PROVINCES = ['SK', 'AB', 'BC', 'MB', 'ON', 'QC', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU'];

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };
const lbl: React.CSSProperties = { display: 'block', color: '#6b7280', fontSize: '12px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const sec: React.CSSProperties = { color: '#0a1f13', fontSize: '13px', fontWeight: '700', margin: '28px 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' };

type Props = {
  value: ProspectFormValue;
  onChange: (value: ProspectFormValue) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  loading?: boolean;
  submitLabel?: string;
  onCompanyNameBlur?: (name: string) => void;
  warning?: React.ReactNode;
  submitDisabled?: boolean;
};

export default function AddProspectForm({ value, onChange, onSubmit, onCancel, loading, submitLabel = 'Save Prospect', onCompanyNameBlur, warning, submitDisabled }: Props) {
  // Province starts blank (no SK default) and follows the city/phone while
  // it's blank or still the value we filled in; a province picked by hand is
  // never overwritten. See lib/canada-places.ts for when it's "certain".
  const [autoProvince, setAutoProvince] = useState('');
  function set<K extends keyof ProspectFormValue>(key: K, v: ProspectFormValue[K]) {
    const next = { ...value, [key]: v };
    if (key === 'city' || key === 'phone' || key === 'contact_phone') {
      if (!value.province || value.province === autoProvince) {
        const inferred = inferProvince(next.city, [next.phone, next.contact_phone]) ?? '';
        next.province = inferred;
        setAutoProvince(inferred);
      }
    }
    onChange(next);
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: '800px' }}>
      {warning}
      <p style={{ ...sec, marginTop: 0 }}>Company Info</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '4px' }}>
        <div><label style={lbl}>Company Name *</label><input style={inp} placeholder="Atlas Roofing Ltd." value={value.company_name} onChange={e => set('company_name', e.target.value)} onBlur={e => onCompanyNameBlur?.(e.target.value)} /></div>
        <div><label style={lbl}>Trade</label><select style={inp} value={value.trade} onChange={e => set('trade', e.target.value)}>{TRADE_OPTIONS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label style={lbl}>Province</label><select style={inp} value={value.province} onChange={e => set('province', e.target.value)}><option value="">Select…</option>{PROVINCES.map(p => <option key={p}>{p}</option>)}</select>{value.province && value.province === autoProvince && <p style={{ color: '#9ca3af', fontSize: '11px', margin: '4px 0 0 0' }}>Filled in from the city</p>}</div>
        <div><label style={lbl}>City</label><input style={inp} placeholder="Saskatoon" value={value.city} onChange={e => set('city', e.target.value)} /></div>
        <div><label style={lbl}>Website</label><input style={inp} placeholder="www.atlasroofing.ca" value={value.website} onChange={e => set('website', e.target.value)} /></div>
        <div><label style={lbl}>Phone</label><input style={inp} placeholder="Phone number" value={value.phone} onChange={e => set('phone', e.target.value)} /></div>
        <div><label style={lbl}>Business Email</label><input style={inp} placeholder="info@example.com" value={value.email} onChange={e => set('email', e.target.value)} /></div>
      </div>

      <p style={sec}>Contact Info</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '4px' }}>
        <div><label style={lbl}>Contact Name</label><input style={inp} placeholder="John Smith" value={value.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
        <div><label style={lbl}>Position</label><input style={inp} placeholder="Owner, GM..." value={value.contact_position} onChange={e => set('contact_position', e.target.value)} /></div>
        <div><label style={lbl}>Direct Phone</label><input style={inp} placeholder="(306) 555-0101" value={value.contact_phone} onChange={e => set('contact_phone', e.target.value)} /></div>
        <div><label style={lbl}>Direct Email</label><input style={inp} placeholder="john@example.com" value={value.contact_email} onChange={e => set('contact_email', e.target.value)} /></div>
      </div>

      <p style={sec}>Pipeline Info</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div><label style={lbl}>Source</label><input style={inp} placeholder="e.g. Roofing Canada" value={value.source} onChange={e => set('source', e.target.value)} /></div>
        <div><label style={lbl}>Status</label><select style={inp} value={value.status} onChange={e => set('status', e.target.value)}>{STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
        <div><label style={lbl}>Estimated Tier</label><select style={inp} value={value.tier || 'Starter'} onChange={e => set('tier', e.target.value)}>{TIER_OPTIONS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label style={lbl}>Follow Up Date</label><input type="date" style={inp} value={value.follow_up_date} onChange={e => set('follow_up_date', e.target.value)} /></div>
      </div>

      <div style={{ marginBottom: '28px' }}>
        <label style={lbl}>Notes</label>
        <textarea placeholder="Anything relevant..." value={value.notes} onChange={e => set('notes', e.target.value)} style={{ width: '100%', minHeight: '100px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onSubmit} disabled={loading || submitDisabled || !value.company_name} style={{ backgroundColor: '#0f2318', color: '#fff', padding: '13px 36px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none', opacity: loading || submitDisabled || !value.company_name ? 0.6 : 1 }}>
          {loading ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={{ backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '13px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
        )}
      </div>
    </div>
  );
}
