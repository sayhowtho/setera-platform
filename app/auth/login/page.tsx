'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, portalForPath, handoffSessionToPortal } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (!data.user) { setError('No user returned'); setLoading(false); return; }
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role, business_id').eq('id', data.user.id).single();
    if (profileError) { setError('Profile error: ' + profileError.message); setLoading(false); return; }
    if (profile?.role === 'client') {
      if (profile.business_id) {
        const { data: clientRow } = await supabase.from('clients').select('status').eq('business_id', profile.business_id).maybeSingle();
        if (clientRow?.status === 'Paused') {
          await supabase.auth.signOut({ scope: 'local' });
          setError('This account has been paused. Contact your Setera rep for details.');
          setLoading(false);
          return;
        }
        const { data: bizRow } = await supabase.from('businesses').select('status').eq('id', profile.business_id).maybeSingle();
        if (bizRow?.status === 'locked') {
          await supabase.auth.signOut({ scope: 'local' });
          router.push('/service-ended');
          return;
        }
      }
      await handoffSessionToPortal(portalForPath('/client'));
      router.push('/client');
      return;
    }
    if (profile?.role === 'owner' || profile?.role === 'admin') { await handoffSessionToPortal(portalForPath('/admin')); router.push('/admin'); }
    else if (profile?.role === 'rep' || profile?.role === 'vp_sales') { await handoffSessionToPortal(portalForPath('/rep')); router.push('/rep'); }
else if (profile?.role === 'setter') { await handoffSessionToPortal(portalForPath('/setter')); router.push('/setter'); }
    else { await handoffSessionToPortal(portalForPath('/dashboard')); router.push('/dashboard'); }
  };

  return (
    <div style={{minHeight:'100vh',backgroundColor:'#0a0a0a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif'}}>
      <div style={{backgroundColor:'#111',border:'1px solid #222',borderRadius:'12px',padding:'48px',width:'100%',maxWidth:'400px'}}>
        <div style={{marginBottom:'32px',textAlign:'center'}}>
          <h1 style={{color:'#00d4aa',fontSize:'24px',fontWeight:'700',marginBottom:'8px'}}>Setera</h1>
          <p style={{color:'#666',fontSize:'14px'}}>Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:'16px'}}>
            <label style={{color:'#999',fontSize:'12px',display:'block',marginBottom:'6px'}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
              style={{width:'100%',padding:'12px',backgroundColor:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:'8px'}}>
            <label style={{color:'#999',fontSize:'12px',display:'block',marginBottom:'6px'}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
              style={{width:'100%',padding:'12px',backgroundColor:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{textAlign:'right',marginBottom:'20px'}}>
            <a href="/auth/forgot-password" style={{color:'#555',fontSize:'12px',textDecoration:'none'}}>Forgot password?</a>
          </div>
          {error&&<div style={{color:'#ff4444',fontSize:'13px',marginBottom:'16px',padding:'10px',backgroundColor:'#1a0000',borderRadius:'6px',border:'1px solid #330000'}}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{width:'100%',padding:'12px',backgroundColor:'#00d4aa',color:'#000',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1}}>
            {loading?'Signing in...':'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}