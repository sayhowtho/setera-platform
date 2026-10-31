'use client';
import { supabase } from '@/lib/supabase';

// Shared bits for AllocatePanel / PullBackPanel (High Table → Prospects).

export type AllocRep = {
  id: string; name: string; role: string; active: boolean;
  assigned: number; worked: number; untouched: number; untouchedAllocated: number; lastActivityAt: string | null;
};

export function timeAgo(iso: string | null): string {
  if (!iso) return 'no activity yet';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days < 60 ? days + 'd ago' : Math.floor(days / 30) + 'mo ago';
}

// "12 assigned · 5 untouched · 6 worked · last activity 2h ago"
export function RepStats({ rep }: { rep: AllocRep }) {
  return (
    <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>
      {rep.assigned} assigned · {rep.untouched} untouched · {rep.worked} worked · {rep.lastActivityAt ? 'last activity ' + timeAgo(rep.lastActivityAt) : 'no activity yet'}
    </p>
  );
}

export const ROLE_LABEL: Record<string, string> = { rep: 'Rep', vp_sales: 'VP Sales', setter: 'Setter' };

export async function authedJson<T>(url: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'Something went wrong (' + res.status + ')' };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: 'Network error — nothing was changed.' };
  }
}

export const overlay: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' };
export const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '14px', padding: '24px', width: '520px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
export const title: React.CSSProperties = { color: '#0a1f13', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 };
export const numInp: React.CSSProperties = { width: '84px', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none', fontFamily: 'Inter, sans-serif', textAlign: 'right' };
export const primaryBtn: React.CSSProperties = { backgroundColor: '#0f2318', color: '#fff', padding: '11px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', border: 'none' };
export const ghostBtn: React.CSSProperties = { backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '11px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' };
export const smallGhost: React.CSSProperties = { backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' };
export const errBox: React.CSSProperties = { backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 14px 0' };
