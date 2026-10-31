import { parseTranscript } from '@/lib/transcript';

// Full call transcript as Emily / caller bubbles — the client portal's
// Call Log view, shared so High Table's All Calls renders it identically.
// Renders nothing when there's no transcript unless emptyText is given.
export function CallTranscript({ transcript, otherLabel = 'Caller', emptyText }: { transcript: unknown; otherLabel?: string; emptyText?: string }) {
  const lines = parseTranscript(transcript);
  if (lines.length === 0) {
    return emptyText ? <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>{emptyText}</p> : null;
  }
  return (
    <>
      <p style={{ color: '#0a1f13', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>Full Transcript</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ padding: '10px 14px', backgroundColor: line.role === 'agent' ? '#f0f4f1' : '#fff', borderRadius: '8px', borderLeft: '3px solid ' + (line.role === 'agent' ? '#00d4aa' : '#e5e7eb') }}>
            <p style={{ color: line.role === 'agent' ? '#00d4aa' : '#9ca3af', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', margin: '0 0 4px 0' }}>{line.role === 'agent' ? 'Emily' : otherLabel}</p>
            <p style={{ color: '#374151', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{line.message || line.text || ''}</p>
          </div>
        ))}
      </div>
    </>
  );
}
