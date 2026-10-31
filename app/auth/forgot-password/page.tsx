'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth/reset-password',
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  };

  return (
    <div style={{minHeight:'100vh',backgroundColor:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif'}}>
      <div style={{backgroundColor:'#111',border:'1px solid #222',borderRadius:'12px',padding:'48px',width:'100%',maxWidth:'400px'}}>
        <div style={{marginBottom:'32px',textAlign:'center'}}>
          <h1 style={{color:'#00d4aa',fontSize:'24px',fontWeight:'700',marginBottom:'8px'}}>Setera</h1>
          <p style={{color:'#666',fontSize:'14px'}}>{sent?'Check your email':'Reset your password'}</p>
        </div>
        {sent?(
          <div>
            <div style={{backgroundColor:'#0a1a12',border:'1px solid rgba(0,212,170,0.3)',borderRadius:'8px',padding:'20px',textAlign:'center',marginBottom:'24px'}}>
              <p style={{color:'#00d4aa',fontSize:'14px',fontWeight:'600',margin:'0 0 6px 0'}}>Link sent</p>
              <p style={{color:'#666',fontSize:'13px',margin:0}}>{'We sent a password setup link to '+email+'. Check your inbox and spam folder.'}</p>
            </div>
            <a href="/auth/login" style={{display:'block',textAlign:'center',color:'#555',fontSize:'13px',textDecoration:'none'}}>Back to sign in</a>
          </div>
        ):(
          <>
            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:'24px'}}>
                <label style={{color:'#999',fontSize:'12px',display:'block',marginBottom:'6px'}}>Email address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="your@email.com"
                  style={{width:'100%',padding:'12px',backgroundColor:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box' as const}}/>
              </div>
              {error&&<div style={{color:'#ff4444',fontSize:'13px',marginBottom:'16px',padding:'10px',backgroundColor:'#1a0000',borderRadius:'6px',border:'1px solid #330000'}}>{error}</div>}
              <button type="submit" disabled={loading}
                style={{width:'100%',padding:'12px',backgroundColor:'#00d4aa',color:'#000',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}>
                {loading?'Sending...':'Send reset link'}
              </button>
            </form>
            <div style={{textAlign:'center',marginTop:'20px'}}>
              <a href="/auth/login" style={{color:'#555',fontSize:'13px',textDecoration:'none'}}>Back to sign in</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}