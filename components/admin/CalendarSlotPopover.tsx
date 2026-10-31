'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { slotState, slotLabel, sortSlots, planRangeBlock, blockSlots, unblockSlot, updateBlockNote, type CalendarSlot } from '@/lib/slots';
import { authedJson } from './allocation-shared';

// High Table → Calendar: the popover for one slot (Alex, 2026-10-03).
//   Open    → note + Mark busy, or "Block through…" to block a range
//   Blocked → note, Edit note, Unblock
//   Booked  → demo details, invite status, Cancel demo (/api/admin/cancel-demo)
// Shift-click opens it straight into range mode (rangeFromId → this slot).
// States and the race-safe updates live in lib/slots.ts (migrations/031).

type Appt = { id: string; business_name: string | null; contact_name: string | null; trade: string | null; phone: string | null; contact_phone: string | null; scheduled_date: string; scheduled_time: string; meet_link: string | null };
type Invite = { hasMeetLink: boolean; eventFound: boolean; inviteEmails: string[]; lookupError?: string };
export type PopoverResult = { message: string; warning?: boolean };

const lbl: React.CSSProperties = { color: '#9ca3af', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px 0' };
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#0a1f13', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' };
const primary: React.CSSProperties = { backgroundColor: '#0f2318', color: '#fff', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: 'none' };
const ghost: React.CSSProperties = { backgroundColor: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' };
const danger: React.CSSProperties = { backgroundColor: '#fee2e2', color: '#991b1b', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1px solid #fca5a5' };
const warnBox: React.CSSProperties = { backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '8px 10px', color: '#92400e', fontSize: '12px', fontWeight: 600, margin: '0 0 10px 0' };
const errBox: React.CSSProperties = { backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', padding: '8px 10px', color: '#991b1b', fontSize: '12px', fontWeight: 600, margin: '0 0 10px 0' };
const row: React.CSSProperties = { display: 'flex', gap: '8px', flexWrap: 'wrap' };

export default function CalendarSlotPopover({ slot, allSlots, rangeFromId, apptForSlot, alignRight, onRangeChange, onClose, onDone, onOpenDetails }: {
  slot: CalendarSlot;
  allSlots: CalendarSlot[];
  rangeFromId?: string;
  apptForSlot: (slotId: string) => Appt | undefined;
  alignRight: boolean;
  onRangeChange: (slotIds: string[]) => void;
  onClose: () => void;
  onDone: (result: PopoverResult) => void;
  onOpenDetails: (appt: Appt) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const state = slotState(slot);
  const appt = state === 'booked' ? apptForSlot(slot.id) : undefined;
  const [rangeOther, setRangeOther] = useState<string | null>(rangeFromId ?? null);
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(slot.blocked_note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const plan = rangeOther ? planRangeBlock(allSlots, rangeOther, slot.id) : null;
  const planKey = plan ? plan.range.map(s => s.id).join(',') : '';
  useEffect(() => { onRangeChange(planKey ? planKey.split(',') : []); }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape or a click outside (clicks on other slots are handled by the grid).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest('[data-slot-id]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  async function markBusy(ids: string[], skippedNow: string[] = []) {
    setBusy(true); setError('');
    const { blocked, error: err } = await blockSlots(supabase, ids, note);
    setBusy(false);
    if (err) { setError('Could not block: ' + err); return; }
    const raced = allSlots.filter(s => ids.includes(s.id) && !blocked.includes(s.id)).map(s => slotLabel(s) + ' (just taken)');
    const skipped = [...skippedNow, ...raced];
    if (ids.length === 1 && blocked.length === 0) { setError('That slot was just booked or blocked by someone else.'); return; }
    onDone({
      message: 'Marked ' + blocked.length + ' slot' + (blocked.length === 1 ? '' : 's') + ' busy.' + (skipped.length ? ' Skipped: ' + skipped.join(', ') + '.' : ''),
      warning: skipped.length > 0,
    });
  }

  async function unblock() {
    setBusy(true); setError('');
    const ok = await unblockSlot(supabase, slot.id);
    setBusy(false);
    if (!ok) { setError('Could not unblock this slot.'); return; }
    onDone({ message: slotLabel(slot) + ' is open again.' });
  }

  async function saveNote() {
    setBusy(true); setError('');
    const ok = await updateBlockNote(supabase, slot.id, noteDraft);
    setBusy(false);
    if (!ok) { setError('Could not save the note.'); return; }
    onDone({ message: 'Note saved.' });
  }

  const sortedAll = sortSlots(allSlots);
  const later = sortedAll.slice(sortedAll.findIndex(s => s.id === slot.id) + 1); // "Block through…" end choices
  const pos: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 6px)', [alignRight ? 'right' : 'left']: 0, zIndex: 60, width: '300px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.15)', padding: '16px', cursor: 'default', textAlign: 'left' };
  const phone = appt?.contact_phone || appt?.phone || '';

  return (
    <div ref={ref} style={pos} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <p style={{ ...lbl, margin: 0 }}>{plan ? 'Block range' : slotLabel(slot)}</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
      </div>
      {error && <p style={errBox}>{error}</p>}

      {plan ? (
        <>
          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0' }}>{slotLabel(plan.range[0])} → {slotLabel(plan.range[plan.range.length - 1])}</p>
          <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 10px 0' }}>{plan.toBlock.length} open slot{plan.toBlock.length === 1 ? '' : 's'} will be marked busy.</p>
          {plan.skippedBooked.length > 0 && (
            <div style={warnBox}>Skipping {plan.skippedBooked.length} booked: {plan.skippedBooked.map(s => slotLabel(s) + (apptForSlot(s.id)?.business_name ? ' (' + apptForSlot(s.id)!.business_name + ')' : '')).join(', ')}</div>
          )}
          {plan.alreadyBlocked.length > 0 && <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 10px 0' }}>{plan.alreadyBlocked.length} already busy, left as is.</p>}
          <p style={lbl}>Note (optional)</p>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. client call" style={{ ...inp, marginBottom: '12px' }} autoFocus />
          <div style={row}>
            <button disabled={busy || plan.toBlock.length === 0} onClick={() => markBusy(plan.toBlock.map(s => s.id), plan.skippedBooked.map(s => slotLabel(s) + ' (booked)'))} style={{ ...primary, opacity: busy || plan.toBlock.length === 0 ? 0.6 : 1 }}>
              {busy ? 'Saving...' : 'Mark ' + plan.toBlock.length + ' busy'}
            </button>
            <button onClick={() => setRangeOther(null)} style={ghost}>Back</button>
          </div>
        </>
      ) : state === 'open' ? (
        <>
          <p style={lbl}>Note (optional)</p>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. dentist" style={{ ...inp, marginBottom: '12px' }} autoFocus onKeyDown={e => { if (e.key === 'Enter' && !busy) markBusy([slot.id]); }} />
          <div style={{ ...row, marginBottom: '12px' }}>
            <button disabled={busy} onClick={() => markBusy([slot.id])} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving...' : 'Mark busy'}</button>
          </div>
          <p style={lbl}>Or block through…</p>
          <select value="" onChange={e => e.target.value && setRangeOther(e.target.value)} style={inp}>
            <option value="">Pick an end slot</option>
            {later.map(s => <option key={s.id} value={s.id}>{slotLabel(s)}</option>)}
          </select>
          <p style={{ color: '#9ca3af', fontSize: '11px', margin: '8px 0 0 0' }}>Tip: shift-click another slot to block everything in between.</p>
        </>
      ) : state === 'blocked' ? (
        <>
          <p style={lbl}>Busy</p>
          {editingNote ? (
            <>
              <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="e.g. dentist" style={{ ...inp, marginBottom: '12px' }} autoFocus onKeyDown={e => { if (e.key === 'Enter' && !busy) saveNote(); }} />
              <div style={row}>
                <button disabled={busy} onClick={saveNote} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving...' : 'Save note'}</button>
                <button onClick={() => { setEditingNote(false); setNoteDraft(slot.blocked_note || ''); }} style={ghost}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: slot.blocked_note ? '#0a1f13' : '#9ca3af', fontSize: '14px', fontWeight: 600, margin: '0 0 14px 0', wordBreak: 'break-word' }}>{slot.blocked_note || 'No note'}</p>
              <div style={row}>
                <button onClick={() => setEditingNote(true)} style={ghost}>Edit note</button>
                <button disabled={busy} onClick={unblock} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving...' : 'Unblock'}</button>
              </div>
            </>
          )}
        </>
      ) : !appt ? (
        <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Booked, but no live appointment is linked to this slot.</p>
      ) : (
        <>
          <p style={{ color: '#0a1f13', fontSize: '15px', fontWeight: 800, margin: '0 0 4px 0' }}>{appt.business_name}</p>
          <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 2px 0' }}>{[appt.contact_name, appt.trade].filter(Boolean).join(' · ')}</p>
          <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 2px 0' }}>{phone ? <a href={'tel:' + phone} style={{ color: '#0f2318', fontWeight: 600 }}>{phone}</a> : <span style={{ color: '#9ca3af' }}>No phone on file</span>}</p>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: '0 0 10px 0' }}>{slotLabel({ date: appt.scheduled_date, time_slot: appt.scheduled_time })}</p>
          <CancelDemo appt={appt} phone={phone} onDone={onDone} extra={<button onClick={() => onOpenDetails(appt)} style={ghost}>Full details</button>} />
        </>
      )}
    </div>
  );
}

// Invite check + confirm + "Notify the prospect" + /api/admin/cancel-demo.
// Shared by the Calendar popover, High Table's Appointment Detail panel and
// the setter / rep portals, so every cancel deletes the Google event (no ghost
// events). startConfirming + onKeep: the portals open it straight at the
// confirm step and close it on "Keep it". showPhone: portals' rows may not
// show the phone already.
export function CancelDemo({ appt, phone, onDone, extra, wide, startConfirming, onKeep, showPhone }: {
  appt: Pick<Appt, 'id' | 'meet_link'>; phone: string; onDone: (result: PopoverResult) => void; extra?: React.ReactNode; wide?: boolean;
  startConfirming?: boolean; onKeep?: () => void; showPhone?: boolean;
}) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [confirming, setConfirming] = useState(!!startConfirming);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [eventMissing, setEventMissing] = useState(false);

  useEffect(() => {
    let live = true;
    authedJson<Invite>('/api/admin/cancel-demo?appointmentId=' + encodeURIComponent(appt.id)).then(r => {
      if (!live) return;
      setInvite(r.ok ? r.data : { hasMeetLink: !!appt.meet_link, eventFound: false, inviteEmails: [], lookupError: r.error });
    });
    return () => { live = false; };
  }, [appt.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel(force: boolean) {
    setBusy(true); setError(''); setEventMissing(false);
    const res = await fetchCancel(appt.id, notify, force);
    setBusy(false);
    if (!res.ok) { setError(res.error); setEventMissing(res.code === 'event_not_found'); return; }
    const d = res.data;
    const who = d.notifiedEmails.length ? ' Cancellation emailed to ' + d.notifiedEmails.join(', ') + '.' : notify ? ' Nobody was on the invite, so nobody was emailed. Contact them yourself.' : ' The prospect was not notified.';
    onDone({ message: 'Demo cancelled' + (d.googleEventDeleted ? ' and removed from Google Calendar' : '') + '; the slot is open again.' + who + (d.warnings.length ? ' ' + d.warnings.join(' ') : ''), warning: d.warnings.length > 0 || (notify && d.notifiedEmails.length === 0) });
  }

  const btn = (style: React.CSSProperties): React.CSSProperties => wide ? { ...style, flex: 1, padding: '11px', fontSize: '14px' } : style;
  return (
    <>
      {error && <p style={errBox}>{error}</p>}
      {showPhone && <p style={{ color: '#374151', fontSize: '13px', margin: '0 0 6px 0' }}>Phone: {phone ? <a href={'tel:' + phone} style={{ color: '#0f2318', fontWeight: 600 }}>{phone}</a> : <span style={{ color: '#9ca3af' }}>none on file</span>}</p>}
      {!invite ? (
        <p style={{ color: '#9ca3af', fontSize: '12px', margin: '0 0 10px 0' }}>Checking the Google invite…</p>
      ) : invite.inviteEmails.length > 0 ? (
        <p style={{ color: '#065f46', fontSize: '12px', fontWeight: 600, margin: '0 0 10px 0' }}>Invite email: {invite.inviteEmails.join(', ')}</p>
      ) : (
        <div style={warnBox}>
          {invite.lookupError ? 'Could not check the Google invite (' + invite.lookupError + '). ' : !invite.hasMeetLink ? 'No Google event for this demo. ' : !invite.eventFound ? 'No Google event found for this demo. ' : 'No email on the invite. '}
          They won&apos;t get a cancellation email. Contact them yourself{phone ? ' at ' + phone : ''}.
        </div>
      )}
      {!confirming ? (
        <div style={row}>
          <button onClick={() => setConfirming(true)} style={btn(danger)}>Cancel demo</button>
          {extra}
        </div>
      ) : (
        <>
          <p style={{ color: '#0a1f13', fontSize: '13px', fontWeight: 700, margin: '4px 0 8px 0' }}>Cancel this demo? The Google event is deleted and the slot opens up.</p>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', color: '#374151', fontSize: '13px', margin: '0 0 12px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} style={{ marginTop: '2px' }} />
            <span>Notify the prospect<br /><span style={{ color: '#9ca3af', fontSize: '11px' }}>Google cancellation email, with a link to rebook at heysetera.com/demo</span></span>
          </label>
          <div style={row}>
            <button disabled={busy} onClick={() => cancel(eventMissing)} style={{ ...btn(danger), opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Cancelling...' : eventMissing ? 'Cancel in Setera anyway' : 'Yes, cancel demo'}
            </button>
            <button onClick={() => { setError(''); setEventMissing(false); if (onKeep) onKeep(); else setConfirming(false); }} style={btn(ghost)}>Keep it</button>
          </div>
        </>
      )}
    </>
  );
}

type CancelOk = { success: true; googleEventDeleted: boolean; notifiedEmails: string[]; warnings: string[] };
async function fetchCancel(appointmentId: string, notify: boolean, force: boolean): Promise<{ ok: true; data: CancelOk } | { ok: false; error: string; code?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch('/api/admin/cancel-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
      body: JSON.stringify({ appointmentId, notify, force }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'Something went wrong (' + res.status + ')', code: body.code };
    return { ok: true, data: body as CancelOk };
  } catch (e) {
    return { ok: false, error: 'Could not reach the server: ' + ((e as Error)?.message || 'network error') + '. Check whether the demo was cancelled before trying again.' };
  }
}
