'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Calls', href: '/dashboard/calls' },
    { name: 'Pipeline', href: '/dashboard/pipeline' },
    { name: 'Calendar', href: '/dashboard/calendar' },
    { name: 'Leads', href: '/dashboard/leads' },
    { name: 'Analytics', href: '/dashboard/analytics' },
    { name: 'Settings', href: '/dashboard/settings' },
  ];
  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };
  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    router.push('/auth/login');
  };
  return (
    <div style={{width:'220px',backgroundColor:'#0f2318',display:'flex',flexDirection:'column',padding:'28px 16px',position:'fixed',height:'100vh',boxShadow:'4px 0 24px rgba(0,0,0,0.15)',zIndex:100}}>
      <div style={{marginBottom:'40px',padding:'0 8px'}}>
        <h2 style={{color:'#00d4aa',fontSize:'22px',fontWeight:'800',margin:'0 0 3px 0'}}>Setera</h2>
        <p style={{color:'rgba(255,255,255,0.35)',fontSize:'11px',margin:0,textTransform:'uppercase',letterSpacing:'0.5px'}}>AI Reception</p>
      </div>
      {navItems.map((item) => (
        <Link key={item.name} href={item.href} style={{textDecoration:'none'}}>
          <div style={{padding:'11px 12px',borderRadius:'10px',marginBottom:'4px',color:isActive(item.href)?'#fff':'rgba(255,255,255,0.45)',backgroundColor:isActive(item.href)?'rgba(0,212,170,0.18)':'transparent',cursor:'pointer',fontSize:'14px',fontWeight:isActive(item.href)?'600':'400',borderLeft:isActive(item.href)?'3px solid #00d4aa':'3px solid transparent'}}>
            {item.name}
          </div>
        </Link>
      ))}
      <div style={{marginTop:'auto',padding:'14px',borderRadius:'12px',backgroundColor:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
          <div style={{width:'34px',height:'34px',borderRadius:'50%',backgroundColor:'#00d4aa',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:'700',color:'#000'}}>S</div>
          <div>
            <p style={{color:'#fff',fontSize:'13px',fontWeight:'600',margin:0}}>My Portal</p>
            <p style={{color:'rgba(255,255,255,0.35)',fontSize:'11px',margin:0}}>Client</p>
          </div>
        </div>
        <button onClick={handleSignOut} style={{width:'100%',backgroundColor:'transparent',border:'1px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.5)',padding:'8px',borderRadius:'6px',cursor:'pointer',fontSize:'12px'}}>Sign out</button>
      </div>
    </div>
  );
}