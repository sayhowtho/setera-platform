'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TRADE_OPTIONS } from '@/lib/trade-options'

type Rep = {
  id: string
  full_name: string | null
  email: string
  availability_schedule: Record<string, { enabled: boolean; start: string; end: string }> | null
}

type BookNowModalProps = {
  onClose: () => void
  onSuccess: (meetLink: string, businessName: string, date: string, time: string) => void
}

const DAY_MAP: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat'
}


function parseTimeMins(t: string): number {
  const parts = t.split(' ')
  const period = parts[1]
  const timeParts = parts[0].split(':')
  let hour = parseInt(timeParts[0])
  const min = parseInt(timeParts[1]) || 0
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + min
}

function minsToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return hour + ':' + m.toString().padStart(2, '0') + ' ' + period
}

function generateSlots(start: string, end: string): string[] {
  const slots: string[] = []
  const startMins = parseTimeMins(start)
  const endMins = parseTimeMins(end)
  for (let m = startMins; m + 30 <= endMins; m += 30) {
    slots.push(minsToTimeStr(m))
  }
  return slots
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff'
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: '700', color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px'
}

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '14px', color: '#0a1f13', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff',
  minHeight: '72px', resize: 'vertical'
}

export default function BookNowModal({ onClose, onSuccess }: BookNowModalProps) {
  const [step, setStep] = useState<'rep' | 'datetime' | 'info'>('rep')
  const [reps, setReps] = useState<Rep[]>([])
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [form, setForm] = useState({ business_name: '', contact_name: '', email: '', phone: '', trade: 'Roofing', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const stepList = ['rep', 'datetime', 'info']
  const stepLabels = ['Rep', 'Date & Time', 'Prospect']
  const currentIndex = stepList.indexOf(step)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email, availability_schedule').in('role', ['rep', 'vp_sales']).order('full_name').then(({ data }) => { if (data) setReps(data) })
  }, [])

  useEffect(() => {
    if (!selectedRep || !selectedDate) return
    const schedule = selectedRep.availability_schedule
    if (!schedule) { setAvailableSlots([]); return }
    const dayKey = DAY_MAP[new Date(selectedDate + 'T12:00:00').getDay()]
    const daySchedule = schedule[dayKey]
    if (!daySchedule || !daySchedule.enabled) { setAvailableSlots([]); return }
    setAvailableSlots(generateSlots(daySchedule.start, daySchedule.end))
    setSelectedSlot('')
    supabase.from('appointments').select('scheduled_time').eq('assigned_to', selectedRep.id).eq('scheduled_date', selectedDate).neq('status', 'Cancelled').then(({ data }) => {
      setBookedSlots(data ? data.map((a: any) => a.scheduled_time) : [])
    })
  }, [selectedRep, selectedDate])

  async function handleSubmit() {
    if (!selectedRep || !selectedDate || !selectedSlot || !form.business_name) return
    setLoading(true)
    setError('')
    let meetLink = ''
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const meetRes = await fetch('/api/create-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token ?? '') },
        body: JSON.stringify({ title: 'Setera Demo - ' + form.business_name, date: selectedDate, time: selectedSlot, attendeeName: form.contact_name || form.business_name, attendeeEmail: form.email, notes: form.notes })
      })
      const meetData = await meetRes.json()
      meetLink = meetData.meetLink || ''
    } catch (e) { console.error('Meet link failed:', e) }
    const { error: insertError } = await supabase.from('appointments').insert({
      business_name: form.business_name, contact_name: form.contact_name,
      contact_phone: form.phone, phone: form.phone, trade: form.trade,
      scheduled_date: selectedDate, scheduled_time: selectedSlot,
      assigned_to: selectedRep.id, setter_id: null, availability_id: null,
      status: 'Scheduled', source: 'admin_booked', notes: form.notes, meet_link: meetLink
    })
    if (insertError) { setError(insertError.message); setLoading(false); return }
    onSuccess(meetLink, form.business_name, selectedDate, selectedSlot)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        <div style={{ backgroundColor: '#0f2318', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: '17px', fontWeight: '800', margin: 0 }}>Book Now</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: '2px 0 0 0' }}>Admin booking</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', padding: '0' }}>x</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}>
          {stepList.map((s, i) => (
            <div key={s} style={{ flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: step === s ? '#0a1f13' : currentIndex > i ? '#00d4aa' : '#9ca3af', borderBottom: step === s ? '2px solid #0f2318' : '2px solid transparent' }}>
              {stepLabels[i]}
            </div>
          ))}
        </div>

        <div style={{ padding: '24px' }}>

          {step === 'rep' && (
            <div>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>Who is running this demo?</p>
              {reps.map(rep => {
                const isSelected = selectedRep !== null && selectedRep.id === rep.id
                const hasSchedule = rep.availability_schedule !== null && Object.values(rep.availability_schedule).some(d => d.enabled)
                return (
                  <div key={rep.id} onClick={() => setSelectedRep(rep)} style={{ padding: '14px 16px', borderRadius: '12px', border: '2px solid ' + (isSelected ? '#0f2318' : '#e5e7eb'), backgroundColor: isSelected ? '#0f2318' : '#fff', cursor: 'pointer', marginBottom: '10px' }}>
                    <p style={{ color: isSelected ? '#fff' : '#0a1f13', fontSize: '14px', fontWeight: '700', margin: '0 0 2px 0' }}>{rep.full_name || rep.email}</p>
                    <p style={{ color: isSelected ? 'rgba(255,255,255,0.4)' : '#9ca3af', fontSize: '12px', margin: 0 }}>{hasSchedule ? 'Schedule set' : 'No schedule yet'}</p>
                  </div>
                )
              })}
              <button onClick={() => setStep('datetime')} disabled={!selectedRep} style={{ width: '100%', marginTop: '8px', backgroundColor: '#0f2318', color: '#fff', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', border: 'none', cursor: 'pointer', opacity: selectedRep ? 1 : 0.4 }}>
                Continue
              </button>
            </div>
          )}

          {step === 'datetime' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={lbl}>Date</label>
                <input type="date" min={today} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={inp} />
              </div>
              {selectedDate && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={lbl}>Available Slots</label>
                  {availableSlots.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '13px', padding: '20px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '10px', margin: 0 }}>No slots available for this day</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', maxHeight: '200px', overflowY: 'scroll' }}>
                      {availableSlots.map(slot => {
                        const isBooked = bookedSlots.includes(slot)
                        const isSelected = selectedSlot === slot
                        return (
                          <button key={slot} disabled={isBooked} onClick={() => setSelectedSlot(slot)} style={{ padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', border: '2px solid ' + (isBooked ? '#f3f4f6' : isSelected ? '#0f2318' : '#e5e7eb'), backgroundColor: isBooked ? '#f9fafb' : isSelected ? '#0f2318' : '#fff', color: isBooked ? '#d1d5db' : isSelected ? '#fff' : '#374151', cursor: isBooked ? 'not-allowed' : 'pointer' }}>
                            {slot}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setStep('rep')} style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', backgroundColor: '#fff', color: '#6b7280' }}>Back</button>
                <button onClick={() => setStep('info')} disabled={!selectedDate || !selectedSlot} style={{ flex: 1, backgroundColor: '#0f2318', color: '#fff', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', border: 'none', cursor: 'pointer', opacity: selectedDate && selectedSlot ? 1 : 0.4 }}>Continue</button>
              </div>
            </div>
          )}

          {step === 'info' && (
            <div>
              <div style={{ backgroundColor: '#f0f4f1', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#374151', marginBottom: '16px' }}>
                <strong>{selectedRep ? (selectedRep.full_name || selectedRep.email) : ''}</strong> - {selectedDate} at {selectedSlot}
              </div>
              <div style={{ marginBottom: '14px' }}><label style={lbl}>Business Name *</label><input type="text" placeholder="Atlas Roofing" value={form.business_name} onChange={e => setForm(prev => ({ ...prev, business_name: e.target.value }))} style={inp} /></div>
              <div style={{ marginBottom: '14px' }}><label style={lbl}>Contact Name</label><input type="text" placeholder="John Smith" value={form.contact_name} onChange={e => setForm(prev => ({ ...prev, contact_name: e.target.value }))} style={inp} /></div>
              <div style={{ marginBottom: '14px' }}><label style={lbl}>Email</label><input type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} style={inp} /></div>
              <div style={{ marginBottom: '14px' }}><label style={lbl}>Phone</label><input type="tel" placeholder="(306) 555-0100" value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} style={inp} /></div>
              <div style={{ marginBottom: '14px' }}>
                <label style={lbl}>Trade</label>
                <select value={form.trade} onChange={e => setForm(prev => ({ ...prev, trade: e.target.value }))} style={inp}>
                  {TRADE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}><label style={lbl}>Notes</label><textarea placeholder="Anything relevant..." value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} style={textareaStyle} /></div>
              {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 12px 0' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setStep('datetime')} style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', backgroundColor: '#fff', color: '#6b7280' }}>Back</button>
                <button onClick={handleSubmit} disabled={loading || !form.business_name} style={{ flex: 2, backgroundColor: '#00d4aa', color: '#000', padding: '12px', borderRadius: '10px', fontSize: '14px', fontWeight: '800', border: 'none', cursor: 'pointer', opacity: loading || !form.business_name ? 0.5 : 1 }}>
                  {loading ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}