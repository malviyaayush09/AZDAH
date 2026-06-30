'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, CalendarDays, Info, Eye, EyeOff, User } from 'lucide-react';

type MemberInfo = {
  id: string; name: string; phone: string;
  plan_name: string; plan_start: string; plan_end: string;
  days_remaining: number; reschedule_used: boolean;
  classes_included: number | null; classes_remaining: number | null;
  must_change_password?: boolean; is_frozen?: boolean;
};
type ClassSlot = {
  id: string; title: string; trainer_name: string | null;
  class_date: string; start_time: string; end_time: string;
  capacity: number; booked_count: number;
  my_booking_id: string | null; my_booking_status: string | null;
  on_waitlist?: boolean;
};
type HistoryItem = {
  booking_id: string; status: string; attended: boolean | null;
  id: string; title: string; trainer_name: string | null;
  class_date: string; start_time: string; end_time: string;
};
type Tab = 'book' | 'my-bookings' | 'history' | 'profile';
type WaitlistPos = { classId: string; position: number; total: number };
type MemberStats = {
  total_attended: number; this_month: number; this_week: number;
  streak_weeks: number; attendance_rate: number;
  favorite_trainer: string | null;
  weekly_data: { week: string; count: number }[];
};

const DARK='#0D0B08', CARD='#1A1410', BORDER='#2A2118', CREAM='#F5F0E8', MUTED='#8A7A6A', ORANGE='#F83433';
const SERIF='var(--font-bodoni), Georgia, serif';

function toYMD(d: Date) { return d.toISOString().split('T')[0]; }
function fmtTime(t: string) {
  const [h,m]=t.split(':').map(Number);
  return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function fmtShortDate(s: string) {
  return new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function greeting() { const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }
function dateLabel(ds: string, todayStr: string) {
  const tmr=new Date(); tmr.setDate(tmr.getDate()+1);
  if(ds===todayStr) return 'Today';
  if(ds===toYMD(tmr)) return 'Tomorrow';
  return new Date(ds+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'});
}

export default function DashboardPage() {
  const router = useRouter();
  const [member, setMember]         = useState<MemberInfo|null>(null);
  const [classes, setClasses]       = useState<ClassSlot[]>([]);
  const [myBookings, setMyBookings] = useState<ClassSlot[]>([]);
  const [history, setHistory]       = useState<HistoryItem[]>([]);
  const [tab, setTab]               = useState<Tab>('book');
  const [loading, setLoading]       = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [msg, setMsg]               = useState<{text:string;ok:boolean}|null>(null);
  const [rescheduleMode, setRescheduleMode] = useState<string|null>(null);
  const [busyId, setBusyId]         = useState<string|null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(toYMD(new Date()));
  const [trainerFilter, setTrainerFilter] = useState<string>('all');
  // Password modal
  const [stats, setStats] = useState<MemberStats|null>(null);
  const [statAnim, setStatAnim] = useState(0);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm]   = useState({current:'',newPw:'',confirm:''});
  const [pwMsg, setPwMsg]     = useState<{text:string;ok:boolean}|null>(null);
  const [pwBusy, setPwBusy]   = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // Profile
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileMsg, setProfileMsg] = useState<{text:string;ok:boolean}|null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  // Waitlist positions cache
  const [waitlistPos, setWaitlistPos] = useState<WaitlistPos[]>([]);

  const todayStr = toYMD(new Date());
  const days14 = Array.from({length:14},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); return d; });

  useEffect(() => { fetchAll(); }, []);

  // Count-up animation for stat numbers + chart bars (runs once stats arrive)
  useEffect(() => {
    if (!stats) return;
    let raf: number; const start = performance.now(), dur = 900;
    const tick = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      setStatAnim(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  async function fetchAll() {
    const [mRes, cRes, sRes] = await Promise.all([
      fetch('/api/member/me'),
      fetch('/api/member/classes'),
      fetch('/api/member/stats'),
    ]);
    if (mRes.status === 401) { router.push('/login'); return; }
    const [mData, cData, sData] = await Promise.all([mRes.json(), cRes.json(), sRes.json()]);
    setMember(mData.member);
    setClasses(cData.upcoming || []);
    setMyBookings(cData.myBookings || []);
    if (sData.total_attended !== undefined) setStats(sData);
    setLoading(false);
    if (mData.member?.must_change_password) setShowPwModal(true);
    if (mData.member) setProfileForm({ name: mData.member.name, email: '' });
    // Fetch waitlist positions for on-waitlist classes
    const wlClasses = (cData.upcoming || []).filter((c: ClassSlot) => c.on_waitlist);
    if (wlClasses.length > 0) {
      const positions = await Promise.all(
        wlClasses.map((c: ClassSlot) =>
          fetch(`/api/member/waitlist-position?classId=${c.id}`)
            .then(r => r.json())
            .then(d => d.position ? { classId: c.id, position: d.position, total: d.total } : null)
        )
      );
      setWaitlistPos(positions.filter(Boolean) as WaitlistPos[]);
    }
  }

  async function loadHistory() {
    if (history.length) return;
    setHistLoading(true);
    const res = await fetch('/api/member/history');
    const data = await res.json();
    setHistory(data.history || []);
    setHistLoading(false);
  }

  async function bookClass(classId: string) {
    setMsg(null); setBusyId(classId);
    const res = await fetch('/api/booking/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({classId})});
    const data = await res.json();
    setBusyId(null);
    setMsg(data.success?{text:'Class booked!',ok:true}:{text:data.error||'Booking failed',ok:false});
    if (data.success) fetchAll();
  }

  async function cancelBooking(bookingId: string) {
    if (!confirm('Cancel this booking? The spot will be freed for others.')) return;
    setMsg(null); setBusyId(bookingId);
    const res = await fetch('/api/booking/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId})});
    const data = await res.json();
    setBusyId(null);
    setMsg(data.success?{text:'Booking cancelled.',ok:true}:{text:data.error||'Failed',ok:false});
    if (data.success) fetchAll();
  }

  async function rescheduleClass(oldId: string, newId: string) {
    setMsg(null); setBusyId(newId);
    const res = await fetch('/api/booking/reschedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oldBookingId:oldId,newClassId:newId})});
    const data = await res.json();
    setBusyId(null);
    if (data.success) { setMsg({text:'Rescheduled!',ok:true}); setRescheduleMode(null); setTab('my-bookings'); fetchAll(); }
    else setMsg({text:data.error||'Failed',ok:false});
  }

  async function toggleWaitlist(cls: ClassSlot) {
    setMsg(null); setBusyId(cls.id);
    if (cls.on_waitlist) {
      const res = await fetch('/api/booking/waitlist',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({classId:cls.id})});
      const data = await res.json();
      setBusyId(null);
      setMsg(data.success?{text:'Removed from waitlist.',ok:true}:{text:data.error||'Failed',ok:false});
    } else {
      const res = await fetch('/api/booking/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({classId:cls.id})});
      const data = await res.json();
      setBusyId(null);
      setMsg(data.success?{text:`Added to waitlist! You'll be auto-booked if a spot opens.`,ok:true}:{text:data.error||'Failed',ok:false});
    }
    if (busyId) fetchAll();
    fetchAll();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setPwMsg(null);
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({text:'Passwords do not match',ok:false}); return; }
    if (pwForm.newPw.length < 8) { setPwMsg({text:'Password must be at least 8 characters',ok:false}); return; }
    setPwBusy(true);
    const res = await fetch('/api/member/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:pwForm.current,newPassword:pwForm.newPw})});
    const data = await res.json();
    setPwBusy(false);
    if (data.success) {
      setPwMsg({text:'Password changed successfully!',ok:true});
      setPwForm({current:'',newPw:'',confirm:''});
      // Clear must_change_password flag in local state so modal becomes dismissable
      setMember(prev => prev ? { ...prev, must_change_password: false } : prev);
      setTimeout(()=>setShowPwModal(false),1500);
    } else setPwMsg({text:data.error||'Failed',ok:false});
  }

  async function logout() { await fetch('/api/auth/logout',{method:'POST'}); router.push('/login'); }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setProfileMsg(null); setProfileBusy(true);
    const res = await fetch('/api/member/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(profileForm)});
    const data = await res.json();
    setProfileBusy(false);
    if (data.success) {
      setProfileMsg({text:'Profile updated!',ok:true});
      setMember(prev => prev ? {...prev, name: profileForm.name || prev.name} : prev);
    } else setProfileMsg({text:data.error||'Update failed',ok:false});
  }

  const trainers = ['all',...Array.from(new Set(classes.map(c=>c.trainer_name).filter(Boolean) as string[]))];
  const dayClasses = classes
    .filter(c=>c.class_date===selectedDate&&(trainerFilter==='all'||c.trainer_name===trainerFilter))
    .sort((a,b)=>a.start_time.localeCompare(b.start_time));
  const nextBooking = myBookings.sort((a,b)=>(a.class_date+a.start_time).localeCompare(b.class_date+b.start_time))[0];

  if (loading) return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
        <div style={{width:36,height:36,border:`3px solid ${BORDER}`,borderTopColor:ORANGE,borderRadius:'50%',animation:'spin .8s linear infinite'}} />
        <span style={{color:MUTED,fontSize:13}}>Loading…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const planStart=new Date(member!.plan_start+'T00:00:00'), planEnd=new Date(member!.plan_end+'T00:00:00');
  const totalDays=Math.max(1,Math.ceil((planEnd.getTime()-planStart.getTime())/86400000));
  const usedPct=Math.min(100,Math.max(0,((totalDays-member!.days_remaining)/totalDays)*100));

  return (
    <main style={{minHeight:'100vh',background:DARK,fontFamily:'system-ui,sans-serif'}}>
      <style dangerouslySetInnerHTML={{__html:`
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes modalIn{from{opacity:0;transform:scale(.96)translateY(8px)}to{opacity:1;transform:scale(1)translateY(0)}}
        .dash-in{animation:fadeUp .4s ease forwards}
        .day-btn,.pill,.tab-btn,.book-btn{border:none;font-family:inherit;cursor:pointer}
        .day-btn{transition:background .15s,border-color .15s,transform .12s}
        .day-btn:hover{transform:translateY(-2px)}
        .slot-card{transition:border-color .15s,background .15s}
        .slot-card:hover{border-color:#3A2B1E !important;background:#1E1712 !important}
        .book-btn{transition:background .15s,transform .1s}
        .book-btn:hover:not(:disabled){background:#FF5049 !important}
        .book-btn:active:not(:disabled){transform:scale(.97)}
        .book-btn:disabled{opacity:.5;cursor:not-allowed}
        .pill{transition:background .15s,border-color .15s,color .15s}
        .tab-btn{background:none;transition:color .15s}
        @media(max-width:800px){.dash-top,.dash-stats{grid-template-columns:1fr !important}}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
        .modal-card{background:#1A1410;border:1px solid #3A2B1E;border-radius:14px;width:100%;max-width:420px;animation:modalIn .25s ease forwards}
        input{outline:none;background:transparent;width:100%;color:${CREAM};font-size:13px;font-family:inherit;border:none}
        input::placeholder{color:#3A2B1E}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 30px #1A1410 inset !important;-webkit-text-fill-color:${CREAM} !important}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:#3A2B1E;border-radius:9px}
        ::-webkit-scrollbar-track{background:transparent}
      `}} />

      {/* ── Navbar ── */}
      <nav style={{height:54,background:'#131009',borderBottom:`1px solid ${BORDER}`,padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:20}}>
        <a href="/"><img src="/azdahlogo.png" alt="AZDAH" style={{height:28,width:'auto',display:'block',filter:'none'}}/></a>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setShowPwModal(true);setPwMsg(null);setPwForm({current:'',newPw:'',confirm:''});}}
            title="Settings" style={{background:'none',border:'none',color:MUTED,cursor:'pointer',fontSize:17,lineHeight:1,padding:4}}
            onMouseOver={e=>e.currentTarget.style.color=CREAM} onMouseOut={e=>e.currentTarget.style.color=MUTED}><Settings size={16} strokeWidth={1.5} /></button>
          <div style={{width:30,height:30,borderRadius:'50%',background:ORANGE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff'}}>
            {member!.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
          </div>
          <button onClick={logout} style={{color:MUTED,fontSize:13,background:'none',border:'none',cursor:'pointer'}}
            onMouseOver={e=>e.currentTarget.style.color=CREAM} onMouseOut={e=>e.currentTarget.style.color=MUTED}>Logout</button>
        </div>
      </nav>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px'}} className="dash-in">

        {/* ── Toast ── */}
        {msg&&(
          <div style={{marginBottom:14,padding:'11px 14px',background:msg.ok?'rgba(74,222,128,.08)':'rgba(248,113,113,.08)',border:`1px solid ${msg.ok?'rgba(74,222,128,.25)':'rgba(248,113,113,.25)'}`,borderRadius:8,fontSize:13,color:msg.ok?'#4ade80':'#f87171',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            {msg.text}<button onClick={()=>setMsg(null)} style={{background:'none',border:'none',color:MUTED,cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
          </div>
        )}

        {/* ── GREETING ── */}
        <div style={{marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:16}}>
            <div>
              <h1 style={{fontFamily:SERIF,fontSize:36,fontWeight:800,color:CREAM,margin:0,lineHeight:1.05,letterSpacing:'-.01em'}}>{greeting()}, {member!.name.split(' ')[0]}.</h1>
              <p style={{color:MUTED,fontSize:14,margin:'8px 0 0'}}>Here&apos;s your week. Let&apos;s keep the streak alive.</p>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap',background:CARD,border:`1px solid ${BORDER}`,borderRadius:999,padding:'9px 16px'}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:member!.days_remaining<=7?'#f87171':'#4ade80',flexShrink:0}} />
              <span style={{color:CREAM,fontSize:13,fontWeight:600}}>{member!.days_remaining} days left</span>
              <span style={{color:MUTED,fontSize:12}}>· {member!.plan_name}</span>
              <span style={{color:MUTED,fontSize:12}}>· Reschedule {member!.reschedule_used?'used':'available'}</span>
              {member!.days_remaining<=7&&<a href="/#plans" style={{fontSize:11,color:ORANGE,border:'1px solid rgba(248,52,51,.35)',padding:'4px 11px',borderRadius:999,textDecoration:'none',background:'rgba(248,52,51,.06)',marginLeft:2}}>Renew →</a>}
            </div>
          </div>
          <div style={{marginTop:16,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:200,height:4,background:'rgba(255,255,255,.06)',borderRadius:999,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${usedPct}%`,background:'linear-gradient(90deg,#F83433,#FF5049)',borderRadius:999,transition:'width .6s ease'}} />
            </div>
            <span style={{fontSize:11,color:MUTED}}>{fmtShortDate(member!.plan_start)} → <span style={{color:member!.days_remaining<=7?'#f87171':MUTED}}>{fmtShortDate(member!.plan_end)}</span></span>
          </div>
        </div>

        {/* ── NEXT CLASS ── */}
        {nextBooking?(
          <div style={{background:`linear-gradient(120deg,rgba(248,52,51,.14) 0%,${CARD} 60%)`,border:'1px solid rgba(248,52,51,.3)',borderRadius:12,padding:'22px 26px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:18}}>
              <div style={{width:48,height:48,borderRadius:10,background:'rgba(248,52,51,.14)',border:'1px solid rgba(248,52,51,.4)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <CalendarDays size={22} color={ORANGE} strokeWidth={1.5} />
              </div>
              <div>
                <div style={{color:ORANGE,fontSize:10,letterSpacing:'.16em',textTransform:'uppercase',fontWeight:700,marginBottom:5}}>Your next class</div>
                <div style={{fontFamily:SERIF,fontSize:21,fontWeight:700,color:CREAM,lineHeight:1.1}}>{nextBooking.title}</div>
                <div style={{color:MUTED,fontSize:13,marginTop:4}}>{dateLabel(nextBooking.class_date,todayStr)} · {fmtTime(nextBooking.start_time)}{nextBooking.trainer_name?` · with ${nextBooking.trainer_name}`:''}</div>
              </div>
            </div>
            <button onClick={()=>{setTab('my-bookings');setMsg(null);}}
              style={{background:'none',border:'1px solid rgba(245,240,232,.2)',color:CREAM,fontSize:12,fontWeight:600,padding:'10px 18px',borderRadius:6,cursor:'pointer'}}>
              Manage bookings
            </button>
          </div>
        ):(
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'22px 26px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              <div style={{width:48,height:48,borderRadius:10,background:'rgba(255,255,255,.04)',border:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <CalendarDays size={22} color={MUTED} strokeWidth={1.3} />
              </div>
              <div>
                <div style={{color:CREAM,fontSize:15,fontWeight:600}}>No upcoming class</div>
                <div style={{color:MUTED,fontSize:12,marginTop:3}}>Browse and book your next session.</div>
              </div>
            </div>
            <button onClick={()=>{setTab('book');setMsg(null);}}
              style={{background:ORANGE,border:'none',color:'#fff',fontWeight:700,fontSize:12,padding:'11px 22px',borderRadius:6,cursor:'pointer'}}>
              Browse classes →
            </button>
          </div>
        )}
        </div>

        {/* ── STATS ROW ── */}
        {stats&&(
          <div className="dash-stats" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

            {/* 2×2 stat grid */}
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden',display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr'}}>
              {[
                {n:stats.total_attended,suf:'',l:'Classes Attended',c:CREAM},
                {n:stats.this_month,suf:'',l:'This Month',c:CREAM},
                {n:stats.streak_weeks,suf:'',l:'Week Streak',c:stats.streak_weeks>0?ORANGE:CREAM},
                {n:stats.attendance_rate,suf:'%',l:'Show-Up Rate',c:stats.attendance_rate>=70?'#4ade80':stats.attendance_rate>=40?'#fbbf24':CREAM},
              ].map(({n,suf,l,c},i)=>(
                <div key={l} style={{padding:'22px 24px',borderRight:i%2===0?`1px solid ${BORDER}`:'none',borderBottom:i<2?`1px solid ${BORDER}`:'none'}}>
                  <div style={{fontFamily:SERIF,fontSize:34,fontWeight:800,color:c,letterSpacing:'-.02em',lineHeight:1,marginBottom:8}}>{Math.round(n*statAnim)}{suf}</div>
                  <div style={{fontSize:10,color:MUTED,letterSpacing:'.06em',textTransform:'uppercase'}}>{l}</div>
                </div>
              ))}
            </div>

            {/* 8-week chart */}
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'20px 22px',display:'flex',flexDirection:'column'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:CREAM,letterSpacing:'-.01em'}}>Consistency</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:3}}>Classes per week · last 8 weeks</div>
                </div>
                {stats.favorite_trainer&&(
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:10,color:MUTED,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:2}}>Top trainer</div>
                    <div style={{fontSize:12,color:CREAM,fontWeight:500}}>{stats.favorite_trainer}</div>
                  </div>
                )}
              </div>
              <div style={{flex:1,display:'flex',alignItems:'flex-end',gap:5,minHeight:72}}>
                {stats.weekly_data.map((w,i)=>{
                  const maxC=Math.max(...stats.weekly_data.map(x=>x.count),1);
                  const isCurrent=i===stats.weekly_data.length-1;
                  return(
                    <div key={w.week} title={`${w.count} class${w.count!==1?'es':''}`}
                      style={{flex:1,height:w.count>0?`${Math.max((w.count/maxC)*100*statAnim,6)}%`:'3px',
                        background:w.count>0?(isCurrent?ORANGE:'rgba(248,52,51,.28)'):'rgba(255,255,255,.06)',
                        borderRadius:'3px 3px 2px 2px',transition:'height .4s ease',alignSelf:'flex-end'}} />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── THIS WEEK ── */}
        {(()=>{
          const weekStart=new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate()-(weekStart.getDay()===0?6:weekStart.getDay()-1));
          const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
          const weekBookings=myBookings.filter(b=>{const d=new Date(b.class_date+'T00:00:00');return d>=weekStart&&d<=weekEnd;}).sort((a,b)=>(a.class_date+a.start_time).localeCompare(b.class_date+b.start_time));
          if(!weekBookings.length) return null;
          return(
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:'18px 20px',marginBottom:14}}>
              <div style={{fontSize:11,color:MUTED,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:12}}>This Week</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {weekBookings.map(b=>(
                  <div key={b.my_booking_id} style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:36,height:36,borderRadius:8,background:'rgba(248,52,51,.1)',border:'1px solid rgba(248,52,51,.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <CalendarDays size={15} color={ORANGE} strokeWidth={1.5} />
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:CREAM,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.title}</div>
                      <div style={{fontSize:11,color:MUTED}}>{dateLabel(b.class_date,todayStr)} · {fmtTime(b.start_time)}</div>
                    </div>
                    <span style={{fontSize:10,padding:'3px 10px',background:'rgba(74,222,128,.08)',color:'#4ade80',border:'1px solid rgba(74,222,128,.2)',borderRadius:999,flexShrink:0}}>Booked</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── BOOKING SECTION ── */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:'hidden'}}>

          {/* Reschedule banner */}
          {rescheduleMode&&(
            <div style={{padding:'10px 20px',background:'rgba(248,52,51,.08)',borderBottom:`1px solid rgba(248,52,51,.18)`,fontSize:12,color:'#FCA39F',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              Pick a new slot below to move your booking.
              <button onClick={()=>{setRescheduleMode(null);setTab('my-bookings');}} style={{background:'none',border:'none',color:'#f87171',cursor:'pointer',fontSize:12,textDecoration:'underline'}}>Cancel</button>
            </div>
          )}

          {/* Tabs */}
          <div style={{display:'flex',borderBottom:`1px solid ${BORDER}`,padding:'0 20px'}}>
            {([['book','Book a Class'],['my-bookings',`My Bookings${myBookings.length>0?' ('+myBookings.length+')':''}`],['history','History'],['profile','Profile']] as const).map(([k,l])=>(
              <button key={k} className="tab-btn" onClick={()=>{setTab(k);setMsg(null);if(k==='history')loadHistory();}}
                style={{padding:'14px 16px',fontSize:13,fontWeight:500,color:tab===k?ORANGE:MUTED,
                  background:'none',border:'none',borderBottom:tab===k?`2px solid ${ORANGE}`:'2px solid transparent',
                  marginBottom:-1,cursor:'pointer'}}>
                {l}
              </button>
            ))}
          </div>

          <div style={{padding:'20px'}}>

            {/* Next class mini-banner inside booking tab */}
            {nextBooking&&tab==='book'&&(
              <div style={{marginBottom:16,padding:'10px 14px',background:'rgba(248,52,51,.07)',border:`1px solid rgba(248,52,51,.16)`,borderRadius:8,display:'flex',alignItems:'center',gap:10}}>
                <CalendarDays size={14} color={ORANGE} strokeWidth={1.5} style={{flexShrink:0}} />
                <div style={{fontSize:12,color:CREAM}}>
                  Next: <span style={{fontWeight:500}}>{nextBooking.title}</span>
                  <span style={{color:MUTED}}> · {dateLabel(nextBooking.class_date,todayStr)} · {fmtTime(nextBooking.start_time)}</span>
                </div>
              </div>
            )}

            {/* ════ BOOK A CLASS ════ */}
            {tab==='book'&&(
              <>
                {/* Day strip */}
                <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:6,marginBottom:20}}>
                  {days14.map(d=>{
                    const ds=toYMD(d),isSel=ds===selectedDate,isToday=ds===todayStr,hasCls=classes.some(c=>c.class_date===ds);
                    return(
                      <button key={ds} className="day-btn" onClick={()=>setSelectedDate(ds)}
                        style={{flexShrink:0,width:54,height:72,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,background:isSel?ORANGE:DARK,border:`1px solid ${isSel?ORANGE:isToday?ORANGE+'50':BORDER}`,borderRadius:12,position:'relative',color:'inherit'}}>
                        <span style={{fontSize:10,letterSpacing:'.08em',textTransform:'uppercase',color:isSel?'rgba(255,255,255,.75)':isToday?ORANGE:MUTED}}>{d.toLocaleDateString('en-IN',{weekday:'short'})}</span>
                        <span style={{fontSize:20,fontWeight:700,color:isSel?'#fff':isToday?ORANGE:CREAM,lineHeight:1}}>{d.getDate()}</span>
                        {hasCls&&!isSel&&<div style={{width:4,height:4,borderRadius:'50%',background:ORANGE,position:'absolute',bottom:8}} />}
                      </button>
                    );
                  })}
                </div>

                {/* Trainer pills */}
                {trainers.length>1&&(
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
                    {trainers.map(t=>{const isSel=trainerFilter===t;return(
                      <button key={t} className="pill" onClick={()=>setTrainerFilter(t)}
                        style={{padding:'7px 16px',borderRadius:999,fontSize:12,fontWeight:500,border:`1px solid ${isSel?ORANGE:BORDER}`,background:isSel?`${ORANGE}18`:'transparent',color:isSel?ORANGE:MUTED}}>
                        {t==='all'?'All Trainers':t}
                      </button>
                    );})}
                  </div>
                )}

                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                  <span style={{fontSize:15,fontWeight:600,color:CREAM}}>{dateLabel(selectedDate,todayStr)}</span>
                  <span style={{fontSize:12,color:MUTED}}>{new Date(selectedDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span>
                </div>

                {dayClasses.length===0?(
                  <div style={{textAlign:'center',padding:'64px 0',color:MUTED,fontSize:14}}>
                    No classes on this day.{' '}
                    <button onClick={()=>{const next=days14.find(d=>classes.some(c=>c.class_date===toYMD(d)));if(next)setSelectedDate(toYMD(next));}} style={{color:ORANGE,background:'none',border:'none',cursor:'pointer',textDecoration:'underline',fontSize:14}}>Find next available →</button>
                  </div>
                ):(
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {dayClasses.map(cls=>{
                      const isBooked=cls.my_booking_status==='confirmed';
                      const spotsLeft=cls.capacity-cls.booked_count;
                      const isFull=spotsLeft<=0&&!isBooked;
                      const fillPct=(cls.booked_count/cls.capacity)*100;
                      const isReschedTarget=rescheduleMode!==null;
                      const hour=parseInt(cls.start_time.split(':')[0]);
                      const ampm=hour>=12?'PM':'AM';
                      const h12=hour%12||12;
                      return(
                        <div key={cls.id} className="slot-card" style={{background:DARK,border:`1px solid ${isBooked?'rgba(74,222,128,.2)':BORDER}`,borderRadius:8,padding:'16px 20px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                          <div style={{width:52,flexShrink:0,textAlign:'center'}}>
                            <div style={{fontSize:20,fontWeight:700,color:ORANGE,lineHeight:1,letterSpacing:'-.01em'}}>{h12}</div>
                            <div style={{fontSize:10,color:MUTED,marginTop:1}}>{ampm}</div>
                          </div>
                          <div style={{width:1,height:44,background:BORDER,flexShrink:0}} />
                          <div style={{flex:1,minWidth:120}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
                              <span style={{fontSize:15,fontWeight:600,color:CREAM}}>{cls.title}</span>
                              {isBooked&&<span style={{fontSize:10,background:'rgba(74,222,128,.12)',color:'#4ade80',border:'1px solid rgba(74,222,128,.28)',padding:'2px 8px',borderRadius:999}}>Booked ✓</span>}
                              {isFull&&!cls.on_waitlist&&<span style={{fontSize:10,background:'rgba(248,113,113,.12)',color:'#f87171',border:'1px solid rgba(248,113,113,.28)',padding:'2px 8px',borderRadius:999}}>Full</span>}
                              {cls.on_waitlist&&(()=>{const wp=waitlistPos.find(w=>w.classId===cls.id);return(<span style={{fontSize:10,background:'rgba(251,191,36,.12)',color:'#fbbf24',border:'1px solid rgba(251,191,36,.28)',padding:'2px 8px',borderRadius:999}}>{wp?`Waitlist #${wp.position} of ${wp.total}`:'On Waitlist'}</span>);})()}
                            </div>
                            <div style={{fontSize:12,color:MUTED}}>{fmtTime(cls.start_time)} – {fmtTime(cls.end_time)}{cls.trainer_name&&<span style={{color:ORANGE,marginLeft:6}}>· {cls.trainer_name}</span>}</div>
                            <div style={{marginTop:8,display:'flex',alignItems:'center',gap:8}}>
                              <div style={{width:80,height:3,background:'rgba(255,255,255,.05)',borderRadius:999,overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${fillPct}%`,background:isFull?'#f87171':fillPct>75?'#fbbf24':ORANGE,borderRadius:999}} />
                              </div>
                              <span style={{fontSize:11,color:isFull?'#f87171':spotsLeft<=3?'#fbbf24':MUTED}}>{isFull?'Full':`${spotsLeft} spot${spotsLeft!==1?'s':''} left`}</span>
                            </div>
                          </div>
                          {isReschedTarget?(
                            !isBooked&&!isFull?(
                              <button className="book-btn" disabled={busyId===cls.id} onClick={()=>rescheduleClass(rescheduleMode!,cls.id)}
                                style={{padding:'10px 20px',background:'#2563eb',color:'#fff',borderRadius:9,fontSize:13,fontWeight:600,flexShrink:0}}>
                                {busyId===cls.id?'Moving…':'Move Here →'}
                              </button>
                            ):null
                          ):!isBooked&&!isFull?(
                            <button className="book-btn" disabled={busyId===cls.id} onClick={()=>bookClass(cls.id)}
                              style={{padding:'10px 22px',background:ORANGE,color:'#fff',borderRadius:9,fontSize:13,fontWeight:600,flexShrink:0}}>
                              {busyId===cls.id?<span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite',display:'inline-block'}} />Booking…</span>:'Book Slot'}
                            </button>
                          ):isFull&&!isBooked?(
                            <button className="book-btn" disabled={busyId===cls.id} onClick={()=>toggleWaitlist(cls)}
                              style={{padding:'10px 16px',background:cls.on_waitlist?'transparent':'rgba(251,191,36,.15)',color:'#fbbf24',border:'1px solid rgba(251,191,36,.35)',borderRadius:9,fontSize:12,fontWeight:600,flexShrink:0}}>
                              {busyId===cls.id?'…':cls.on_waitlist?'Leave Waitlist':'Join Waitlist'}
                            </button>
                          ):null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ════ MY BOOKINGS ════ */}
            {tab==='my-bookings'&&(
              <>
                <div style={{marginBottom:14,padding:'9px 14px',background:'rgba(255,255,255,.03)',border:`1px solid ${BORDER}`,borderRadius:8,fontSize:12,color:MUTED,display:'flex',alignItems:'center',gap:8}}>
                  <Info size={13} strokeWidth={1.5} style={{flexShrink:0}} /> Cancellations are allowed up to 2 hours before class starts.
                </div>
                {!member!.reschedule_used&&!rescheduleMode&&myBookings.length>0&&(
                  <div style={{marginBottom:16,padding:'10px 14px',background:'rgba(37,99,235,.08)',border:'1px solid rgba(37,99,235,.25)',borderRadius:8,fontSize:12,color:'#93c5fd'}}>
                    <Info size={13} strokeWidth={1.5} style={{flexShrink:0,marginRight:6}} /> You have 1 free reschedule available this month.
                  </div>
                )}
                {myBookings.length===0?(
                  <div style={{textAlign:'center',padding:'64px 0',color:MUTED,fontSize:14}}>No bookings yet. <button onClick={()=>setTab('book')} style={{color:ORANGE,background:'none',border:'none',cursor:'pointer',textDecoration:'underline',fontSize:14}}>Book a class</button></div>
                ):(
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {myBookings.sort((a,b)=>(a.class_date+a.start_time).localeCompare(b.class_date+b.start_time)).map(cls=>{
                      const h=parseInt(cls.start_time.split(':')[0]);
                      return(
                        <div key={cls.my_booking_id} style={{background:DARK,border:'1px solid rgba(74,222,128,.18)',borderRadius:8,padding:'16px 20px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                          <div style={{width:52,flexShrink:0,textAlign:'center'}}>
                            <div style={{fontSize:20,fontWeight:700,color:ORANGE,lineHeight:1,letterSpacing:'-.01em'}}>{h%12||12}</div>
                            <div style={{fontSize:10,color:MUTED,marginTop:1}}>{h>=12?'PM':'AM'}</div>
                          </div>
                          <div style={{width:1,height:44,background:BORDER,flexShrink:0}} />
                          <div style={{flex:1,minWidth:120}}>
                            <div style={{fontSize:15,fontWeight:600,color:CREAM,marginBottom:3}}>{cls.title}</div>
                            <div style={{fontSize:12,color:MUTED,display:'flex',gap:12,flexWrap:'wrap'}}>
                              <span>{dateLabel(cls.class_date,todayStr)}</span>
                              <span>{fmtTime(cls.start_time)} – {fmtTime(cls.end_time)}</span>
                              {cls.trainer_name&&<span style={{color:ORANGE}}>{cls.trainer_name}</span>}
                            </div>
                          </div>
                          <span style={{fontSize:11,padding:'5px 12px',background:'rgba(74,222,128,.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,.25)',borderRadius:8,flexShrink:0}}>Confirmed</span>
                          <div style={{display:'flex',gap:6,flexShrink:0}}>
                            {!member!.reschedule_used&&!rescheduleMode&&(
                              <button onClick={()=>{setRescheduleMode(cls.my_booking_id!);setTab('book');}}
                                style={{padding:'8px 14px',fontSize:12,background:'none',border:`1px solid ${ORANGE}`,color:ORANGE,borderRadius:8,cursor:'pointer',fontWeight:500}}
                                onMouseOver={e=>e.currentTarget.style.background=`${ORANGE}12`} onMouseOut={e=>e.currentTarget.style.background='none'}>
                                Reschedule
                              </button>
                            )}
                            <button disabled={busyId===cls.my_booking_id} onClick={()=>cancelBooking(cls.my_booking_id!)}
                              style={{padding:'8px 14px',fontSize:12,background:'none',border:'1px solid rgba(248,113,113,.3)',color:'#f87171',borderRadius:8,cursor:'pointer',opacity:busyId===cls.my_booking_id?.5:1}}>
                              {busyId===cls.my_booking_id?'…':'Cancel'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ════ HISTORY ════ */}
            {tab==='history'&&(
              <>
                {histLoading?(
                  <div style={{textAlign:'center',padding:'64px 0',color:MUTED,fontSize:14}}>Loading history…</div>
                ):history.length===0?(
                  <div style={{textAlign:'center',padding:'64px 0',color:MUTED,fontSize:14}}>No past classes yet.</div>
                ):(
                  <>
                    <p style={{fontSize:12,color:MUTED,marginBottom:16}}>{history.length} past class{history.length!==1?'es':''}</p>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {history.map(h=>{
                        const hr=parseInt(h.start_time.split(':')[0]);
                        const attended=h.attended===true;
                        const cancelled=h.status==='cancelled'||h.status==='rescheduled';
                        return(
                          <div key={h.booking_id} style={{background:DARK,border:`1px solid ${cancelled?BORDER:'rgba(74,222,128,.12)'}`,borderRadius:10,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,opacity:cancelled?.6:1}}>
                            <div style={{width:46,flexShrink:0,textAlign:'center'}}>
                              <div style={{fontSize:17,fontWeight:700,color:cancelled?MUTED:ORANGE,lineHeight:1,letterSpacing:'-.01em'}}>{hr%12||12}</div>
                              <div style={{fontSize:9,color:MUTED,marginTop:1}}>{hr>=12?'PM':'AM'}</div>
                            </div>
                            <div style={{width:1,height:36,background:BORDER,flexShrink:0}} />
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:cancelled?MUTED:CREAM}}>{h.title}</div>
                              <div style={{fontSize:11,color:MUTED,marginTop:2}}>{fmtShortDate(h.class_date)} · {fmtTime(h.start_time)}{h.trainer_name&&<span style={{color:ORANGE,marginLeft:4}}>· {h.trainer_name}</span>}</div>
                            </div>
                            <div style={{flexShrink:0}}>
                              {cancelled?(
                                <span style={{fontSize:10,padding:'3px 8px',background:'rgba(248,113,113,.1)',color:'#f87171',border:'1px solid rgba(248,113,113,.25)',borderRadius:999}}>{h.status}</span>
                              ):attended?(
                                <span style={{fontSize:10,padding:'3px 8px',background:'rgba(74,222,128,.1)',color:'#4ade80',border:'1px solid rgba(74,222,128,.25)',borderRadius:999}}>Attended ✓</span>
                              ):(
                                <span style={{fontSize:10,padding:'3px 8px',background:'rgba(139,92,246,.1)',color:'#a78bfa',border:'1px solid rgba(139,92,246,.25)',borderRadius:999}}>Completed</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ════ PROFILE ════ */}
            {tab==='profile'&&(
              <div style={{maxWidth:420}}>
                <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:24}}>
                  <div style={{width:56,height:56,borderRadius:'50%',background:ORANGE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'#fff'}}>
                    {member!.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:CREAM}}>{member!.name}</div>
                    <div style={{fontSize:12,color:MUTED}}>{member!.phone}</div>
                  </div>
                </div>
                <form onSubmit={saveProfile} style={{display:'flex',flexDirection:'column',gap:14}}>
                  {[['Full Name','name','text',profileForm.name],['Email (optional)','email','email',profileForm.email]] .map(([label,key,type,val])=>(
                    <div key={key}>
                      <label style={{display:'block',fontSize:11,color:MUTED,marginBottom:6,textTransform:'uppercase',letterSpacing:'.1em'}}>{label}</label>
                      <div style={{border:`1px solid ${BORDER}`,borderRadius:8,background:DARK,padding:'0 12px'}}>
                        <input type={type} value={val} onChange={e=>setProfileForm(p=>({...p,[key]:e.target.value}))} style={{padding:'11px 0'}} placeholder={key==='email'?'your@email.com':''} />
                      </div>
                    </div>
                  ))}
                  {profileMsg&&(
                    <div style={{padding:'10px 12px',background:profileMsg.ok?'rgba(74,222,128,.08)':'rgba(248,113,113,.08)',border:`1px solid ${profileMsg.ok?'rgba(74,222,128,.25)':'rgba(248,113,113,.25)'}`,borderRadius:7,fontSize:12,color:profileMsg.ok?'#4ade80':'#f87171'}}>
                      {profileMsg.text}
                    </div>
                  )}
                  <div style={{display:'flex',gap:10}}>
                    <button type="submit" disabled={profileBusy}
                      style={{flex:1,padding:'12px',background:profileBusy?MUTED:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:profileBusy?'not-allowed':'pointer'}}>
                      {profileBusy?'Saving…':'Save Changes'}
                    </button>
                    <button type="button" onClick={()=>{setShowPwModal(true);setPwMsg(null);setPwForm({current:'',newPw:'',confirm:''});}}
                      style={{padding:'12px 18px',background:'none',border:`1px solid ${BORDER}`,color:MUTED,borderRadius:8,fontSize:13,cursor:'pointer'}}>
                      Change Password
                    </button>
                  </div>
                </form>
                <div style={{marginTop:24,padding:'14px 16px',background:'rgba(255,255,255,.03)',border:`1px solid ${BORDER}`,borderRadius:10}}>
                  <div style={{fontSize:11,color:MUTED,letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>Membership</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:MUTED}}>Plan</span><span style={{color:CREAM,fontWeight:600}}>{member!.plan_name}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:MUTED}}>Valid until</span><span style={{color:member!.days_remaining<=7?'#f87171':CREAM,fontWeight:600}}>{fmtShortDate(member!.plan_end)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:MUTED}}>Days remaining</span><span style={{color:member!.days_remaining<=7?'#f87171':'#4ade80',fontWeight:600}}>{member!.days_remaining} days</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:MUTED}}>Status</span><span style={{color:member!.is_frozen?'#fbbf24':'#4ade80',fontWeight:600}}>{member!.is_frozen?'Frozen':'Active'}</span></div>
                  </div>
                </div>
                <button onClick={logout} style={{marginTop:16,width:'100%',padding:'11px',background:'none',border:'1px solid rgba(248,113,113,.25)',color:'#f87171',borderRadius:8,fontSize:13,cursor:'pointer'}}>
                  Log out
                </button>
              </div>
            )}

          </div>
        </div>

      {/* ── Change Password Modal ── */}
      {showPwModal&&(
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget&&!member?.must_change_password)setShowPwModal(false);}}>
          <div className="modal-card" style={{padding:'28px 28px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div>
                <h3 style={{color:CREAM,fontSize:16,fontWeight:700,margin:0}}>
                  {member?.must_change_password ? 'Set Your Password' : 'Change Password'}
                </h3>
                <p style={{color:MUTED,fontSize:12,marginTop:3}}>
                  {member?.must_change_password
                    ? 'Please set a new password before continuing. The temporary password was sent to you via WhatsApp.'
                    : 'Choose a strong password (min 8 characters)'}
                </p>
              </div>
              {!member?.must_change_password&&(
                <button onClick={()=>setShowPwModal(false)} style={{background:'none',border:'none',color:MUTED,cursor:'pointer',fontSize:22,lineHeight:1,padding:0}}>×</button>
              )}
            </div>
            <form onSubmit={changePassword} style={{display:'flex',flexDirection:'column',gap:14}}>
              {([
                ['Current Password','current',showCurrent,()=>setShowCurrent(p=>!p)],
                ['New Password','newPw',showNew,()=>setShowNew(p=>!p)],
                ['Confirm New Password','confirm',showNew,()=>{}],
              ] as const).map(([label,key,show,toggle])=>(
                <div key={key}>
                  <label style={{display:'block',fontSize:11,color:MUTED,marginBottom:6,textTransform:'uppercase',letterSpacing:'.1em'}}>{label}</label>
                  <div style={{display:'flex',alignItems:'center',border:`1px solid ${BORDER}`,borderRadius:8,background:DARK,padding:'0 12px',transition:'border-color .15s'}}
                    onFocus={e=>(e.currentTarget.style.borderColor=ORANGE)} onBlur={e=>(e.currentTarget.style.borderColor=BORDER)}>
                    <input type={show?'text':'password'} required value={pwForm[key as keyof typeof pwForm]}
                      onChange={e=>setPwForm(p=>({...p,[key]:e.target.value}))} placeholder="••••••••" style={{flex:1,padding:'11px 0'}} />
                    {key!=='confirm'&&(
                      <button type="button" onClick={toggle} style={{background:'none',border:'none',cursor:'pointer',color:MUTED,fontSize:15,padding:'0 0 0 8px'}}>
                        {show?<EyeOff size={15} strokeWidth={1.5} />:<Eye size={15} strokeWidth={1.5} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {pwMsg&&(
                <div style={{padding:'10px 12px',background:pwMsg.ok?'rgba(74,222,128,.08)':'rgba(248,113,113,.08)',border:`1px solid ${pwMsg.ok?'rgba(74,222,128,.25)':'rgba(248,113,113,.25)'}`,borderRadius:7,fontSize:12,color:pwMsg.ok?'#4ade80':'#f87171'}}>
                  {pwMsg.text}
                </div>
              )}
              <button type="submit" disabled={pwBusy}
                style={{marginTop:4,padding:'12px',background:pwBusy?MUTED:ORANGE,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:pwBusy?'not-allowed':'pointer'}}>
                {pwBusy?'Saving…':'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
