'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, CheckCircle2, Clock, CalendarDays, Search, Download, MessageCircle, TrendingUp, BarChart3, RefreshCw, Snowflake, RotateCcw, Send, Trash2 } from 'lucide-react';
import { Toast } from '@/components/Toast';
import { api } from '@/lib/api';

type MemberPack = {
  id: string; name: string;
  classes_included: number | null; used: number; remaining: number | null;
  by_category?: { category: string; limit: number; used: number; remaining: number }[];
  starts_on: string; expires_on: string; is_frozen: boolean; is_live: boolean;
};

type Member = {
  id: string; name: string; phone: string;
  plan_name: string; plan_start: string; plan_end: string;
  days_remaining: number; is_active: boolean;
  reschedule_used: boolean; razorpay_payment_id: string | null;
  created_at: string;
  packs?: MemberPack[];
  live_pack_count?: number;
  booking_count?: number;
  classes_remaining?: number | null;
};

// One confirmed booking, flattened across bookings + members + classes.
type AdminBooking = {
  id: string; class_id: string; title: string; trainer_name: string | null;
  class_date: string; start_time: string; category: string | null;
  member_id: string; member_name: string; member_phone: string;
  plan_name: string | null; attended: boolean | null;
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
type ClassWaiting = {
  id: string; position: number; created_at: string;
  member: { id: string; name: string; phone: string } | null;
  canBePromoted: boolean; reason: string | null;
};

type RevenueData = {
  total_paise: number; total_members: number;
  monthly: { month: string; revenue: number; members: number }[];
  yearly: { year: string; revenue: number; members: number }[];
  recent: { date: string; plan: string; price_paise: number }[];
  by_category?: { category: string; revenue: number; members: number }[];
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

type Tab = 'overview' | 'members' | 'calendar' | 'add-class' | 'revenue' | 'broadcast' | 'promo' | 'audit' | 'templates' | 'instructors' | 'workshops';

type ClassTemplate = {
  id: string; title: string; instructor_name: string | null; instructor_id: string | null;
  day_of_week: number; start_time: string; end_time: string;
  capacity: number; category: string; notes: string | null;
  is_active: boolean; created_at: string;
};

type Instructor = {
  id: string; name: string; phone: string; is_active: boolean; created_at: string;
};

type Workshop = {
  id: string; title: string; description: string; instructor_name: string | null;
  workshop_date: string; start_time: string; end_time: string | null;
  capacity: number; price_paise: number; location: string | null;
  is_active: boolean; created_at: string; registration_count: number;
  paid_count: number; paid_total_paise: number;
};

type OrphanedPayment = {
  order_id: string; name: string; phone: string; amount_paise: number; workshop_title: string;
};

type WorkshopReg = {
  id: string; name: string; phone: string; email: string | null;
  amount_paise: number; status: string; created_at: string;
};

const DARK = '#0D0B08';
const CARD = '#1A1410';
const BORDER = '#2A2118';
const CREAM = '#F5F0E8';
const MUTED = '#8A7A6A';
const ORANGE = '#F83433';
const SERIF = 'var(--font-bodoni), Georgia, serif';
const FAINT = 'rgba(241,233,218,0.04)';

const PALETTE = ['#F83433','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899','#06b6d4','#84cc16'];

const CAT_LABELS: Record<string, string> = {
  pole_regular: 'Pole (Azdah / Arti)',
  pole_nimisha: 'Pole (Nimisha)',
  self_practice: 'Self Practice',
  mobility: 'Mobility',
  strength: 'Strength',
  combo: 'Combos',
  other: 'Other',
};

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
// Format a Date as YYYY-MM-DD using its LOCAL calendar parts. Must not use
// toISOString(): getWeekDates()/mondayOf() build days at local midnight, which
// in IST (UTC+5:30) is 18:30 the previous day in UTC — so toISOString() named
// every column the day before and shifted the whole calendar by one day.
function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
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
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [viewingClass, setViewingClass] = useState<ClassSlot | null>(null);
  const [classBookings, setClassBookings] = useState<ClassBooking[]>([]);
  const [capBusy, setCapBusy] = useState(false);
  const [classWaiting, setClassWaiting] = useState<ClassWaiting[]>([]);
  // Every confirmed booking in the visible week. Loaded up front so the
  // calendar can show who is in each class, and be filtered by instructor,
  // member or plan, without opening one class at a time.
  const [weekBookings, setWeekBookings] = useState<AdminBooking[]>([]);
  const [calTrainer, setCalTrainer] = useState('all');
  const [calMember, setCalMember] = useState('all');
  const [calPlan, setCalPlan] = useState('all');
  // Week is for scanning what is on; List is for reading who is in it. Seven
  // columns leave about 125px per class, which is too narrow for names.
  const [calView, setCalView] = useState<'day' | 'week' | 'list'>('day');
  const [selectedDay, setSelectedDay] = useState<string>(() => toYMD(new Date()));
  // The dashboard's chart data. Fetched only when she is looking at it.
  const [trendBookings, setTrendBookings] = useState<AdminBooking[] | null>(null);
  const [showNames, setShowNames] = useState(false);
  // Members tab: which row is expanded, and the dates behind it.
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [memberDates, setMemberDates] = useState<Record<string, AdminBooking[]>>({});
  const [datesBusy, setDatesBusy] = useState<string | null>(null);
  const [memberStatus, setMemberStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [newClass, setNewClass] = useState({ title:'', trainer_name:'', class_date:'', start_time:'', end_time:'', capacity:'20' });
  // Kept out of `newClass` so the existing text-input loop below stays untouched.
  // Empty, not 'pole_regular'. A silent default meant any class created
  // without touching this dropdown became a Pole class, and the mistake only
  // showed up later as a member's credits leaving the wrong bucket. The API
  // rejects a class with no category, so this cannot be skipped by accident.
  const [newClassCategory, setNewClassCategory] = useState('');
  const [newClassInstructor, setNewClassInstructor] = useState('');
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
  // Separate from `recurring` so the generic text-input loop below is untouched.
  const [recurringCategory, setRecurringCategory] = useState('');
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [newPromo, setNewPromo] = useState({ code: '', discount_percent: '', max_uses: '', expires_at: '' });
  const [promoSaving, setPromoSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [revView, setRevView] = useState<'monthly' | 'yearly'>('monthly');
  const [revCategory, setRevCategory] = useState<string>('all');
  const [templates, setTemplates] = useState<ClassTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: '', instructor_id: '', day_of_week: '1', start_time: '', end_time: '', capacity: '8', category: '' });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateDeleteBusy, setTemplateDeleteBusy] = useState<string | null>(null);
  const [genCycle, setGenCycle] = useState({ startDate: '', endDate: '' });
  const [genCycleSaving, setGenCycleSaving] = useState(false);
  const [genCycleResult, setGenCycleResult] = useState<{ created: number; skipped: number } | null>(null);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [instructorsLoading, setInstructorsLoading] = useState(false);
  const [newInstructor, setNewInstructor] = useState({ name: '', phone: '' });
  const [instructorSaving, setInstructorSaving] = useState(false);
  const [instructorBusy, setInstructorBusy] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [orphanedPayments, setOrphanedPayments] = useState<OrphanedPayment[]>([]);
  const [workshopsLoading, setWorkshopsLoading] = useState(false);
  const [newWorkshop, setNewWorkshop] = useState({ title: '', description: '', instructor_name: '', workshop_date: '', start_time: '', end_time: '', capacity: '20', price: '', location: '' });
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [workshopBusy, setWorkshopBusy] = useState<string | null>(null);
  const [viewingWorkshop, setViewingWorkshop] = useState<Workshop | null>(null);
  const [workshopRegs, setWorkshopRegs] = useState<WorkshopReg[]>([]);
  const [regsLoading, setRegsLoading] = useState(false);
  type OverviewStats = {
    today: { classes: number; expected_members: number; attended: number };
    expiring_this_week: { id: string; name: string; phone: string; plan_name: string; plan_end: string; days_remaining: number }[];
    inactive_members: { id: string; name: string; phone: string; plan_name: string; plan_end: string; created_at: string }[];
    whatsapp_enabled?: boolean;
  };
  type ScheduleHealth = {
    ends_on: string | null; days_left: number;
    classes_next_14_days: number; seats_free_next_14_days: number;
    credits_expiring_next_14_days: number;
    stranded_members: number; stranded_credits: number;
  };
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  // Per-day toggle for revealing cancelled classes in the calendar.
  const [expandedCancelled, setExpandedCancelled] = useState<Record<string, boolean>>({});

  // Membership payments captured by Razorpay where no member was ever created.
  type MembershipOrphan = {
    order_id: string; payment_id: string | null; name: string; phone: string;
    email: string | null; amount_paise: number | null; created_at: string; reason: string;
  };
  const [memberOrphans, setMemberOrphans] = useState<MembershipOrphan[]>([]);

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
    /**
     * Three bare fetches in Promise.all, then three bare .json() calls. One
     * failure rejected before setLoading(false) ran and left the studio owner
     * on "Loading..." with no way back -- locked out of her own panel by a
     * dropped request.
     */
    const [m, c, ov] = await Promise.all([
      api<{ members?: Member[]; stats?: AdminStats }>('/api/admin/members'),
      api<{ classes?: ClassSlot[] }>('/api/admin/classes'),
      api<OverviewStats>('/api/admin/overview-stats'),
    ]);
    if (m.status === 401 || m.status === 403) { router.push('/login'); return; }
    setMembers(m.data?.members || []);
    setStats(m.data?.stats || null);
    setClasses(c.data?.classes || []);
    setOverviewStats(ov.data?.today ? ov.data : null);
    setLoading(false);
    if (!m.ok || !c.ok) setMsg({ text: (m.ok ? c.error : m.error)!, ok: false });

    // Checked separately: it calls out to Razorpay per pending order, so it
    // must not hold up the dashboard render.
    fetch('/api/admin/orphaned-payments')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.orphans) setMemberOrphans(d.orphans); })
      .catch(() => {});
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const res = await api('/api/admin/classes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newClass,
        capacity: parseInt(newClass.capacity),
        category: newClassCategory,
        instructor_id: newClassInstructor || null,
        // Keep the label in sync with the picked instructor, like templates do.
        trainer_name: newClass.trainer_name
          || instructors.find(i => i.id === newClassInstructor)?.name
          || null,
      }),
    });
    const data = res.data ?? {};
    setSaving(false);
    if (data.success) {
      setMsg({ text: 'Class scheduled!', ok: true });
      setNewClass({ title:'', trainer_name:'', class_date:'', start_time:'', end_time:'', capacity:'20' });
      setNewClassCategory('pole_regular'); setNewClassInstructor('');
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
    const res = await api(`/api/admin/classes/${cls.id}/cancel`, { method: 'POST' });
    const data = res.data ?? {};
    if (data.success) {
      const released = data.released ?? 0;
      setMsg({
        text: `Class cancelled. WhatsApp opened for ${classBookings.length} member${classBookings.length !== 1 ? 's' : ''}.`
          + (released ? ` ${released} booking${released !== 1 ? 's' : ''} released — their class credit is back.` : ''),
        ok: true,
      });
      fetchAll(); setViewingClass(null);
    }
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function toggleMember(id: string, active: boolean) {
    const res = await api(`/api/admin/members/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    });
    const data = res.data ?? {};
    if (data.success) fetchAll();
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  /**
   * Add or remove seats on a class that is already published.
   *
   * There was no way to do this at all: the only route to "one more spot on
   * Thursday" was cancelling the class and rebuilding it, which throws away
   * everyone's bookings. Adding a seat hands it to the front of the waitlist
   * rather than to whoever refreshes first.
   */
  async function changeCapacity(delta: number) {
    if (!viewingClass) return;
    const next = viewingClass.capacity + delta;
    setCapBusy(true);
    const r = await api<{ capacity?: number; promoted?: { name: string }[] }>(
      `/api/admin/classes/${viewingClass.id}`,
      { method: 'PATCH', json: { capacity: next } },
    );
    setCapBusy(false);
    if (!r.ok) { setMsg({ text: r.error!, ok: false }); return; }
    const promoted = r.data?.promoted || [];
    setViewingClass(prev => prev ? { ...prev, capacity: r.data?.capacity ?? next } : prev);
    setMsg({
      text: promoted.length
        ? `Class size now ${next}. ${promoted.map(p => p.name).join(', ')} moved off the waitlist into the class.`
        : `Class size now ${next}.`,
      ok: true,
    });
    // The roster and the calendar both change when someone is promoted.
    if (promoted.length) openClassModal({ ...viewingClass, capacity: next });
    fetchAll();
  }

  async function openClassModal(cls: ClassSlot) {
    setViewingClass(cls); setClassBookings([]); setClassWaiting([]); setLoadingBookings(true);
    const res = await api<{ bookings?: ClassBooking[]; waitlist?: ClassWaiting[] }>(`/api/admin/classes/${cls.id}/bookings`);
    setClassBookings(res.data?.bookings || []);
    setClassWaiting(res.data?.waitlist || []);
    setLoadingBookings(false);
  }

  async function loadRevenue(category?: string) {
    setRevLoading(true);
    const q = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    const res = await api('/api/admin/revenue' + q);
    const data = res.data ?? {};
    setRevenue(data);
    setRevLoading(false);
  }

  async function markAttendance(bookingId: string, attended: boolean) {
    if (!viewingClass) return;
    setAttendanceBusy(bookingId);
    const res = await api(`/api/admin/classes/${viewingClass.id}/attendance`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, attended }),
    });
    const data = res.data ?? {};
    if (data.success) {
      setClassBookings(prev => prev.map(b => b.id === bookingId ? { ...b, attended } : b));
    } else setMsg({ text: data.error || 'Failed to update attendance', ok: false });
    setAttendanceBusy(null);
  }

  async function duplicateClass(cls: ClassSlot) {
    setDupBusy(cls.id);
    const res = await api(`/api/admin/classes/${cls.id}/duplicate`, { method: 'POST' });
    const data = res.data ?? {};
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
      m.name, m.phone,
      (m.packs && m.packs.filter(p => p.is_live).length
        ? m.packs.filter(p => p.is_live)
            .map(p => `${p.name} (${p.remaining === null ? 'unlimited' : p.remaining + ' left'})`)
            .join(' + ')
        : m.plan_name),
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
    if (!confirm('Reset this member\'s password? You will see the new password to share with them.')) return;
    setMemberActionBusy(memberId + '-reset');
    const res = await api(`/api/admin/members/${memberId}/reset-password`, { method: 'POST' });
    const data = res.data ?? {};
    setMemberActionBusy(null);
    if (data.ok) {
      // Show the password in a blocking alert so the admin can copy and relay it
      // (WhatsApp delivery is best-effort and may not be live yet).
      window.alert(`New password for ${data.name} (+${data.phone}):\n\n${data.password}\n\nShare this with the member. They'll be asked to change it on first login.`);
      setMsg({ text: `Password reset for ${data.name} — new password: ${data.password}`, ok: true });
    } else {
      setMsg({ text: data.error || 'Failed', ok: false });
    }
  }

  async function submitRefund() {
    if (!refundModal) return;
    setMemberActionBusy(refundModal.id + '-refund');
    const res = await api(`/api/admin/members/${refundModal.id}/refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: refundReason }),
    });
    const data = res.data ?? {};
    setMemberActionBusy(null);
    setRefundModal(null); setRefundReason('');
    setMsg(data.ok ? { text: `Refund ₹${(data.amount/100).toLocaleString('en-IN')} initiated`, ok: true } : { text: data.error || 'Refund failed', ok: false });
    fetchAll();
  }

  async function submitFreeze(action: 'freeze' | 'unfreeze') {
    if (!freezeModal) return;
    setMemberActionBusy(freezeModal.id + '-freeze');
    const res = await api(`/api/admin/members/${freezeModal.id}/freeze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, days: action === 'unfreeze' ? parseInt(freezeDays) : undefined }),
    });
    const data = res.data ?? {};
    setMemberActionBusy(null); setFreezeModal(null); setFreezeDays('');
    if (data.ok) {
      setMsg({ text: action === 'freeze' ? 'Membership frozen' : `Membership unfrozen — plan extended to ${data.new_plan_end}`, ok: true });
      fetchAll();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBroadcastBusy(true); setBroadcastResult(null);
    const res = await api('/api/admin/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcast),
    });
    const data = res.data ?? {};
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
    const res = await api('/api/admin/classes/recurring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...recurring, capacity: parseInt(recurring.capacity), weeks: parseInt(recurring.weeks), category: recurringCategory }),
    });
    const data = res.data ?? {};
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

  async function loadTemplates() {
    if (!instructors.length) loadInstructors();
    if (templates.length) return;
    setTemplatesLoading(true);
    const res = await api('/api/admin/class-templates');
    const data = res.data ?? {};
    setTemplates(data.templates || []);
    setTemplatesLoading(false);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault(); setTemplateSaving(true); setMsg(null);
    const inst = instructors.find(i => i.id === newTemplate.instructor_id);
    const res = await api('/api/admin/class-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newTemplate,
        instructor_id: newTemplate.instructor_id || null,
        instructor_name: inst?.name || null,
        day_of_week: parseInt(newTemplate.day_of_week),
        capacity: parseInt(newTemplate.capacity),
      }),
    });
    const data = res.data ?? {};
    setTemplateSaving(false);
    if (data.success) {
      setMsg({ text: 'Template created!', ok: true });
      setTemplates([]); loadTemplates();
      setNewTemplate({ title: '', instructor_id: '', day_of_week: '1', start_time: '', end_time: '', capacity: '8', category: '' });
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function loadInstructors() {
    setInstructorsLoading(true);
    const res = await api('/api/admin/instructors');
    const data = res.data ?? {};
    setInstructors(data.instructors || []);
    setInstructorsLoading(false);
  }

  async function createInstructor(e: React.FormEvent) {
    e.preventDefault(); setInstructorSaving(true); setMsg(null);
    const res = await api('/api/admin/instructors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInstructor),
    });
    const data = res.data ?? {};
    setInstructorSaving(false);
    if (data.success) {
      window.alert(`Instructor ${data.instructor.name} created.\n\nLogin phone: ${data.instructor.phone}\nPassword: ${data.password}\n\nShare these — they log in on the normal login page and land on their own instructor dashboard.`);
      setMsg({ text: `Instructor ${data.instructor.name} created — password: ${data.password}`, ok: true });
      setNewInstructor({ name: '', phone: '' });
      loadInstructors();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function toggleInstructor(id: string, active: boolean) {
    setInstructorBusy(id);
    const res = await api(`/api/admin/instructors/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    });
    const data = res.data ?? {};
    setInstructorBusy(null);
    if (data.ok) loadInstructors(); else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function resetInstructorPassword(id: string) {
    if (!confirm("Reset this instructor's password? You'll see the new one to share.")) return;
    setInstructorBusy(id);
    const res = await api(`/api/admin/instructors/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password' }),
    });
    const data = res.data ?? {};
    setInstructorBusy(null);
    if (data.ok) window.alert(`New password for ${data.name} (+${data.phone}):\n\n${data.password}\n\nShare it with them.`);
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function deleteInstructor(id: string) {
    if (!confirm('Remove this instructor? Their classes stay but become unassigned.')) return;
    setInstructorBusy(id);
    const res = await api(`/api/admin/instructors/${id}`, { method: 'DELETE' });
    const data = res.data ?? {};
    setInstructorBusy(null);
    if (data.ok) { setInstructors(prev => prev.filter(i => i.id !== id)); setMsg({ text: 'Instructor removed', ok: true }); }
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function loadWorkshops() {
    setWorkshopsLoading(true);
    const res = await api('/api/admin/workshops');
    const data = res.data ?? {};
    setWorkshops(data.workshops || []);
    setOrphanedPayments(data.orphaned || []);
    setWorkshopsLoading(false);
  }

  async function createWorkshop(e: React.FormEvent) {
    e.preventDefault(); setWorkshopSaving(true); setMsg(null);
    const priceNum = Number(newWorkshop.price || 0);
    if (isNaN(priceNum) || priceNum < 0) { setWorkshopSaving(false); setMsg({ text: 'Enter a valid price (0 for free)', ok: false }); return; }
    const res = await api('/api/admin/workshops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newWorkshop.title,
        description: newWorkshop.description,
        instructor_name: newWorkshop.instructor_name || null,
        workshop_date: newWorkshop.workshop_date,
        start_time: newWorkshop.start_time,
        end_time: newWorkshop.end_time || null,
        capacity: parseInt(newWorkshop.capacity),
        price_paise: Math.round(priceNum * 100),
        location: newWorkshop.location || null,
      }),
    });
    const data = res.data ?? {};
    setWorkshopSaving(false);
    if (data.success) {
      setMsg({ text: `Workshop created${data.workshop.price_paise === 0 ? ' (free)' : ''}!`, ok: true });
      setNewWorkshop({ title: '', description: '', instructor_name: '', workshop_date: '', start_time: '', end_time: '', capacity: '20', price: '', location: '' });
      loadWorkshops();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function toggleWorkshop(w: Workshop) {
    // Deactivating a workshop with PAID registrants: warn that hiding it does
    // not refund anyone — that has to be done in Razorpay.
    if (w.is_active && w.paid_count > 0) {
      const ok = confirm(
        `"${w.title}" has ${w.paid_count} PAID registration${w.paid_count !== 1 ? 's' : ''} totalling ₹${(w.paid_total_paise / 100).toLocaleString('en-IN')}.\n\n` +
        `Deactivating hides it from the public page but does NOT refund anyone. Refund them in the Razorpay dashboard first.\n\nDeactivate anyway?`
      );
      if (!ok) return;
    }
    setWorkshopBusy(w.id);
    const res = await api(`/api/admin/workshops/${w.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !w.is_active }),
    });
    const data = res.data ?? {};
    setWorkshopBusy(null);
    if (data.success) loadWorkshops(); else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function deleteWorkshop(w: Workshop) {
    // Delete is blocked server-side once anyone has registered (protects paid
    // records). Explain that here instead of letting it 409, and flag refunds.
    if (w.registration_count > 0) {
      alert(
        `"${w.title}" has ${w.registration_count} registration${w.registration_count !== 1 ? 's' : ''}` +
        `${w.paid_count > 0 ? ` (${w.paid_count} paid — refund in Razorpay first)` : ''}.\n\n` +
        `Delete is blocked to protect records. Use Deactivate to hide it from the public page instead.`
      );
      return;
    }
    if (!confirm(`Delete "${w.title}"? This can't be undone.`)) return;
    setWorkshopBusy(w.id);
    const res = await api(`/api/admin/workshops/${w.id}`, { method: 'DELETE' });
    const data = res.data ?? {};
    setWorkshopBusy(null);
    if (data.success) { setWorkshops(prev => prev.filter(x => x.id !== w.id)); setMsg({ text: 'Workshop deleted', ok: true }); }
    else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function viewRegistrations(w: Workshop) {
    setViewingWorkshop(w); setWorkshopRegs([]); setRegsLoading(true);
    const res = await api(`/api/admin/workshops/${w.id}/registrations`);
    const data = res.data ?? {};
    setWorkshopRegs(data.registrations || []);
    setRegsLoading(false);
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template? This will not affect already-created classes.')) return;
    setTemplateDeleteBusy(id);
    const res = await api(`/api/admin/class-templates/${id}`, { method: 'DELETE' });
    const data = res.data ?? {};
    setTemplateDeleteBusy(null);
    if (data.success) {
      setTemplates(prev => prev.filter(t => t.id !== id));
      setMsg({ text: 'Template deleted', ok: true });
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function generateCycleAction(e: React.FormEvent) {
    e.preventDefault(); setGenCycleSaving(true); setGenCycleResult(null); setMsg(null);
    const res = await api('/api/admin/generate-cycle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genCycle),
    });
    const data = res.data ?? {};
    setGenCycleSaving(false);
    if (data.success) {
      setGenCycleResult({ created: data.created, skipped: data.skipped });
      const restored = data.restored ?? 0;
      setMsg({
        text: `Done — ${data.created} created${restored ? `, ${restored} cancelled class${restored !== 1 ? 'es' : ''} restored` : ''}, ${data.skipped} already existed.`,
        ok: true,
      });
      fetchAll();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function loadPromoCodes() {
    setPromoLoading(true);
    const res = await api('/api/admin/promo-codes');
    const data = res.data ?? {};
    setPromoCodes(data.codes || []);
    setPromoLoading(false);
  }

  async function createPromoCode(e: React.FormEvent) {
    e.preventDefault(); setPromoSaving(true); setMsg(null);
    const res = await api('/api/admin/promo-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: newPromo.code,
        discount_percent: parseInt(newPromo.discount_percent),
        max_uses: newPromo.max_uses ? parseInt(newPromo.max_uses) : undefined,
        expires_at: newPromo.expires_at || undefined,
      }),
    });
    const data = res.data ?? {};
    setPromoSaving(false);
    if (data.ok) {
      setMsg({ text: 'Promo code created!', ok: true });
      setNewPromo({ code: '', discount_percent: '', max_uses: '', expires_at: '' });
      loadPromoCodes();
    } else setMsg({ text: data.error || 'Failed', ok: false });
  }

  async function togglePromo(id: string, is_active: boolean) {
    await api('/api/admin/promo-codes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !is_active }),
    });
    setPromoCodes(prev => prev.map(p => p.id === id ? { ...p, is_active: !is_active } : p));
  }

  async function loadAuditLog() {
    setAuditLoading(true);
    const res = await api('/api/admin/audit-log');
    const data = res.data ?? {};
    setAuditLogs(data.logs || []);
    setAuditLoading(false);
  }

  async function logout() { await api('/api/auth/logout', { method: 'POST' }); router.push('/login'); }

  // Ten destinations read as a wall when they are one flat list. Grouping
  // means she scans four headings instead of ten words.
  const NAV: { section: string | null; items: { k: Tab; label: string }[] }[] = [
    { section: null,       items: [{ k:'overview', label:'Dashboard' }] },
    { section: 'Schedule', items: [{ k:'calendar', label:'Calendar' }, { k:'add-class', label:'Add class' }, { k:'templates', label:'Templates' }] },
    { section: 'People',   items: [{ k:'members', label:'Members' }, { k:'instructors', label:'Instructors' }] },
    { section: 'Money',    items: [{ k:'revenue', label:'Revenue' }, { k:'promo', label:'Promos' }] },
    { section: 'More',     items: [{ k:'workshops', label:'Workshops' }, { k:'audit', label:'Audit' }] },
  ];
  const TITLES: Record<Tab, [string, string]> = {
    overview:    ['Dashboard',   'How the studio is doing right now.'],
    calendar:    ['Calendar',    'Every class, and who is coming to it.'],
    members:     ['Members',     'Everyone who has ever joined.'],
    revenue:     ['Revenue',     'What has been taken, and from which plans.'],
    'add-class': ['Add a class', 'Put a new class on the schedule.'],
    templates:   ['Templates',   'Classes you run again and again.'],
    instructors: ['Instructors', 'Who teaches, and their logins.'],
    workshops:   ['Workshops',   'One-off sessions, open to non-members.'],
    promo:       ['Promo codes', 'Discounts, and what they have cost.'],
    audit:       ['Audit log',   'What was changed here, and by whom.'],
    broadcast:   ['Broadcast',   'Message members at once.'],
  };
  function goTab(k: Tab) {
    setTab(k); setMsg(null);
    if(k==='revenue')loadRevenue(); if(k==='promo')loadPromoCodes(); if(k==='audit')loadAuditLog();
    if(k==='templates')loadTemplates(); if(k==='instructors')loadInstructors(); if(k==='workshops')loadWorkshops();
  }

  // Colour carries fullness, not which instructor is teaching. She scans a
  // calendar asking what is filling and what is empty, and instructor identity
  // was taking the whole colour budget while capacity got a hairline.
  const fillTone = (booked: number, cap: number) => {
    if (!cap) return MUTED;
    if (booked === 0) return 'rgba(241,233,218,0.20)';
    const p = booked / cap;
    if (p >= 1) return '#f87171';
    if (p >= 0.6) return '#4ade80';
    return '#fbbf24';
  };
  const CATEGORY_LABEL: Record<string, string> = {
    pole_regular: 'Pole', pole_nimisha: 'Pole (Nimisha)', mobility: 'Mobility',
    self_practice: 'Self practice', strength: 'Strength',
  };
  const FILL_KEY: [string, string][] = [
    ['rgba(241,233,218,0.20)', 'Nobody yet'],
    ['#fbbf24', 'Filling'],
    ['#4ade80', 'Nearly full'],
    ['#f87171', 'Full'],
  ];
  const durationOf = (a: string, b: string | null) => {
    if (!b) return null;
    const m = (t: string) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
    const d = m(b) - m(a);
    return d > 0 ? (d >= 60 && d % 60 === 0 ? `${d / 60} hr` : `${d} min`) : null;
  };

  const weekDates = getWeekDates(weekStart);
  const todayStr = toYMD(new Date());
  // Trimmed: the data holds both 'AZDAH' and 'AZDAH ', which listed the same
  // person twice in the legend and gave her two different colours on the grid.
  const trainerNames = Array.from(new Set(
    classes.map(c => (c.trainer_name || '').trim()).filter(Boolean)));
  const trainerColor = (name: string | null) => {
    const n = (name || '').trim();
    return n ? PALETTE[trainerNames.indexOf(n) % PALETTE.length] : MUTED;
  };
  // Moving the week must move the chosen day with it, or the day view shows
  // nothing and looks broken.
  useEffect(() => {
    const days = getWeekDates(weekStart).map(toYMD);
    if (!days.includes(selectedDay)) {
      const t = toYMD(new Date());
      setSelectedDay(days.includes(t) ? t : days[0]);
    }
    // selectedDay is deliberately not a dependency: this only corrects the day
    // when the week itself moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  useEffect(() => {
    if (tab !== 'overview' || trendBookings !== null) return;
    const end = new Date(); end.setDate(end.getDate() + 6);
    const start = new Date(); start.setDate(start.getDate() - 29);
    fetch(`/api/admin/bookings?from=${toYMD(start)}&to=${toYMD(end)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setTrendBookings(d?.bookings || []))
      .catch(() => setTrendBookings([]));
  }, [tab, trendBookings]);

  // Bookings for the week on screen. Refetched whenever the week moves.
  useEffect(() => {
    const days = getWeekDates(weekStart);
    const from = toYMD(days[0]), to = toYMD(days[6]);
    let cancelled = false;
    fetch(`/api/admin/bookings?from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setWeekBookings(d?.bookings || []); })
      .catch(() => { if (!cancelled) setWeekBookings([]); });
    return () => { cancelled = true; };
  }, [weekStart]);

  const bookingsByClass = new Map<string, AdminBooking[]>();
  for (const b of weekBookings) {
    const l = bookingsByClass.get(b.class_id) || [];
    l.push(b); bookingsByClass.set(b.class_id, l);
  }

  // Trainer names are trimmed: the data holds both 'AZDAH' and 'AZDAH ',
  // which would otherwise appear as two different instructors.
  const trainerOptions = Array.from(new Set(
    classes.map(c => (c.trainer_name || '').trim()).filter(Boolean))).sort();
  const memberOptions = Array.from(new Map(
    members.map(m => [m.id, m.name] as const)).entries())
    .sort((a, b) => a[1].localeCompare(b[1]));
  const planOptions = Array.from(new Set(
    weekBookings.map(b => b.plan_name).filter(Boolean) as string[])).sort();
  const calFiltered = calTrainer !== 'all' || calMember !== 'all' || calPlan !== 'all';

  function calMatch(cls: ClassSlot) {
    if (calTrainer !== 'all' && (cls.trainer_name || '').trim() !== calTrainer) return false;
    if (calMember === 'all' && calPlan === 'all') return true;
    const bs = bookingsByClass.get(cls.id) || [];
    if (calMember !== 'all' && !bs.some(b => b.member_id === calMember)) return false;
    if (calPlan !== 'all' && !bs.some(b => b.plan_name === calPlan)) return false;
    return true;
  }

  // A member's own dates, fetched once per member and kept.
  // Only offered where nothing would be destroyed; the server checks again.
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null);

  // The warning goes away on its own once the account exists or the payment is
  // refunded. This is for the third case: already sorted out some other way.
  async function resolveOrphan(o: { order_id: string; name: string }) {
    if (!confirm(`Hide the warning for ${o.name}?

Only do this if you have already sorted it out — set them up under another number, or refunded them. The payment itself is not touched, and the audit log records this.`)) return;
    setOrphanBusy(o.order_id);
    const res = await api('/api/admin/orphaned-payments/resolve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: o.order_id }),
    });
    setOrphanBusy(null);
    if (res.ok) {
      setMemberOrphans(p => p.filter(x => x.order_id !== o.order_id));
      setMsg({ text: `Marked ${o.name}'s payment as handled.`, ok: true });
    } else {
      setMsg({ text: 'Could not mark that as handled.', ok: false });
    }
  }

  async function deleteMember(m: Member) {
    if (!confirm(`Delete ${m.name} (${m.phone}) permanently?

They have no bookings and no payments, so nothing is lost. This cannot be undone.`)) return;
    setMemberActionBusy(m.id + '-del');
    const res = await api(`/api/admin/members/${m.id}`, { method: 'DELETE' });
    const d = res.data ?? {};
    setMemberActionBusy(null);
    if (res.ok && d.success) {
      setMsg({ text: `${d.name} deleted.`, ok: true });
      setOpenMember(null);
      fetchAll();
    } else {
      setMsg({ text: d.error || 'Could not delete that member.', ok: false });
    }
  }

  async function toggleMemberDates(id: string) {
    if (openMember === id) { setOpenMember(null); return; }
    setOpenMember(id);
    if (memberDates[id]) return;
    setDatesBusy(id);
    try {
      const r = await api(`/api/admin/bookings?member_id=${id}`);
      const d = r.data;
      setMemberDates(p => ({ ...p, [id]: d?.bookings || [] }));
    } catch { setMemberDates(p => ({ ...p, [id]: [] })); }
    setDatesBusy(null);
  }

  const filteredMembers = members
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search))
    .filter(m => memberStatus === 'all' || (memberStatus === 'active' ? m.is_active : !m.is_active));
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
        @media(max-width:900px){ .dash-charts{grid-template-columns:1fr !important} }
        .asidebar{width:214px;flex-shrink:0;background:#131009;border-right:1px solid ${BORDER};
          display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
        .anav{display:flex;align-items:center;gap:9px;width:100%;text-align:left;font-size:13px;
          padding:8px 10px;border:none;border-radius:7px;cursor:pointer;font-family:inherit;
          transition:background .15s,color .15s}
        .anav:hover{background:rgba(255,255,255,.04)}
        .anav-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;transition:background .15s}
        /* Everything below fights an inline style, so it has to shout. The
           sidebar's padding, flex and overflow are all set on the elements
           themselves, and a media query loses to those without !important --
           which is why the strip only half-appeared on a phone. */
        @media(max-width:860px){
          .ashell{flex-direction:column}
          .acontent{padding:16px 14px 48px !important}
        }
        @media(max-width:860px){
          /* The sidebar becomes a scrolling strip along the top rather than
             stealing a fifth of a phone screen. */
          /* Two rows: brand and logout share the first, the tabs get the whole
             width of the second. Kept on one row, the brand and logout left the
             tabs about 170px of 390 and only the first two were reachable. */
          .asidebar{position:static;width:100%;height:auto;flex-direction:row;flex-wrap:wrap;
            align-items:center;overflow:visible;border-right:none;border-bottom:1px solid ${BORDER}}
          .asidebar>div:first-child{padding:10px 12px !important;flex:1 1 auto}
          .asidebar nav{display:flex;gap:4px;padding:6px !important;overflow-x:auto;
            flex:0 0 100% !important;order:3;overflow-y:hidden !important;
            -webkit-overflow-scrolling:touch;border-top:1px solid ${BORDER}}
          .asidebar nav>div{display:flex;gap:4px;margin-bottom:0 !important;flex-shrink:0}
          .asidebar nav>div>div:first-child{display:none}
          .anav{width:auto;white-space:nowrap;padding:7px 11px}
          .asidebar>div:last-child{border-top:none !important;padding:0 12px !important;flex-shrink:0}
        }

        /* Fixed column counts that a phone cannot hold. */
        @media(max-width:760px){
          .kpi-row{grid-template-columns:repeat(2,1fr) !important}
          /* The week grid keeps its seven columns and scrolls sideways rather
             than crushing them; Day is the default view on a phone anyway. */
          .wk7{overflow-x:auto;grid-auto-columns:minmax(122px,1fr);
            grid-template-columns:none !important;grid-auto-flow:column}
          /* The members table stops being a table: six columns in 360px is
             unreadable, so each member becomes a stacked block. */
          .mhead{display:none !important}
          .mrow{grid-template-columns:1fr !important;gap:7px;padding:14px 14px !important}
        }
        @media(max-width:420px){
          .dstrip{gap:3px}
          .dpick{padding:9px 2px 8px}
        }
        .atab{transition:color .15s;background:none;border:none;cursor:pointer;font-family:inherit}
        .atab:hover{color:${CREAM} !important}
        .mrow{transition:background .12s}
        .mrow:hover{background:#1E1712 !important}
        .cbk{transition:transform .12s,box-shadow .12s;cursor:pointer}
        .cbk:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.5)}
        .abtn{transition:opacity .12s,background .12s;cursor:pointer}
        .abtn:hover{opacity:.8}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px)}
        /* Blurring a full-screen layer every frame is costly on modest
           phones and can leave the dialog visibly stuck. The dimming
           alone does the job there. */
        @media (max-width: 900px){ .modal-bg{backdrop-filter:none;background:rgba(0,0,0,.86)} }
        .modal-box{background:#1A1410;border:1px solid #3A2B1E;border-radius:14px;width:100%;max-width:520px;max-height:88vh;overflow-y:auto}
        input:focus{outline:none;border-color:${ORANGE} !important}
        input[type=date]::-webkit-calendar-picker-indicator,input[type=time]::-webkit-calendar-picker-indicator{filter:invert(.5);cursor:pointer}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#3A2B1E;border-radius:9px}
        @media(max-width:900px){.admin-cal{grid-template-columns:1fr !important}}
        .cbk .dup{opacity:0;transition:opacity .15s}
        .cbk:hover .dup,.cbk:focus-within .dup{opacity:1}
        .dstrip{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:22px}
        .dpick{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 4px 10px;
          border:1px solid transparent;border-radius:12px;background:none;cursor:pointer;
          font-family:inherit;transition:background .18s,border-color .18s}
        .dpick:hover{background:rgba(255,255,255,.035)}
        .drow{display:grid;grid-template-columns:112px 1fr 132px;gap:22px;align-items:center;
          padding:20px 22px;border:1px solid ${BORDER};border-radius:14px;background:${CARD};
          margin-bottom:10px;cursor:pointer;transition:border-color .18s,transform .18s}
        .drow:hover{border-color:rgba(241,233,218,.22);transform:translateY(-1px)}
        @media(max-width:760px){
          .drow{grid-template-columns:1fr;gap:10px;padding:16px}
        }
        .lrow,.lhead{display:grid;
          grid-template-columns:74px minmax(140px,1fr) 104px 52px minmax(200px,1.9fr);
          gap:10px;align-items:center}
        .lrow{padding:9px 12px;cursor:pointer;border-radius:7px}
        .lrow:hover{background:rgba(255,255,255,.03)}
        .lhead{padding:9px 12px 9px 15px;font-size:9.5px;letter-spacing:.12em;
          text-transform:uppercase;font-weight:600}
        @media(max-width:900px){
          .lrow{grid-template-columns:1fr;gap:3px;padding:11px 12px}
          .lhead{display:none}
        }
      `}} />

      <div className="ashell" style={{ display:'flex', alignItems:'stretch', minHeight:'100vh' }}>

        {/* ── Sidebar ── */}
        <aside className="asidebar">
          <div style={{ padding:'20px 18px 22px', display:'flex', alignItems:'center', gap:9 }}>
            <img src="/azdahlogo.png" alt="AZDAH" style={{ height:26, width:'auto', display:'block' }} />
            <span style={{ fontSize:8.5, background:`${ORANGE}22`, color:ORANGE, border:`1px solid ${ORANGE}40`, padding:'2px 6px', borderRadius:4, letterSpacing:'.12em', textTransform:'uppercase' }}>Admin</span>
          </div>

          <nav style={{ flex:1, overflowY:'auto', padding:'0 10px 14px' }}>
            {NAV.map((group, gi) => (
              <div key={group.section || 'top'} style={{ marginBottom: gi === NAV.length-1 ? 0 : 16 }}>
                {group.section && (
                  <div style={{ fontSize:9, letterSpacing:'.16em', textTransform:'uppercase', color:'rgba(241,233,218,0.34)', fontWeight:700, padding:'0 10px', marginBottom:6 }}>
                    {group.section}
                  </div>
                )}
                {group.items.map(it => {
                  const on = tab === it.k;
                  return (
                    <button key={it.k} onClick={() => goTab(it.k)} className="anav"
                      style={{ color: on ? ORANGE : MUTED, background: on ? `${ORANGE}14` : 'transparent',
                        fontWeight: on ? 600 : 400 }}>
                      <span className="anav-dot" style={{ background: on ? ORANGE : 'transparent' }} />
                      {it.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={{ borderTop:`1px solid ${BORDER}`, padding:'12px 18px' }}>
            <button onClick={logout} style={{ color:MUTED, fontSize:12.5, background:'none', border:'none', cursor:'pointer', padding:0 }}>Logout</button>
          </div>
        </aside>

      <div className="acontent" style={{ flex:1, minWidth:0, padding:'26px 30px 60px' }}>

        {/* ── Heading, named by wherever she is ── */}
        <h1 style={{ fontFamily:SERIF, fontSize:30, fontWeight:800, color:CREAM, margin:'0 0 5px', lineHeight:1.05, letterSpacing:'-.01em' }}>{TITLES[tab][0]}</h1>
        <p style={{ color:MUTED, fontSize:13.5, margin:'0 0 22px' }}>{TITLES[tab][1]}</p>

        {/* Money taken, nothing delivered. Highest-priority thing on the page. */}
        {memberOrphans.length > 0 && (
          <div style={{ marginBottom:16, padding:'14px 16px', background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.35)', borderRadius:10 }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:'#f87171', marginBottom:4 }}>
              ⚠ {memberOrphans.length} paid membership{memberOrphans.length !== 1 ? 's' : ''} with no account created
            </div>
            <div style={{ fontSize:12, color:'#d99', marginBottom:12, lineHeight:1.5 }}>
              Razorpay captured the money but the member was never set up — usually the browser closed mid-payment.
              Either create the member manually and share their login, or refund the payment in Razorpay.
              This clears itself once the account exists or the payment is refunded.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {memberOrphans.map(o => (
                <div key={o.order_id} style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, padding:'9px 11px', background:'rgba(0,0,0,.25)', border:`1px solid ${BORDER}`, borderRadius:7 }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:CREAM }}>{o.name}</span>
                  <span style={{ fontSize:12, color:MUTED }}>{o.phone}</span>
                  {o.amount_paise != null && (
                    <span style={{ fontSize:12, fontWeight:700, color:'#fbbf24' }}>₹{(o.amount_paise/100).toLocaleString('en-IN')}</span>
                  )}
                  <span style={{ fontSize:11, color:MUTED }}>{fmtDate(o.created_at)}</span>
                  <span style={{ fontSize:10.5, color:MUTED, fontFamily:'monospace' }}>{o.payment_id}</span>
                  <a href={`https://wa.me/${o.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Hi ${o.name.split(' ')[0]}, we received your payment for AZDAH but your account didn't get created automatically. We're sorting it out right now — sorry for the trouble!`)}`}
                    target="_blank" rel="noopener"
                    style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:'#4ade80', border:'1px solid rgba(74,222,128,.3)', borderRadius:5, padding:'5px 10px', textDecoration:'none' }}>
                    WhatsApp them
                  </a>
                  <button onClick={() => resolveOrphan(o)} disabled={orphanBusy === o.order_id}
                    title="Hide this warning — the payment is untouched"
                    style={{ fontSize:11, fontWeight:600, color:MUTED, border:`1px solid ${BORDER}`, borderRadius:5, padding:'5px 10px', background:'none', cursor:'pointer' }}>
                    {orphanBusy === o.order_id ? '…' : 'Already handled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The schedule running out is the one problem the studio cannot see
            by looking at a calendar: it needs credits and expiry dates beside
            the class list. Fifteen members nearly lost 38 paid classes to it
            before anyone noticed. Shown on every screen, not just Dashboard. */}
        {(() => {
          const sch = (overviewStats as unknown as { schedule?: ScheduleHealth } | null)?.schedule;
          if (!sch || !sch.ends_on) return null;
          const short = sch.days_left <= 21;
          // Seats, not classes: a class seats several people.
          const oversubscribed = sch.credits_expiring_next_14_days > sch.seats_free_next_14_days;
          if (!short && !oversubscribed && !sch.stranded_credits) return null;
          const urgent = sch.days_left <= 10 || sch.stranded_credits > 0;
          const tint = urgent ? '248,113,113' : '251,191,36';
          const ink = urgent ? '#f87171' : '#fbbf24';
          return (
            <div style={{ marginBottom:16, padding:'13px 16px', background:`rgba(${tint},.08)`, border:`1px solid rgba(${tint},.32)`, borderRadius:10 }}>
              <div style={{ fontSize:13.5, fontWeight:700, color:ink, marginBottom:5 }}>
                Your schedule ends {fmtDate(sch.ends_on)}{sch.days_left >= 0 ? ` — ${sch.days_left} day${sch.days_left===1?'':'s'} away` : ''}
              </div>
              <div style={{ fontSize:12.5, color:MUTED, lineHeight:1.55, marginBottom:11 }}>
                {sch.stranded_credits > 0 && (
                  <>
                    <strong style={{ color:ink, fontWeight:600 }}>
                      {sch.stranded_members} member{sch.stranded_members===1?'':'s'} hold {sch.stranded_credits} paid class{sch.stranded_credits===1?'':'es'} that expire after your last published class
                    </strong>
                    {' '}— they cannot book them at all until you add more.{' '}
                  </>
                )}
                {oversubscribed && (
                  <>
                    In the next 14 days there are only <strong style={{ color:CREAM, fontWeight:600 }}>{sch.seats_free_next_14_days} free places</strong> across
                    {' '}{sch.classes_next_14_days} classes, but <strong style={{ color:CREAM, fontWeight:600 }}>{sch.credits_expiring_next_14_days} paid classes</strong> expiring.{' '}
                  </>
                )}
                Nothing adds classes automatically — every class is created here.
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={() => goTab('add-class')}
                  style={{ fontSize:12, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', background:ORANGE, color:'#fff', border:'none', padding:'8px 14px', borderRadius:6, cursor:'pointer' }}>
                  Add classes
                </button>
                <button onClick={() => goTab('templates')}
                  style={{ fontSize:12, color:CREAM, background:'none', border:`1px solid ${BORDER}`, padding:'8px 14px', borderRadius:6, cursor:'pointer' }}>
                  Generate from templates
                </button>
              </div>
            </div>
          );
        })()}

        {/* ════ DASHBOARD ════ */}
        {tab === 'overview' && (<>

        {/* Standing fact, not an alarm. This is true every day the kill switch
            is off, and a permanent warning box teaches her to stop reading the
            red one beside it — which is the one that means money is missing. */}
        {overviewStats && overviewStats.whatsapp_enabled === false && (
          <div style={{ marginBottom:18, display:'flex', alignItems:'center', gap:8, fontSize:12, color:MUTED }}>
            <MessageCircle size={13} strokeWidth={1.6} style={{ flexShrink:0, opacity:.7 }} />
            <span>
              Automatic WhatsApp is off — nobody is messaged automatically. Use the WhatsApp buttons
              to write to people yourself, and read new passwords off the screen.
            </span>
          </div>
        )}

        {/* ── Charts ──
            Deliberately bars, not trend lines: there are two months of trading
            history, and a line through two points looks like a broken chart
            rather than a business. These read correctly at this size and get
            better as the data builds up. */}
        <div style={{ display:'grid', gridTemplateColumns:'1.55fr 1fr', gap:14, marginBottom:16 }} className="dash-charts">

          {/* Classes taken, by day */}
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:16 }}>
              <span style={{ fontSize:9, color:MUTED, letterSpacing:'.12em', textTransform:'uppercase', fontWeight:600 }}>Classes taken, last 30 days</span>
              <span style={{ fontSize:12, color:MUTED }}>
                {trendBookings === null ? '' : `${trendBookings.filter(b => b.class_date <= todayStr).length} total`}
              </span>
            </div>
            {trendBookings === null ? (
              <div style={{ height:104, display:'flex', alignItems:'center', color:MUTED, fontSize:12 }}>Loading…</div>
            ) : (() => {
              const days = Array.from({length:30}, (_,i) => {
                const d = new Date(); d.setDate(d.getDate() - 29 + i); return toYMD(d);
              });
              const counts = days.map(ds => trendBookings.filter(b => b.class_date === ds).length);
              const peak = Math.max(1, ...counts);
              return (
                <>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:104 }}>
                    {days.map((ds, i) => (
                      <div key={ds} title={`${fmtDate(ds)} — ${counts[i]} class${counts[i]===1?'':'es'}`}
                        style={{ flex:1, height:`${Math.max(2,(counts[i]/peak)*100)}%`, borderRadius:'3px 3px 0 0',
                          background: counts[i] === 0 ? 'rgba(241,233,218,.07)' : ds === todayStr ? CREAM : ORANGE,
                          opacity: counts[i] === 0 ? 1 : ds === todayStr ? 1 : .82 }} />
                    ))}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:10.5, color:MUTED }}>
                    <span>{fmtDate(days[0])}</span><span>Today</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* How the coming week is filling */}
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px 14px' }}>
            <div style={{ fontSize:9, color:MUTED, letterSpacing:'.12em', textTransform:'uppercase', fontWeight:600, marginBottom:16 }}>
              How the next 7 days are filling
            </div>
            {(() => {
              const next7 = Array.from({length:7}, (_,i) => {
                const d = new Date(); d.setDate(d.getDate() + i); return d;
              });
              const rows = next7.map(d => {
                const ds = toYMD(d);
                const cs = classes.filter(c => c.class_date === ds && !c.is_cancelled);
                const cap = cs.reduce((n,c) => n + c.capacity, 0);
                const bk = cs.reduce((n,c) => n + c.booked_count, 0);
                return { d, ds, cap, bk, pct: cap ? (bk/cap)*100 : 0 };
              });
              if (rows.every(r => r.cap === 0)) {
                return <div style={{ fontSize:12, color:MUTED, padding:'26px 0' }}>No classes scheduled in the next week.</div>;
              }
              return rows.map(r => (
                <div key={r.ds} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9 }}>
                  <span style={{ fontSize:10.5, color: r.ds === todayStr ? ORANGE : MUTED, width:30, flexShrink:0, textTransform:'uppercase', letterSpacing:'.06em' }}>
                    {r.d.toLocaleDateString('en-IN',{weekday:'short'})}
                  </span>
                  <div style={{ flex:1, height:7, background:'rgba(255,255,255,.05)', borderRadius:999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${r.pct}%`, background:fillTone(r.bk, r.cap || 1), borderRadius:999, transition:'width .4s' }} />
                  </div>
                  <span style={{ fontSize:11, color:MUTED, width:42, textAlign:'right', flexShrink:0 }}>
                    {r.cap ? `${r.bk}/${r.cap}` : '—'}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* ── KPI Row ── */}
        {stats && (
          <div className="kpi-row" style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:'hidden', display:'grid', gridTemplateColumns:'repeat(4,1fr)', marginBottom:16 }}>
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

        {/* ── TODAY / EXPIRING / INACTIVE ── */}
        {overviewStats && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:16 }}>

            {/* Today's attendance */}
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'18px 20px' }}>
              <div style={{ fontSize:11, color:MUTED, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:12 }}>Today</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:MUTED }}>Classes scheduled</span>
                  <span style={{ color:CREAM, fontWeight:700 }}>{overviewStats.today.classes}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:MUTED }}>Members expected</span>
                  <span style={{ color:CREAM, fontWeight:700 }}>{overviewStats.today.expected_members}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:MUTED }}>Attended so far</span>
                  <span style={{ color:'#4ade80', fontWeight:700 }}>{overviewStats.today.attended}</span>
                </div>
              </div>
              {overviewStats.today.classes === 0 && <div style={{ fontSize:12, color:MUTED, marginTop:8 }}>No classes scheduled today.</div>}
            </div>

            {/* Expiring this week */}
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'18px 20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:11, color:MUTED, letterSpacing:'.1em', textTransform:'uppercase' }}>Expiring This Week</div>
                <span style={{ fontSize:12, fontWeight:700, color: overviewStats.expiring_this_week.length > 0 ? '#fbbf24' : MUTED }}>{overviewStats.expiring_this_week.length}</span>
              </div>
              {overviewStats.expiring_this_week.length === 0 ? (
                <div style={{ fontSize:12, color:MUTED }}>No memberships expiring in the next 7 days.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:140, overflowY:'auto' }}>
                  {overviewStats.expiring_this_week.map(m => (
                    <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, color:CREAM, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                        <div style={{ fontSize:11, color:MUTED }}>{m.days_remaining}d left · {m.plan_name}</div>
                      </div>
                      <a href={`https://wa.me/${m.phone}`} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, padding:'4px 10px', background:'rgba(37,211,102,.1)', color:'#25d366', border:'1px solid rgba(37,211,102,.25)', borderRadius:6, textDecoration:'none', flexShrink:0 }}>
                        WA
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inactive members */}
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'18px 20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:11, color:MUTED, letterSpacing:'.1em', textTransform:'uppercase' }}>Inactive Members</div>
                <span style={{ fontSize:12, fontWeight:700, color: overviewStats.inactive_members.length > 0 ? '#f87171' : MUTED }}>{overviewStats.inactive_members.length}</span>
              </div>
              {overviewStats.inactive_members.length === 0 ? (
                <div style={{ fontSize:12, color:MUTED }}>No inactive members.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:140, overflowY:'auto' }}>
                  {overviewStats.inactive_members.slice(0, 8).map(m => (
                    <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, color:CREAM, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                        <div style={{ fontSize:11, color:MUTED }}>{m.plan_name}</div>
                      </div>
                      <a href={`https://wa.me/${m.phone}`} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, padding:'4px 10px', background:'rgba(248,52,51,.1)', color:ORANGE, border:`1px solid rgba(248,52,51,.25)`, borderRadius:6, textDecoration:'none', flexShrink:0 }}>
                        WA
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        </>)}

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
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', border:`1px solid ${BORDER}`, borderRadius:6, overflow:'hidden' }}>
                    {([['day','Day'],['week','Week'],['list','List']] as const).map(([k,l]) => (
                      <button key={k} onClick={() => { setCalView(k); if (k === 'list') setShowNames(true); }}
                        title={k === 'week' ? 'Grid of the week' : 'Every class with who is booked'}
                        style={{ padding:'6px 14px', fontSize:12, fontWeight:500, border:'none', cursor:'pointer',
                          background: calView===k ? ORANGE : 'transparent', color: calView===k ? '#fff' : MUTED }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize:13, color:MUTED }}>
                    {weekDates[0].toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – {weekDates[6].toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                  </span>
                </div>
              </div>

              {/* Filters. The studio had to open every class to find out who
                  was in it; picking a member now leaves only their classes. */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
                <select value={calTrainer} onChange={e => setCalTrainer(e.target.value)} style={{ background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:6, padding:'7px 10px', fontSize:12, maxWidth:190 }}>
                  <option value="all">All instructors</option>
                  {trainerOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={calMember} onChange={e => setCalMember(e.target.value)} style={{ background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:6, padding:'7px 10px', fontSize:12, maxWidth:190 }}>
                  <option value="all">All members</option>
                  {memberOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select value={calPlan} onChange={e => setCalPlan(e.target.value)} style={{ background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:6, padding:'7px 10px', fontSize:12, maxWidth:190 }}>
                  <option value="all">All plans</option>
                  {planOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {/* List always shows names -- that is what it is for. */}
                {calView === 'week' && (
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:MUTED, cursor:'pointer' }}>
                    <input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)} />
                    Show who&apos;s booked
                  </label>
                )}
                {calFiltered && (
                  <button onClick={() => { setCalTrainer('all'); setCalMember('all'); setCalPlan('all'); }}
                    style={{ background:'none', border:'none', color:ORANGE, fontSize:12, textDecoration:'underline', cursor:'pointer' }}>
                    Clear filters
                  </button>
                )}
                <span style={{ marginLeft:'auto', fontSize:12, color:MUTED }}>
                  {weekBookings.length} booking{weekBookings.length !== 1 ? 's' : ''} this week
                </span>
              </div>

              {/* A filter that matches nothing looks identical to an empty
                  week, so say which it is. */}
              {calFiltered && !weekDates.some(d => classes.some(c =>
                  c.class_date === toYMD(d) && !c.is_cancelled && calMatch(c))) && (
                <div style={{ padding:'14px 16px', marginBottom:12, background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, fontSize:12.5, color:MUTED }}>
                  Nothing matches these filters this week. Try Prev/Next, or clear them.
                </div>
              )}

              {/* Day: one day at a time, with room to breathe. Seven columns
                  is what forced every class into a 125px sliver. */}
              {calView === 'day' && (() => {
                const dayOf = (ds: string) => classes
                  .filter(c => c.class_date === ds && !c.is_cancelled && calMatch(c))
                  .sort((a,b) => a.start_time.localeCompare(b.start_time));
                const todays = dayOf(selectedDay);
                const heads = todays.reduce((n,c) => n + c.booked_count, 0);
                return (
                  <>
                    <div className="dstrip">
                      {weekDates.map(d => {
                        const ds = toYMD(d);
                        const n = dayOf(ds).length;
                        const on = ds === selectedDay;
                        const isToday = ds === todayStr;
                        return (
                          <button key={ds} className="dpick" onClick={() => setSelectedDay(ds)}
                            style={{ background: on ? ORANGE : undefined, borderColor: !on && isToday ? ORANGE + '55' : undefined }}>
                            <span style={{ fontSize:10, letterSpacing:'.14em', textTransform:'uppercase',
                              color: on ? '#fff' : isToday ? ORANGE : MUTED }}>
                              {d.toLocaleDateString('en-IN',{weekday:'short'})}
                            </span>
                            <span style={{ fontSize:21, fontWeight:700, lineHeight:1,
                              color: on ? '#fff' : isToday ? ORANGE : CREAM }}>
                              {d.getDate()}
                            </span>
                            {/* A dot per class, so the shape of the week stays
                                readable without leaving the day view. */}
                            <span style={{ display:'flex', gap:2.5, height:4, alignItems:'center' }}>
                              {n === 0
                                ? <span style={{ width:3, height:3, borderRadius:'50%', background: on ? 'rgba(255,255,255,.35)' : 'rgba(241,233,218,.13)' }} />
                                : Array.from({length: Math.min(n,5)}).map((_,i) => (
                                    <span key={i} style={{ width:3.5, height:3.5, borderRadius:'50%', background: on ? '#fff' : ORANGE }} />
                                  ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display:'flex', alignItems:'baseline', gap:10, margin:'0 0 14px 2px', flexWrap:'wrap' }}>
                      <span style={{ fontFamily:SERIF, fontSize:19, fontWeight:700, color:CREAM }}>
                        {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-IN',{weekday:'long', day:'numeric', month:'long'})}
                      </span>
                      <span style={{ fontSize:12.5, color:MUTED }}>
                        {todays.length === 0
                          ? 'nothing on'
                          : todays.length + (todays.length === 1 ? ' class' : ' classes') + ' \u00b7 ' + heads + ' booked'}
                      </span>
                    </div>

                    {todays.length === 0 ? (
                      <div style={{ padding:'60px 0', textAlign:'center', color:MUTED, fontSize:13.5, border:'1px dashed ' + BORDER, borderRadius:14 }}>
                        No classes on this day.
                      </div>
                    ) : todays.map(cls => {
                      const bs = bookingsByClass.get(cls.id) || [];
                      const tone = fillTone(cls.booked_count, cls.capacity);
                      const dur = durationOf(cls.start_time, cls.end_time);
                      return (
                        <article key={cls.id} className="drow" onClick={() => openClassModal(cls)}
                          style={{ borderLeft:'3px solid ' + tone }}>
                          <div>
                            <div style={{ fontSize:16, fontWeight:700, color:CREAM, letterSpacing:'-.01em' }}>{fmtTime(cls.start_time)}</div>
                            {dur && <div style={{ fontSize:11.5, color:MUTED, marginTop:2 }}>{dur}</div>}
                          </div>

                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:15.5, fontWeight:600, color:CREAM, marginBottom:3 }}>{cls.title}</div>
                            <div style={{ fontSize:12.5, color:MUTED }}>{cls.trainer_name?.trim() || 'No instructor set'}</div>
                            {bs.length > 0 && (
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px 6px', marginTop:11 }}>
                                {bs.map(b => (
                                  <span key={b.id} title={b.plan_name || 'no pack'}
                                    style={{ fontSize:11.5, padding:'3px 10px', borderRadius:999,
                                      border:'1px solid ' + (b.member_id===calMember ? ORANGE : BORDER),
                                      color: b.member_id===calMember ? ORANGE : CREAM,
                                      background: b.member_id===calMember ? ORANGE + '16' : 'transparent' }}>
                                    {b.member_name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:14, fontWeight:700, color:tone }}>
                              {cls.booked_count} of {cls.capacity}
                            </div>
                            <div style={{ fontSize:11, color:MUTED, marginTop:2, marginBottom:8 }}>booked</div>
                            <div style={{ height:4, background:'rgba(255,255,255,.06)', borderRadius:999, overflow:'hidden' }}>
                              <div style={{ height:'100%', width: Math.min(100,(cls.booked_count/(cls.capacity||1))*100) + '%', background:tone, borderRadius:999, transition:'width .3s' }} />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </>
                );
              })()}

              {/* List: one row per class, with room across the page for the
                  names the 125px grid columns cannot hold. */}
              {calView === 'list' && (
                <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'0 6px 10px' }}>
                  <div className="lhead" style={{ color:MUTED, borderBottom:`1px solid ${BORDER}` }}>
                    <span>Time</span>
                    <span>Class</span>
                    <span>Instructor</span>
                    <span style={{ textAlign:'right' }}>Booked</span>
                    <span>Members</span>
                  </div>
                  {weekDates.map(date => {
                    const ds = toYMD(date);
                    const list = classes
                      .filter(c => c.class_date === ds && !c.is_cancelled && calMatch(c))
                      .sort((a,b) => a.start_time.localeCompare(b.start_time));
                    if (!list.length) return null;   // empty days are noise here
                    return (
                      <section key={ds}>
                        <div style={{ display:'flex', alignItems:'baseline', gap:9, padding:'12px 12px 7px' }}>
                          <span style={{ fontSize:13, fontWeight:700, color: ds===todayStr ? ORANGE : CREAM }}>
                            {date.toLocaleDateString('en-IN',{weekday:'long'})}
                          </span>
                          <span style={{ fontSize:12, color:MUTED }}>
                            {date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                          </span>
                          {ds===todayStr && <span style={{ fontSize:10, color:ORANGE, letterSpacing:'.1em', textTransform:'uppercase' }}>Today</span>}
                        </div>
                        {list.map(cls => {
                          const tc = fillTone(cls.booked_count, cls.capacity);
                          const bs = bookingsByClass.get(cls.id) || [];
                          const full = cls.booked_count >= cls.capacity;
                          return (
                            <div key={cls.id} className="lrow" onClick={() => openClassModal(cls)}
                              style={{ borderLeft:`3px solid ${tc}` }}>
                              <span style={{ fontSize:12, color:ORANGE, fontWeight:600 }}>{fmtTime(cls.start_time)}</span>
                              <span style={{ fontSize:12.5, color:CREAM, fontWeight:500 }}>{cls.title}</span>
                              <span style={{ fontSize:11.5, color:tc, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {cls.trainer_name?.trim() || '—'}
                              </span>
                              <span style={{ fontSize:11.5, fontWeight:600, textAlign:'right', color: full ? '#f87171' : MUTED }}>
                                {cls.booked_count}/{cls.capacity}
                              </span>
                              <span style={{ display:'flex', flexWrap:'wrap', gap:'4px 6px' }}>
                                {bs.length === 0
                                  ? <span style={{ fontSize:13, color:MUTED, opacity:.35 }}>&mdash;</span>
                                  : bs.map(b => (
                                      <span key={b.id} title={b.plan_name || 'no pack'}
                                        style={{ fontSize:11, padding:'2px 8px', borderRadius:999,
                                          border:`1px solid ${b.member_id===calMember ? ORANGE : BORDER}`,
                                          color: b.member_id===calMember ? ORANGE : CREAM,
                                          background: b.member_id===calMember ? `${ORANGE}16` : 'transparent' }}>
                                        {b.member_name}
                                      </span>
                                    ))}
                              </span>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
              )}

              {/* 7-column grid */}
              <div className="wk7" style={{ display: calView === 'week' ? 'grid' : 'none', gridTemplateColumns:'repeat(7,1fr)', gap:8 }}>
                {weekDates.map((date, i) => {
                  const ds = toYMD(date);
                  const isToday = ds === todayStr;
                  const dayClasses = classes.filter(c => c.class_date === ds && !c.is_cancelled && calMatch(c))
                    .sort((a,b) => a.start_time.localeCompare(b.start_time));
                  const dayCancelled = classes.filter(c => c.class_date === ds && c.is_cancelled)
                    .sort((a,b) => a.start_time.localeCompare(b.start_time));
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
                        {dayClasses.length === 0 && dayCancelled.length === 0 && (
                          <div style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center', color:'#2A2118', fontSize:18 }}>·</div>
                        )}
                        {dayClasses.map(cls => {
                          // Fullness, not instructor. A week tinted five colours
                          // by who is teaching tells her nothing she scans for.
                          const tc = fillTone(cls.booked_count, cls.capacity);
                          const pct = (cls.booked_count / cls.capacity) * 100;
                          return (
                            <div key={cls.id} className="cbk" onClick={() => openClassModal(cls)}
                              style={{ background:`${tc}10`, border:`1px solid ${tc}2e`, borderLeft:`3px solid ${tc}`, borderRadius:7, padding:'9px 8px', minHeight:96 }}>
                              <div style={{ fontSize:11, fontWeight:600, color:CREAM, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cls.title}</div>
                              {/* Time and instructor share a line, and the fill
                                  bar carries the count beside it. Five stacked
                                  rows in a 125px column read as noise. */}
                              <div style={{ fontSize:10, color:MUTED, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {fmtTime(cls.start_time)}{cls.trainer_name ? <span> · {cls.trainer_name.trim()}</span> : null}
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                                <div style={{ flex:1, height:3, background:'rgba(255,255,255,.06)', borderRadius:999, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${pct}%`, background:tc, borderRadius:999, transition:'width .3s' }} />
                                </div>
                                <span style={{ fontSize:9.5, color: cls.booked_count >= cls.capacity ? '#f87171' : MUTED, fontWeight:600, flexShrink:0 }}>
                                  {cls.booked_count}/{cls.capacity}
                                </span>
                              </div>
                              {showNames && (() => {
                                const bs = bookingsByClass.get(cls.id) || [];
                                if (!bs.length) return null;
                                // Four fits the column; the rest are a count so
                                // the card keeps its height.
                                const shown = bs.slice(0, 4);
                                return (
                                  <div style={{ marginTop:5, paddingTop:5, borderTop:`1px solid ${tc}22`, display:'flex', flexDirection:'column', gap:1 }}>
                                    {shown.map(b => (
                                      <div key={b.id} title={`${b.member_name} — ${b.plan_name || 'no pack'}`}
                                        style={{ fontSize:9.5, color: calMember !== 'all' && b.member_id === calMember ? ORANGE : MUTED,
                                          fontWeight: calMember !== 'all' && b.member_id === calMember ? 700 : 400,
                                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                        {b.member_name}
                                      </div>
                                    ))}
                                    {bs.length > shown.length && (
                                      <div style={{ fontSize:9.5, color:MUTED, opacity:.75 }}>+{bs.length - shown.length} more</div>
                                    )}
                                  </div>
                                );
                              })()}
                              <button
                                className={dupBusy === cls.id ? undefined : 'dup'}
                                onClick={e => { e.stopPropagation(); duplicateClass(cls); }}
                                disabled={dupBusy === cls.id}
                                style={{ marginTop:6, width:'100%', padding:'4px 0', fontSize:10, background:'rgba(248,52,51,.1)', border:'1px solid rgba(248,52,51,.25)', color:ORANGE, borderRadius:4, cursor:'pointer' }}>
                                {dupBusy===cls.id?'…':'+ Duplicate'}
                              </button>
                            </div>
                          );
                        })}
                        {/* Cancelled classes: collapsed by default so they never
                            bury the live ones, but legible and expandable —
                            the old version was an unreadable count. */}
                        {dayCancelled.length > 0 && (
                          <>
                            <button
                              onClick={() => setExpandedCancelled(p => ({ ...p, [ds]: !p[ds] }))}
                              style={{ width:'100%', padding:'4px 6px', background:'none', border:'none', color:MUTED, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                              <span style={{ display:'inline-block', transform: expandedCancelled[ds] ? 'rotate(90deg)' : 'none', transition:'transform .15s' }}>›</span>
                              {dayCancelled.length} cancelled
                            </button>
                            {expandedCancelled[ds] && dayCancelled.map(cls => (
                              <div key={cls.id} className="cbk" onClick={() => openClassModal(cls)}
                                title="Cancelled — click for details"
                                style={{ background:'rgba(248,113,113,.04)', border:'1px dashed rgba(248,113,113,.25)', borderRadius:7, padding:'6px 8px', opacity:.7 }}>
                                <div style={{ fontSize:10.5, fontWeight:600, color:'#f87171', textDecoration:'line-through', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cls.title}</div>
                                <div style={{ fontSize:9.5, color:MUTED, marginTop:1 }}>{fmtTime(cls.start_time)}</div>
                              </div>
                            ))}
                          </>
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

              {/* What the colours mean. Replaces a trainer legend, now that
                  colour carries fullness rather than who is teaching. */}
              <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:9, color:MUTED, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>How full</div>
                {FILL_KEY.map(([colour, label]) => (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:colour, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:CREAM }}>{label}</span>
                  </div>
                ))}
                {trainerNames.length > 0 && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${BORDER}`, fontSize:11.5, color:MUTED, lineHeight:1.5 }}>
                    Teaching this week: {trainerNames.join(', ')}
                  </div>
                )}
              </div>

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

            <div style={{ display:'flex', gap:6, marginBottom:12 }}>
              {([['all','Everyone'],['active','Active'],['inactive','Inactive']] as const).map(([k,l]) => {
                const n = k === 'all' ? members.length : members.filter(m => k === 'active' ? m.is_active : !m.is_active).length;
                const on = memberStatus === k;
                return (
                  <button key={k} onClick={() => { setMemberStatus(k); setOpenMember(null); }}
                    style={{ padding:'7px 14px', borderRadius:999, fontSize:12, fontWeight:500, cursor:'pointer',
                      border:`1px solid ${on ? ORANGE : BORDER}`, background: on ? `${ORANGE}18` : 'transparent', color: on ? ORANGE : MUTED }}>
                    {l} <span style={{ opacity:.7 }}>{n}</span>
                  </button>
                );
              })}
            </div>

            {memberStatus === 'inactive' && (
              <div style={{ marginBottom:12, padding:'10px 14px', background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, fontSize:12, color:MUTED, lineHeight:1.55 }}>
                Inactive members are already hidden from the Active list. A member who has booked a class or paid
                can only stay deactivated — deleting them would take their class and revenue history with them.
                The bin appears on test or duplicate entries, which have neither.
              </div>
            )}

            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, overflow:'hidden' }}>
              <div className="mhead" style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.2fr .7fr 1fr', padding:'10px 16px', background:'#131009', borderBottom:`1px solid ${BORDER}` }}>
                {['Member','Plan','Joined','Expires','Status','Actions'].map(h => (
                  <span key={h} style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.12em', fontWeight:600 }}>{h}</span>
                ))}
              </div>
              {filteredMembers.length === 0 ? (
                <div style={{ padding:'48px 0', textAlign:'center', color:MUTED, fontSize:13 }}>No members found.</div>
              ) : (
                filteredMembers.map((m, i) => (
                  <div key={m.id} style={{ borderBottom: i < filteredMembers.length-1 ? `1px solid ${BORDER}` : 'none' }}>
                  <div className="mrow" onClick={() => toggleMemberDates(m.id)}
                    title="Show the classes this member is booked into"
                    style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1.2fr .7fr 1fr', padding:'13px 16px', alignItems:'center', background: openMember === m.id ? 'rgba(248,52,51,.05)' : 'transparent', cursor:'pointer' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:avatarColor(m.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {initials(m.name)}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ color:CREAM, fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                        <div style={{ color:MUTED, fontSize:11 }}>{m.phone.replace('91','+91 ')}</div>
                      </div>
                    </div>
                    <div>
                      {/* A member may hold several packs. Show each with what is
                          left on it — plan_name alone only names the primary. */}
                      {(() => { const livePacks = (m.packs || []).filter(p => p.is_live); return livePacks.length
                        ? livePacks.map(p => (
                            <div key={p.id} style={{ fontSize:12, color:ORANGE, fontWeight:500, lineHeight:1.45 }}>
                              {p.name}
                              <span style={{ color: p.remaining === 0 ? '#f87171' : MUTED, fontWeight:400 }}>
                                {' · '}{p.remaining === null ? 'unlimited' : `${p.remaining}/${p.classes_included} left`}
                              </span>
                              {/* Combos are spent per discipline, so the pooled
                                  number alone hides which half has run out. */}
                              {p.by_category && p.by_category.length > 0 && (
                                <div style={{ fontSize:11, color:MUTED, fontWeight:400, marginTop:1 }}>
                                  {p.by_category.map(c => (
                                    <span key={c.category} style={{ marginRight:8, color: c.remaining === 0 ? '#f87171' : MUTED }}>
                                      {CATEGORY_LABEL[c.category] || c.category.replace(/_/g,' ')} {c.remaining}/{c.limit}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {p.is_frozen && <span style={{ color:'#fbbf24', fontWeight:400 }}>{' · frozen'}</span>}
                              {/* Packs do not all expire together -- a Mobility
                                  4-session runs 60 days where Pole runs 30 -- and
                                  the single date in the next column is only the
                                  furthest of them. Without this, a member holding
                                  three packs looks like everything lasts until the
                                  latest one, and gets told the wrong date. */}
                              {livePacks.length > 1 && livePacks.some(q => q.expires_on !== p.expires_on) && (
                                <span style={{ color:MUTED, fontWeight:400 }}>{' · till '}{fmtDate(p.expires_on)}</span>
                              )}
                            </div>
                          ))
                        : <div style={{ fontSize:12, color:ORANGE, fontWeight:500 }}>{m.plan_name}</div>; })()}
                    </div>
                    <div style={{ fontSize:12, color:MUTED }}>{fmtDate(m.created_at)}</div>
                    <div>
                      <div style={{ fontSize:12, color: m.days_remaining<=7 ? '#f87171' : CREAM }}>{fmtDate(m.plan_end)}</div>
                      <div style={{ fontSize:11, color: m.days_remaining<=7 ? '#f87171' : MUTED }}>
                        {m.days_remaining}d left
                        {(m.packs || []).filter(p => p.is_live).some(p => p.expires_on !== m.plan_end) && ' (latest pack)'}
                      </div>
                    </div>
                    <span style={{ fontSize:11, padding:'3px 8px', borderRadius:999, background: m.is_active ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)', color: m.is_active ? '#4ade80' : '#f87171', border:`1px solid ${m.is_active ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.25)'}` }}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div onClick={e => e.stopPropagation()} style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
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
                      {m.booking_count === 0 && !m.razorpay_payment_id && (
                        <button onClick={() => deleteMember(m)} className="abtn"
                          disabled={memberActionBusy === m.id + '-del'}
                          title="Delete permanently — no bookings or payments to lose"
                          style={{ fontSize:11, padding:'5px 7px', border:'1px solid rgba(248,113,113,.3)', color:'#f87171', borderRadius:5, background:'none', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                          <Trash2 size={10} strokeWidth={1.5} />
                        </button>
                      )}
                      {m.razorpay_payment_id && (
                        <button onClick={() => setRefundModal(m)} className="abtn"
                          title="Issue refund"
                          style={{ fontSize:11, padding:'5px 7px', border:'1px solid rgba(248,113,113,.3)', color:'#f87171', borderRadius:5, background:'none', cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                          <RotateCcw size={10} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>

                  {openMember === m.id && (
                    <div style={{ padding:'4px 16px 16px 60px', background:'rgba(0,0,0,.18)' }}>
                      {datesBusy === m.id ? (
                        <div style={{ fontSize:12, color:MUTED, padding:'10px 0' }}>Loading their classes…</div>
                      ) : !(memberDates[m.id] || []).length ? (
                        <div style={{ fontSize:12, color:MUTED, padding:'10px 0' }}>No classes booked.</div>
                      ) : (() => {
                        const all = memberDates[m.id];
                        const today = toYMD(new Date());
                        const next = all.filter(b => b.class_date >= today);
                        const past = all.filter(b => b.class_date < today);
                        const line = (b: AdminBooking, dim: boolean) => (
                          <div key={b.id} style={{ display:'flex', gap:10, alignItems:'baseline', flexWrap:'wrap', fontSize:12, padding:'4px 0', opacity: dim ? .5 : 1 }}>
                            <span style={{ color:CREAM, fontWeight:600, minWidth:104 }}>{fmtDate(b.class_date)}</span>
                            <span style={{ color:ORANGE, minWidth:64 }}>{fmtTime(b.start_time)}</span>
                            <span style={{ color:CREAM }}>{b.title}</span>
                            {b.trainer_name && <span style={{ color:MUTED, fontSize:11 }}>{b.trainer_name.trim()}</span>}
                            {b.plan_name && <span style={{ color:MUTED, fontSize:11 }}>· {b.plan_name}</span>}
                            {dim && b.attended && <span style={{ color:'#4ade80', fontSize:11 }}>· attended</span>}
                          </div>
                        );
                        return (
                          <>
                            <div style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.12em', fontWeight:600, margin:'8px 0 4px' }}>
                              Coming up — {next.length}
                            </div>
                            {next.length ? next.map(b => line(b, false))
                              : <div style={{ fontSize:12, color:MUTED, padding:'4px 0' }}>Nothing booked ahead.</div>}
                            {past.length > 0 && (
                              <>
                                <div style={{ fontSize:10, color:MUTED, textTransform:'uppercase', letterSpacing:'.12em', fontWeight:600, margin:'14px 0 4px' }}>
                                  Already been — {past.length}
                                </div>
                                {past.slice(-6).reverse().map(b => line(b, true))}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ════ REVENUE TAB ════ */}
        {tab === 'revenue' && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:12, flexWrap:'wrap' }}>
              <select value={revCategory} onChange={e => { setRevCategory(e.target.value); loadRevenue(e.target.value); }}
                style={{ background:CARD, border:`1px solid ${BORDER}`, color:CREAM, borderRadius:8, fontSize:12, padding:'8px 12px', cursor:'pointer' }}>
                <option value="all">All trainers / tiers</option>
                {(revenue?.by_category || []).map(c => (
                  <option key={c.category} value={c.category}>{CAT_LABELS[c.category] || c.category}</option>
                ))}
              </select>
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

                {(revenue.by_category?.length ?? 0) > 0 && (
                  <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:'18px 22px', marginBottom:24 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>Revenue by trainer / tier</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {revenue.by_category!.map(c => {
                        const max = Math.max(...revenue.by_category!.map(x => x.revenue), 1);
                        return (
                          <div key={c.category} style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <div style={{ width:150, fontSize:12, color:CREAM, flexShrink:0 }}>{CAT_LABELS[c.category] || c.category}</div>
                            <div style={{ flex:1, height:8, background:'rgba(255,255,255,.05)', borderRadius:999, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${(c.revenue/max)*100}%`, background:ORANGE, borderRadius:999 }} />
                            </div>
                            <div style={{ width:120, textAlign:'right', fontSize:12, color:CREAM, flexShrink:0 }}>₹{(c.revenue/100).toLocaleString('en-IN')} <span style={{ color:MUTED }}>({c.members})</span></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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

                <div>
                  <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>Instructor</label>
                  <select value={newClassInstructor} onChange={e => setNewClassInstructor(e.target.value)}
                    style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13 }}>
                    <option value="">— No instructor —</option>
                    {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>Category *</label>
                  <select required value={newClassCategory} onChange={e => setNewClassCategory(e.target.value)}
                    style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13 }}>
                    <option value="">Choose a discipline…</option>
                    <option value="pole_regular">Pole (Regular)</option>
                    <option value="pole_nimisha">Pole (Nimisha)</option>
                    <option value="strength">Strength</option>
                    <option value="mobility">Mobility</option>
                    <option value="self_practice">Self Practice</option>
                  </select>
                  <div style={{ fontSize:11, color:MUTED, marginTop:6, lineHeight:1.5 }}>
                    Members only see classes their pack covers — a class without a category is hidden from them.
                  </div>
                </div>

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
                <div>
                  <label style={{ display:'block', fontSize:11, color:MUTED, marginBottom:6, textTransform:'uppercase', letterSpacing:'.1em' }}>Category *</label>
                  <select required value={recurringCategory} onChange={e => setRecurringCategory(e.target.value)}
                    style={{ width:'100%', background:DARK, border:`1px solid ${BORDER}`, borderRadius:8, padding:'11px 14px', color:CREAM, fontSize:13 }}>
                    <option value="">Choose a discipline…</option>
                    <option value="pole_regular">Pole (Regular)</option>
                    <option value="pole_nimisha">Pole (Nimisha)</option>
                    <option value="strength">Strength</option>
                    <option value="mobility">Mobility</option>
                    <option value="self_practice">Self Practice</option>
                  </select>
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
        {/* ════ TEMPLATES TAB ════ */}
        {tab === 'templates' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, maxWidth:1100 }}>
            {/* Left — template list */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:4 }}>Weekly Templates</div>
              <div style={{ fontSize:12, color:MUTED, marginBottom:16 }}>Each template generates one class per matching day when you run Generate Cycle.</div>
              {templatesLoading ? (
                <div style={{ color:MUTED, fontSize:13 }}>Loading…</div>
              ) : templates.length === 0 ? (
                <div style={{ color:MUTED, fontSize:13 }}>No templates yet. Add one using the form →</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, dow) => {
                    const dayTemplates = templates.filter(t => t.day_of_week === dow);
                    if (!dayTemplates.length) return null;
                    return (
                      <div key={dow}>
                        <div style={{ fontSize:10, color:ORANGE, letterSpacing:'.14em', textTransform:'uppercase', fontWeight:700, marginBottom:4, marginTop:8 }}>{day}</div>
                        {dayTemplates.map(t => (
                          <div key={t.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:6, padding:'9px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:3 }}>
                            <div>
                              <span style={{ fontSize:12, fontWeight:600, color:CREAM }}>{t.title}</span>
                              {t.instructor_name && <span style={{ fontSize:11, color:MUTED, marginLeft:8 }}>{t.instructor_name}</span>}
                              <span style={{ fontSize:11, color:MUTED, marginLeft:8 }}>{t.start_time.slice(0,5)}–{t.end_time.slice(0,5)}</span>
                              <span style={{ fontSize:10, color:MUTED, marginLeft:8 }}>cap:{t.capacity}</span>
                            </div>
                            <button onClick={() => deleteTemplate(t.id)} disabled={templateDeleteBusy === t.id}
                              style={{ fontSize:11, color:'#f87171', background:'none', border:'1px solid rgba(248,113,113,.25)', borderRadius:4, padding:'3px 8px', cursor:'pointer' }}>
                              {templateDeleteBusy === t.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Generate Cycle */}
              <div style={{ marginTop:28, background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:'18px 16px' }}>
                <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:4 }}>Generate Cycle</div>
                <div style={{ fontSize:12, color:MUTED, marginBottom:14 }}>Creates all classes from active templates for a date range. Skips any that already exist.</div>
                <form onSubmit={generateCycleAction} style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Start date</label>
                      <input type="date" required value={genCycle.startDate} onChange={e => setGenCycle(p => ({ ...p, startDate: e.target.value }))}
                        style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>End date</label>
                      <input type="date" required value={genCycle.endDate} onChange={e => setGenCycle(p => ({ ...p, endDate: e.target.value }))}
                        style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:12 }} />
                    </div>
                  </div>
                  <button type="submit" disabled={genCycleSaving}
                    style={{ background:ORANGE, border:'none', color:'#fff', borderRadius:6, padding:'9px', fontSize:13, fontWeight:600, cursor:'pointer', opacity: genCycleSaving ? .6 : 1 }}>
                    {genCycleSaving ? 'Generating…' : '⚡ Generate Classes'}
                  </button>
                  {genCycleResult && (
                    <div style={{ fontSize:12, color:'#4ade80', background:'rgba(74,222,128,.08)', border:'1px solid rgba(74,222,128,.2)', borderRadius:6, padding:'8px 12px' }}>
                      ✓ {genCycleResult.created} classes created{genCycleResult.skipped > 0 ? `, ${genCycleResult.skipped} already existed` : ''}
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Right — add template form */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>Add Template</div>
              <form onSubmit={createTemplate} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Class title</label>
                  <input type="text" required placeholder="e.g. Pole Princess"
                    value={newTemplate.title}
                    onChange={e => setNewTemplate(p => ({ ...p, title: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Instructor</label>
                  <select value={newTemplate.instructor_id}
                    onChange={e => setNewTemplate(p => ({ ...p, instructor_id: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }}>
                    <option value="">— No instructor —</option>
                    {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  {instructors.length === 0 && <div style={{ fontSize:10, color:MUTED, marginTop:4 }}>Create instructors in the Instructors tab first to assign them.</div>}
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Day of week</label>
                  <select value={newTemplate.day_of_week} onChange={e => setNewTemplate(p => ({ ...p, day_of_week: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }}>
                    {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Start time</label>
                    <input type="time" required value={newTemplate.start_time} onChange={e => setNewTemplate(p => ({ ...p, start_time: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>End time</label>
                    <input type="time" required value={newTemplate.end_time} onChange={e => setNewTemplate(p => ({ ...p, end_time: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Capacity</label>
                    <input type="number" required min="1" max="100" value={newTemplate.capacity} onChange={e => setNewTemplate(p => ({ ...p, capacity: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Category</label>
                    <select required value={newTemplate.category} onChange={e => setNewTemplate(p => ({ ...p, category: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }}>
                      <option value="">Choose a discipline…</option>
                      <option value="pole_regular">Pole (Regular)</option>
                      <option value="pole_nimisha">Pole (Nimisha)</option>
                      <option value="strength">Strength</option>
                      <option value="mobility">Mobility</option>
                      <option value="self_practice">Self Practice</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={templateSaving}
                  style={{ background:ORANGE, border:'none', color:'#fff', borderRadius:6, padding:'10px', fontSize:13, fontWeight:600, cursor:'pointer', opacity: templateSaving ? .6 : 1 }}>
                  {templateSaving ? 'Saving…' : 'Add Template'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ════ INSTRUCTORS TAB ════ */}
        {tab === 'instructors' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, maxWidth:1000 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:4 }}>Instructors</div>
              <div style={{ fontSize:12, color:MUTED, marginBottom:16 }}>They log in with their phone and see only their own classes, rosters and attendance.</div>
              {instructorsLoading ? (
                <div style={{ color:MUTED, fontSize:13 }}>Loading…</div>
              ) : instructors.length === 0 ? (
                <div style={{ color:MUTED, fontSize:13 }}>No instructors yet. Add one →</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {instructors.map(i => (
                    <div key={i.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color: i.is_active ? CREAM : MUTED }}>{i.name}{!i.is_active && <span style={{ fontSize:10, color:MUTED, marginLeft:8 }}>(inactive)</span>}</div>
                        <div style={{ fontSize:11, color:MUTED, marginTop:2 }}>+{i.phone}</div>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => resetInstructorPassword(i.id)} disabled={instructorBusy===i.id} style={{ fontSize:11, color:MUTED, background:'none', border:`1px solid ${BORDER}`, borderRadius:5, padding:'4px 8px', cursor:'pointer' }}>Reset PW</button>
                        <button onClick={() => toggleInstructor(i.id, i.is_active)} disabled={instructorBusy===i.id} style={{ fontSize:11, color: i.is_active ? '#fbbf24' : '#4ade80', background:'none', border:`1px solid ${BORDER}`, borderRadius:5, padding:'4px 8px', cursor:'pointer' }}>{i.is_active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => deleteInstructor(i.id)} disabled={instructorBusy===i.id} style={{ fontSize:11, color:'#f87171', background:'none', border:'1px solid rgba(248,113,113,.25)', borderRadius:5, padding:'4px 8px', cursor:'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>Add Instructor</div>
              <form onSubmit={createInstructor} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Name</label>
                  <input type="text" required placeholder="e.g. Nimisha" value={newInstructor.name}
                    onChange={e => setNewInstructor(p => ({ ...p, name: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  <div style={{ fontSize:10, color:MUTED, marginTop:4 }}>Tip: match the name used on templates (e.g. &quot;Nimisha&quot;) so their existing classes auto-link.</div>
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Login phone (10-digit)</label>
                  <input type="tel" required placeholder="9876543210" value={newInstructor.phone}
                    onChange={e => setNewInstructor(p => ({ ...p, phone: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                </div>
                <button type="submit" disabled={instructorSaving}
                  style={{ background:ORANGE, border:'none', color:'#fff', borderRadius:6, padding:'10px', fontSize:13, fontWeight:600, cursor:'pointer', opacity: instructorSaving ? .6 : 1 }}>
                  {instructorSaving ? 'Creating…' : 'Add Instructor'}
                </button>
                <div style={{ fontSize:11, color:MUTED }}>A password is generated and shown once — share it with them.</div>
              </form>
            </div>
          </div>
        )}

        {/* ════ WORKSHOPS TAB ════ */}
        {tab === 'workshops' && (
          <div style={{ maxWidth:1150 }}>
            {orphanedPayments.length > 0 && (
              <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.35)', borderRadius:8, padding:'12px 16px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#f87171', marginBottom:4 }}>⚠️ {orphanedPayments.length} paid order{orphanedPayments.length !== 1 ? 's' : ''} without a seat</div>
                <div style={{ fontSize:12, color:MUTED, marginBottom:8 }}>These people were charged but no registration was created (usually the last seat filled during payment). Refund them in the Razorpay dashboard.</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {orphanedPayments.map(o => (
                    <div key={o.order_id} style={{ fontSize:12, color:CREAM }}>
                      {o.name} · +{o.phone} · <strong>₹{(o.amount_paise/100).toLocaleString('en-IN')}</strong> · {o.workshop_title} <span style={{ color:MUTED }}>({o.order_id})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1.15fr 0.85fr', gap:24 }}>
            {/* Left — workshop list */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:4 }}>Workshops</div>
              <div style={{ fontSize:12, color:MUTED, marginBottom:16 }}>Set a price of <strong style={{ color:CREAM }}>0</strong> to make a workshop free — attendees register instantly with no payment.</div>
              {workshopsLoading ? (
                <div style={{ color:MUTED, fontSize:13 }}>Loading…</div>
              ) : workshops.length === 0 ? (
                <div style={{ color:MUTED, fontSize:13 }}>No workshops yet. Create one using the form →</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {workshops.map(w => {
                    const past = w.workshop_date < todayStr;
                    return (
                      <div key={w.id} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:'14px 16px', opacity: w.is_active ? 1 : 0.55 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:CREAM }}>
                              {w.title}
                              {!w.is_active && <span style={{ fontSize:10, color:MUTED, marginLeft:8, textTransform:'uppercase', letterSpacing:'.08em' }}>Hidden</span>}
                              {past && <span style={{ fontSize:10, color:'#f0a', marginLeft:8, textTransform:'uppercase', letterSpacing:'.08em' }}>Past</span>}
                            </div>
                            <div style={{ fontSize:12, color:MUTED, marginTop:3 }}>
                              {new Date(w.workshop_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
                              {' · '}{w.start_time.slice(0,5)}{w.end_time ? `–${w.end_time.slice(0,5)}` : ''}
                              {w.instructor_name ? ` · ${w.instructor_name}` : ''}
                            </div>
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, whiteSpace:'nowrap', color: w.price_paise === 0 ? '#4ade80' : ORANGE }}>
                            {w.price_paise === 0 ? 'FREE' : `₹${(w.price_paise/100).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, color:CREAM, background:'#131009', border:`1px solid ${BORDER}`, borderRadius:20, padding:'3px 10px' }}>
                            {w.registration_count} / {w.capacity} registered
                          </span>
                          <button onClick={() => viewRegistrations(w)}
                            style={{ fontSize:11, color:CREAM, background:'none', border:`1px solid ${BORDER}`, borderRadius:4, padding:'4px 10px', cursor:'pointer' }}>
                            View roster
                          </button>
                          <button onClick={() => toggleWorkshop(w)} disabled={workshopBusy === w.id}
                            style={{ fontSize:11, color:MUTED, background:'none', border:`1px solid ${BORDER}`, borderRadius:4, padding:'4px 10px', cursor:'pointer' }}>
                            {workshopBusy === w.id ? '…' : w.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => deleteWorkshop(w)} disabled={workshopBusy === w.id}
                            style={{ fontSize:11, color:'#f87171', background:'none', border:'1px solid rgba(248,113,113,.25)', borderRadius:4, padding:'4px 10px', cursor:'pointer' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right — create workshop form */}
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:CREAM, marginBottom:14 }}>New Workshop</div>
              <form onSubmit={createWorkshop} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Title</label>
                  <input type="text" required placeholder="e.g. Flexibility Intensive" value={newWorkshop.title}
                    onChange={e => setNewWorkshop(p => ({ ...p, title: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Description</label>
                  <textarea rows={3} placeholder="What's it about, what to bring, level…" value={newWorkshop.description}
                    onChange={e => setNewWorkshop(p => ({ ...p, description: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13, resize:'vertical', fontFamily:'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Instructor <span style={{ color:MUTED }}>(optional)</span></label>
                  <input type="text" placeholder="e.g. Nimisha" value={newWorkshop.instructor_name}
                    onChange={e => setNewWorkshop(p => ({ ...p, instructor_name: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Date</label>
                  <input type="date" required value={newWorkshop.workshop_date}
                    onChange={e => setNewWorkshop(p => ({ ...p, workshop_date: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Start time</label>
                    <input type="time" required value={newWorkshop.start_time} onChange={e => setNewWorkshop(p => ({ ...p, start_time: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>End time <span style={{ color:MUTED }}>(optional)</span></label>
                    <input type="time" value={newWorkshop.end_time} onChange={e => setNewWorkshop(p => ({ ...p, end_time: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Capacity</label>
                    <input type="number" required min="1" max="500" value={newWorkshop.capacity} onChange={e => setNewWorkshop(p => ({ ...p, capacity: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Price (₹) — 0 = free</label>
                    <input type="number" min="0" step="1" placeholder="0" value={newWorkshop.price} onChange={e => setNewWorkshop(p => ({ ...p, price: e.target.value }))}
                      style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:11, color:MUTED, display:'block', marginBottom:4 }}>Location <span style={{ color:MUTED }}>(optional)</span></label>
                  <input type="text" placeholder="Studio / address" value={newWorkshop.location}
                    onChange={e => setNewWorkshop(p => ({ ...p, location: e.target.value }))}
                    style={{ width:'100%', background:'#111', border:`1px solid ${BORDER}`, borderRadius:6, padding:'8px 10px', color:CREAM, fontSize:13 }} />
                </div>
                <button type="submit" disabled={workshopSaving}
                  style={{ background:ORANGE, border:'none', color:'#fff', borderRadius:6, padding:'10px', fontSize:13, fontWeight:600, cursor:'pointer', opacity: workshopSaving ? .6 : 1 }}>
                  {workshopSaving ? 'Saving…' : 'Create Workshop'}
                </button>
                <div style={{ fontSize:11, color:MUTED }}>Appears on the public /workshops page while active.</div>
              </form>
            </div>

            {/* Roster modal */}
            {viewingWorkshop && (
              <div onClick={() => setViewingWorkshop(null)} style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
                <div onClick={e => e.stopPropagation()} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:10, width:'100%', maxWidth:560, maxHeight:'80vh', overflow:'auto', padding:24 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                    <div style={{ fontSize:16, fontWeight:700, color:CREAM }}>{viewingWorkshop.title}</div>
                    <button onClick={() => setViewingWorkshop(null)} style={{ background:'none', border:'none', color:MUTED, fontSize:22, lineHeight:1, cursor:'pointer' }}>×</button>
                  </div>
                  <div style={{ fontSize:12, color:MUTED, marginBottom:16 }}>
                    {new Date(viewingWorkshop.workshop_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })} · {viewingWorkshop.registration_count} registered
                  </div>
                  {regsLoading ? (
                    <div style={{ color:MUTED, fontSize:13 }}>Loading…</div>
                  ) : workshopRegs.length === 0 ? (
                    <div style={{ color:MUTED, fontSize:13 }}>No registrations yet.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {workshopRegs.map((r, i) => (
                        <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, background:'#131009', border:`1px solid ${BORDER}`, borderRadius:6, padding:'9px 12px' }}>
                          <div>
                            <div style={{ fontSize:13, color:CREAM, fontWeight:600 }}>{i + 1}. {r.name}</div>
                            <div style={{ fontSize:11, color:MUTED }}>+{r.phone}{r.email ? ` · ${r.email}` : ''}</div>
                          </div>
                          <span style={{ fontSize:11, fontWeight:600, color: r.amount_paise === 0 ? '#4ade80' : ORANGE }}>
                            {r.amount_paise === 0 ? 'Free' : `₹${(r.amount_paise/100).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* ════ AUDIT TAB ════ */}
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
              The full amount actually paid (after any promo/discount) will be refunded via Razorpay. Member will be deactivated.
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
                <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <div style={{ width:120, height:5, background:'rgba(255,255,255,.05)', borderRadius:999, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(viewingClass.booked_count/viewingClass.capacity)*100}%`, background: viewingClass.booked_count >= viewingClass.capacity ? '#f87171' : ORANGE, borderRadius:999 }} />
                  </div>
                  <span style={{ fontSize:12, color:MUTED }}>{viewingClass.booked_count}/{viewingClass.capacity} booked</span>
                  <span style={{ fontSize:12, color: viewingClass.capacity-viewingClass.booked_count > 0 ? '#4ade80' : '#f87171' }}>
                    · {viewingClass.capacity-viewingClass.booked_count} spots free
                  </span>
                </div>

                {/* Class size, on its own line and spelled out. It sat inline at
                    the end of the capacity row, which on a phone had nowhere to
                    wrap to -- the studio could not see it at all. And a bare +
                    beside the word "spots" did not read as "add a spot" even
                    where it fitted: the first question asked was "how do I add a
                    slot to an existing class". */}
                {!viewingClass.is_cancelled && (
                  <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, color:MUTED, letterSpacing:'.06em', textTransform:'uppercase' }}>Class size</span>
                    <button onClick={() => changeCapacity(1)} disabled={capBusy}
                      title="Adds one seat. If anyone is on the waitlist, it goes to them."
                      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, background:'rgba(74,222,128,.12)', border:'1px solid rgba(74,222,128,.4)', color:'#4ade80', cursor: capBusy ? 'default' : 'pointer', fontSize:12.5, fontWeight:600, opacity: capBusy ? .5 : 1 }}>
                      + Add spot
                    </button>
                    <button onClick={() => changeCapacity(-1)}
                      disabled={capBusy || viewingClass.capacity <= Math.max(1, viewingClass.booked_count)}
                      title={viewingClass.capacity <= viewingClass.booked_count ? 'Every seat is already booked, so the class cannot be made smaller' : 'Removes one seat'}
                      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, background:'transparent', border:`1px solid ${BORDER}`, color:CREAM, cursor: (capBusy || viewingClass.capacity <= Math.max(1, viewingClass.booked_count)) ? 'default' : 'pointer', fontSize:12.5, fontWeight:600, opacity: (capBusy || viewingClass.capacity <= Math.max(1, viewingClass.booked_count)) ? .35 : 1 }}>
                      &minus; Remove spot
                    </button>
                    {capBusy && <span style={{ fontSize:11.5, color:MUTED }}>saving…</span>}
                    {!capBusy && viewingClass.booked_count >= viewingClass.capacity && (
                      <span style={{ fontSize:11.5, color:'#fbbf24' }}>
                        {classWaiting.some(w => w.canBePromoted)
                          ? `Class is full — a spot goes straight to ${classWaiting.find(w => w.canBePromoted)!.member?.name ?? 'the waitlist'}`
                          : classWaiting.length
                            ? 'Class is full. Nobody on the waitlist can take a spot right now — see below for why'
                            : 'Class is full, and nobody is waiting'}
                      </span>
                    )}
                  </div>
                )}
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

                  {/* Who is waiting, and whether a new spot could actually go to
                      them. Without this, "Add spot" on a full class is a guess:
                      somebody appears, or nothing happens, and the studio cannot
                      tell which to expect. A member who has spent every credit
                      stays on the waitlist for good, correctly, but invisibly. */}
                  {classWaiting.length > 0 && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'18px 0 8px' }}>
                        <span style={{ fontSize:11, color:MUTED, textTransform:'uppercase', letterSpacing:'.1em' }}>Waiting — {classWaiting.length}</span>
                        <span style={{ fontSize:11, color: classWaiting.some(w=>w.canBePromoted) ? '#4ade80' : '#fbbf24' }}>
                          {classWaiting.filter(w=>w.canBePromoted).length} can take a spot
                        </span>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                        {classWaiting.map(w => (
                          <div key={w.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'10px 12px', background:FAINT, borderRadius:8, border:`1px solid ${w.canBePromoted ? 'rgba(74,222,128,.25)' : BORDER}` }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                              <div style={{ width:32, height:32, borderRadius:'50%', background: w.member ? avatarColor(w.member.name) : MUTED, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                {w.member ? initials(w.member.name) : '?'}
                              </div>
                              <div style={{ minWidth:0 }}>
                                <div style={{ color:CREAM, fontSize:13, fontWeight:500 }}>#{w.position} &nbsp;{w.member?.name ?? '—'}</div>
                                <div style={{ color:MUTED, fontSize:11 }}>{w.member?.phone?.replace('91','+91 ')}</div>
                              </div>
                            </div>
                            <span style={{ fontSize:11, textAlign:'right', color: w.canBePromoted ? '#4ade80' : '#fbbf24', flexShrink:0, maxWidth:200 }}>
                              {w.canBePromoted ? 'Gets the next spot' : w.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
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

      <Toast msg={msg} onClose={() => setMsg(null)} />
    </main>
  );
}
