'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/app/components/sidebar';
import { supabase } from '@/lib/supabase';

type Call = {
  id: string;
  caller_name: string | null;
  caller_number: string;
  reason: string | null;
  status: string;
  created_at: string;
  pipeline_stage: string | null;
  install_date: string | null;
  pipeline_notes: string | null;
};

const STAGES = [
  { id: 'new', label: 'New', color: '#6b7280', accent: '#f3f4f6' },
  { id: 'called_back', label: 'Called Back', color: '#3b82f6', accent: '#dbeafe' },
  { id: 'quote_sent', label: 'Quote Sent', color: '#f59e0b', accent: '#fef3c7' },
  { id: 'booked', label: 'Booked', color: '#8b5cf6', accent: '#ede9fe' },
  { id: 'install_date', label: 'Install Date', color: '#00d4aa', accent: '#f0fdf4' },
  { id: 'closed', label: 'Closed', color: '#10b981', accent: '#d1fae5' },
];

function getCallColor(status: string) {
  if (status === 'Urgent' || status === 'red') return '#ef4444';
  if (status === 'Follow Up' || status === 'yellow') return '#f59e0b';
  if (status === 'Captured' || status === 'green') return '#10b981';
  return '#3b82f6';
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return diff + 'm ago';
  if (diff < 1440) return Math.floor(diff / 60) + 'h ago';
  return Math.floor(diff / 1440) + 'd ago';
}

function getStage(call: Call): string {
  return call.pipeline_stage || 'new';
}

export default function PipelinePage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [installDateDraft, setInstallDateDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  useEffect(() => { fetchCalls(); }, []);

  async function fetchCalls() {
    const { data, error } = await supabase.from('calls').select('*').order('created_at', { ascending: false });
    if (!error && data) setCalls(data);
    setLoading(false);
  }

  async function updateStage(id: string, stage: string) {
    await supabase.from('calls').update({ pipeline_stage: stage }).eq('id', id);
    setCalls(prev => prev.map(c => c.id === id ? { ...c, pipeline_stage: stage } : c));
    if (selectedCall?.id === id) setSelectedCall(prev => prev ? { ...prev, pipeline_stage: stage } : null);
  }

  async function saveCardDetails() {
    if (!selectedCall) return;
    setSaving(true);
    await supabase.from('calls').update({ pipeline_notes: notesDraft, install_date: installDateDraft || null }).eq('id', selectedCall.id);
    setCalls(prev => prev.map(c => c.id === selectedCall.id ? { ...c, pipeline_notes: notesDraft, install_date: installDateDraft || null } : c));
    setSelectedCall(prev => prev ? { ...prev, pipeline_notes: notesDraft, install_date: installDateDraft || null } : null);
    setSaving(false);
  }

  function openCard(call: Call) {
    setSelectedCall(call);
    setNotesDraft(call.pipeline_notes || '');
    setInstallDateDraft(call.install_date || '');
  }

  return (
    <div style={{display:'flex',minHeight:'100vh',backgroundColor:'#f0f4f1',fontFamily:'Inter, sans-serif'}}>
      <Sidebar />
      <div style={{marginLeft:'220px',flex:1,padding:'32px 36px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'28px'}}>
          <div>
            <h1 style={{color:'#0a1f13',fontSize:'28px',fontWeight:'800',margin:'0 0 4px 0'}}>Pipeline</h1>
            <p style={{color:'#6b7280',margin:0,fontSize:'14px'}}>{calls.length+' leads — drag cards to move between stages'}</p>
          </div>
          <div style={{display:'flex',border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
            <button onClick={()=>setViewMode('board')} style={{padding:'8px 18px',fontSize:'13px',fontWeight:'600',cursor:'pointer',border:'none',backgroundColor:viewMode==='board'?'#0f2318':'#fff',color:viewMode==='board'?'#00d4aa':'#6b7280'}}>Board</button>
            <button onClick={()=>setViewMode('list')} style={{padding:'8px 18px',fontSize:'13px',fontWeight:'600',cursor:'pointer',border:'none',backgroundColor:viewMode==='list'?'#0f2318':'#fff',color:viewMode==='list'?'#00d4aa':'#6b7280',borderLeft:'1px solid #e5e7eb'}}>List</button>
          </div>
        </div>

        {loading ? <p style={{color:'#9ca3af',fontSize:'14px'}}>Loading pipeline...</p> : (
          <>
            {viewMode==='board' && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(6, 1fr)',gap:'12px'}}>
                {STAGES.map(stage => {
                  const stageCalls = calls.filter(c => getStage(c) === stage.id);
                  return (
                    <div key={stage.id}
                      onDragOver={e=>{e.preventDefault();setDragOverStage(stage.id);}}
                      onDragLeave={()=>setDragOverStage(null)}
                      onDrop={e=>{e.preventDefault();if(draggedId){updateStage(draggedId,stage.id);setDraggedId(null);setDragOverStage(null);}}}
                      style={{backgroundColor:dragOverStage===stage.id?stage.accent:'#f9fafb',borderRadius:'12px',padding:'12px',border:'2px dashed '+(dragOverStage===stage.id?stage.color:'transparent'),minHeight:'400px',transition:'all 0.15s'}}>
                      <div style={{marginBottom:'12px',paddingBottom:'10px',borderBottom:'2px solid '+stage.color+'30'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'12px',fontWeight:'700',color:'#0a1f13'}}>{stage.label}</span>
                          <span style={{backgroundColor:stage.accent,color:stage.color,fontSize:'11px',padding:'1px 8px',borderRadius:'20px',fontWeight:'700',border:'1px solid '+stage.color+'40'}}>{stageCalls.length}</span>
                        </div>
                      </div>
                      {stageCalls.map(call=>(
                        <div key={call.id} draggable
                          onDragStart={()=>setDraggedId(call.id)}
                          onDragEnd={()=>{setDraggedId(null);setDragOverStage(null);}}
                          onClick={()=>openCard(call)}
                          style={{backgroundColor:'#fff',borderRadius:'10px',padding:'10px 12px',marginBottom:'8px',boxShadow:'0 1px 4px rgba(0,0,0,0.08)',cursor:'grab',opacity:draggedId===call.id?0.4:1,border:'0.5px solid #e5e7eb'}}>
                          <p style={{color:'#0a1f13',fontSize:'12px',fontWeight:'700',margin:'0 0 4px 0'}}>{call.caller_name||call.caller_number}</p>
                          {call.reason&&<p style={{color:'#6b7280',fontSize:'11px',margin:'0 0 6px 0',lineHeight:'1.4'}}>{call.reason.slice(0,50)}{call.reason.length>50?'...':''}</p>}
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{backgroundColor:getCallColor(call.status)+'18',color:getCallColor(call.status),fontSize:'10px',padding:'1px 6px',borderRadius:'10px',fontWeight:'600'}}>{call.status}</span>
                            <span style={{color:'#9ca3af',fontSize:'10px'}}>{timeAgo(call.created_at)}</span>
                          </div>
                          {call.install_date&&<div style={{marginTop:'6px',padding:'4px 8px',backgroundColor:'#f0fdf4',borderRadius:'6px',fontSize:'10px',color:'#065f46',fontWeight:'600'}}>{'Install: '+formatDate(call.install_date)}</div>}
                          {call.pipeline_notes&&<p style={{color:'#9ca3af',fontSize:'10px',margin:'4px 0 0 0',fontStyle:'italic'}}>{call.pipeline_notes.slice(0,40)}{call.pipeline_notes.length>40?'...':''}</p>}
                        </div>
                      ))}
                      {stageCalls.length===0&&<div style={{textAlign:'center',padding:'32px 8px',color:'#d1d5db',fontSize:'12px',border:'1.5px dashed #e5e7eb',borderRadius:'8px'}}>Drop here</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode==='list' && (
              <div style={{backgroundColor:'#fff',borderRadius:'14px',boxShadow:'0 2px 12px rgba(0,0,0,0.06)',overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr',padding:'12px 24px',borderBottom:'1px solid #f3f4f6',backgroundColor:'#f9fafb'}}>
                  {['Caller','Reason','Stage','Install Date','Status'].map(col=>(
                    <p key={col} style={{color:'#9ca3af',fontSize:'11px',fontWeight:'600',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>{col}</p>
                  ))}
                </div>
                {calls.length===0 ? (
                  <p style={{color:'#9ca3af',fontSize:'14px',padding:'40px',textAlign:'center'}}>No calls yet.</p>
                ) : calls.map(call=>{
                  const stage=STAGES.find(s=>s.id===getStage(call))||STAGES[0];
                  return (
                    <div key={call.id} onClick={()=>openCard(call)}
                      style={{display:'grid',gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr',padding:'14px 24px',borderBottom:'1px solid #f9fafb',alignItems:'center',cursor:'pointer'}}
                      onMouseEnter={e=>(e.currentTarget.style.backgroundColor='#f9fafb')}
                      onMouseLeave={e=>(e.currentTarget.style.backgroundColor='transparent')}>
                      <div>
                        <p style={{color:'#0a1f13',fontSize:'13px',fontWeight:'600',margin:'0 0 2px 0'}}>{call.caller_name||call.caller_number}</p>
                        <p style={{color:'#9ca3af',fontSize:'11px',margin:0}}>{timeAgo(call.created_at)}</p>
                      </div>
                      <p style={{color:'#374151',fontSize:'13px',margin:0}}>{call.reason||'—'}</p>
                      <span style={{backgroundColor:stage.accent,color:stage.color,fontSize:'11px',padding:'3px 10px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{stage.label}</span>
                      <p style={{color:'#374151',fontSize:'13px',margin:0}}>{call.install_date?formatDate(call.install_date):'—'}</p>
                      <span style={{backgroundColor:getCallColor(call.status)+'18',color:getCallColor(call.status),fontSize:'11px',padding:'3px 8px',borderRadius:'20px',fontWeight:'600',display:'inline-block'}}>{call.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Detail Panel */}
        {selectedCall&&(
          <div style={{position:'fixed',top:0,right:0,width:'380px',height:'100vh',backgroundColor:'#fff',boxShadow:'-4px 0 24px rgba(0,0,0,0.12)',zIndex:200,padding:'28px',overflowY:'auto',display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'24px'}}>
              <div>
                <h2 style={{color:'#0a1f13',fontSize:'18px',fontWeight:'800',margin:'0 0 4px 0'}}>{selectedCall.caller_name||selectedCall.caller_number}</h2>
                <p style={{color:'#6b7280',fontSize:'13px',margin:0}}>{selectedCall.caller_number}</p>
              </div>
              <button onClick={()=>setSelectedCall(null)} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'#6b7280'}}>✕</button>
            </div>

            {selectedCall.reason&&(
              <div style={{backgroundColor:'#f9fafb',borderRadius:'8px',padding:'12px 14px',marginBottom:'20px'}}>
                <p style={{color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',margin:'0 0 4px 0'}}>Reason for Call</p>
                <p style={{color:'#374151',fontSize:'13px',margin:0,lineHeight:'1.5'}}>{selectedCall.reason}</p>
              </div>
            )}

            <div style={{marginBottom:'20px'}}>
              <label style={{display:'block',color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'8px'}}>Stage</label>
              <select value={getStage(selectedCall)} onChange={e=>updateStage(selectedCall.id,e.target.value)}
                style={{width:'100%',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',backgroundColor:'#fff',outline:'none',fontFamily:'Inter, sans-serif',cursor:'pointer'}}>
                {STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            <div style={{marginBottom:'20px'}}>
              <label style={{display:'block',color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'8px'}}>Install Date</label>
              <input type="date" value={installDateDraft} onChange={e=>setInstallDateDraft(e.target.value)}
                style={{width:'100%',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',color:'#0a1f13',outline:'none',boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/>
            </div>

            <div style={{marginBottom:'24px'}}>
              <label style={{display:'block',color:'#6b7280',fontSize:'11px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'8px'}}>Notes</label>
              <textarea value={notesDraft} onChange={e=>setNotesDraft(e.target.value)} placeholder="Quote amount, next steps, anything relevant..."
                style={{width:'100%',minHeight:'120px',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',color:'#0a1f13',outline:'none',resize:'vertical',boxSizing:'border-box' as const,fontFamily:'Inter, sans-serif'}}/>
            </div>

            <button onClick={saveCardDetails} disabled={saving}
              style={{width:'100%',padding:'12px',backgroundColor:'#0f2318',color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',opacity:saving?0.6:1}}>
              {saving?'Saving...':'Save'}
            </button>

            <div style={{marginTop:'16px',paddingTop:'16px',borderTop:'1px solid #f3f4f6'}}>
              <p style={{color:'#9ca3af',fontSize:'11px',margin:'0 0 6px 0'}}>{'Called '+timeAgo(selectedCall.created_at)}</p>
              <span style={{backgroundColor:getCallColor(selectedCall.status)+'18',color:getCallColor(selectedCall.status),fontSize:'11px',padding:'3px 8px',borderRadius:'20px',fontWeight:'600'}}>{selectedCall.status}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}