'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Member = {
  id: string;
  name: string;
  phone: string;
  plan_name: string;
  plan_start: string;
  plan_end: string;
  days_remaining: number;
  is_active: boolean;
  reschedule_used: boolean;
  razorpay_payment_id: string | null;
  created_at: string;
};

type ClassSlot = {
  id: string;
  title: string;
  trainer_name: string | null;
  class_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  is_cancelled: boolean;
};

type AdminStats = {
  total_members: number;
  active_members: number;
  expiring_soon: number;
};

type Tab = 'members' | 'classes' | 'add-class';

export default function AdminPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tab, setTab] = useState<Tab>('members');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');

  // New class form
  const [newClass, setNewClass] = useState({
    title: '',
    trainer_name: '',
    class_date: '',
    start_time: '',
    end_time: '',
    capacity: '20',
  });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [mRes, cRes] = await Promise.all([
      fetch('/api/admin/members'),
      fetch('/api/admin/classes'),
    ]);
    if (mRes.status === 401 || mRes.status === 403) { router.push('/login'); return; }

    const mData = await mRes.json();
    const cData = await cRes.json();
    setMembers(mData.members || []);
    setStats(mData.stats || null);
    setClasses(cData.classes || []);
    setLoading(false);
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/admin/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newClass, capacity: parseInt(newClass.capacity) }),
    });
    const data = await res.json();
    if (data.success) {
      setMsg('Class added successfully!');
      setNewClass({ title: '', trainer_name: '', class_date: '', start_time: '', end_time: '', capacity: '20' });
      fetchAll();
      setTab('classes');
    } else {
      setMsg(data.error || 'Failed to add class');
    }
  }

  async function cancelClass(classId: string) {
    if (!confirm('Cancel this class? All booked members will need to be notified manually.')) return;
    const res = await fetch(`/api/admin/classes/${classId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { setMsg('Class cancelled.'); fetchAll(); }
    else setMsg(data.error || 'Failed to cancel');
  }

  async function toggleMember(memberId: string, active: boolean) {
    const res = await fetch(`/api/admin/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    });
    const data = await res.json();
    if (data.success) fetchAll();
    else setMsg(data.error || 'Failed to update member');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const filteredMembers = members.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search)
  );

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0D0B08] flex items-center justify-center text-[#8A7A6A]">Loading admin panel...</div>;
  }

  return (
    <main className="min-h-screen bg-[#0D0B08]">
      {/* Navbar */}
      <nav className="border-b border-[#2A2118] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-widest text-[#E1542B]" style={{ fontFamily: 'Georgia, serif' }}>AZDAH</span>
          <span className="text-xs bg-[#E1542B]/20 text-[#E1542B] border border-[#E1542B]/30 px-2 py-0.5 rounded">Admin</span>
        </div>
        <button onClick={logout} className="text-sm text-[#8A7A6A] hover:text-[#F5F0E8] transition-colors">Logout</button>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Total Members', value: stats.total_members, color: '#F5F0E8' },
              { label: 'Active Now', value: stats.active_members, color: '#4ade80' },
              { label: 'Expiring in 7 days', value: stats.expiring_soon, color: stats.expiring_soon > 0 ? '#fbbf24' : '#F5F0E8' },
            ].map((s) => (
              <div key={s.label} className="bg-[#1A1410] border border-[#2A2118] rounded-xl p-5 text-center">
                <div className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[#8A7A6A] text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Action message */}
        {msg && (
          <div className="mb-6 p-4 bg-[#1A1410] border border-[#2A2118] rounded text-sm text-[#F5F0E8]">{msg}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#2A2118]">
          {([['members', 'Members'], ['classes', 'Classes'], ['add-class', '+ Add Class']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setMsg(''); }}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                tab === key
                  ? 'text-[#E1542B] border-b-2 border-[#E1542B]'
                  : 'text-[#8A7A6A] hover:text-[#F5F0E8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Members Tab */}
        {tab === 'members' && (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full mb-4 bg-[#1A1410] border border-[#2A2118] rounded px-4 py-3 text-[#F5F0E8] placeholder-[#3A2B1E] focus:outline-none focus:border-[#E1542B] text-sm"
            />
            <div className="space-y-3">
              {filteredMembers.length === 0 ? (
                <div className="text-center text-[#8A7A6A] py-12">No members found.</div>
              ) : (
                filteredMembers.map((m) => (
                  <div key={m.id} className="bg-[#1A1410] border border-[#2A2118] rounded-xl p-5">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-[#F5F0E8]">{m.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded border ${
                            m.is_active
                              ? 'bg-green-900/30 text-green-400 border-green-800'
                              : 'bg-red-900/30 text-red-400 border-red-800'
                          }`}>
                            {m.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {m.days_remaining <= 7 && m.days_remaining > 0 && (
                            <span className="text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-800 px-2 py-0.5 rounded">Expiring soon</span>
                          )}
                          {m.days_remaining === 0 && (
                            <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded">Expired</span>
                          )}
                        </div>
                        <div className="text-sm text-[#8A7A6A]">
                          {m.phone.replace('91', '+91 ')} · {m.plan_name}
                        </div>
                        <div className="text-xs text-[#8A7A6A] mt-1">
                          Expires: {formatDate(m.plan_end)} · {m.days_remaining} days left
                        </div>
                        <div className="text-xs text-[#8A7A6A] mt-0.5">
                          Joined: {formatDate(m.created_at)} · Reschedule: {m.reschedule_used ? 'Used' : 'Available'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`https://wa.me/${m.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 text-xs border border-green-700 text-green-400 rounded hover:bg-green-900/20 transition-colors"
                        >
                          WhatsApp
                        </a>
                        <button
                          onClick={() => toggleMember(m.id, m.is_active)}
                          className="px-3 py-2 text-xs border border-[#2A2118] text-[#8A7A6A] rounded hover:border-[#E1542B] hover:text-[#E1542B] transition-colors"
                        >
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Classes Tab */}
        {tab === 'classes' && (
          <div className="space-y-3">
            {classes.length === 0 ? (
              <div className="text-center text-[#8A7A6A] py-12">No classes yet. Add one using the tab above.</div>
            ) : (
              classes.map((cls) => (
                <div key={cls.id} className={`bg-[#1A1410] border rounded-xl p-5 flex flex-wrap items-center gap-4 ${cls.is_cancelled ? 'opacity-50 border-[#2A2118]' : 'border-[#2A2118]'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[#F5F0E8]">{cls.title}</span>
                      {cls.is_cancelled && <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 px-2 py-0.5 rounded">Cancelled</span>}
                    </div>
                    <div className="text-sm text-[#8A7A6A]">
                      {formatDate(cls.class_date)} · {formatTime(cls.start_time)} – {formatTime(cls.end_time)}
                      {cls.trainer_name && ` · ${cls.trainer_name}`}
                    </div>
                    <div className="text-xs text-[#8A7A6A] mt-1">
                      {cls.booked_count} / {cls.capacity} booked
                    </div>
                  </div>
                  {!cls.is_cancelled && (
                    <button
                      onClick={() => cancelClass(cls.id)}
                      className="px-3 py-2 text-xs border border-red-800 text-red-400 rounded hover:bg-red-900/20 transition-colors"
                    >
                      Cancel Class
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Add Class Tab */}
        {tab === 'add-class' && (
          <form onSubmit={addClass} className="max-w-lg space-y-4">
            {[
              { label: 'Class Title', key: 'title', type: 'text', placeholder: 'e.g. Morning Yoga, HIIT, Zumba' },
              { label: 'Trainer Name (optional)', key: 'trainer_name', type: 'text', placeholder: 'Trainer name' },
              { label: 'Date', key: 'class_date', type: 'date', placeholder: '' },
              { label: 'Start Time', key: 'start_time', type: 'time', placeholder: '' },
              { label: 'End Time', key: 'end_time', type: 'time', placeholder: '' },
              { label: 'Capacity', key: 'capacity', type: 'number', placeholder: '20' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-[#8A7A6A] mb-1 tracking-wider uppercase">{label}</label>
                <input
                  type={type}
                  value={newClass[key as keyof typeof newClass]}
                  onChange={(e) => setNewClass({ ...newClass, [key]: e.target.value })}
                  placeholder={placeholder}
                  required={key !== 'trainer_name'}
                  min={key === 'capacity' ? '1' : undefined}
                  className="w-full bg-[#0D0B08] border border-[#2A2118] rounded px-4 py-3 text-[#F5F0E8] placeholder-[#3A2B1E] focus:outline-none focus:border-[#E1542B] text-sm"
                />
              </div>
            ))}
            <button
              type="submit"
              className="w-full bg-[#E1542B] text-white py-4 rounded font-semibold tracking-wide hover:bg-[#F06040] transition-colors"
            >
              Add Class
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
