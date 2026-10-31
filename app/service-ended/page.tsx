export const metadata = { title: 'Service Ended — Setera' };

export default function ServiceEndedPage() {
  return (
    <div style={{minHeight:'100vh',backgroundColor:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif',padding:'16px'}}>
      <div style={{backgroundColor:'#111',border:'1px solid #222',borderRadius:'12px',padding:'48px',width:'100%',maxWidth:'440px',textAlign:'center'}}>
        <h1 style={{color:'#00d4aa',fontSize:'24px',fontWeight:'700',marginBottom:'8px'}}>Setera</h1>
        <h2 style={{color:'#fff',fontSize:'18px',fontWeight:'600',margin:'24px 0 12px'}}>Your service has ended</h2>
        <p style={{color:'#999',fontSize:'14px',lineHeight:'1.6',margin:0}}>This account is no longer active, so the dashboard and your AI receptionist are turned off. If you&apos;d like to restart service, reach out to Setera and we&apos;ll get you back up and running.</p>
        <p style={{color:'#fbbf24',backgroundColor:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.35)',borderRadius:'8px',padding:'12px 14px',fontSize:'14px',fontWeight:'600',lineHeight:'1.5',margin:'20px 0 0',textAlign:'left'}}>If you have call forwarding set up to send missed calls to us, please turn that off now — otherwise those calls may not reach you.</p>
      </div>
    </div>
  );
}
