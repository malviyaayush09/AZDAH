'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const DARK = '#0D0B08';
const CARD = '#1A1410';
const BORDER = '#2A2118';
const CREAM = '#F5F0E8';
const MUTED = '#8A7A6A';
const ORANGE = '#F83433';
const SERIF = 'var(--font-bodoni), Georgia, serif';

type ClassRow = {
  id: string; title: string; class_date: string; start_time: string; end_time: string;
  capacity: number; booked_count: number; is_past: boolean;
};
type RosterEntry = { id: string; member_id: string; name: string; phone: string; attended: boolean | null; note: string };

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function InstructorPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [stats, setStats] = useState<{ upcoming_classes: number; total_upcoming_bookings: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterEntry[]>>({});
  const [rosterLoading, setRosterLoading] = useState<string | null>(null);
  const [attBusy, setAttBusy] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteBusy, setNoteBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/instructor/dashboard');
      if (res.status === 401 || res.status === 403) { router.push('/login'); return; }
      const data = await res.json();
      setName(data.name || 'Instructor');
      setClasses(data.classes || []);
      setStats(data.stats || null);
      setLoading(false);
    })();
  }, [router]);

  async function toggleRoster(classId: string) {
    if (expanded === classId) { setExpanded(null); return; }
    setExpanded(classId);
    if (!rosters[classId]) {
      setRosterLoading(classId);
      const res = await fetch(`/api/instructor/classes/${classId}`);
      const data = await res.json();
      const roster: RosterEntry[] = data.roster || [];
      setRosters((prev) => ({ ...prev, [classId]: roster }));
      setNoteDrafts((prev) => ({ ...prev, ...Object.fromEntries(roster.map((r) => [r.member_id, r.note])) }));
      setRosterLoading(null);
    }
  }

  async function markAttendance(classId: string, bookingId: string, attended: boolean) {
    setAttBusy(bookingId);
    const res = await fetch(`/api/instructor/classes/${classId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, attended }),
    });
    if (res.ok) {
      setRosters((prev) => ({ ...prev, [classId]: (prev[classId] || []).map((r) => (r.id === bookingId ? { ...r, attended } : r)) }));
    }
    setAttBusy(null);
  }

  async function saveNote(memberId: string) {
    setNoteBusy(memberId);
    const note = noteDrafts[memberId] ?? '';
    await fetch('/api/instructor/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, note }),
    });
    setNoteBusy(null);
  }

  function messageClass(classId: string, title: string) {
    const roster = rosters[classId] || [];
    if (!roster.length) return;
    const msg = window.prompt(`Message all ${roster.length} student(s) booked for "${title}":`, `Hi! A quick note about your ${title} class — `);
    if (!msg) return;
    roster.forEach((r) => r.phone && window.open(`https://wa.me/${r.phone}?text=${encodeURIComponent(msg)}`, '_blank'));
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const upcoming = classes.filter((c) => !c.is_past);
  const past = classes.filter((c) => c.is_past).reverse();

  const renderClass = (c: ClassRow) => (
    <div key={c.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={() => toggleRoster(c.id)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
        <div style={{ minWidth: 92 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: CREAM }}>{fmtDate(c.class_date)}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{fmtTime(c.start_time)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: CREAM }}>{c.title}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{c.booked_count} of {c.capacity} booked</div>
        </div>
        <span style={{ fontSize: 12, color: ORANGE }}>{expanded === c.id ? 'Hide' : 'View roster'}</span>
      </button>

      {expanded === c.id && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 20px' }}>
          {rosterLoading === c.id ? (
            <div style={{ color: MUTED, fontSize: 13 }}>Loading roster…</div>
          ) : (rosters[c.id]?.length ?? 0) === 0 ? (
            <div style={{ color: MUTED, fontSize: 13 }}>No one has booked this class yet.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button onClick={() => messageClass(c.id, c.title)}
                  style={{ fontSize: 12, fontWeight: 600, color: '#25D366', background: 'rgba(37,211,102,.1)', border: '1px solid rgba(37,211,102,.3)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                  Message class ({rosters[c.id].length}) on WhatsApp
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {rosters[c.id].map((r) => (
                  <div key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, color: CREAM, fontWeight: 500 }}>{r.name}</div>
                        <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: MUTED, textDecoration: 'none' }}>+{r.phone}</a>
                      </div>
                      <button onClick={() => markAttendance(c.id, r.id, !r.attended)} disabled={attBusy === r.id}
                        style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
                          background: r.attended ? 'rgba(74,222,128,.12)' : 'transparent',
                          border: `1px solid ${r.attended ? 'rgba(74,222,128,.4)' : BORDER}`,
                          color: r.attended ? '#4ade80' : MUTED }}>
                        {attBusy === r.id ? '…' : r.attended ? '✓ Attended' : 'Mark attended'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
                      <textarea value={noteDrafts[r.member_id] ?? ''} onChange={(e) => setNoteDrafts((p) => ({ ...p, [r.member_id]: e.target.value }))}
                        placeholder="Coaching note (private) — e.g. working on invert, left shoulder…" rows={1}
                        style={{ flex: 1, background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', color: CREAM, fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit' }} />
                      <button onClick={() => saveNote(r.member_id)} disabled={noteBusy === r.member_id}
                        style={{ fontSize: 12, color: MUTED, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 12px', cursor: 'pointer', flexShrink: 0 }}>
                        {noteBusy === r.member_id ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: DARK, color: CREAM, fontFamily: 'system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: '*{box-sizing:border-box;margin:0;padding:0}' }} />

      <nav style={{ borderBottom: `1px solid ${BORDER}`, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/azdahlogo.png" alt="AZDAH" style={{ height: 26, width: 'auto' }} />
          <span style={{ fontSize: 11, color: MUTED, letterSpacing: '.14em', textTransform: 'uppercase', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '3px 10px' }}>Instructor</span>
        </div>
        <button onClick={logout} style={{ background: 'none', border: `1px solid ${BORDER}`, color: MUTED, fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>Log out</button>
      </nav>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px 80px' }}>
        {loading ? (
          <div style={{ color: MUTED, fontSize: 14, padding: '60px 0', textAlign: 'center' }}>Loading your classes…</div>
        ) : (
          <>
            <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 800, marginBottom: 6 }}>Hi, {name.split(' ')[0]}.</h1>
            <p style={{ color: MUTED, fontSize: 14, marginBottom: 28 }}>Your classes, rosters, attendance and coaching notes.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, maxWidth: 420 }}>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 800, color: ORANGE, lineHeight: 1 }}>{stats?.upcoming_classes ?? 0}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Upcoming classes</div>
              </div>
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{stats?.total_upcoming_bookings ?? 0}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Booked (upcoming)</div>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: CREAM, marginBottom: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>Upcoming</div>
            {upcoming.length === 0 ? (
              <div style={{ color: MUTED, fontSize: 14, marginBottom: 28 }}>No upcoming classes assigned to you yet.</div>
            ) : (
              <div style={{ marginBottom: 28 }}>{upcoming.map(renderClass)}</div>
            )}

            {past.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>Recent (for attendance)</div>
                <div style={{ marginBottom: 28 }}>{past.map(renderClass)}</div>
              </>
            )}

          </>
        )}
      </div>
    </main>
  );
}
