'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, CheckCircle2, Clock, CalendarDays, Search, Download, MessageCircle, TrendingUp, BarChart3, RefreshCw, Snowflake, RotateCcw, Send } from 'lucide-react';

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
  yearly: { year: string; revenue: number; members: number }[];
  recent: { date: string; plan: string; price_paise: number }[];
};
type PromoCode = {
  id: string; code: string; discount_percent: number;
  max_uses: number | null; uses_count: number;
  expires_at: string | null; is_active: boolean; created_at: string;
};
type AuditLog = {
  id: string; admin_phone: string; action: string;
  entity_type: string | null; entity_id: string | null;
  details: Record<string, unknown> | null; created_at: string;
};

type Tab = 'members' | 'calendar' | 'add-class' | 'revenue' | 'broadcast' | 'promo' | 'audit';

const DARK = '#0D0B08';
const CARD = '#1A1410';
const BORDER = '#2A2118';
const CREAM = '#F5F0E8';
const MUTED = '#8A7A6A';
const ORANGE = '#F83433';
const SERIF = 'var(--font-bodoni), Georgia, serif';
const FAINT = 'rgba(241,233,218,0.04)';

const PALETTE = ['#F83433','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899','#06b6d4','#84cc16'];

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
  const [statAnim, setStatAnim] = useState(0);
  const [revAnim, setRevAnim] = useState(0);
  const [memberActionBusy, setMemberActionBusy] = useState<string | null>(null);
  const [freezeModal, setFreezeModal] = useState<Member | null>(null);
  const [freezeDays, setFreezeDays] = useState('');
  const [refundModal, setRefundModal] = useState<Member | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [broadcast, setBroadcast] = useState({ message: '', audience: 'active' as 'all' | 'active' | 'expiring' });
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number } | null>(null);
  const [recurring, setRecurring] = useState({ title: '', trainer_name: '', days_of_week: [] as number[], start_time: '', end_time: '', capacity: '20', weeks: '4' });
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [newPromo, setNewPromo] = useState({ code: '', discount_percent: '', max_uses: '', expires_at: '' });
  const [promoSaving, setPromoSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [revView, setRevView] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => { fetchAll(); }, []);

  // Count-up animation for the overview stat cards (runs once stats arrive)
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

  // Grow-in animation for the revenue bars (runs once revenue loads)
  useEffect(() => {
    if (!revenue) return;
    let raf: number; const start = performance.now(), dur = 900;
    const tick = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      setRevAnim(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [revenue]);

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

  async function resetPassword(memberId: string) {
    if (!confirm('Reset this member\'s password and send via WhatsApp?')) return;
    setMemberActionBusy(memberId + '-reset');
    const res = await fetch(`/api/admin/members/${memberId}/reset-password`, { method: 'POST' });
    const data = await res.json();
    setMemberActionBusy(null);
    setMsg(data.ok ? { text: 'Password reset — new password sent via WhatsApp', ok: true } : { text: data.error || 'Failed', ok: false });
  }

  async function submitRefund() {
    if (!refundModal) return;
    setMemberActionBusy(refundModal.id + '-refund');
    const res = await fetch(`/api/admin/members/${refundModal.id}/refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: refundReason }),
    });
    const data = await res.json();
    setMemberActionBusy(null);
    setRefundModal(null); setRefundReason('');
    setMsg(data.ok ? { text: `Refund ₹${(data.amount/100).toLocaleString('en-IN')} initiated`, ok: true } : { text: data.error || 'Refund failed', ok: false });
    fetchAll();
  }

  async function submitFreeze(action: 'freeze' | 'unfreeze') {
    if (!freezeModal) return;
    setMemberActionBusy(freezeModal.id + '-freeze');
    const res = await fetch(`/api/admin/members/${freezeModal.id}/freeze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, days: action === 'unfreeze' ? parseInt(freezeDays) : undefined }),
    });
    const data = await res.json();
    setMemberActionBusy(null); setFreezeModal(null); setFreezeDays('');
    if (data.ok) {
      setMsg({ text: action === 'freeze' ? 'Membership frozen' : `Membership unfrozen — plan extended to ${data.new_plan_end}`, ok: true });
      fetchAll();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBroadcastBusy(true); setBroadcastResult(null);
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcast),
    });
    const data = await res.json();
    setBroadcastBusy(false);
    if (data.ok) {
      setBroadcastResult({ sent: data.sent, failed: data.failed });
      setBroadcast(prev => ({ ...prev, message: '' }));
    } else setMsg({ text: data.error || 'Broadcast failed', ok: false });
  }

  async function createRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!recurring.days_of_week.length) { setMsg({ text: 'Select at least one day', ok: false }); return; }
    setRecurringSaving(true); setMsg(null);
    const res = await fetch('/api/admin/classes/recurring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...recurring, capacity: parseInt(recurring.capacity), weeks: parseInt(recurring.weeks) }),
    });
    const data = await res.json();
    setRecurringSaving(false);
    if (data.ok) {
      setMsg({ text: `${data.created} recurring classes created!`, ok: true });
      setRecurring({ title: '', trainer_name: '', days_of_week: [], start_time: '', end_time: '', capacity: '20', weeks: '4' });
      fetchAll(); setTab('calendar');
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  function exportRevenueCSV() {
    window.open('/api/admin/export/revenue', '_blank');
  }

  async function loadPromoCodes() {
    setPromoLoading(true);
    const res = await fetch('/api/admin/promo-codes');
    const data = await res.json();
    setPromoCodes(data.codes || []);
    setPromoLoading(false);
  }

  async function createPromoCode(e: React.FormEvent) {
    e.preventDefault(); setPromoSaving(true); setMsg(null);
    const res = await fetch('/api/admin/promo-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: newPromo.code,
        discount_percent: parseInt(newPromo.discount_percent),
        max_uses: newPromo.max_uses ? parseInt(newPromo.max_uses) : undefined,
        expires_at: newPromo.expires_at || undefined,
      }),
    });
    const data = await res.json();
    setPromoSaving(false);
    if (data.ok) {
      setMsg({ text: 'Promo code created!', ok: true });
      setNewPromo({ code: '', discount_percent: '', max_uses: '', expires_at: '' });
      loadPromoCodes();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function togglePromo(id: string, is_active: boolean) {
    await fetch('/api/admin/promo-codes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !is_active }),
    });
    setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, is_active: !is_active } : p));
  }

  async function loadAuditLog() {
    setAuditLoading(true);
    const res = await fetch('/api/admin/audit-log');
    const data = await res.json();
    setAuditLogs(data.logs || []);
    setAuditLoading(false);
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
  const todayClasses = classes.filter(c => c.class_date === todayStr && !c.is_cancelled)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

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
        @media(max-width:900px){.admin-cal{grid-template-columns:1fr !important}}
      `}} />

      {/* ── Navbar ── */}
      <nav style={{ height:54, background:'#131009', borderBottom:`1px solid ${BORDER}`, padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/azdahlogo.png" alt="AZDAH" style={{ height:28, width:'auto', display:'block', filter:'none' }} />
          <span style={{ fontSize:9, background:`${ORANGE}22`, color:ORANGE, border:`1px solid ${ORANGE}40`, padding:'2px 7px', borderRadius:4, letterSpacing:'.12em', textTransform:'uppercase' }}>Admin</span>
        </div>
        <button onClick={logout} style={{ color:MUTED, fontSize:13, background:'none', border:'none', cursor:'pointer' }}>Logout</button>
      </nav>

      <div style={{ maxWidth:1240, margin:'0 auto', padding:'24px 20px' }}>

        {/* ── Heading ── */}
        <h1 style={{ fontFamily:SERIF, fontSize:32, fontWeight:800, color:CREAM, margin:'0 0 6px', lineHeight:1.05, letterSpacing:'-.01em' }}>Studio overview</h1>
        <p style={{ color:MUTED, fontSize:14, margin:'0 0 22px' }}>Members, bookings and revenue at a glance.</p>

        {/* ── KPI Row ── */}
        {stats && (
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:'hidden', display:'grid', gridTemplateColumns:'repeat(4,1fr)', marginBottom:16 }}>
            {[
              { Icon: Users,        label:'Total Members',      value: stats.total_members,  color: CREAM },
              { Icon: CheckCircle2, label:'Active Members',     value: stats.active_members, color: '#4ade80' },
              { Icon: Clock,        label:'Expiring in 7 days', value: stats.expiring_soon,  color: stats.expiring_soon > 0 ? '#fbbf24' : CREAM },
              { Icon: CalendarDays, label:'Classes This Week',  value: weekClassCount,       color: ORANGE },
            ].map((s, i) => (
              <div key={s.label} style={{ padding:'20px 24px', borderLeft: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <s.Icon size={14} color={MUTED} strokeWidth={1.5} />
                  <div style={{ fontFamily:SERIF, fontSize:34, fontWeight:800, color:s.color, lineHeight:1, letterSpacing:'-.02em' }}>{Math.round(s.value*statAnim)}</div>
                </div>
                <div style={{ fontSize:10, color:MUTED, letterSpacing:'.06em', textTransform:'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Toast ── */}
        {msg && (
          <div style={{ marginBottom:14, padding:'10px 14px', background: msg.ok ? 'rgba(74,222,128,.08)' : 'rgba(248,113,113,.08)', border:`1px solid ${msg.ok ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.25)'}`, borderRadius:7, fontSize:13, color: msg.ok ? '#4ade80' : '#f87171', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background:'none', border:'none', color:MUTED, cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{ display:'flex', borderBottom:`1px solid ${BORDER}`, marginBottom:20 }}>
          {([['calendar','Calendar'],['members','Members'],['revenue','Revenue'],['add-class','Add Class'],['broadcast','Broadcast'],['promo','Promos'],['audit','Audit']] as const).map(([k,l]) => (
            <button key={k} className="atab" onClick={() => { setTab(k); setMsg(null); if(k==='revenue')loadRevenue(); if(k==='promo')loadPromoCodes(); if(k==='audit')loadAuditLog(); }}
              style={{ padding:'13px 20px', fontSize:13, fontWeight:500, color: tab===k ? ORANGE : MUTED, borderBottom: tab===k ? `2px solid ${ORANGE}` : '2px solid transparent', marginBottom:-1 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ════ CALENDAR TAB ════ */}
        {tab === 'calendar' && (
          <div className="admin-cal" style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:14 }}>

            {/* Main calendar */}
            <div>
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
                      <div style={{ textAlign:'center', marginBottom:8, padding:'8px 4px', borderRadius:8, background: isToday ? `${ORANGE}12` : 'transparent', border: isToday ? `1px solid ${ORANGE}28` : '1px solid transparent' }}>
                        <div style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.1em' }}>
                          {date.toLocaleDateString('en-IN',{weekday:'short'})}
                        </div>
                        <div style={{ fontSize:20, fontWeight:700, color: isToday ? ORANGE : CREAM, lineHeight:1.3, marginTop:2 }}>
                          {date.getDate()}
                        </div>
                      </div>
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
                                style={{ marginTop:6, width:'100%', padding:'4px 0', fontSize:10, background:'rgba(248,52,51,.1)', border:'1px solid rgba(248,52,51,.25)', color:ORANGE, borderRadius:4, cursor:'pointer', opacity: dupBusy===cls.id?.5:1 }}>
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
            </div>

            {/* Sidebar */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* Today card */}
              <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'14px 16px', borderBottom:`1px solid ${BORDER}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:9, color:MUTED, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:3 }}>Today</div>
                    <div style={{ fontSize:13, fontWeight:600, color:CREAM }}>
                      {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}
                    </div>
                  </div>
                  <button onClick={() => setTab('add-class')}
                    style={{ fontSize:11, background:ORANGE, color:'#fff', border:'none', padding:'6px 13px', borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                    + Add
                  </button>
                </div>
                <div style={{ maxHeight:340, overflowY:'auto' }}>
                  {todayClasses.length === 0 ? (
                    <div style={{ padding:'28px 16px', textAlign:'center', color:MUTED, fontSize:12 }}>No classes today</div>
                  ) : (
                    todayClasses.map((cls, i) => {
                      const tc = trainerColor(cls.trainer_name);
                      const pct = (cls.booked_count / cls.capacity) * 100;
                      return (
                        <div key={cls.id} onClick={() => openClassModal(cls)}
                          style={{ padding:'11px 16px', cursor:'pointer', borderBottom: i < todayClasses.length-1 ? `1px solid ${BORDER}` : 'none' }}
                          onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,.02)'}
                          onMouseOut={e => e.currentTarget.style.background='transparent'}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:CREAM, flex:1, marginRight:8 }}>{cls.title}</div>
                            <div style={{ fontSize:11, color:ORANGE, fontWeight:600, flexShrink:0 }}>{fmtTime(cls.start_time)}</div>
                          </div>
                          {cls.trainer_name && <div style={{ fontSize:10, color:tc, marginBottom:4 }}>{cls.trainer_name}</div>}
                          <div style={{ height:2, background:'rgba(255,255,255,.05)', borderRadius:999, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background: pct >= 100 ? '#f87171' : tc, borderRadius:999 }} />
                          </div>
                          <div style={{ fontSize:10, color: pct >= 100 ? '#f87171' : MUTED, marginTop:3 }}>{cls.booked_count}/{cls.capacity} booked</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Trainer legend */}
              {trainerNames.length > 0 && (
                <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:9, color:MUTED, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Trainers</div>
                  {trainerNames.map(name => (
                    <div key={name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:trainerColor(name), flexShrink:0 }} />
                      <span style={{ fontSize:12, color:CREAM }}>{name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Expiring soon alert */}
              {stats && stats.expiring_soon > 0 && (
                <div style={{ background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.2)', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#fbbf24', marginBottom:4 }}>⚠ {stats.expiring_soon} expiring soon</div>
                  <div style={{ fontSize:11, color:MUTED }}>Members expiring within 7 days.</div>
                  <button onClick={() => setTab('members')}
                    style={{ marginTop:8, fontSize:11, background:'none', border:'1px solid rgba(251,191,36,.3)', color:'#fbbf24', padding:'5px 12px', borderRadius:5, cursor:'pointer' }}>
                    View Members →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ MEMBERS TAB ════ */}
        {tab === 'members' && (
          <>
            <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
              <div style={{ position:'relative', flex:1 }}>
                <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:MUTED, pointerEvents:'none', display:'flex' }}><Search size={14} strokeWidth={1.5} /></span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..."
                  style={{ width:'100%', background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:'10px 14px 10px 36px', color:CREAM, fontSize:13 }} />
              </div>
              <button onClick={exportMembersCSV} className="abtn"
                style={{ padding:'10px 16px', background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
                <Download size={13} strokeWidth={1.5} /> Members CSV
              </button>
            </div>

            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.2fr .7fr 1fr', padding:'10px 16px', background:'#131009', borderBottom:`1px solid ${BORDER}` }}>
                {['Member','Plan','Joined','Expires','Status','Actions'].map(h => (
                  <span key={h} style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.12em', fontWeight:600 }}>{h}</span>
                ))}
              </div>
              {filteredMembers.length === 0 ? (
                <div style={{ padding:'48px 0', textAlign:'center', color:MUTED, fontSize:13 }}>No members found.</div>
              ) : (
                filteredMembers.map((m, i) => (
                  <div key={m.id} className="mrow" style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.2fr .7fr 1fr', padding:'13px 16px', borderBottom: i < filteredMembers.length-1 ? `1px solid ${BORDER}` : 'none', alignItems:'center', background:'transparent' }}>
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
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      <a href={`https://wa.me/${m.phone}`} target="_blank" rel="noopener noreferrer" className="abtn"
                        title="WhatsApp Chat"
                        style={{ fontSize:11, padding:'5px 7px', border:'1px solid rgba(74,222,128,.3)', color:'#4ade80', borderRadius:5, textDecoration:'none', display:'inline-flex', alignItems:'center' }}><MessageCircle size={11} strokeWidth={1.5} /></a>
                      <button onClick={() => toggleMember(m.id, m.is_active)} className="abtn"
                        title={m.is_active ? 'Deactivate' : 'Activate'}
                        style={{ fontSize:11, padding:'5px 7px', border:`1px solid ${BORDER}`, color:MUTED, borderRadius:5, background:'none', cursor:'pointer' }}>
                        {m.is_active ? 'Off' : 'On'}
                      </button>
                      <button onClick={() => resetPassword(m.id)} className="abtn"
                        disabled={memberActionBusy === m.id + '-reset'}
                        title="Reset password & send via WhatsApp"
                        style={{ fontSize:11, padding:'5px 7px', border:'1px solid rgba(139,122,100,.3)', color:MUTED, borderRadius:5, background:'none', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                        <RefreshCw size={10} strokeWidth={1.5} />
                      </button>
                      <button onClick={() => setFreezeModal(m)} className="abtn"
                        title="Freeze / Unfreeze membership"
                        style={{ fontSize:11, padding:'5px 7px', border:'1px solid rgba(96,165,250,.3)', color:'#60a5fa', borderRadius:5, background:'none', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                        <Snowflake size={10} strokeWidth={1.5} />
                      </button>
                      {m.razorpay_payment_id && (
                        <button onClick={() => setRefundModal(m)} className="abtn"
                          title="Issue refund"
                          style={{ fontSize:11, padding:'5px 7px', border:'1px solid rgba(248,113,113,.3)', color:'#f87171', borderRadius:5, background:'none', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                          <RotateCcw size={10} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ════ REVENUE TAB ════ */}
        {tab === 'revenue' && (
          <>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
              <button onClick={exportRevenueCSV} className="abtn"
                style={{ padding:'9px 16px', background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                <Download size={13} strokeWidth={1.5} /> Revenue CSV
              </button>
            </div>
            {revLoading ? (
              <div style={{ padding:'64px 0', textAlign:'center', color:MUTED, fontSize:14 }}>Loading revenue data…</div>
            ) : !revenue ? (
              <div style={{ padding:'64px 0', textAlign:'center', color:MUTED, fontSize:14 }}>No data.</div>
            ) : (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24 }}>
                  {[
                    { label:'Total Revenue', value:`₹${(revenue.total_paise/100).toLocaleString('en-IN')}`, color:ORANGE, Icon:TrendingUp },
                    { label:'Paid Members', value:String(revenue.total_members), color:'#4ade80', Icon:Users },
                    { label:'Avg per Member', value: revenue.total_members ? `₹${Math.round(revenue.total_paise/100/revenue.total_members).toLocaleString('en-IN')}` : '—', color:CREAM, Icon:BarChart3 },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'20px 22px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                        <kpi.Icon size={15} color={MUTED} strokeWidth={1.5} />
                        <span style={{ fontFamily:SERIF, fontSize:30, fontWeight:800, color:kpi.color, lineHeight:1 }}>{kpi.value}</span>
                      </div>
                      <div style={{ fontSize:11, color:MUTED, textTransform:'uppercase', letterSpacing:'.06em' }}>{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {(revenue.monthly.length > 0 || revenue.yearly?.length > 0) && (
                  <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'20px 24px', marginBottom:24 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:CREAM }}>{revView === 'monthly' ? 'Monthly Revenue (Last 12 Months)' : 'Yearly Revenue'}</div>
                      <div style={{ display:'flex', gap:4 }}>
                        {(['monthly','yearly'] as const).map(v => (
                          <button key={v} onClick={() => setRevView(v)}
                            style={{ padding:'4px 12px', fontSize:11, borderRadius:5, border:`1px solid ${revView===v ? ORANGE : BORDER}`, background:revView===v ? `${ORANGE}18` : 'transparent', color:revView===v ? ORANGE : MUTED, cursor:'pointer' }}>
                            {v.charAt(0).toUpperCase()+v.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const data = revView === 'monthly' ? revenue.monthly : (revenue.yearly || []);
                      const max = Math.max(...data.map(m => m.revenue), 1);
                      return (
                        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120 }}>
                          {data.map((m, i) => (
                            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, height:'100%', justifyContent:'flex-end' }}>
                              <span style={{ fontSize:10, color:MUTED }}>{m.members}</span>
                              <div title={`₹${(m.revenue/100).toLocaleString('en-IN')} · ${m.members} member${m.members!==1?'s':''}`}
                                style={{ width:'100%', background:ORANGE, borderRadius:'3px 3px 0 0', height:`${Math.max(4,(m.revenue/max)*80*revAnim)}px`, opacity:.8+.2*(m.revenue/max), transition:'height .3s', cursor:'default' }} />
                              <span style={{ fontSize:9, color:MUTED, textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', width:'100%' }}>
                                {'month' in m ? (m as {month:string}).month : (m as {year:string}).year}
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
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, maxWidth:1000 }}>
            {/* Single class */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>Single Class</div>
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

            {/* Recurring classes */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>Recurring Classes</div>
              <form onSubmit={createRecurring} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {([
                  ['Class Title', 'title', 'text', 'e.g. Morning Yoga', true],
                  ['Trainer Name', 'trainer_name', 'text', 'Optional', false],
                  ['Start Time', 'start_time', 'time', '', true],
                  ['End Time', 'end_time', 'time', '', true],
                  ['Max Capacity', 'capacity', 'number', '20', true],
                  ['Weeks to Generate', 'weeks', 'number', '4', true],
                ] as const).map(([label, key, type, ph, req]) => (
                  <div key={key}>
                    <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>{label}{req && ' *'}</label>
                    <input type={type as string}
                      value={recurring[key as keyof typeof recurring] as string}
                      onChange={e => setRecurring({ ...recurring, [key]: e.target.value })}
                      placeholder={ph as string}
                      required={req as boolean}
                      min={key === 'capacity' ? '1' : key === 'weeks' ? '1' : undefined}
                      max={key === 'weeks' ? '12' : undefined}
                      style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13 }} />
                  </div>
                ))}
                <div>
                  <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:8, textTransform:'uppercase', letterSpacing:'.1em' }}>Days of Week *</label>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => {
                      const sel = recurring.days_of_week.includes(i);
                      return (
                        <button key={d} type="button"
                          onClick={() => setRecurring(prev => ({ ...prev, days_of_week: sel ? prev.days_of_week.filter(x => x !== i) : [...prev.days_of_week, i] }))}
                          style={{ padding:'6px 11px', fontSize:12, borderRadius:6, border:`1px solid ${sel ? ORANGE : BORDER}`, background: sel ? `${ORANGE}18` : 'transparent', color: sel ? ORANGE : MUTED, cursor:'pointer' }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button type="submit" disabled={recurringSaving}
                  style={{ marginTop:4, padding:'13px', background: recurringSaving ? MUTED : ORANGE, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor: recurringSaving ? 'not-allowed' : 'pointer' }}>
                  {recurringSaving ? 'Creating...' : 'Create Recurring'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ════════════════ BROADCAST TAB ════════════════ */}
        {tab === 'broadcast' && (
          <div style={{ maxWidth:540 }}>
            <p style={{ color:MUTED, fontSize:13, marginBottom:20 }}>Send a WhatsApp message to a group of members. Uses the <code style={{ color:ORANGE, fontSize:11 }}>azdah_broadcast</code> template.</p>
            <form onSubmit={sendBroadcast} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>Audience *</label>
                <select value={broadcast.audience} onChange={e => setBroadcast({ ...broadcast, audience: e.target.value as 'all' | 'active' | 'expiring' })}
                  style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13 }}>
                  <option value="active">Active members only</option>
                  <option value="expiring">Expiring in 7 days</option>
                  <option value="all">All members</option>
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>Message *</label>
                <textarea value={broadcast.message} onChange={e => setBroadcast({ ...broadcast, message: e.target.value })}
                  rows={5} placeholder="Type your message here..."
                  required
                  style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13, resize:'vertical', fontFamily:'inherit' }} />
              </div>
              <button type="submit" disabled={broadcastBusy}
                style={{ padding:'13px', background: broadcastBusy ? MUTED : ORANGE, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor: broadcastBusy ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <Send size={15} strokeWidth={1.5} />
                {broadcastBusy ? 'Sending...' : 'Send Broadcast'}
              </button>
            </form>
            {broadcastResult && (
              <div style={{ marginTop:16, padding:'14px 18px', background:'rgba(74,222,128,.06)', border:'1px solid rgba(74,222,128,.2)', borderRadius:8 }}>
                <div style={{ fontSize:13, color:'#4ade80', fontWeight:600 }}>Broadcast sent!</div>
                <div style={{ fontSize:12, color:MUTED, marginTop:4 }}>{broadcastResult.sent} sent · {broadcastResult.failed} failed</div>
              </div>
            )}
          </div>
        )}
        {/* ════════════════ PROMO CODES TAB ════════════════ */}
        {tab === 'promo' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, maxWidth:900 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>Create Promo Code</div>
              <form onSubmit={createPromoCode} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {([
                  ['Code', 'code', 'text', 'e.g. AZDAH20', true],
                  ['Discount %', 'discount_percent', 'number', '20', true],
                  ['Max Uses', 'max_uses', 'number', 'Unlimited', false],
                  ['Expires At', 'expires_at', 'datetime-local', '', false],
                ] as const).map(([label, key, type, ph, req]) => (
                  <div key={key}>
                    <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:5, textTransform:'uppercase', letterSpacing:'.1em' }}>{label}{req && ' *'}</label>
                    <input type={type as string}
                      value={newPromo[key as keyof typeof newPromo]}
                      onChange={e => setNewPromo({ ...newPromo, [key]: e.target.value })}
                      placeholder={ph as string} required={req as boolean}
                      min={key === 'discount_percent' ? '1' : key === 'max_uses' ? '1' : undefined}
                      max={key === 'discount_percent' ? '100' : undefined}
                      style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'10px 14px', color:CREAM, fontSize:13 }} />
                  </div>
                ))}
                <button type="submit" disabled={promoSaving}
                  style={{ padding:'12px', background:promoSaving?MUTED:ORANGE, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', marginTop:4 }}>
                  {promoSaving ? 'Creating…' : 'Create Code'}
                </button>
              </form>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>All Codes</div>
              {promoLoading ? <div style={{ color:MUTED, fontSize:13 }}>Loading…</div> : promoCodes.length === 0 ? <div style={{ color:MUTED, fontSize:13 }}>No codes yet.</div> : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {promoCodes.map(p => (
                    <div key={p.id} style={{ background:CARD, border:`1px solid ${p.is_active ? BORDER : '#1a1a1a'}`, borderRadius:8, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', opacity:p.is_active ? 1 : 0.5 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:CREAM, letterSpacing:'.08em' }}>{p.code}</div>
                        <div style={{ fontSize:11, color:MUTED, marginTop:2 }}>
                          {p.discount_percent}% off · {p.uses_count}/{p.max_uses ?? '∞'} used
                          {p.expires_at && ` · exp ${fmtDate(p.expires_at)}`}
                        </div>
                      </div>
                      <button onClick={() => togglePromo(p.id, p.is_active)} className="abtn"
                        style={{ fontSize:11, padding:'5px 10px', border:`1px solid ${BORDER}`, color:p.is_active?'#f87171':'#4ade80', borderRadius:5, background:'none', cursor:'pointer' }}>
                        {p.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════ AUDIT LOG TAB ════════════════ */}
        {tab === 'audit' && (
          <div style={{ maxWidth:860 }}>
            {auditLoading ? <div style={{ color:MUTED, fontSize:13 }}>Loading…</div> : auditLogs.length === 0 ? <div style={{ color:MUTED, fontSize:13 }}>No audit entries yet.</div> : (
              <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1.8fr 1.2fr 1fr 1fr', padding:'10px 16px', background:'#131009', borderBottom:`1px solid ${BORDER}` }}>
                  {['Action','Admin','Entity','Time'].map(h => (
                    <span key={h} style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.12em', fontWeight:600 }}>{h}</span>
                  ))}
                </div>
                {auditLogs.map((l, i) => (
                  <div key={l.id} style={{ display:'grid', gridTemplateColumns:'1.8fr 1.2fr 1fr 1fr', padding:'11px 16px', borderBottom: i < auditLogs.length-1 ? `1px solid ${BORDER}` : 'none', alignItems:'center' }}>
                    <span style={{ fontSize:12, color:CREAM, fontWeight:500 }}>{l.action.replace(/_/g,' ')}</span>
                    <span style={{ fontSize:11, color:MUTED }}>{l.admin_phone}</span>
                    <span style={{ fontSize:11, color:MUTED }}>{l.entity_type || '—'}</span>
                    <span style={{ fontSize:11, color:MUTED }}>{new Date(l.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ════ FREEZE MODAL ════ */}
      {freezeModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setFreezeModal(null); }}>
          <div className="modal-box" style={{ maxWidth:380, padding:'24px' }}>
            <div style={{ fontSize:15, fontWeight:600, color:CREAM, marginBottom:4 }}>Freeze Membership</div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:20 }}>{freezeModal.name} · {freezeModal.plan_name}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={() => submitFreeze('freeze')} disabled={memberActionBusy === freezeModal.id + '-freeze'}
                style={{ padding:'11px', background:'rgba(96,165,250,.1)', border:'1px solid rgba(96,165,250,.3)', color:'#60a5fa', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Freeze Now
              </button>
              <div style={{ fontSize:11, color:MUTED, textAlign:'center' }}>— or unfreeze & extend —</div>
              <input type="number" placeholder="Days frozen (to extend plan end)" value={freezeDays} onChange={e => setFreezeDays(e.target.value)}
                min="1" style={{ background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'10px 14px', color:CREAM, fontSize:13, width:'100%' }} />
              <button onClick={() => submitFreeze('unfreeze')} disabled={!freezeDays || memberActionBusy === freezeModal.id + '-freeze'}
                style={{ padding:'11px', background:ORANGE, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Unfreeze & Extend Plan
              </button>
              <button onClick={() => setFreezeModal(null)}
                style={{ padding:'8px', background:'none', border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, fontSize:12, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ REFUND MODAL ════ */}
      {refundModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setRefundModal(null); }}>
          <div className="modal-box" style={{ maxWidth:380, padding:'24px' }}>
            <div style={{ fontSize:15, fontWeight:600, color:CREAM, marginBottom:4 }}>Issue Refund</div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:20 }}>{refundModal.name} · {refundModal.plan_name}</div>
            <div style={{ fontSize:12, color:'#fbbf24', background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.2)', borderRadius:6, padding:'10px 12px', marginBottom:14 }}>
              Full plan amount will be refunded via Razorpay. Member will be deactivated.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <input placeholder="Reason (optional)" value={refundReason} onChange={e => setRefundReason(e.target.value)}
                style={{ background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'10px 14px', color:CREAM, fontSize:13, width:'100%' }} />
              <button onClick={submitRefund} disabled={memberActionBusy === refundModal.id + '-refund'}
                style={{ padding:'11px', background:'rgba(248,113,113,.15)', border:'1px solid rgba(248,113,113,.3)', color:'#f87171', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {memberActionBusy === refundModal.id + '-refund' ? 'Processing...' : 'Confirm Refund'}
              </button>
              <button onClick={() => { setRefundModal(null); setRefundReason(''); }}
                style={{ padding:'8px', background:'none', border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, fontSize:12, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
