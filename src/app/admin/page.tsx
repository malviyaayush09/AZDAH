'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Member = {
  id: string; name: string; phone: string;
  plan_name: string; plan_start: string; plan_end: string;
  days_remaining: number; is_active: boolean;
  reschedule_used: boolean; razorpay_payment_id: string | null;
  created_at: string;
};

type ClassSlot = {
  id: string; title: string; trainer_name: string | null;
  class_date: string; start_time: string; end_time: string;
  capacity: number; booked_count: number; is_cancelled: boolean;
};

type AdminStats = { total_members: number; active_members: number; expiring_soon: number };

type ClassBooking = {
  id: string; created_at: string; attended: boolean | null;
  member: { id: string; name: string; phone: string; plan_end: string } | null;
};

type RevenueData = {
  total_paise: number; total_members: number;
  monthly: { month: string; revenue: number; members: number }[];
  recent: { date: string; plan: string; price_paise: number }[];
};

type Tab = 'members' | 'calendar' | 'add-class' | 'revenue';

const DARK = '#0D0B08';
const CARD = '#1A1410';
const BORDER = '#2A2118';
const CREAM = '#F5F0E8';
const MUTED = '#8A7A6A';
const ORANGE = '#E1542B';
const FAINT = 'rgba(241,233,218,0.04)';

const PALETTE = ['#E1542B','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899','#06b6d4','#84cc16'];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function getWeekDates(ref: Date): Date[] {
  const d = new Date(ref); d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => { const nd = new Date(d); nd.setDate(d.getDate() + i); return nd; });
}
function toYMD(d: Date) { return d.toISOString().split('T')[0]; }
function fmtDate(s: string) {
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function mondayOf(d: Date) {
  const nd = new Date(d); nd.setHours(0,0,0,0);
  const day = nd.getDay();
  nd.setDate(nd.getDate() - (day === 0 ? 6 : day - 1));
  return nd;
}

export default function AdminPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tab, setTab] = useState<Tab>('calendar');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [viewingClass, setViewingClass] = useState<ClassSlot | null>(null);
  const [classBookings, setClassBookings] = useState<ClassBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [newClass, setNewClass] = useState({ title:'', trainer_name:'', class_date:'', start_time:'', end_time:'', capacity:'20' });
  const [saving, setSaving] = useState(false);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState<string | null>(null);
  const [dupBusy, setDupBusy] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const [mRes, cRes] = await Promise.all([fetch('/api/admin/members'), fetch('/api/admin/classes')]);
    if (mRes.status === 401 || mRes.status === 403) { router.push('/login'); return; }
    const [mData, cData] = await Promise.all([mRes.json(), cRes.json()]);
    setMembers(mData.members || []);
    setStats(mData.stats || null);
    setClasses(cData.classes || []);
    setLoading(false);
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const res = await fetch('/api/admin/classes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newClass, capacity: parseInt(newClass.capacity) }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setMsg({ text: 'Class scheduled!', ok: true });
      setNewClass({ title:'', trainer_name:'', class_date:'', start_time:'', end_time:'', capacity:'20' });
      fetchAll(); setTab('calendar');
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function cancelClass(cls: ClassSlot) {
    // Open WhatsApp for each booked member with pre-filled cancellation message
    if (classBookings.length > 0) {
      const date = fmtDate(cls.class_date);
      const time = fmtTime(cls.start_time);
      classBookings.forEach(b => {
        if (!b.member?.phone) return;
        const name = b.member.name.split(' ')[0];
        const text = encodeURIComponent(`Hi ${name}, your *${cls.title}* class scheduled on *${date} at ${time}* has been cancelled. Sorry for the inconvenience. Please contact us to reschedule. — AZDAH`);
        window.open(`https://wa.me/${b.member.phone}?text=${text}`, '_blank');
      });
    }
    const res = await fetch(`/api/admin/classes/${cls.id}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { setMsg({ text: `Class cancelled. WhatsApp opened for ${classBookings.length} member${classBookings.length !== 1 ? 's' : ''}.`, ok: true }); fetchAll(); setViewingClass(null); }
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function toggleMember(id: string, active: boolean) {
    const res = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    });
    const data = await res.json();
    if (data.success) fetchAll();
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function openClassModal(cls: ClassSlot) {
    setViewingClass(cls); setClassBookings([]); setLoadingBookings(true);
    const res = await fetch(`/api/admin/classes/${cls.id}/bookings`);
    const data = await res.json();
    setClassBookings(data.bookings || []);
    setLoadingBookings(false);
  }

  async function loadRevenue() {
    if (revenue) return;
    setRevLoading(true);
    const res = await fetch('/api/admin/revenue');
    const data = await res.json();
    setRevenue(data);
    setRevLoading(false);
  }

  async function markAttendance(bookingId: string, attended: boolean) {
    if (!viewingClass) return;
    setAttendanceBusy(bookingId);
    const res = await fetch(`/api/admin/classes/${viewingClass.id}/attendance`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, attended }),
    });
    const data = await res.json();
    if (data.success) {
      setClassBookings(prev => prev.map(b => b.id === bookingId ? { ...b, attended } : b));
    } else setMsg({ text: data.error || 'Failed to update attendance', ok: false });
    setAttendanceBusy(null);
  }

  async function duplicateClass(cls: ClassSlot) {
    setDupBusy(cls.id);
    const res = await fetch(`/api/admin/classes/${cls.id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    setDupBusy(null);
    if (data.success) {
      setMsg({ text: `Class duplicated to ${fmtDate(data.newDate)}!`, ok: true });
      setViewingClass(null);
      fetchAll();
    } else setMsg({ text: data.error || 'Duplicate failed', ok: false });
  }

  function exportMembersCSV() {
    const headers = ['Name','Phone','Plan','Joined','Expires','Days Left','Status','Payment ID'];
    const rows = members.map(m => [
      m.name, m.phone, m.plan_name,
      fmtDate(m.created_at), fmtDate(m.plan_end),
      String(m.days_remaining),
      m.is_active ? 'Active' : 'Inactive',
      m.razorpay_payment_id || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v.replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `azdah-members-${toYMD(new Date())}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }

  const weekDates = getWeekDates(weekStart);
  const todayStr = toYMD(new Date());
  const trainerNames = Array.from(new Set(classes.map(c => c.trainer_name).filter(Boolean) as string[]));
  const trainerColor = (name: string | null) => name ? PALETTE[trainerNames.indexOf(name) % PALETTE.length] : MUTED;
  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search));
  const weekClassCount = classes.filter(c => {
    const d = new Date(c.class_date + 'T00:00:00');
    return !c.is_cancelled && d >= weekDates[0] && d <= weekDates[6];
  }).length;

  if (loading) return (
    <div style={{ minHeight:'100vh', background:DARK, display:'flex', alignItems:'center', justifyContent:'center', color:MUTED, fontSize:14 }}>
      Loading admin panel...
    </div>
  );

  return (
    <main style={{ minHeight:'100vh', background:DARK, fontFamily:'system-ui,sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        *{box-sizing:border-box}
        .atab{transition:color .15s;background:none;border:none;cursor:pointer;font-family:inherit}
        .atab:hover{color:${CREAM} !important}
        .mrow{transition:background .12s}
        .mrow:hover{background:#1E1712 !important}
        .cbk{transition:transform .12s,box-shadow .12s;cursor:pointer}
        .cbk:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.5)}
        .abtn{transition:opacity .12s,background .12s;cursor:pointer}
        .abtn:hover{opacity:.8}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
        .modal-box{background:#1A1410;border:1px solid #3A2B1E;border-radius:14px;width:100%;max-width:520px;max-height:88vh;overflow-y:auto}
        input:focus{outline:none;border-color:${ORANGE} !important}
        input[type=date]::-webkit-calendar-picker-indicator,input[type=time]::-webkit-calendar-picker-indicator{filter:invert(.5);cursor:pointer}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#3A2B1E;border-radius:9px}
      `}} />

      {/* ── Navbar ── */}
      <nav style={{ height:54, background:'#131009', borderBottom:`1px solid ${BORDER}`, padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.jpeg" alt="AZDAH" style={{ height:28, width:'auto', display:'block', filter:'grayscale(1) brightness(2) contrast(10) invert(1)' }} />
          <span style={{ fontSize:9, background:`${ORANGE}22`, color:ORANGE, border:`1px solid ${ORANGE}40`, padding:'2px 7px', borderRadius:4, letterSpacing:'.12em', textTransform:'uppercase' }}>Admin</span>
        </div>
        <button onClick={logout} style={{ color:MUTED, fontSize:13, background:'none', border:'none', cursor:'pointer' }}>Logout</button>
      </nav>

      <div style={{ maxWidth:1240, margin:'0 auto', padding:'24px 16px' }}>

        {/* ── Stats ── */}
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginBottom:24 }}>
            {[
              { icon:'👥', label:'Total Members',       value:stats.total_members,  color:CREAM },
              { icon:'✅', label:'Active Members',       value:stats.active_members, color:'#4ade80' },
              { icon:'⏳', label:'Expiring in 7 days',  value:stats.expiring_soon,  color:stats.expiring_soon > 0 ? '#fbbf24' : CREAM },
              { icon:'📅', label:'Classes This Week',   value:weekClassCount,        color:ORANGE },
            ].map(s => (
              <div key={s.label} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'18px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:20 }}>{s.icon}</span>
                  <span style={{ fontSize:26, fontWeight:700, color:s.color }}>{s.value}</span>
                </div>
                <div style={{ fontSize:11, color:MUTED, letterSpacing:'.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Toast ── */}
        {msg && (
          <div style={{ marginBottom:16, padding:'10px 14px', background: msg.ok ? 'rgba(74,222,128,.08)' : 'rgba(248,113,113,.08)', border:`1px solid ${msg.ok ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.25)'}`, borderRadius:7, fontSize:13, color: msg.ok ? '#4ade80' : '#f87171', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background:'none', border:'none', color:MUTED, cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display:'flex', borderBottom:`1px solid ${BORDER}`, marginBottom:24 }}>
          {([['calendar','📅 Calendar'],['members','👥 Members'],['revenue','💰 Revenue'],['add-class','＋ Add Class']] as const).map(([k,l]) => (
            <button key={k} className="atab" onClick={() => { setTab(k); setMsg(null); if(k==='revenue')loadRevenue(); }}
              style={{ padding:'12px 20px', fontSize:13, fontWeight:500, color: tab===k ? ORANGE : MUTED, borderBottom: tab===k ? `2px solid ${ORANGE}` : '2px solid transparent', marginBottom:-1 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ════════════════ CALENDAR TAB ════════════════ */}
        {tab === 'calendar' && (
          <>
            {/* Week nav */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', gap:6 }}>
                {[['← Prev', -7],['Today', 0],['Next →', 7]].map(([label, delta]) => (
                  <button key={String(label)} className="abtn"
                    onClick={() => {
                      if (delta === 0) { setWeekStart(mondayOf(new Date())); return; }
                      const d = new Date(weekStart); d.setDate(d.getDate() + (delta as number)); setWeekStart(d);
                    }}
                    style={{ padding:'7px 14px', background:CARD, border:`1px solid ${BORDER}`, color: label==='Today' ? MUTED : CREAM, borderRadius:6, fontSize:12, cursor:'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize:13, color:MUTED }}>
                {weekDates[0].toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – {weekDates[6].toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
              </span>
              <button className="abtn" onClick={() => setTab('add-class')}
                style={{ padding:'8px 18px', background:ORANGE, color:'#fff', border:'none', borderRadius:7, fontSize:13, fontWeight:600 }}>
                + Add Class
              </button>
            </div>

            {/* 7-column grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
              {weekDates.map((date, i) => {
                const ds = toYMD(date);
                const isToday = ds === todayStr;
                const dayClasses = classes.filter(c => c.class_date === ds && !c.is_cancelled)
                  .sort((a,b) => a.start_time.localeCompare(b.start_time));
                const cancelledCnt = classes.filter(c => c.class_date === ds && c.is_cancelled).length;
                return (
                  <div key={i}>
                    {/* Day header */}
                    <div style={{ textAlign:'center', marginBottom:8, padding:'8px 4px', borderRadius:8, background: isToday ? `${ORANGE}12` : 'transparent', border: isToday ? `1px solid ${ORANGE}28` : '1px solid transparent' }}>
                      <div style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.1em' }}>
                        {date.toLocaleDateString('en-IN',{weekday:'short'})}
                      </div>
                      <div style={{ fontSize:20, fontWeight:700, color: isToday ? ORANGE : CREAM, lineHeight:1.3, marginTop:2 }}>
                        {date.getDate()}
                      </div>
                    </div>

                    {/* Class blocks */}
                    <div style={{ display:'flex', flexDirection:'column', gap:6, minHeight:60 }}>
                      {dayClasses.length === 0 && (
                        <div style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center', color:'#2A2118', fontSize:18 }}>·</div>
                      )}
                      {dayClasses.map(cls => {
                        const tc = trainerColor(cls.trainer_name);
                        const pct = (cls.booked_count / cls.capacity) * 100;
                        return (
                          <div key={cls.id} className="cbk" onClick={() => openClassModal(cls)}
                            style={{ background:`${tc}12`, border:`1px solid ${tc}30`, borderLeft:`3px solid ${tc}`, borderRadius:7, padding:'9px 8px' }}>
                            <div style={{ fontSize:11, fontWeight:600, color:CREAM, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cls.title}</div>
                            <div style={{ fontSize:10, color:MUTED, marginTop:2 }}>{fmtTime(cls.start_time)}</div>
                            {cls.trainer_name && <div style={{ fontSize:10, color:tc, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cls.trainer_name}</div>}
                            <div style={{ marginTop:5, height:3, background:'rgba(255,255,255,.06)', borderRadius:999, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background:tc, borderRadius:999, transition:'width .3s' }} />
                            </div>
                            <div style={{ fontSize:10, color:MUTED, marginTop:2 }}>{cls.booked_count}/{cls.capacity} booked</div>
                          <button
                            onClick={e => { e.stopPropagation(); duplicateClass(cls); }}
                            disabled={dupBusy === cls.id}
                            style={{ marginTop:6, width:'100%', padding:'4px 0', fontSize:10, background:'rgba(225,84,43,.1)', border:'1px solid rgba(225,84,43,.25)', color:ORANGE, borderRadius:4, cursor:'pointer', opacity: dupBusy===cls.id?.5:1 }}>
                            {dupBusy===cls.id?'…':'+ Duplicate'}
                          </button>
                          </div>
                        );
                      })}
                      {cancelledCnt > 0 && (
                        <div style={{ fontSize:10, color:'#3A2B1E', textAlign:'center', padding:'2px 0' }}>{cancelledCnt} cancelled</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trainer legend */}
            {trainerNames.length > 0 && (
              <div style={{ marginTop:20, display:'flex', gap:16, flexWrap:'wrap', padding:'12px 16px', background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:MUTED }}>Trainers:</span>
                {trainerNames.map(name => (
                  <div key={name} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:trainerColor(name) }} />
                    <span style={{ fontSize:12, color:CREAM }}>{name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════ MEMBERS TAB ════════════════ */}
        {tab === 'members' && (
          <>
            <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
              <div style={{ position:'relative', flex:1 }}>
                <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:MUTED, fontSize:13, pointerEvents:'none' }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
                  style={{ width:'100%', background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:'10px 14px 10px 36px', color:CREAM, fontSize:13 }} />
              </div>
              <button onClick={exportMembersCSV} className="abtn"
                style={{ padding:'10px 16px', background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                ⬇ Export CSV
              </button>
            </div>

            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, overflow:'hidden' }}>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.2fr .7fr 100px', padding:'10px 16px', background:'#131009', borderBottom:`1px solid ${BORDER}` }}>
                {['Member','Plan','Joined','Expires','Status','Actions'].map(h => (
                  <span key={h} style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.12em', fontWeight:600 }}>{h}</span>
                ))}
              </div>

              {filteredMembers.length === 0 ? (
                <div style={{ padding:'48px 0', textAlign:'center', color:MUTED, fontSize:13 }}>No members found.</div>
              ) : (
                filteredMembers.map((m, i) => (
                  <div key={m.id} className="mrow" style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.2fr .7fr 100px', padding:'13px 16px', borderBottom: i < filteredMembers.length-1 ? `1px solid ${BORDER}` : 'none', alignItems:'center', background:'transparent' }}>
                    {/* Avatar + name */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:avatarColor(m.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {initials(m.name)}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ color:CREAM, fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                        <div style={{ color:MUTED, fontSize:11 }}>{m.phone.replace('91','+91 ')}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:12, color:ORANGE, fontWeight:500 }}>{m.plan_name}</div>
                    <div style={{ fontSize:12, color:MUTED }}>{fmtDate(m.created_at)}</div>
                    <div>
                      <div style={{ fontSize:12, color: m.days_remaining<=7 ? '#f87171' : CREAM }}>{fmtDate(m.plan_end)}</div>
                      <div style={{ fontSize:11, color: m.days_remaining<=7 ? '#f87171' : MUTED }}>{m.days_remaining}d left</div>
                    </div>
                    <span style={{ fontSize:11, padding:'3px 8px', borderRadius:999, background: m.is_active ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)', color: m.is_active ? '#4ade80' : '#f87171', border:`1px solid ${m.is_active ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.25)'}` }}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div style={{ display:'flex', gap:5 }}>
                      <a href={`https://wa.me/${m.phone}`} target="_blank" rel="noopener noreferrer" className="abtn"
                        style={{ fontSize:11, padding:'5px 8px', border:'1px solid rgba(74,222,128,.3)', color:'#4ade80', borderRadius:5, textDecoration:'none' }}>WA</a>
                      <button onClick={() => toggleMember(m.id, m.is_active)} className="abtn"
                        style={{ fontSize:11, padding:'5px 8px', border:`1px solid ${BORDER}`, color:MUTED, borderRadius:5, background:'none', cursor:'pointer' }}>
                        {m.is_active ? 'Off' : 'On'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ════════════════ REVENUE TAB ════════════════ */}
        {tab === 'revenue' && (
          <>
            {revLoading ? (
              <div style={{ padding:'64px 0', textAlign:'center', color:MUTED, fontSize:14 }}>Loading revenue data…</div>
            ) : !revenue ? (
              <div style={{ padding:'64px 0', textAlign:'center', color:MUTED, fontSize:14 }}>No data.</div>
            ) : (
              <>
                {/* Top KPIs */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
                  {[
                    { label:'Total Revenue', value:`₹${(revenue.total_paise/100).toLocaleString('en-IN')}`, color:ORANGE, icon:'💰' },
                    { label:'Paid Members', value:String(revenue.total_members), color:'#4ade80', icon:'👤' },
                    { label:'Avg per Member', value: revenue.total_members ? `₹${Math.round(revenue.total_paise/100/revenue.total_members).toLocaleString('en-IN')}` : '—', color:CREAM, icon:'📊' },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'20px 20px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                        <span style={{ fontSize:20 }}>{kpi.icon}</span>
                        <span style={{ fontSize:28, fontWeight:700, color:kpi.color, fontFamily:'Georgia,serif' }}>{kpi.value}</span>
                      </div>
                      <div style={{ fontSize:11, color:MUTED, textTransform:'uppercase', letterSpacing:'.1em' }}>{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Monthly bar chart */}
                {revenue.monthly.length > 0 && (
                  <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'20px 24px', marginBottom:24 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:16 }}>Monthly Revenue (Last 12 Months)</div>
                    {(() => {
                      const max = Math.max(...revenue.monthly.map(m => m.revenue), 1);
                      return (
                        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120 }}>
                          {revenue.monthly.map((m, i) => (
                            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end' }}>
                              <span style={{ fontSize:10, color:MUTED }}>{m.members}</span>
                              <div title={`₹${(m.revenue/100).toLocaleString('en-IN')} · ${m.members} member${m.members!==1?'s':''}`}
                                style={{ width:'100%', background:`${ORANGE}`, borderRadius:'3px 3px 0 0', height:`${Math.max(4,(m.revenue/max)*80)}px`, opacity:.8+.2*(m.revenue/max), transition:'height .3s', cursor:'default' }} />
                              <span style={{ fontSize:9, color:MUTED, textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', width:'100%' }}>
                                {m.month.replace(' ','\n')}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Recent payments */}
                {revenue.recent.length > 0 && (
                  <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', borderBottom:`1px solid ${BORDER}`, fontSize:13, fontWeight:600, color:CREAM }}>Recent Payments</div>
                    {revenue.recent.map((r, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom: i < revenue.recent.length-1 ? `1px solid ${BORDER}` : 'none' }}>
                        <div>
                          <div style={{ fontSize:13, color:CREAM }}>{r.plan} Plan</div>
                          <div style={{ fontSize:11, color:MUTED, marginTop:2 }}>{fmtDate(r.date)}</div>
                        </div>
                        <span style={{ fontSize:14, fontWeight:600, color:ORANGE }}>₹{(r.price_paise/100).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ════════════════ ADD CLASS TAB ════════════════ */}
        {tab === 'add-class' && (
          <div style={{ maxWidth:500 }}>
            <p style={{ color:MUTED, fontSize:13, marginBottom:20 }}>Fill in the details below to schedule a new class slot for members to book.</p>
            <form onSubmit={addClass} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {([
                ['Class Title', 'title', 'text', 'e.g. Morning Yoga, HIIT, Pilates', true],
                ['Trainer Name', 'trainer_name', 'text', 'Optional', false],
                ['Date', 'class_date', 'date', '', true],
                ['Start Time', 'start_time', 'time', '', true],
                ['End Time', 'end_time', 'time', '', true],
                ['Max Capacity', 'capacity', 'number', '20', true],
              ] as const).map(([label, key, type, ph, req]) => (
                <div key={key}>
                  <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>{label}{req && ' *'}</label>
                  <input type={type as string}
                    value={newClass[key as keyof typeof newClass]}
                    onChange={e => setNewClass({ ...newClass, [key]: e.target.value })}
                    placeholder={ph as string}
                    required={req as boolean}
                    min={key === 'capacity' ? '1' : undefined}
                    style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13 }} />
                </div>
              ))}
              <button type="submit" disabled={saving}
                style={{ marginTop:4, padding:'13px', background: saving ? MUTED : ORANGE, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Scheduling...' : 'Schedule Class'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ════════════════ CLASS BOOKINGS MODAL ════════════════ */}
      {viewingClass && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setViewingClass(null); }}>
          <div className="modal-box">
            {/* Modal header */}
            <div style={{ padding:'20px 24px', borderBottom:`1px solid ${BORDER}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ color:CREAM, fontWeight:600, fontSize:16 }}>{viewingClass.title}</span>
                  {viewingClass.is_cancelled && <span style={{ fontSize:10, background:'rgba(248,113,113,.15)', color:'#f87171', border:'1px solid rgba(248,113,113,.3)', padding:'2px 7px', borderRadius:4 }}>Cancelled</span>}
                </div>
                <div style={{ fontSize:13, color:MUTED }}>
                  {fmtDate(viewingClass.class_date)} · {fmtTime(viewingClass.start_time)} – {fmtTime(viewingClass.end_time)}
                  {viewingClass.trainer_name && (
                    <span style={{ color: trainerColor(viewingClass.trainer_name), marginLeft:6 }}>· {viewingClass.trainer_name}</span>
                  )}
                </div>
                {/* Capacity bar */}
                <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:120, height:5, background:'rgba(255,255,255,.05)', borderRadius:999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(viewingClass.booked_count/viewingClass.capacity)*100}%`, background: viewingClass.booked_count >= viewingClass.capacity ? '#f87171' : ORANGE, borderRadius:999 }} />
                  </div>
                  <span style={{ fontSize:12, color:MUTED }}>{viewingClass.booked_count}/{viewingClass.capacity} booked</span>
                  <span style={{ fontSize:12, color: viewingClass.capacity-viewingClass.booked_count > 0 ? '#4ade80' : '#f87171' }}>
                    · {viewingClass.capacity-viewingClass.booked_count} spots free
                  </span>
                </div>
              </div>
              <button onClick={() => setViewingClass(null)} style={{ color:MUTED, background:'none', border:'none', cursor:'pointer', fontSize:22, lineHeight:1, marginLeft:16, padding:0 }}>×</button>
            </div>

            {/* Bookings list */}
            <div style={{ padding:'16px 24px' }}>
              {loadingBookings ? (
                <div style={{ color:MUTED, fontSize:13, padding:'28px 0', textAlign:'center' }}>Loading...</div>
              ) : classBookings.length === 0 ? (
                <div style={{ color:MUTED, fontSize:13, padding:'28px 0', textAlign:'center' }}>No members booked yet.</div>
              ) : (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <span style={{ fontSize:11, color:MUTED, textTransform:'uppercase', letterSpacing:'.1em' }}>Booked Members — {classBookings.length}</span>
                    <span style={{ fontSize:11, color:'#4ade80' }}>{classBookings.filter(b=>b.attended).length} attended</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    {classBookings.map((b, i) => (
                      <div key={b.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:b.attended?'rgba(74,222,128,.04)':FAINT, borderRadius:8, border:`1px solid ${b.attended?'rgba(74,222,128,.2)':BORDER}` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background: b.member ? avatarColor(b.member.name) : MUTED, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {b.member ? initials(b.member.name) : '?'}
                          </div>
                          <div>
                            <div style={{ color:CREAM, fontSize:13, fontWeight:500 }}>{b.member?.name ?? '—'}</div>
                            <div style={{ color:MUTED, fontSize:11 }}>{b.member?.phone?.replace('91','+91 ')}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          {b.member?.plan_end && <span style={{ fontSize:11, color:MUTED }}>{fmtDate(b.member.plan_end)}</span>}
                          {b.member && (
                            <a href={`https://wa.me/${b.member.phone}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:11, padding:'4px 9px', border:'1px solid rgba(74,222,128,.3)', color:'#4ade80', borderRadius:5, textDecoration:'none' }}>WA</a>
                          )}
                          <button
                            disabled={attendanceBusy === b.id}
                            onClick={() => markAttendance(b.id, !b.attended)}
                            style={{ padding:'4px 10px', fontSize:11, borderRadius:5, border:`1px solid ${b.attended?'rgba(74,222,128,.4)':'rgba(139,122,100,.3)'}`, background:b.attended?'rgba(74,222,128,.12)':'transparent', color:b.attended?'#4ade80':MUTED, cursor:'pointer', fontWeight:500 }}>
                            {attendanceBusy===b.id?'…':b.attended?'✓ Present':'Mark Present'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ marginTop:18, display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
                {!viewingClass.is_cancelled && (
                  <>
                    <button onClick={() => duplicateClass(viewingClass)} disabled={dupBusy === viewingClass.id}
                      style={{ padding:'8px 14px', fontSize:12, background:'none', border:`1px solid ${ORANGE}40`, color:ORANGE, borderRadius:6, cursor:'pointer' }}>
                      {dupBusy===viewingClass.id?'Duplicating…':'Duplicate +7d'}
                    </button>
                    <button onClick={() => cancelClass(viewingClass)}
                      style={{ padding:'8px 14px', fontSize:12, background:'none', border:'1px solid rgba(248,113,113,.3)', color:'#f87171', borderRadius:6, cursor:'pointer' }}>
                      Cancel Class
                    </button>
                  </>
                )}
                <button onClick={() => setViewingClass(null)}
                  style={{ padding:'8px 18px', fontSize:12, background:ORANGE, color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
