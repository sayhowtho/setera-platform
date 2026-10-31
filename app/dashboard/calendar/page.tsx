'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/app/components/sidebar';
import { supabase } from '@/lib/supabase';

type Appointment = {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string | null;
  service_type: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: string;
  source: string;
  created_at: string;
};

const SERVICE_TYPES = ['Estimate','Inspection','Repair','Installation','Service Call','Follow Up','Other'];
const STATUS_OPTIONS = ['confirmed','pending','cancelled','completed'];

function formatTime(time: string) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return display + ':' + m + ' ' + ampm;
}

function getStatusStyle(status: string) {
  const map: Record<string, {bg: string; color: string}> = {
    confirmed: {bg:'#d1fae5',color:'#065f46'},
    pending: {bg:'#fef3c7',color:'#92400e'},
    cancelled: {bg:'#fee2e2',color:'#991b1b'},
    completed: {bg:'#f3f4f6',color:'#6b7280'},
  };
  return map[status] || {bg:'#f3f4f6',color:'#6b7280'};
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CalendarPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month'|'week'|'list'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', date: '', start_time: '09:00', end_time: '10:00',
    service_type: 'Estimate', address: '', contact_name: '',
    contact_phone: '', notes: '', status: 'confirmed',
  });

  useEffect(() => {
    fetchAppointments();
  }, []);

  async function fetchAppointments() {
    const { data } = await supabase.from('appointments').select('*').order('date', {ascending: true}).order('start_time', {ascending: true});
    if (data) setAppointments(data);
    setLoading(false);
  }

  async function saveAppointment() {
    if (!form.title || !form.date || !form.start_time) return;
    setActionLoading(true);
    const { error } = await supabase.from('appointments').insert({
      title: form.title, date: form.date, start_time: form.start_time,
      end_time: form.end_time || null, service_type: form.service_type,
      address: form.address || null, contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null, notes: form.notes || null,
      status: form.status, source: 'manual',
    });
    if (!error) {
      setForm({ title:'', date:'', start_time:'09:00', end_time:'10:00', service_type:'Estimate', address:'', contact_name:'', contact_phone:'', notes:'', status:'confirmed' });
      setShowForm(false);
      setSelectedDate(null);
      fetchAppointments();
    }
    setActionLoading(false);
  }

  async function updateAppointmentStatus(id: string, status: string) {
    await supabase.from('appointments').update({status}).eq('id', id);
    setAppointments(prev => prev.map(a => a.id === id ? {...a, status} : a));
    if (selectedAppointment?.id === id) setSelectedAppointment(prev => prev ? {...prev, status} : null);
  }

  async function deleteAppointment(id: string) {
    await supabase.from('appointments').delete().eq('id', id);
    setAppointments(prev => prev.filter(a => a.id !== id));
    setSelectedAppointment(null);
  }

  function getAppointmentsForDate(dateStr: string) {
    return appointments.filter(a => a.date === dateStr);
  }

  function formatDateStr(date: Date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function getMonthGrid() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function getWeekDates() {
    const start = new Date(currentDate);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    return Array.from({length: 7}, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }

  const today = formatDateStr(new Date());
  const inp: React.CSSProperties = {width:'100%',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',boxSizing:'border-box',fontFamily:'Inter, sans-serif'};
  const lbl: React.CSSProperties = {display:'block',color:'#6b7280',fontSize:'12px',fontWeight:'600',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.05em'};

  const upcomingAppointments = appointments.filter(a => a.date >= today && a.status !== 'cancelled').slice(0, 50);

  return (
    <div style={{display:'flex',minHeight:'100vh',backgroundColor:'#f0f4f1',fontFamily:'Inter, sans-serif'}}>
      <Sidebar />
      <div style={{marginLeft:'220px',flex:1,padding:'32px 36px'}}>

        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'28px'}}>
          <div>
            <h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Calendar</h1>
            <p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{appointments.filter(a=>a.date>=today&&a.status!=='cancelled').length} upcoming appointments</p>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
            <div style={{display:'flex',border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
              {(['month','week','list'] as const).map(v=>(
                <button key={v} onClick={()=>setView(v)} style={{padding:'8px 16px',fontSize:'13px',fontWeight:'600',cursor:'pointer',border:'none',backgroundColor:view===v?'#0f2318':'#fff',color:view===v?'#00d4aa':'#6b7280',borderLeft:v!=='month'?'1px solid #e5e7eb':'none',textTransform:'capitalize'}}>{v}</button>
              ))}
            </div>
            <button onClick={()=>{setShowForm(true);setForm(prev=>({...prev,date:today}));}} style={{backgroundColor:'#0f2318',color:'#fff',padding:'10px 20px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>+ Add Appointment</button>
          </div>
        </div>

        {/* ADD FORM MODAL */}
        {showForm && (
          <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
            <div style={{backgroundColor:'#fff',borderRadius:'16px',padding:'32px',width:'100%',maxWidth:'560px',maxHeight:'90vh',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
                <h2 style={{color:'#0a1f13',fontSize:'20px',fontWeight:'800',margin:0}}>New Appointment</h2>
                <button onClick={()=>setShowForm(false)} style={{backgroundColor:'transparent',border:'none',fontSize:'20px',cursor:'pointer',color:'#6b7280'}}>×</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                <div style={{gridColumn:'1/-1'}}><label style={lbl}>Title *</label><input style={inp} placeholder="Roof inspection - Johnson" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
                <div><label style={lbl}>Service Type</label><select style={{...inp,backgroundColor:'#fff'}} value={form.service_type} onChange={e=>setForm({...form,service_type:e.target.value})}>{SERVICE_TYPES.map(s=><option key={s}>{s}</option>)}</select></div>
                <div><label style={lbl}>Status</label><select style={{...inp,backgroundColor:'#fff'}} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{STATUS_OPTIONS.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></div>
                <div><label style={lbl}>Date *</label><input type="date" style={inp} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}><div><label style={lbl}>Start</label><input type="time" style={inp} value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/></div><div><label style={lbl}>End</label><input type="time" style={inp} value={form.end_time||''} onChange={e=>setForm({...form,end_time:e.target.value})}/></div></div>
                <div style={{gridColumn:'1/-1'}}><label style={lbl}>Address</label><input style={inp} placeholder="123 Main St, Regina SK" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></div>
                <div><label style={lbl}>Contact Name</label><input style={inp} placeholder="John Smith" value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></div>
                <div><label style={lbl}>Contact Phone</label><input style={inp} placeholder="(306) 555-0100" value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})}/></div>
                <div style={{gridColumn:'1/-1'}}><label style={lbl}>Notes</label><textarea style={{...inp,minHeight:'80px',resize:'vertical'} as React.CSSProperties} placeholder="Any additional details..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
              </div>
              <div style={{display:'flex',gap:'12px'}}>
                <button onClick={saveAppointment} disabled={actionLoading||!form.title||!form.date} style={{backgroundColor:'#0f2318',color:'#fff',padding:'12px 32px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none',opacity:actionLoading||!form.title||!form.date?0.6:1}}>{actionLoading?'Saving...':'Save Appointment'}</button>
                <button onClick={()=>setShowForm(false)} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#6b7280',padding:'12px 20px',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* APPOINTMENT DETAIL MODAL */}
        {selectedAppointment && (
          <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
            <div style={{backgroundColor:'#fff',borderRadius:'16px',padding:'32px',width:'100%',maxWidth:'480px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px'}}>
                <div>
                  <h2 style={{color:'#0a1f13',fontSize:'20px',fontWeight:'800',margin:'0 0 4px 0'}}>{selectedAppointment.title}</h2>
                  <span style={{backgroundColor:getStatusStyle(selectedAppointment.status).bg,color:getStatusStyle(selectedAppointment.status).color,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'700'}}>{selectedAppointment.status.charAt(0).toUpperCase()+selectedAppointment.status.slice(1)}</span>
                </div>
                <button onClick={()=>setSelectedAppointment(null)} style={{backgroundColor:'transparent',border:'none',fontSize:'20px',cursor:'pointer',color:'#6b7280'}}>×</button>
              </div>
              {([['Date', new Date(selectedAppointment.date+'T00:00:00').toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric',year:'numeric'})],['Time', formatTime(selectedAppointment.start_time)+(selectedAppointment.end_time?' - '+formatTime(selectedAppointment.end_time):'')],['Service Type', selectedAppointment.service_type],['Address', selectedAppointment.address],['Contact', selectedAppointment.contact_name],['Phone', selectedAppointment.contact_phone],['Notes', selectedAppointment.notes],['Source', selectedAppointment.source.charAt(0).toUpperCase()+selectedAppointment.source.slice(1)]] as [string,string|null][]).filter(([,v])=>v).map(([label,value])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f9fafb'}}>
                  <span style={{color:'#9ca3af',fontSize:'13px'}}>{label}</span>
                  <span style={{color:'#374151',fontSize:'13px',fontWeight:'500',textAlign:'right',maxWidth:'60%'}}>{value}</span>
                </div>
              ))}
              <div style={{display:'flex',gap:'8px',marginTop:'20px',flexWrap:'wrap' as const}}>
                {selectedAppointment.status==='pending'&&<button onClick={()=>updateAppointmentStatus(selectedAppointment.id,'confirmed')} style={{backgroundColor:'#d1fae5',color:'#065f46',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none'}}>Confirm</button>}
                {selectedAppointment.status==='confirmed'&&<button onClick={()=>updateAppointmentStatus(selectedAppointment.id,'completed')} style={{backgroundColor:'#dbeafe',color:'#1e40af',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none'}}>Mark Complete</button>}
                {selectedAppointment.status!=='cancelled'&&<button onClick={()=>updateAppointmentStatus(selectedAppointment.id,'cancelled')} style={{backgroundColor:'#fef3c7',color:'#92400e',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none'}}>Cancel</button>}
                <button onClick={()=>deleteAppointment(selectedAppointment.id)} style={{backgroundColor:'#fee2e2',color:'#991b1b',padding:'8px 16px',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',border:'none'}}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{color:'#6b7280'}}>Loading calendar...</p>
        ) : (
          <>
            {/* MONTH VIEW */}
            {view==='month'&&(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px',borderBottom:'1px solid #f3f4f6'}}>
                  <button onClick={()=>{const d=new Date(currentDate);d.setMonth(d.getMonth()-1);setCurrentDate(d);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'6px 14px',borderRadius:'8px',cursor:'pointer',fontSize:'14px',fontWeight:'600'}}>{'<'}</button>
                  <h2 style={{color:'#0a1f13',fontSize:'18px',fontWeight:'800',margin:0}}>{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                  <button onClick={()=>{const d=new Date(currentDate);d.setMonth(d.getMonth()+1);setCurrentDate(d);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'6px 14px',borderRadius:'8px',cursor:'pointer',fontSize:'14px',fontWeight:'600'}}>{'>'}</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',borderBottom:'1px solid #f3f4f6'}}>
                  {DAYS.map(d=><div key={d} style={{padding:'12px 0',textAlign:'center',color:'#9ca3af',fontSize:'12px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em'}}>{d}</div>)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)'}}>
                  {getMonthGrid().map((day, i)=>{
                    if (!day) return <div key={i} style={{minHeight:'80px',borderRight:'1px solid #f9fafb',borderBottom:'1px solid #f9fafb',backgroundColor:'#fafafa'}}/>;
                    const dateStr = currentDate.getFullYear()+'-'+String(currentDate.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
                    const dayAppts = getAppointmentsForDate(dateStr);
                    const isToday = dateStr === today;
                    return (
                      <div key={i} onClick={()=>{setSelectedDate(dateStr);setShowForm(true);setForm(prev=>({...prev,date:dateStr}));}} style={{minHeight:'80px',borderRight:'1px solid #f9fafb',borderBottom:'1px solid #f9fafb',padding:'8px',cursor:'pointer',backgroundColor:isToday?'#f0fdf4':'#fff'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor=isToday?'#dcfce7':'#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor=isToday?'#f0fdf4':'#fff')}>
                        <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'50%',backgroundColor:isToday?'#0f2318':'transparent',color:isToday?'#00d4aa':'#374151',fontSize:'13px',fontWeight:isToday?'800':'500',marginBottom:'4px'}}>{day}</span>
                        {dayAppts.slice(0,2).map(a=>(
                          <div key={a.id} onClick={e=>{e.stopPropagation();setSelectedAppointment(a);}} style={{backgroundColor:getStatusStyle(a.status).bg,color:getStatusStyle(a.status).color,fontSize:'10px',fontWeight:'600',padding:'2px 6px',borderRadius:'4px',marginBottom:'2px',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',cursor:'pointer'}}>{formatTime(a.start_time)} {a.title}</div>
                        ))}
                        {dayAppts.length>2&&<div style={{color:'#9ca3af',fontSize:'10px',fontWeight:'600'}}>+{dayAppts.length-2} more</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW */}
            {view==='week'&&(
              <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px',borderBottom:'1px solid #f3f4f6'}}>
                  <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()-7);setCurrentDate(d);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'6px 14px',borderRadius:'8px',cursor:'pointer',fontSize:'14px',fontWeight:'600'}}>{'<'}</button>
                  <h2 style={{color:'#0a1f13',fontSize:'18px',fontWeight:'800',margin:0}}>
                    {(()=>{const w=getWeekDates();return MONTHS[w[0].getMonth()]+' '+w[0].getDate()+' – '+w[6].getDate()+', '+w[6].getFullYear();})()}
                  </h2>
                  <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()+7);setCurrentDate(d);}} style={{backgroundColor:'transparent',border:'1px solid #e5e7eb',color:'#374151',padding:'6px 14px',borderRadius:'8px',cursor:'pointer',fontSize:'14px',fontWeight:'600'}}>{'>'}</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'60px repeat(7, 1fr)'}}>
                  <div style={{borderRight:'1px solid #f3f4f6'}}/>
                  {getWeekDates().map((date,i)=>{
                    const ds = formatDateStr(date);
                    const isToday = ds === today;
                    return (
                      <div key={i} style={{padding:'12px 8px',textAlign:'center',borderRight:'1px solid #f9fafb',borderBottom:'1px solid #f3f4f6',backgroundColor:isToday?'#f0fdf4':'#fff'}}>
                        <p style={{color:'#9ca3af',fontSize:'11px',fontWeight:'700',margin:'0 0 4px 0',textTransform:'uppercase'}}>{DAYS[i]}</p>
                        <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'50%',backgroundColor:isToday?'#0f2318':'transparent',color:isToday?'#00d4aa':'#374151',fontSize:'14px',fontWeight:'800'}}>{date.getDate()}</span>
                      </div>
                    );
                  })}
                  {Array.from({length:13},(_,hi)=>{
                    const hour = hi + 7;
                    const timeLabel = (hour>12?hour-12:hour===0?12:hour)+':00 '+(hour>=12?'PM':'AM');
                    return (
                      <>
                        <div key={'time-'+hi} style={{padding:'12px 8px',borderRight:'1px solid #f3f4f6',borderBottom:'1px solid #f9fafb',textAlign:'right'}}>
                          <span style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600'}}>{timeLabel}</span>
                        </div>
                        {getWeekDates().map((date,di)=>{
                          const ds = formatDateStr(date);
                          const slotAppts = getAppointmentsForDate(ds).filter(a=>{
                            const startHour = parseInt(a.start_time.split(':')[0]);
                            return startHour === hour;
                          });
                          return (
                            <div key={'slot-'+hi+'-'+di} style={{minHeight:'52px',borderRight:'1px solid #f9fafb',borderBottom:'1px solid #f9fafb',padding:'4px',backgroundColor:formatDateStr(date)===today?'#f0fdf4':'#fff'}}>
                              {slotAppts.map(a=>(
                                <div key={a.id} onClick={()=>setSelectedAppointment(a)} style={{backgroundColor:getStatusStyle(a.status).bg,color:getStatusStyle(a.status).color,fontSize:'11px',fontWeight:'600',padding:'4px 6px',borderRadius:'6px',marginBottom:'2px',cursor:'pointer',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{a.title}</div>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIST VIEW */}
            {view==='list'&&(
              <div>
                {upcomingAppointments.length===0?(
                  <div style={{backgroundColor:'#fff',borderRadius:'14px',padding:'60px',textAlign:'center',boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
                    <p style={{color:'#0a1f13',fontSize:'16px',fontWeight:'700',margin:'0 0 8px 0'}}>No upcoming appointments</p>
                    <p style={{color:'#9ca3af',fontSize:'14px',margin:'0 0 20px 0'}}>Add your first appointment to get started.</p>
                    <button onClick={()=>{setShowForm(true);setForm(prev=>({...prev,date:today}));}} style={{backgroundColor:'#0f2318',color:'#fff',padding:'11px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',border:'none'}}>+ Add Appointment</button>
                  </div>
                ):(
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {upcomingAppointments.map(a=>{
                      const st = getStatusStyle(a.status);
                      const dateObj = new Date(a.date+'T00:00:00');
                      const dateLabel = dateObj.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'});
                      return (
                        <div key={a.id} onClick={()=>setSelectedAppointment(a)} style={{backgroundColor:'#fff',borderRadius:'12px',padding:'16px 20px',boxShadow:'0 2px 8px rgba(0,0,0,0.05)',cursor:'pointer',display:'flex',alignItems:'center',gap:'16px',border:'1px solid #f3f4f6'}} onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')} onMouseLeave={e=>(e.currentTarget.style.backgroundColor='#fff')}>
                          <div style={{width:'52px',textAlign:'center',flexShrink:0}}>
                            <p style={{color:'#9ca3af',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',margin:'0 0 2px 0'}}>{dateObj.toLocaleDateString('en-CA',{month:'short'})}</p>
                            <p style={{color:'#0a1f13',fontSize:'24px',fontWeight:'800',margin:0,lineHeight:1}}>{dateObj.getDate()}</p>
                            <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{dateObj.toLocaleDateString('en-CA',{weekday:'short'})}</p>
                          </div>
                          <div style={{width:'1px',height:'40px',backgroundColor:'#e5e7eb',flexShrink:0}}/>
                          <div style={{flex:1}}>
                            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                              <p style={{color:'#0a1f13',fontSize:'14px',fontWeight:'700',margin:0}}>{a.title}</p>
                              <span style={{backgroundColor:st.bg,color:st.color,fontSize:'10px',padding:'2px 8px',borderRadius:'20px',fontWeight:'700'}}>{a.status.charAt(0).toUpperCase()+a.status.slice(1)}</span>
                              {a.source==='emily'&&<span style={{backgroundColor:'#ede9fe',color:'#5b21b6',fontSize:'10px',padding:'2px 8px',borderRadius:'20px',fontWeight:'700'}}>Emily</span>}
                            </div>
                            <p style={{color:'#6b7280',fontSize:'13px',margin:0}}>{formatTime(a.start_time)}{a.end_time?' – '+formatTime(a.end_time):''}{a.address?' · '+a.address:''}</p>
                            {a.contact_name&&<p style={{color:'#9ca3af',fontSize:'12px',margin:'2px 0 0 0'}}>{a.contact_name}{a.contact_phone?' · '+a.contact_phone:''}</p>}
                          </div>
                          {a.service_type&&<span style={{backgroundColor:'#f3f4f6',color:'#374151',fontSize:'11px',padding:'4px 10px',borderRadius:'20px',fontWeight:'600',flexShrink:0}}>{a.service_type}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}