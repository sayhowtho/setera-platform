'use client';

// Generic bulk action bar for High Table lists. Shown while 1+ rows are
// selected; each list passes its own actions (Prospects: Allocate today —
// status change / DNC / delete can be added as more entries).

export type BulkAction = { label: string; onClick: () => void; tone?: 'primary' | 'danger' | 'default'; disabled?: boolean };

const TONE: Record<NonNullable<BulkAction['tone']>, React.CSSProperties> = {
  primary: { backgroundColor: '#00d4aa', color: '#0a1f13', border: 'none' },
  danger: { backgroundColor: '#ef4444', color: '#fff', border: 'none' },
  default: { backgroundColor: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' },
};

export default function BulkActionBar({ count, onClear, actions, note }: { count: number; onClear: () => void; actions: BulkAction[]; note?: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div style={{ position: 'sticky', top: '12px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#0f2318', borderRadius: '12px', padding: '12px 18px', marginBottom: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
      <p style={{ color: '#fff', fontSize: '14px', fontWeight: '700', margin: 0 }}>{count} selected</p>
      {note && <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>{note}</p>}
      <div style={{ flex: 1 }} />
      {actions.map(a => (
        <button key={a.label} onClick={a.onClick} disabled={a.disabled} style={{ ...TONE[a.tone || 'default'], padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: a.disabled ? 'not-allowed' : 'pointer', opacity: a.disabled ? 0.5 : 1 }}>{a.label}</button>
      ))}
      <button onClick={onClear} style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer', padding: '8px 4px' }}>Clear</button>
    </div>
  );
}
