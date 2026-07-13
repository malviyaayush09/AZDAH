'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Razorpay checkout is loaded from their CDN at runtime. We don't augment the
// global Window here (the landing page already does, with a different options
// shape) — instead we cast window locally where we construct the checkout.
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  prefill?: { contact?: string; name?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};
type RazorpayInstance = { open(): void };

type Workshop = {
  id: string;
  title: string;
  description: string;
  instructor_name: string | null;
  workshop_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  image_url: string | null;
  price_paise: number;
  is_free: boolean;
  is_full: boolean;
};

const SERIF = 'var(--font-bodoni), Georgia, "Times New Roman", serif';
const DARK = '#15110D';
const CREAM = '#F1E9DA';
const ORANGE = '#F83433';
const TAN = '#E5DAC6';
const CARD = '#1E1812';
const MUTED = 'rgba(241,233,218,0.62)';
const FAINT = 'rgba(241,233,218,0.38)';

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;overflow-x:hidden;background:${DARK}}
  button{font-family:inherit;cursor:pointer}
  input{font-family:inherit}
  .ws-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:24px}
  .ws-card{transition:transform .25s ease,border-color .25s ease}
  .ws-card:hover{transform:translateY(-4px);border-color:rgba(248,52,51,0.5)}
  .ws-btn:disabled{opacity:.45;cursor:not-allowed}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{width:16px;height:16px;border:2px solid rgba(21,17,13,0.3);border-top-color:${DARK};border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
  @media(max-width:640px){.ws-hero-h1{font-size:44px !important}}
`;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load payment script'));
    document.body.appendChild(s);
  });
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
}
function fmtTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}
function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Workshop | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch('/api/workshops/public')
      .then((r) => r.json())
      .then((d) => setWorkshops(d.workshops || []))
      .catch(() => setWorkshops([]))
      .finally(() => setLoading(false));
  }, []);

  function openModal(w: Workshop) {
    setSelected(w);
    setForm({ name: '', phone: '', email: '' });
    setError('');
    setDone(false);
  }
  function closeModal() {
    if (busy) return;
    setSelected(null);
  }

  async function submit() {
    if (!selected) return;
    setError('');
    const name = form.name.trim();
    if (name.length < 3 || name.length > 80) return setError('Please enter your full name.');
    if (/\d/.test(name)) return setError('Name should not contain numbers.');
    if (!/[A-Za-z]/.test(name)) return setError('Please enter a valid name.');
    const rawPhone = form.phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(rawPhone)) return setError('Enter a valid 10-digit Indian mobile number.');
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email, or leave it blank.');
    const fullPhone = `91${rawPhone}`;

    setBusy(true);
    try {
      if (selected.is_free) {
        const res = await fetch('/api/workshops/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workshopId: selected.id, name, phone: fullPhone, email: email || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        setDone(true);
        setBusy(false);
        return;
      }

      // Paid workshop → Razorpay
      const orderRes = await fetch('/api/workshops/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshopId: selected.id, name, phone: fullPhone, email: email || undefined }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || 'Could not start payment');

      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const RazorpayCtor = (window as unknown as { Razorpay: new (o: RazorpayOptions) => RazorpayInstance }).Razorpay;
      const rzp = new RazorpayCtor({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        order_id: order.orderId,
        amount: order.amount,
        currency: 'INR',
        name: 'AZDAH Fitness',
        description: order.workshopTitle || selected.title,
        prefill: { contact: rawPhone, name, email: email || undefined },
        theme: { color: ORANGE },
        handler: async (response) => {
          const verifyRes = await fetch('/api/workshops/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          const result = await verifyRes.json();
          if (result.success) {
            setDone(true);
          } else if (result.error === 'full_after_payment') {
            setError('This workshop just filled up. Your payment will be refunded — please reach out on WhatsApp.');
          } else {
            setError('Payment verification failed. Please contact us on WhatsApp.');
          }
          setBusy(false);
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 60, background: 'rgba(21,17,13,0.92)', backdropFilter: 'saturate(160%) blur(14px)', WebkitBackdropFilter: 'saturate(160%) blur(14px)', borderBottom: '1px solid rgba(241,233,218,0.1)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/azdahlogo.png" alt="AZDAH" style={{ height: 36, width: 'auto', display: 'block' }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/" style={{ color: MUTED, fontSize: 13.5, fontWeight: 500 }}>← Home</Link>
            <Link href="/login" style={{ border: '1px solid rgba(241,233,218,0.2)', color: CREAM, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 2 }}>
              Member login
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section style={{ background: DARK, padding: '72px 28px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 18, fontWeight: 600 }}>
            One-off sessions &amp; masterclasses
          </p>
          <h1 className="ws-hero-h1" style={{ fontFamily: SERIF, fontSize: 66, lineHeight: 1.04, fontWeight: 900, letterSpacing: '-0.01em', color: CREAM, margin: '0 0 18px' }}>
            Workshops
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, lineHeight: 1.5, color: TAN, margin: 0, maxWidth: 560 }}>
            Deep-dives, guest instructors and skill intensives. Book your spot below — no membership needed.
          </p>
        </div>
      </section>

      {/* LIST */}
      <section style={{ background: DARK, padding: '20px 28px 100px', minHeight: '50vh' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {loading ? (
            <p style={{ color: MUTED, fontSize: 15 }}>Loading workshops…</p>
          ) : workshops.length === 0 ? (
            <div style={{ border: '1px solid rgba(241,233,218,0.12)', borderRadius: 4, padding: '48px 28px', textAlign: 'center' }}>
              <p style={{ fontFamily: SERIF, fontSize: 24, color: CREAM, margin: '0 0 8px' }}>No workshops scheduled right now.</p>
              <p style={{ color: MUTED, fontSize: 14.5, margin: 0 }}>Check back soon — or follow us on Instagram for announcements.</p>
            </div>
          ) : (
            <div className="ws-grid">
              {workshops.map((w) => (
                <div key={w.id} className="ws-card" style={{ background: CARD, border: '1px solid rgba(241,233,218,0.12)', borderRadius: 4, padding: 24, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <span style={{ display: 'inline-block', background: w.is_free ? 'rgba(120,200,120,0.14)' : 'rgba(248,52,51,0.14)', color: w.is_free ? '#8BD48B' : ORANGE, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 2 }}>
                      {w.is_free ? 'Free' : rupees(w.price_paise)}
                    </span>
                    {w.is_full && (
                      <span style={{ color: FAINT, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Full</span>
                    )}
                  </div>

                  <h3 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 800, color: CREAM, margin: '0 0 10px', lineHeight: 1.15 }}>{w.title}</h3>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 14 }}>
                    <span style={{ color: TAN, fontSize: 13.5 }}>{fmtDate(w.workshop_date)}</span>
                    <span style={{ color: FAINT }}>·</span>
                    <span style={{ color: TAN, fontSize: 13.5 }}>{fmtTime(w.start_time)}{w.end_time ? ` – ${fmtTime(w.end_time)}` : ''}</span>
                  </div>

                  {(w.instructor_name || w.location) && (
                    <p style={{ color: MUTED, fontSize: 13, margin: '0 0 12px' }}>
                      {w.instructor_name ? `With ${w.instructor_name}` : ''}
                      {w.instructor_name && w.location ? ' · ' : ''}
                      {w.location || ''}
                    </p>
                  )}

                  {w.description && (
                    <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6, margin: '0 0 20px', flex: 1 }}>{w.description}</p>
                  )}

                  <button className="ws-btn" disabled={w.is_full} onClick={() => openModal(w)}
                    style={{ marginTop: 'auto', background: ORANGE, border: 'none', color: DARK, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '13px 18px', borderRadius: 2, width: '100%' }}>
                    {w.is_full ? 'Sold out' : w.is_free ? 'Register free' : 'Book your spot'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0F0C09', borderTop: '1px solid rgba(241,233,218,0.08)', padding: '32px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: FAINT, fontSize: 12.5 }}>© AZDAH Fitness · Indiranagar, Bengaluru</span>
          <a href="https://wa.me/918588056122" target="_blank" rel="noopener noreferrer" style={{ color: ORANGE, fontSize: 12.5, fontWeight: 600 }}>
            Questions? WhatsApp us
          </a>
        </div>
      </footer>

      {/* MODAL */}
      {selected && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: '1px solid rgba(241,233,218,0.14)', borderRadius: 6, width: '100%', maxWidth: 440, padding: 28, position: 'relative' }}>
            <button onClick={closeModal} aria-label="Close" style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: FAINT, fontSize: 24, lineHeight: 1 }}>×</button>

            {done ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>✓</div>
                <h3 style={{ fontFamily: SERIF, fontSize: 26, color: CREAM, margin: '0 0 10px' }}>You&apos;re registered!</h3>
                <p style={{ color: MUTED, fontSize: 14.5, lineHeight: 1.6, margin: '0 0 8px' }}>
                  See you at <strong style={{ color: TAN }}>{selected.title}</strong> on {fmtDate(selected.workshop_date)} at {fmtTime(selected.start_time)}{selected.location ? ` · ${selected.location}` : ''}.
                </p>
                <p style={{ color: FAINT, fontSize: 12.5, lineHeight: 1.5, margin: '0 0 22px' }}>
                  Please take a screenshot — this is your confirmation.
                </p>
                <button onClick={closeModal} style={{ background: ORANGE, border: 'none', color: DARK, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '12px 22px', borderRadius: 2 }}>Done</button>
              </div>
            ) : (
              <>
                <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 6px' }}>
                  {selected.is_free ? 'Free registration' : `Book · ${rupees(selected.price_paise)}`}
                </p>
                <h3 style={{ fontFamily: SERIF, fontSize: 25, color: CREAM, margin: '0 0 4px', lineHeight: 1.2 }}>{selected.title}</h3>
                <p style={{ color: MUTED, fontSize: 13, margin: '0 0 20px' }}>{fmtDate(selected.workshop_date)} · {fmtTime(selected.start_time)}</p>

                <label style={{ display: 'block', color: TAN, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Full name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name"
                  style={{ width: '100%', background: DARK, border: '1px solid rgba(241,233,218,0.18)', borderRadius: 3, color: CREAM, fontSize: 15, padding: '11px 13px', marginBottom: 14, outline: 'none' }} />

                <label style={{ display: 'block', color: TAN, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Mobile number</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="numeric" placeholder="10-digit mobile"
                  style={{ width: '100%', background: DARK, border: '1px solid rgba(241,233,218,0.18)', borderRadius: 3, color: CREAM, fontSize: 15, padding: '11px 13px', marginBottom: 14, outline: 'none' }} />

                <label style={{ display: 'block', color: TAN, fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Email <span style={{ color: FAINT, fontWeight: 400 }}>(optional)</span></label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="you@email.com"
                  style={{ width: '100%', background: DARK, border: '1px solid rgba(241,233,218,0.18)', borderRadius: 3, color: CREAM, fontSize: 15, padding: '11px 13px', marginBottom: 18, outline: 'none' }} />

                {error && <p style={{ color: '#FF8A80', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>{error}</p>}

                <button onClick={submit} disabled={busy}
                  style={{ width: '100%', background: ORANGE, border: 'none', color: DARK, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '14px 18px', borderRadius: 2, opacity: busy ? 0.7 : 1 }}>
                  {busy ? <span className="spin" /> : selected.is_free ? 'Confirm registration' : `Pay ${rupees(selected.price_paise)}`}
                </button>

                <p style={{ color: FAINT, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
                  {selected.is_free ? 'No payment required.' : 'Secured by Razorpay · 256-bit SSL'}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
