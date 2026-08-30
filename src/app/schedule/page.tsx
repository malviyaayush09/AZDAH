'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const DARK = '#15110D';
const CARD = '#1E1812';
const CREAM = '#F1E9DA';
const ORANGE = '#F83433';
const MUTED = 'rgba(241,233,218,0.62)';
const FAINT = 'rgba(241,233,218,0.38)';
const BORDER = 'rgba(241,233,218,0.1)';
const SERIF = 'var(--font-bodoni), Georgia, "Times New Roman", serif';

type PublicClass = {
  id: string; title: string; trainer_name: string | null;
  class_date: string; start_time: string; end_time: string;
  category: string | null; is_full: boolean;
};

// Local date formatting. toISOString() would shift to the previous day in IST
// (UTC+5:30) and show every class one day early — the same trap the dashboard
// already documents.
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
};

export default function SchedulePage() {
  const [classes, setClasses] = useState<PublicClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    fetch('/api/classes/public')
      .then((r) => r.json())
      .then((d) => {
        const list: PublicClass[] = d.classes || [];
        setClasses(list);
        // Land on the first week that actually has something on. Opening on the
        // current week shows an empty grid whenever today is late in the week
        // and the day's classes have already run — a poor first impression of a
        // schedule that is in fact full.
        if (list.length) {
          const mondayOf = (d0: Date) => {
            const x = new Date(d0);
            x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
            x.setHours(0, 0, 0, 0);
            return x;
          };
          const thisMonday = mondayOf(new Date());
          const firstMonday = mondayOf(new Date(list[0].class_date + 'T00:00:00'));
          const weeks = Math.round((firstMonday.getTime() - thisMonday.getTime()) / (7 * 86400000));
          if (weeks > 0) setWeekOffset(weeks);
        }
      })
      .catch(() => setClasses([]))
      .finally(() => setLoading(false));
  }, []);

  const todayStr = toYMD(new Date());

  // Weeks run Monday to Sunday, the way a timetable is read.
  const weekStart = useMemo(() => {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const byDate = useMemo(() => {
    const m = new Map<string, PublicClass[]>();
    for (const c of classes) {
      const list = m.get(c.class_date) || [];
      list.push(c);
      m.set(c.class_date, list);
    }
    return m;
  }, [classes]);

  // How far the published schedule runs, so navigation stops at the real end
  // rather than letting people wander into empty weeks.
  const lastDate = classes.length ? classes[classes.length - 1].class_date : todayStr;
  const weekHasAny = days.some((d) => (byDate.get(toYMD(d)) || []).length > 0);
  const canGoBack = weekOffset > 0;
  const canGoForward = toYMD(days[6]) < lastDate;

  const monthLabel = () => {
    const a = days[0], b = days[6];
    const fmt = (d: Date, withYear: boolean) =>
      d.toLocaleDateString('en-IN', { month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${fmt(b, true)}`
      : `${a.getDate()} ${fmt(a, false)} – ${b.getDate()} ${fmt(b, true)}`;
  };

  return (
    <main style={{ background: DARK, minHeight: '100vh', color: CREAM }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header style={{ borderBottom: `1px solid ${BORDER}`, padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Link href="/" aria-label="AZDAH home">
          <Image src="/azdahlogo.png" alt="AZDAH" width={415} height={124} style={{ height: 22, width: 'auto' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/login" style={{ fontSize: 12.5, color: MUTED, border: `1px solid ${BORDER}`, padding: '8px 14px', borderRadius: 2 }}>Member login</Link>
          <Link href="/#membership" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', background: ORANGE, color: DARK, padding: '9px 16px', borderRadius: 2 }}>JOIN NOW</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '44px 28px 80px' }}>
        <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 14px' }}>Class schedule</p>
        <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(34px,5vw,60px)', fontWeight: 800, margin: '0 0 12px', lineHeight: 1.05, letterSpacing: '-.02em' }}>
          What&apos;s on.
        </h1>
        <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, maxWidth: '52ch', margin: 0 }}>
          Every class we run, open to see before you join. Book a pack to reserve your place.
        </p>

        {/* week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '36px 0 20px', flexWrap: 'wrap' }}>
          <button className="nav-btn" onClick={() => setWeekOffset((w) => w - 1)} disabled={!canGoBack} aria-label="Previous week">←</button>
          <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, minWidth: 190 }}>{monthLabel()}</span>
          <button className="nav-btn" onClick={() => setWeekOffset((w) => w + 1)} disabled={!canGoForward} aria-label="Next week">→</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ background: 'none', border: 'none', color: ORANGE, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>
              This week
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: MUTED, padding: '80px 0' }}>Loading the schedule…</div>
        ) : !weekHasAny ? (
          <div style={{ textAlign: 'center', color: MUTED, padding: '80px 0', fontSize: 15 }}>
            No classes published for this week.
            {canGoForward && <> <button onClick={() => setWeekOffset((w) => w + 1)} style={{ background: 'none', border: 'none', color: ORANGE, textDecoration: 'underline', cursor: 'pointer', fontSize: 15 }}>Try the next one →</button></>}
          </div>
        ) : (
          <div className="week">
            {days.map((d) => {
              const ds = toYMD(d);
              const list = (byDate.get(ds) || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
              const isToday = ds === todayStr;
              const past = ds < todayStr;
              return (
                <section key={ds} className="day" style={{ opacity: past ? 0.45 : 1 }}>
                  <div className="day-head" style={{ borderColor: isToday ? ORANGE : BORDER }}>
                    <span style={{ fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: isToday ? ORANGE : FAINT }}>
                      {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </span>
                    <span style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 800, color: isToday ? ORANGE : CREAM }}>{d.getDate()}</span>
                  </div>

                  {list.length === 0 ? (
                    <p style={{ color: FAINT, fontSize: 12, margin: '14px 0 0' }}>—</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      {list.map((c) => (
                        <article key={c.id} style={{
                          background: CARD, border: `1px solid ${c.is_full ? 'rgba(248,113,113,.28)' : BORDER}`,
                          borderRadius: 8, padding: '11px 12px',
                        }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: CREAM, lineHeight: 1.35, marginBottom: 5 }}>{c.title}</div>
                          <div style={{ fontSize: 11.5, color: MUTED }}>{fmtTime(c.start_time)}</div>
                          {c.trainer_name && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{c.trainer_name}</div>}
                          {/* Available or full. Never a count — the studio does
                              not want spot numbers shown. */}
                          <div style={{
                            marginTop: 8, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                            color: c.is_full ? '#f87171' : '#4ade80',
                          }}>
                            {c.is_full ? 'Full' : 'Available'}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 52, padding: '26px 28px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, marginBottom: 5 }}>Ready to book?</div>
            <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>Choose a class pack, then reserve any class your pack covers.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/#membership" style={{ background: ORANGE, color: DARK, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '13px 22px', borderRadius: 2 }}>See packs</Link>
            <Link href="/login" style={{ border: `1px solid ${BORDER}`, color: CREAM, fontSize: 12.5, padding: '13px 22px', borderRadius: 2 }}>Already a member</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

const CSS = `
  .week{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;align-items:start}
  .day-head{display:flex;flex-direction:column;gap:2px;padding-bottom:9px;border-bottom:1px solid}
  .nav-btn{width:36px;height:36px;border-radius:50%;border:1px solid ${BORDER};background:none;
    color:${CREAM};font-size:15px;cursor:pointer;transition:border-color .2s,opacity .2s}
  .nav-btn:hover:not(:disabled){border-color:${ORANGE}}
  .nav-btn:disabled{opacity:.3;cursor:default}
  @media (max-width:900px){
    /* Seven columns cannot work on a phone. The week becomes a list of days,
       which keeps every class reachable by scrolling rather than hiding any. */
    .week{grid-template-columns:1fr;gap:22px}
    .day-head{flex-direction:row;align-items:baseline;gap:10px}
  }
`;
