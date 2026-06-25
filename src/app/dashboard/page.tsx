'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type MemberInfo = {
  id: string;
  name: string;
  phone: string;
  plan_name: string;
  plan_start: string;
  plan_end: string;
  days_remaining: number;
  reschedule_used: boolean;
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
  my_booking_id: string | null;
  my_booking_status: string | null;
};

type Tab = 'schedule' | 'my-bookings';

export default function DashboardPage() {
  const router = useRouter();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [myBookings, setMyBookings] = useState<ClassSlot[]>([]);
  const [tab, setTab] = useState<Tab>('schedule');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [rescheduleMode, setRescheduleMode] = useState<string | null>(null); // bookingId being rescheduled

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [mRes, cRes] = await Promise.all([
      fetch('/api/member/me'),
      fetch('/api/member/classes'),
    ]);

    if (mRes.status === 401) { router.push('/login'); return; }

    const mData = await mRes.json();
    const cData = await cRes.json();

    setMember(mData.member);
    setClasses(cData.upcoming || []);
    setMyBookings(cData.myBookings || []);
    setLoading(false);
  }

  async function bookClass(classId: string) {
    setActionMsg('');
    const res = await fetch('/api/booking/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId }),
    });
    const data = await res.json();
    if (data.success) {
      setActionMsg('Class booked! Check WhatsApp for confirmation.');
      fetchAll();
    } else {
      setActionMsg(data.error || 'Booking failed');
    }
  }

  async function rescheduleClass(oldBookingId: string, newClassId: string) {
    setActionMsg('');
    const res = await fetch('/api/booking/reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldBookingId, newClassId }),
    });
    const data = await res.json();
    if (data.success) {
      setActionMsg('Rescheduled! Check WhatsApp for confirmation.');
      setRescheduleMode(null);
      fetchAll();
    } else {
      setActionMsg(data.error || 'Reschedule failed');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0B08] flex items-center justify-center">
        <div className="text-[#8A7A6A]">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0D0B08]">
      {/* Navbar */}
      <nav className="border-b border-[#2A2118] px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold tracking-widest text-[#E1542B]" style={{ fontFamily: 'Georgia, serif' }}>AZDAH</span>
        <div className="flex items-center gap-4">
          <span className="text-[#8A7A6A] text-sm hidden sm:block">{member?.name}</span>
          <button onClick={logout} className="text-sm text-[#8A7A6A] hover:text-[#F5F0E8] transition-colors">
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Membership Card */}
        {member && (
          <div className="bg-gradient-to-br from-[#1A1410] to-[#211A13] border border-[#2A2118] rounded-xl p-6 mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[#8A7A6A] text-xs tracking-widest uppercase mb-1">Active Member</p>
                <h2 className="text-2xl font-bold text-[#F5F0E8]" style={{ fontFamily: 'Georgia, serif' }}>{member.name}</h2>
                <p className="text-[#E1542B] font-semibold mt-1">{member.plan_name}</p>
              </div>
              <div className="text-right">
                <div className={`text-4xl font-bold ${member.days_remaining <= 7 ? 'text-red-400' : 'text-[#E1542B]'}`}>
                  {member.days_remaining}
                </div>
                <div className="text-[#8A7A6A] text-xs">days remaining</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#2A2118] flex flex-wrap gap-4 text-sm text-[#8A7A6A]">
              <span>Start: <span className="text-[#F5F0E8]">{formatDate(member.plan_start)}</span></span>
              <span>Expiry: <span className="text-[#F5F0E8]">{formatDate(member.plan_end)}</span></span>
              <span>
                Reschedule:{' '}
                <span className={member.reschedule_used ? 'text-red-400' : 'text-green-400'}>
                  {member.reschedule_used ? 'Used this month' : 'Available'}
                </span>
              </span>
            </div>
            {member.days_remaining <= 7 && (
              <a
                href="/#plans"
                className="mt-4 inline-block text-sm text-[#E1542B] border border-[#E1542B] px-4 py-2 rounded hover:bg-[#E1542B]/10 transition-colors"
              >
                Renew Membership →
              </a>
            )}
          </div>
        )}

        {/* Action message */}
        {actionMsg && (
          <div className="mb-6 p-4 bg-[#1A1410] border border-[#2A2118] rounded text-sm text-[#F5F0E8]">
            {actionMsg}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#2A2118]">
          {([['schedule', 'Class Schedule'], ['my-bookings', 'My Bookings']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setRescheduleMode(null); setActionMsg(''); }}
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

        {/* Schedule Tab */}
        {tab === 'schedule' && (
          <div className="space-y-3">
            {classes.length === 0 ? (
              <div className="text-center text-[#8A7A6A] py-12">No upcoming classes scheduled.</div>
            ) : (
              classes.map((cls) => {
                const spotsLeft = cls.capacity - cls.booked_count;
                const isBooked = cls.my_booking_status === 'confirmed';
                const isFull = spotsLeft <= 0 && !isBooked;

                return (
                  <div key={cls.id} className="bg-[#1A1410] border border-[#2A2118] rounded-xl p-5 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-[#F5F0E8]">{cls.title}</span>
                        {isBooked && <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded">Booked</span>}
                        {isFull && <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded">Full</span>}
                      </div>
                      <div className="text-sm text-[#8A7A6A]">
                        {formatDate(cls.class_date)} · {formatTime(cls.start_time)} – {formatTime(cls.end_time)}
                        {cls.trainer_name && ` · ${cls.trainer_name}`}
                      </div>
                      <div className="text-xs text-[#8A7A6A] mt-1">{spotsLeft > 0 ? `${spotsLeft} spots left` : 'Class full'}</div>
                    </div>

                    <div className="flex gap-2">
                      {rescheduleMode ? (
                        <button
                          onClick={() => rescheduleClass(rescheduleMode, cls.id)}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                        >
                          Move Here
                        </button>
                      ) : !isBooked && !isFull ? (
                        <button
                          onClick={() => bookClass(cls.id)}
                          className="px-4 py-2 text-sm bg-[#E1542B] text-white rounded hover:bg-[#F06040] transition-colors"
                        >
                          Book
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* My Bookings Tab */}
        {tab === 'my-bookings' && (
          <div className="space-y-3">
            {myBookings.length === 0 ? (
              <div className="text-center text-[#8A7A6A] py-12">No bookings yet. Book a class from the schedule.</div>
            ) : (
              <>
                {!member?.reschedule_used && (
                  <div className="p-4 bg-blue-900/20 border border-blue-800 rounded text-sm text-blue-300 mb-4">
                    You have 1 reschedule available this month. Select a booking below to reschedule it.
                  </div>
                )}
                {rescheduleMode && (
                  <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded text-sm text-yellow-300 mb-4">
                    Now go to <button className="underline" onClick={() => setTab('schedule')}>Class Schedule</button> and pick a new class.
                    <button onClick={() => setRescheduleMode(null)} className="ml-3 text-red-400 underline">Cancel</button>
                  </div>
                )}

                {myBookings.map((cls) => (
                  <div key={cls.my_booking_id} className="bg-[#1A1410] border border-[#2A2118] rounded-xl p-5 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#F5F0E8] mb-1">{cls.title}</div>
                      <div className="text-sm text-[#8A7A6A]">
                        {formatDate(cls.class_date)} · {formatTime(cls.start_time)}
                        {cls.trainer_name && ` · ${cls.trainer_name}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!member?.reschedule_used && !rescheduleMode && (
                        <button
                          onClick={() => { setRescheduleMode(cls.my_booking_id!); setTab('schedule'); }}
                          className="px-4 py-2 text-sm border border-[#E1542B] text-[#E1542B] rounded hover:bg-[#E1542B]/10 transition-colors"
                        >
                          Reschedule
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
