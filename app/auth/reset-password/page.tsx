'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, portalForPath, handoffSessionToPortal } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);
  const [validating, setValidating] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { setReady(true); setValidating(false); return; }
        setError('This link has expired or is invalid.');
        setValidating(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setReady(true); setValidating(false); return; }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') { setReady(true); setValidating(false); }
      });
      setValidating(false);
      return () => subscription.unsubscribe();
    }
    init();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error?.message ?? 'An error occurred.'); setLoading(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session?.user?.id).single();
    const role = profile?.role;
    setSuccess(true);
    setTimeout(async () => {
      const dest = role === 'setter' ? '/setter' : (role === 'rep' || role === 'vp_sales') ? '/rep' : '/dashboard';
      await handoffSessionToPortal(portalForPath(dest));
      router.push(dest);
    }, 2000);
  };

  const wrap = (content: React.ReactNode) => (
    <div style={{minHeight:'100vh',backgroundColor:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif'}}>
      <div style={{backgroundColor:'#111',border:'1px solid #222',borderRadius:'12px',padding:'48px',width:'100%',maxWidth:'400px'}}>
        {content}
      </div>
    </div>
  );

  if (validating) return wrap(
    <p style={{color:'#666',fontSize:'14px',textAlign:'center',margin:0}}>Verifying your link...</p>
  );

  if (success) return wrap(
    <div style={{textAlign:'center'}}>
      <div style={{color:'#00d4aa',fontSize:'40px',marginBottom:'16px'}}>✓</div>
      <h2 style={{color:'#00d4aa',fontSize:'18px',fontWeight:'700',margin:'0 0 8px 0'}}>Password set</h2>
      <p style={{color:'#666',fontSize:'14px',margin:0}}>Taking you to your portal...</p>
    </div>
  );

  if (!ready) return wrap(
    <div style={{textAlign:'center'}}>
      <p style={{color:'#ff4444',fontSize:'14px',margin:'0 0 20px 0'}}>{error||'This link is invalid or has expired.'}</p>
      <a href="/auth/forgot-password" style={{color:'#00d4aa',fontSize:'14px',textDecoration:'none',fontWeight:'600'}}>Request a new link</a>
    </div>
  );

  return wrap(
    <>
      <div style={{marginBottom:'32px',textAlign:'center'}}>
        <h1 style={{color:'#00d4aa',fontSize:'24px',fontWeight:'700',marginBottom:'8px'}}>Setera</h1>
        <p style={{color:'#666',fontSize:'14px'}}>Set your password</p>
      </div>
      <form onSubmit={handleReset}>
        <div style={{marginBottom:'16px'}}>
          <label style={{color:'#999',fontSize:'12px',display:'block',marginBottom:'6px'}}>New password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Minimum 8 characters"
            style={{width:'100%',padding:'12px',backgroundColor:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box' as const}}/>
        </div>
        <div style={{marginBottom:'24px'}}>
          <label style={{color:'#999',fontSize:'12px',display:'block',marginBottom:'6px'}}>Confirm password</label>
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required placeholder="Repeat password"
            style={{width:'100%',padding:'12px',backgroundColor:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box' as const}}/>
        </div>
        {error&&<div style={{color:'#ff4444',fontSize:'13px',marginBottom:'16px',padding:'10px',backgroundColor:'#1a0000',borderRadius:'6px',border:'1px solid #330000'}}>{error}</div>}
        <button type="submit" disabled={loading}
          style={{width:'100%',padding:'12px',backgroundColor:'#00d4aa',color:'#000',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}>
          {loading?'Setting password...':'Set password'}
        </button>
      </form>
    </>
  );
}
