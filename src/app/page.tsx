'use client';

import { useEffect, useState } from 'react';
import { supabase, type MembershipPlan } from '@/lib/supabase';
import Link from 'next/link';
import { Camera, ChevronDown } from 'lucide-react';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  prefill?: { contact?: string; name?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};

const SERIF = 'var(--font-bodoni), Georgia, "Times New Roman", serif';
const DARK = '#15110D';
const CREAM = '#F1E9DA';
const ORANGE = '#F83433';
const TAN = '#E5DAC6';
const TAN2 = '#D9CDB6';
const CARD = '#1E1812';
const FOOT = '#0F0C09';
const MUTED = 'rgba(241,233,218,0.62)';
const FAINT = 'rgba(241,233,218,0.38)';

// ─── CSS for animations + responsive ─────────────────────────
const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  button{font-family:inherit;cursor:pointer}
  input,textarea{font-family:inherit}

  @keyframes marquee {
    from { transform: translateX(0) }
    to   { transform: translateX(-50%) }
  }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(24px) }
    to   { opacity:1; transform:translateY(0) }
  }
  .anim-fadeup { animation: fadeUp 0.7s ease both }
  .anim-fadeup-2 { animation: fadeUp 0.7s 0.15s ease both }
  .anim-fadeup-3 { animation: fadeUp 0.7s 0.3s ease both }

  .nav-link:hover { color: ${CREAM} !important }
  .plan-card:hover { border-color: rgba(248,52,51,0.5) !important; transform: translateY(-3px); transition: all 0.2s }
  .plan-card { transition: all 0.2s }
  .btn-orange:hover { background: #D8281F !important }
  .btn-outline:hover { background: rgba(248,52,51,0.1) !important }
  .disc-card:hover .disc-num { color: ${ORANGE} !important; transition: color 0.2s }
  @keyframes waPulse {
    0%,100% { box-shadow: 0 4px 20px rgba(37,211,102,0.45) }
    50% { box-shadow: 0 4px 32px rgba(37,211,102,0.75), 0 0 0 8px rgba(37,211,102,0.12) }
  }

  @media (max-width: 900px) {
    .hero-grid { grid-template-columns: 1fr !important }
    .hero-img-col { display: none !important }
    .hero-h1 { font-size: 52px !important; line-height: 1.1 !important }
    .stats-row { gap: 28px !important }
    .disc-grid { grid-template-columns: 1fr 1fr !important }
    .phil-grid { grid-template-columns: 1fr !important }
    .test-grid { grid-template-columns: 1fr !important }
    .plans-grid { grid-template-columns: 1fr 1fr !important }
    .cta-grid { grid-template-columns: 1fr !important; text-align: center }
    .mob-hide { display: none !important }
    .mob-menu-btn { display: flex !important }
    .nav-links { display: none !important }
  }
  @media (max-width: 580px) {
    .disc-grid { grid-template-columns: 1fr !important }
    .plans-grid { grid-template-columns: 1fr !important }
    .hero-h1 { font-size: 40px !important }
    .stats-row { flex-direction: column !important; gap: 18px !important }
  }
`;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = reject;
    document.head.appendChild(s);
  });
}

const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
const perMonth = (plan: MembershipPlan) => {
  const mo = plan.duration_days / 30;
  return '₹' + Math.round(plan.price_paise / 100 / mo).toLocaleString('en-IN');
};

// ─── DISCIPLINES ─────────────────────────────────────────────
const DISCIPLINES = [
  {
    num: '01',
    title: 'Vertical Fitness',
    desc: 'Pole, Aerial Hoop & Aerial Silks — build strength and grace through vertical movement.',
  },
  {
    num: '02',
    title: 'Core & Strength',
    desc: 'Pilates, TRX & Calisthenics — sculpt functional strength from the inside out.',
  },
  {
    num: '03',
    title: 'Contemporary Movement',
    desc: 'Dance, Hip-Hop & Yoga Flow — move freely and expressively to your own rhythm.',
  },
  {
    num: '04',
    title: 'Holistic & Breathwork',
    desc: 'Meditation, Pranayama & Yin — restore, reset and reconnect with your body.',
  },
];

// ─── GALLERY ─────────────────────────────────────────────────
const GALLERY = [
  { label: 'Aerial Silks', sub: 'Vertical Fitness', bg: 'linear-gradient(135deg,#1A1008 0%,#2A1510 100%)', accent: '#F83433' },
  { label: 'Pole Training', sub: 'Strength & Grace', bg: 'linear-gradient(135deg,#0D1018 0%,#151825 100%)', accent: '#3b82f6' },
  { label: 'Core Lab', sub: 'Pilates & TRX', bg: 'linear-gradient(135deg,#0A1510 0%,#122018 100%)', accent: '#10b981' },
  { label: 'Hip-Hop Dance', sub: 'Contemporary', bg: 'linear-gradient(135deg,#15100A 0%,#22160A 100%)', accent: '#f59e0b' },
  { label: 'Aerial Hoop', sub: 'Lyra & Flow', bg: 'linear-gradient(135deg,#130A18 0%,#1E1025 100%)', accent: '#8b5cf6' },
  { label: 'Yin & Breathwork', sub: 'Holistic', bg: 'linear-gradient(135deg,#0A1215 0%,#101C20 100%)', accent: '#06b6d4' },
];

// ─── FAQ ──────────────────────────────────────────────────────
const FAQS = [
  { q: 'Do I need prior experience to join?', a: 'Not at all. Every discipline at AZDAH has beginner-friendly batches. Our coaches will assess your level on day one and guide you into the right class.' },
  { q: 'Can I try before buying a membership?', a: 'Yes! We offer a trial class at no cost. Just tap the button below to WhatsApp us and we will slot you into the next available session before you commit.' },
  { q: 'What does the membership include?', a: 'All plans give you full access to every discipline — Aerial, Pole, Pilates, Dance, Yoga, and more. No per-class charges, no hidden fees.' },
  { q: 'Can I freeze or pause my membership?', a: 'Yes, members can pause their membership for up to 15 days per plan cycle. Contact us on WhatsApp at least 24 hours in advance.' },
  { q: 'What if I miss a class I booked?', a: 'You can cancel up to 2 hours before the class starts from your member dashboard. You also get one free reschedule per month.' },
  { q: 'Is the payment secure?', a: 'All payments are processed through Razorpay with 256-bit SSL encryption. We never store your card details.' },
];

// ─── TESTIMONIALS (real Google reviews) ──────────────────────
const TESTIMONIALS = [
  {
    quote: "This is a great place to learn pole from. Azdah is very encouraging and great at teaching. Everything I know in pole is because of her. She's helped me gain strength, flexibility and confidence… The studio is extremely well maintained. It's clean, has AC and really good quality equipment. I highly recommend learning from here!",
    name: 'Nimisha Sharma',
    role: 'Google review',
  },
  {
    quote: "Training with Azdah has been nothing short of amazing. Exactly a year apart, I achieved my split and then my Ayesha — something I never thought possible when I first started. Her patience, encouragement, and incredible teaching skills make every class empowering. Couldn't have asked for a better pole teacher!",
    name: 'Rakhi Ranjan',
    role: 'Google review',
  },
  {
    quote: "I've been taking classes with Azdah for a while now, and she's truly the best. Every session feels like a mix of strength, grace, and fun. She's incredibly patient and attentive, always making sure we understand the moves and can do them safely… Whether you're a beginner or have been at it for years, she knows exactly how to challenge you and help you grow.",
    name: 'Sneh Ratna',
    role: 'Google review',
  },
];

export default function HomePage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [planTab, setPlanTab] = useState<'pole' | 'offpole' | 'self' | 'combo'>('pole');

  // checkout
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', promoCode: '' });
  const [promoStatus, setPromoStatus] = useState<{ valid: boolean; discount: number; msg: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [memberCreds, setMemberCreds] = useState<{ phone: string; name: string; password: string } | null>(null);
  const [receipt, setReceipt] = useState<{ planName: string; amount: number; planEnd: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('membership_plans').select('*').order('sort_order');
        if (error) console.error('Plans fetch error:', error.message);
        setPlans(data || []);
      } catch (err) {
        console.error('Plans network error:', err);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  // Reveal each section's content as it scrolls into view (self-contained; no markup needed)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const targets: HTMLElement[] = [];
    document.querySelectorAll('section').forEach((sec) => {
      if (sec.id === 'home') return; // hero already has its own entrance animation
      const el = sec.firstElementChild as HTMLElement | null;
      if (el) targets.push(el);
    });
    const vh = window.innerHeight;
    targets.forEach((el) => {
      if (el.getBoundingClientRect().top > vh * 0.82) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1)';
      }
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const t = e.target as HTMLElement;
            t.style.opacity = '1';
            t.style.transform = 'none';
            io.unobserve(t);
          }
        });
      },
      { threshold: 0.12 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [loadingPlans]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const openCheckout = (plan: MembershipPlan) => {
    setSelectedPlan(plan);
    setCheckoutError('');
    setCheckoutDone(false);
    setForm({ name: '', phone: '', email: '', promoCode: '' });
  };

  async function checkPromo() {
    if (!form.promoCode.trim() || !selectedPlan) return;
    setPromoChecking(true); setPromoStatus(null);
    const res = await fetch('/api/promo/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: form.promoCode, planId: selectedPlan.id }),
    });
    const data = await res.json();
    setPromoChecking(false);
    if (data.valid) {
      setPromoStatus({ valid: true, discount: data.discount_percent, msg: `${data.discount_percent}% off applied!` });
    } else {
      setPromoStatus({ valid: false, discount: 0, msg: data.error || 'Invalid code' });
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan) return;
    setPayLoading(true);
    setCheckoutError('');

    const trimmedName = form.name.trim();
    if (trimmedName.length < 3) {
      setCheckoutError('Please enter your full name (at least 3 characters).');
      setPayLoading(false);
      return;
    }
    if (/\d/.test(trimmedName)) {
      setCheckoutError('Name should not contain numbers.');
      setPayLoading(false);
      return;
    }

    const rawPhone = form.phone.replace(/\D/g, '');
    if (rawPhone.length !== 10) {
      setCheckoutError('Enter a valid 10-digit mobile number.');
      setPayLoading(false);
      return;
    }
    const fullPhone = `91${rawPhone}`;

    try {
      const orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id, phone: fullPhone, name: trimmedName, email: form.email, promoCode: form.promoCode || undefined }),
      });
      const order = await orderRes.json();
      if (orderRes.status === 409) {
        setCheckoutError('This number already has an active membership. Please login instead.');
        setPayLoading(false);
        return;
      }
      if (!orderRes.ok) throw new Error(order.error || 'Could not create order');

      await loadScript('https://checkout.razorpay.com/v1/checkout.js');

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
        order_id: order.orderId,
        amount: order.amount,
        currency: 'INR',
        name: 'AZDAH Fitness',
        description: `${selectedPlan.name} Membership`,
        prefill: { contact: rawPhone, name: form.name },
        theme: { color: ORANGE },
        handler: async (response) => {
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planId: selectedPlan.id,
              name: form.name,
              phone: fullPhone,
              email: form.email,
            }),
          });
          const result = await verifyRes.json();
          if (result.success) {
            setMemberCreds({ phone: result.phone, name: result.name, password: result.password });
            setReceipt({ planName: selectedPlan.name, amount: order.amount, planEnd: result.plan_end || '' });
            setCheckoutDone(true);
          } else {
            setCheckoutError('Payment verification failed. Contact us on WhatsApp.');
          }
          setPayLoading(false);
        },
        modal: { ondismiss: () => setPayLoading(false) },
      });
      rzp.open();
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : 'Something went wrong.');
      setPayLoading(false);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── NAV ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 60,
        background: 'rgba(21,17,13,0.9)',
        backdropFilter: 'saturate(160%) blur(14px)',
        WebkitBackdropFilter: 'saturate(160%) blur(14px)',
        borderBottom: '1px solid rgba(241,233,218,0.1)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          {/* Logo */}
          <button onClick={() => scrollTo('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <img src="/azdahlogo.png" alt="AZDAH" style={{ height: 36, width: 'auto', display: 'block', filter: 'none' }} />
          </button>

          {/* Desktop links */}
          <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {(['Home', 'About', 'Membership', 'Contact'] as const).map((label) => (
              <button key={label} onClick={() => scrollTo(label.toLowerCase())} className="nav-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 13.5, letterSpacing: '0.025em', fontWeight: 500 }}>
                {label}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/login" style={{ border: '1px solid rgba(241,233,218,0.2)', color: CREAM, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 2 }} className="mob-hide">
              Member login
            </Link>
            <button onClick={() => scrollTo('membership')} className="btn-orange"
              style={{ background: ORANGE, border: 'none', color: DARK, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '10px 18px', borderRadius: 2 }}>
              Join now
            </button>
            {/* Hamburger */}
            <button className="mob-menu-btn" onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: 'none', background: 'none', border: '1px solid rgba(241,233,218,0.2)', borderRadius: 2, width: 40, height: 36, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, padding: 0 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 17, height: 1.5, background: CREAM, display: 'block' }} />)}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div style={{ padding: '4px 28px 16px', borderTop: '1px solid rgba(241,233,218,0.07)' }}>
            {(['Home', 'About', 'Membership', 'Contact'] as const).map((label) => (
              <button key={label} onClick={() => scrollTo(label.toLowerCase())}
                style={{ display: 'block', width: '100%', background: 'none', border: 'none', textAlign: 'left', color: CREAM, fontSize: 15, fontWeight: 500, padding: '12px 0', borderBottom: '1px solid rgba(241,233,218,0.07)' }}>
                {label}
              </button>
            ))}
            <Link href="/login" style={{ display: 'block', color: CREAM, fontSize: 15, fontWeight: 500, padding: '12px 0' }}>
              Member login
            </Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section id="home" style={{ background: DARK, padding: '0 28px', minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center' }}>
        <div className="hero-grid" style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 60, alignItems: 'center', padding: '80px 0' }}>
          {/* Left */}
          <div className="anim-fadeup">
            <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 24, fontWeight: 600 }}>
              Bangalore&apos;s finest movement studio
            </p>
            <h1 className="hero-h1" style={{ fontFamily: SERIF, fontSize: 78, lineHeight: 1.0, fontWeight: 900, letterSpacing: '-0.01em', color: CREAM, margin: '0 0 36px' }}>
              MASTER<br />YOUR<br />
              <em style={{ fontStyle: 'italic', color: ORANGE }}>BODY &amp;<br />MIND</em>
            </h1>
            <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7, maxWidth: 440, margin: '0 0 44px' }}>
              Join AZDAH — where movement becomes a practice. 12 disciplines, world-class coaches, and a community that lifts you higher.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={() => scrollTo('membership')} className="btn-orange"
                style={{ background: ORANGE, border: 'none', color: DARK, fontWeight: 700, fontSize: 13.5, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '15px 32px', borderRadius: 2 }}>
                Begin your practice
              </button>
              <button onClick={() => scrollTo('about')} className="btn-outline"
                style={{ background: 'none', border: '1px solid rgba(241,233,218,0.3)', color: CREAM, fontWeight: 600, fontSize: 13.5, padding: '15px 28px', borderRadius: 2 }}>
                View disciplines
              </button>
            </div>

            {/* Stats */}
            <div className="stats-row" style={{ display: 'flex', gap: 40, marginTop: 60, paddingTop: 40, borderTop: '1px solid rgba(241,233,218,0.1)' }}>
              {[['12', 'Disciplines'], ['40+', 'Classes / week'], ['6', 'Master coaches']].map(([num, label]) => (
                <div key={label}>
                  <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 800, color: CREAM, lineHeight: 1 }}>{num}</div>
                  <div style={{ color: MUTED, fontSize: 12, marginTop: 5, letterSpacing: '0.04em' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — visual panel */}
          <div className="hero-img-col anim-fadeup-2" style={{ position: 'relative' }}>
            <div style={{ aspectRatio: '3/4', background: 'linear-gradient(160deg,#211810 0%,#1A1410 55%,#0F0C09 100%)', borderRadius: 4, border: '1px solid rgba(241,233,218,0.06)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '32px 28px' }}>
              {/* Background watermark */}
              <div style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)', fontFamily: SERIF, fontSize: 130, fontWeight: 900, color: 'rgba(248,52,51,0.04)', letterSpacing: '.06em', lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>AZ<br/>DA<br/>H</div>

              {/* Top label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px rgba(74,222,128,.7)' }} />
                <span style={{ fontSize: 11, color: MUTED, letterSpacing: '.16em', textTransform: 'uppercase' }}>Now enrolling</span>
              </div>

              {/* Centre quote */}
              <div style={{ position: 'relative' }}>
                <div style={{ fontFamily: SERIF, fontSize: 13, color: ORANGE, letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 16 }}>Philosophy</div>
                <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 26, lineHeight: 1.35, color: CREAM, margin: 0 }}>
                  &ldquo;Your body is<br />capable of<br />
                  <em style={{ color: ORANGE }}>far more.</em>&rdquo;
                </p>
              </div>

              {/* Discipline grid */}
              <div style={{ borderTop: '1px solid rgba(241,233,218,0.08)', paddingTop: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
                  {['Aerial Silks', 'Core Lab', 'Yoga Flow', 'Hip-Hop'].map(d => (
                    <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 3, height: 3, borderRadius: '50%', background: ORANGE, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE BAND ── */}
      <div style={{ background: ORANGE, overflow: 'hidden', padding: '14px 0', userSelect: 'none' }}>
        <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'marquee 22s linear infinite' }}>
          {[...Array(2)].map((_, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
              {['Aerial Silks', 'Pole', 'Core Lab', 'Hip-Hop', 'Pilates', 'Aerial Hoop', 'Breathwork', 'Calisthenics', 'Yin Yoga', 'Contemporary', 'TRX', 'Meditation'].map((d) => (
                <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                  <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, fontWeight: 700, color: DARK, padding: '0 20px', letterSpacing: '0.02em' }}>{d}</span>
                  <span style={{ color: 'rgba(21,17,13,0.5)', fontSize: 14 }}>✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── DISCIPLINES ── */}
      <section id="about" style={{ background: CREAM, padding: '100px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: 'rgba(21,17,13,0.45)', fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>What we offer</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 60, flexWrap: 'wrap', gap: 20 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 800, color: DARK, margin: 0, lineHeight: 1.05, maxWidth: 440 }}>
              12 disciplines.<br />One practice.
            </h2>
            <p style={{ color: 'rgba(21,17,13,0.6)', fontSize: 15, lineHeight: 1.7, maxWidth: 380, margin: 0 }}>
              At AZDAH, we believe movement is medicine. Explore disciplines designed for every body, every goal.
            </p>
          </div>
          <div className="disc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            {DISCIPLINES.map((d) => (
              <div key={d.num} className="disc-card" style={{ background: 'rgba(21,17,13,0.04)', padding: '36px 28px', border: '1px solid rgba(21,17,13,0.1)' }}>
                <div className="disc-num" style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, color: 'rgba(21,17,13,0.15)', lineHeight: 1, marginBottom: 24, transition: 'color 0.2s' }}>{d.num}</div>
                <h3 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, color: DARK, marginBottom: 12, marginTop: 0 }}>{d.title}</h3>
                <p style={{ color: 'rgba(21,17,13,0.6)', fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY ── */}
      <section style={{ background: DARK, padding: '100px 28px' }}>
        <div className="phil-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
          <div>
            <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 20 }}>Our philosophy</p>
            <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 800, color: CREAM, lineHeight: 1.08, margin: '0 0 28px' }}>
              Movement is not a<br />habit. It is a{' '}
              <em style={{ fontStyle: 'italic', color: ORANGE }}>way of being.</em>
            </h2>
            <p style={{ color: MUTED, fontSize: 15.5, lineHeight: 1.75, margin: '0 0 20px' }}>
              At AZDAH, we don&apos;t just train bodies — we cultivate minds, build communities, and invite transformation through intentional movement.
            </p>
            <p style={{ color: MUTED, fontSize: 15.5, lineHeight: 1.75, margin: 0 }}>
              Every class is designed to meet you where you are, challenge who you are becoming, and celebrate the strength you already carry.
            </p>
          </div>
          <div>
            {[
              ['01', 'Intentional', 'Every session is designed with purpose — no filler, no fluff.'],
              ['02', 'Inclusive', 'Beginners and veterans share the same floor. Your pace, your power.'],
              ['03', 'Transformative', 'We measure progress in confidence, not just calories burned.'],
            ].map(([num, title, text]) => (
              <div key={title} style={{ display: 'flex', gap: 32, padding: '28px 0', borderBottom: '1px solid rgba(241,233,218,0.07)' }}>
                <span style={{ fontSize: 11, color: ORANGE, letterSpacing: '.08em', minWidth: 20, flexShrink: 0, paddingTop: 2 }}>{num}</span>
                <div>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, color: CREAM, marginBottom: 8 }}>{title}</div>
                  <div style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.65 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ background: TAN, padding: '100px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: 'rgba(21,17,13,0.45)', fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>Members speak</p>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, color: DARK, margin: '0 0 60px', lineHeight: 1.1 }}>What the practice gives.</h2>
          <div className="test-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start' }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} style={{ background: '#EDE2CF', padding: '36px 32px', border: '1px solid ' + TAN2, borderRadius: 2 }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>
                  {[0,1,2,3,4].map((i) => (
                    <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#F5A623" aria-hidden="true">
                      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, lineHeight: 1.65, color: DARK, margin: '0 0 24px' }}>{t.quote}</p>
                <div style={{ borderTop: '1px solid ' + TAN2, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: DARK }}>{t.name}</div>
                  <div style={{ color: 'rgba(21,17,13,0.5)', fontSize: 11, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                    {t.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GALLERY ── */}
      <section style={{ background: DARK, padding: '100px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>The studio</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, flexWrap: 'wrap', gap: 20 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 800, color: CREAM, margin: 0, lineHeight: 1.05 }}>
              Where it all<br />happens.
            </h2>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, maxWidth: 340, margin: 0 }}>
              A space designed for movement — equipped with professional-grade aerial rigs, sprung floors, and natural light.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'auto auto', gap: 4 }}>
            {GALLERY.map((g, i) => (
              <div key={g.label} style={{ background: g.bg, border: `1px solid ${g.accent}12`, borderRadius: 2, padding: '40px 28px', position: 'relative', overflow: 'hidden', gridColumn: i === 3 ? 'span 2' : 'span 1', minHeight: i === 3 ? 180 : 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 10, color: g.accent, letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600, opacity: 0.8 }}>{g.sub}</div>
                <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: CREAM }}>{g.label}</div>
              </div>
            ))}
          </div>
          <p style={{ color: FAINT, fontSize: 12, textAlign: 'center', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Camera size={12} strokeWidth={1.5} /> Studio photography coming soon</p>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="membership" style={{ background: DARK, padding: '100px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>Memberships & Packs</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, flexWrap: 'wrap', gap: 20 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 800, color: CREAM, margin: 0, lineHeight: 1.05 }}>
              Choose your<br />practice.
            </h2>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.7, maxWidth: 340, margin: 0 }}>
              Class packs — buy what you need, use at your pace. No subscriptions.
            </p>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 40, flexWrap: 'wrap' }}>
            {([
              { key: 'pole',    label: 'Pole Classes' },
              { key: 'offpole', label: 'Off The Pole' },
              { key: 'self',    label: 'Self Practice' },
              { key: 'combo',   label: 'Combos' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setPlanTab(key)}
                style={{
                  background: planTab === key ? ORANGE : 'none',
                  border: planTab === key ? 'none' : '1px solid rgba(241,233,218,0.2)',
                  color: planTab === key ? DARK : MUTED,
                  fontWeight: planTab === key ? 700 : 500,
                  fontSize: 13, letterSpacing: '0.04em',
                  padding: '9px 20px', borderRadius: 2,
                }}>
                {label}
              </button>
            ))}
          </div>

          {loadingPlans ? (
            <div style={{ textAlign: 'center', color: MUTED, padding: '60px 0', fontSize: 15 }}>Loading plans...</div>
          ) : (() => {
            const POPULAR = ['Pole · 4 Classes', 'Self Practice · 8 Sessions', 'Mobility · 8 Sessions', 'Combo · Pole + Practice'];
            const catMap: Record<typeof planTab, string[]> = {
              pole:    ['pole_regular', 'pole_nimisha'],
              offpole: ['strength', 'mobility'],
              self:    ['self_practice'],
              combo:   ['combo'],
            };
            const filtered = plans.filter(p => catMap[planTab].includes(p.plan_category));
            const regularPlans = filtered.filter(p => p.plan_category === 'pole_regular');
            const nimishaPlans = filtered.filter(p => p.plan_category === 'pole_nimisha');
            const otherPlans   = filtered.filter(p => !['pole_regular','pole_nimisha'].includes(p.plan_category));

            const PlanCard = ({ plan }: { plan: MembershipPlan }) => {
              const isPopular = POPULAR.includes(plan.name);
              const classLabel = plan.classes_included
                ? `${plan.classes_included} class${plan.classes_included !== 1 ? 'es' : ''}`
                : `${plan.duration_days}-day pack`;
              const pricePerUnit = plan.classes_included
                ? `₹${Math.round(plan.price_paise / 100 / plan.classes_included).toLocaleString('en-IN')} / class`
                : `${perMonth(plan)} / month`;
              return (
                <div className="plan-card" style={{
                  position: 'relative', background: isPopular ? '#231C15' : CARD,
                  border: isPopular ? `1px solid ${ORANGE}` : '1px solid rgba(241,233,218,0.1)',
                  borderRadius: 2, padding: '36px 28px', display: 'flex', flexDirection: 'column',
                }}>
                  {isPopular && (
                    <div style={{ position: 'absolute', top: -1, left: 0, right: 0, background: ORANGE, textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: DARK, padding: '5px 0' }}>Best value</div>
                  )}
                  {isPopular && <div style={{ marginTop: 18 }} />}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: MUTED, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>{classLabel}</div>
                    <div style={{ fontFamily: SERIF, fontWeight: 800, fontSize: 20, color: CREAM, lineHeight: 1.2 }}>{plan.name}</div>
                  </div>
                  <div style={{ margin: '20px 0 24px', paddingBottom: 20, borderBottom: '1px solid rgba(241,233,218,0.1)' }}>
                    <div style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 800, color: isPopular ? ORANGE : CREAM, lineHeight: 1 }}>
                      {formatPrice(plan.price_paise)}
                    </div>
                    <div style={{ color: MUTED, fontSize: 12.5, marginTop: 5 }}>{pricePerUnit}</div>
                  </div>
                  <ul style={{ flex: 1, listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(plan.features || []).map((f: string, j: number) => (
                      <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: MUTED }}>
                        <span style={{ color: ORANGE, marginTop: 1, flexShrink: 0, fontSize: 11 }}>✦</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => openCheckout(plan)} className={isPopular ? 'btn-orange' : 'btn-outline'} style={{
                    width: '100%', padding: '13px 0', borderRadius: 2,
                    background: isPopular ? ORANGE : 'none',
                    border: isPopular ? 'none' : `1px solid rgba(248,52,51,0.5)`,
                    color: isPopular ? DARK : ORANGE,
                    fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>Book now</button>
                </div>
              );
            };

            return (
              <>
                {/* Pole tab: regular + Nimisha sub-section */}
                {planTab === 'pole' && (
                  <>
                    <div className="plans-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(regularPlans.length, 4)}, 1fr)`, gap: 16 }}>
                      {regularPlans.map(p => <PlanCard key={p.id} plan={p} />)}
                    </div>
                    {nimishaPlans.length > 0 && (
                      <div style={{ marginTop: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                          <div style={{ flex: 1, height: 1, background: 'rgba(241,233,218,0.1)' }} />
                          <span style={{ fontSize: 12, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            With Nimisha · Junior instructor · 4–11% off
                          </span>
                          <div style={{ flex: 1, height: 1, background: 'rgba(241,233,218,0.1)' }} />
                        </div>
                        <div className="plans-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(nimishaPlans.length, 4)}, 1fr)`, gap: 16 }}>
                          {nimishaPlans.map(p => <PlanCard key={p.id} plan={p} />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {/* All other tabs */}
                {planTab !== 'pole' && (
                  <div className="plans-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Math.max(otherPlans.length, 1), 4)}, 1fr)`, gap: 16 }}>
                    {otherPlans.map(p => <PlanCard key={p.id} plan={p} />)}
                  </div>
                )}
                {filtered.length === 0 && !loadingPlans && (
                  <div style={{ textAlign: 'center', color: MUTED, padding: '60px 0', fontSize: 15 }}>No plans available in this category yet.</div>
                )}
              </>
            );
          })()}

          <p style={{ color: FAINT, fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            Secured by Razorpay · 100% safe payment · No auto-renewal · GST included where shown
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ background: '#111009', padding: '100px 28px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>FAQ</p>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, color: CREAM, margin: '0 0 56px', lineHeight: 1.1, textAlign: 'center' }}>Questions answered.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} style={{ background: isOpen ? CARD : 'transparent', border: `1px solid ${isOpen ? 'rgba(248,52,51,0.25)' : 'rgba(241,233,218,0.08)'}`, borderRadius: 2, overflow: 'hidden', transition: 'border-color .2s,background .2s' }}>
                  <button onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, textAlign: 'left' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: isOpen ? CREAM : TAN, lineHeight: 1.4 }}>{faq.q}</span>
                    <ChevronDown size={17} color={ORANGE} strokeWidth={1.5} style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .25s ease' }} />
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 24px 22px', color: MUTED, fontSize: 14.5, lineHeight: 1.75 }}>{faq.a}</div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ color: MUTED, fontSize: 14, textAlign: 'center', marginTop: 32 }}>
            Still have questions?{' '}
            <a href="https://wa.me/918588056122" target="_blank" rel="noopener noreferrer" style={{ color: ORANGE, textDecoration: 'underline' }}>
              Chat with us on WhatsApp →
            </a>
          </p>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section style={{ background: ORANGE, padding: '72px 28px' }}>
        <div className="cta-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 40 }}>
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, color: DARK, margin: '0 0 12px', lineHeight: 1.1 }}>
              Ready to begin?
            </h2>
            <p style={{ color: 'rgba(21,17,13,0.65)', fontSize: 16, lineHeight: 1.6, margin: 0 }}>
              Join hundreds of members already training at AZDAH. Your first class could be tomorrow.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={() => scrollTo('membership')} style={{
              background: DARK, border: 'none', color: CREAM, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '14px 30px', borderRadius: 2, cursor: 'pointer',
            }}>
              View membership
            </button>
            <Link href="/login" style={{
              background: 'none', border: '1px solid rgba(21,17,13,0.35)', color: DARK, fontWeight: 600, fontSize: 13, padding: '14px 24px', borderRadius: 2,
            }}>
              Member login
            </Link>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" style={{ background: DARK, padding: '100px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>Find us</p>
          <h2 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, color: CREAM, margin: '0 0 60px', lineHeight: 1.1 }}>Come visit.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60 }} className="phil-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {[
                { label: 'Studio', text: '549/3, 9th A Main, Indiranagar\nBangalore — 560038\n(Left of Copper + Clove, PCI Gases building)' },
                { label: 'Hours', text: 'Mon – Sat: 6:00 AM – 9:00 PM\nSunday: 7:00 AM – 2:00 PM' },
                { label: 'WhatsApp', text: '+91 85880 56122' },
                { label: 'Email', text: 'hello@azdahfit.in' },
              ].map(({ label, text }) => (
                <div key={label}>
                  <div style={{ color: ORANGE, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>{label}</div>
                  <div style={{ color: CREAM, fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{text}</div>
                </div>
              ))}
            </div>
            {/* Map card */}
            <a
              href="https://maps.google.com/?q=549%2F3+9th+A+Main+Indiranagar+Bangalore+560038"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div style={{ background: CARD, borderRadius: 2, minHeight: 320, border: '1px solid rgba(241,233,218,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40, cursor: 'pointer', transition: 'border-color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(248,52,51,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(241,233,218,0.1)')}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="rgba(248,52,51,0.15)" stroke={ORANGE} strokeWidth="1.2"/>
                  <circle cx="12" cy="9" r="2.5" fill={ORANGE} />
                </svg>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: CREAM, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>549/3, 9th A Main</div>
                  <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.6 }}>Indiranagar, Bangalore — 560038<br />Left of Copper + Clove, PCI Gases building</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 20px', borderRadius: 2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Open in Google Maps
                </div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="footer" style={{ background: FOOT, padding: '60px 28px 40px', borderTop: '1px solid rgba(241,233,218,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 40, marginBottom: 60 }}>
            <div>
              <div style={{ marginBottom: 14 }}>
                <img src="/azdahlogo.png" alt="AZDAH" style={{ height: 32, width: 'auto', display: 'block', filter: 'none', opacity: 0.75 }} />
              </div>
              <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.65, maxWidth: 280, margin: 0 }}>
                Movement, aerial arts & holistic fitness studio. Bangalore.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 60, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: FAINT, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>Studio</div>
                {['About', 'Disciplines', 'Membership'].map((link) => (
                  <button key={link} onClick={() => scrollTo(link === 'Disciplines' ? 'about' : link.toLowerCase())} style={{ display: 'block', background: 'none', border: 'none', color: MUTED, fontSize: 13.5, marginBottom: 10, textAlign: 'left', padding: 0 }}>{link}</button>
                ))}
              </div>
              <div>
                <div style={{ color: FAINT, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 16 }}>Members</div>
                <Link href="/login" style={{ display: 'block', color: MUTED, fontSize: 13.5, marginBottom: 10 }}>Login</Link>
                <button onClick={() => scrollTo('membership')} style={{ display: 'block', background: 'none', border: 'none', color: MUTED, fontSize: 13.5, marginBottom: 10, padding: 0 }}>Join now</button>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(241,233,218,0.07)', paddingTop: 28, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ color: FAINT, fontSize: 12, margin: 0 }}>© 2026 AZDAH Fitness · Bangalore, India</p>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/privacy" style={{ color: FAINT, fontSize: 12, textDecoration: 'none' }}>Privacy Policy</Link>
              <Link href="/terms" style={{ color: FAINT, fontSize: 12, textDecoration: 'none' }}>Terms & Conditions</Link>
              <span style={{ color: FAINT, fontSize: 12 }}>Payments secured by Razorpay</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── FLOATING WHATSAPP ── */}
      <a href="https://wa.me/918588056122" target="_blank" rel="noopener noreferrer"
        title="Chat on WhatsApp"
        style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 90, width: 56, height: 56, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(37,211,102,0.45)', textDecoration: 'none', animation: 'waPulse 2.5s ease-in-out infinite' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.528 5.847L.057 23.882l6.196-1.624A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.787 9.787 0 01-4.988-1.365l-.358-.213-3.676.964.981-3.584-.233-.369A9.79 9.79 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
        </svg>
      </a>

      {/* ── CHECKOUT MODAL ── */}
      {selectedPlan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, overflowY: 'auto' }}>
          <div style={{ background: '#1C1610', border: '1px solid rgba(241,233,218,0.1)', borderRadius: 3, width: '100%', maxWidth: 460, padding: '0 0 8px' }}>
            {/* Modal header */}
            <div style={{ background: DARK, padding: '20px 28px', borderBottom: '1px solid rgba(241,233,218,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, letterSpacing: '0.18em', color: CREAM }}>AZDAH</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: ORANGE, display: 'inline-block' }} />
              </div>
              <button onClick={() => { setSelectedPlan(null); setPayLoading(false); }} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>

            {checkoutDone ? (
              /* Success / Receipt screen */
              <div style={{ padding: '36px 28px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 800, color: CREAM, margin: '0 0 6px' }}>Welcome to AZDAH!</h3>
                <p style={{ color: MUTED, fontSize: 13, margin: '0 0 22px' }}>Payment successful. Your membership is now active.</p>

                {/* Receipt */}
                {receipt && (
                  <div style={{ background: DARK, border: '1px solid rgba(241,233,218,0.1)', borderRadius: 6, padding: '16px 18px', marginBottom: 16, textAlign: 'left' }}>
                    <div style={{ color: MUTED, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>Payment Receipt</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: MUTED }}>Plan</span>
                        <span style={{ color: CREAM, fontWeight: 600 }}>{receipt.planName}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: MUTED }}>Amount paid</span>
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>₹{(receipt.amount / 100).toLocaleString('en-IN')}</span>
                      </div>
                      {receipt.planEnd && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: MUTED }}>Valid until</span>
                          <span style={{ color: CREAM, fontWeight: 600 }}>{new Date(receipt.planEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Login credentials */}
                {memberCreds && (
                  <div style={{ background: DARK, border: '1px solid rgba(241,233,218,0.1)', borderRadius: 6, padding: '16px 18px', marginBottom: 22, textAlign: 'left' }}>
                    <div style={{ color: MUTED, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>Your login credentials</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: MUTED }}>Phone</span>
                        <span style={{ color: CREAM, fontWeight: 600 }}>+{memberCreds.phone}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: MUTED }}>Password</span>
                        <span style={{ color: ORANGE, fontWeight: 700, letterSpacing: '0.05em' }}>{memberCreds.password}</span>
                      </div>
                    </div>
                    <p style={{ color: ORANGE, fontSize: 11, marginTop: 10, marginBottom: 0, fontWeight: 600 }}>⚠ Screenshot or save these now — you&apos;ll need them to log in.</p>
                  </div>
                )}
                <Link href="/login" onClick={() => setSelectedPlan(null)} style={{
                  display: 'inline-block', background: ORANGE, color: DARK, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '13px 32px', borderRadius: 2,
                }}>
                  Go to dashboard →
                </Link>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handlePay} style={{ padding: '28px 28px 20px' }}>
                {/* Plan summary */}
                <div style={{ background: DARK, border: '1px solid rgba(241,233,218,0.08)', borderRadius: 2, padding: '16px 18px', marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, color: CREAM }}>{selectedPlan.name}</div>
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>
                      {selectedPlan.classes_included
                        ? `${selectedPlan.classes_included} class${selectedPlan.classes_included !== 1 ? 'es' : ''} · valid ${selectedPlan.duration_days} days · one-time`
                        : `${selectedPlan.duration_days} days · one-time`}
                    </div>
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 800, color: ORANGE }}>{formatPrice(selectedPlan.price_paise)}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 7 }}>Full name</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name"
                      style={{ width: '100%', background: DARK, border: '1px solid rgba(241,233,218,0.14)', borderRadius: 2, padding: '12px 14px', color: CREAM, fontSize: 14, outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 7 }}>WhatsApp number</label>
                    <div style={{ display: 'flex' }}>
                      <span style={{ background: '#231C15', border: '1px solid rgba(241,233,218,0.14)', borderRight: 'none', borderRadius: '2px 0 0 2px', padding: '12px 12px', color: MUTED, fontSize: 14, flexShrink: 0 }}>+91</span>
                      <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" maxLength={10} inputMode="numeric"
                        style={{ flex: 1, background: DARK, border: '1px solid rgba(241,233,218,0.14)', borderRadius: '0 2px 2px 0', padding: '12px 14px', color: CREAM, fontSize: 14, outline: 'none', minWidth: 0 }} />
                    </div>
                    <p style={{ color: FAINT, fontSize: 11, marginTop: 5 }}>Your login credentials will be shown on the next screen — save them.</p>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 7 }}>Email <span style={{ opacity: 0.5 }}>(optional)</span></label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com"
                      style={{ width: '100%', background: DARK, border: '1px solid rgba(241,233,218,0.14)', borderRadius: 2, padding: '12px 14px', color: CREAM, fontSize: 14, outline: 'none' }} />
                  </div>
                </div>

                {/* Promo code */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', color: MUTED, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 7 }}>Promo Code <span style={{ opacity: 0.5 }}>(optional)</span></label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={form.promoCode} onChange={(e) => { setForm({ ...form, promoCode: e.target.value.toUpperCase() }); setPromoStatus(null); }}
                      placeholder="e.g. AZDAH20" maxLength={20}
                      style={{ flex: 1, background: DARK, border: '1px solid rgba(241,233,218,0.14)', borderRadius: 2, padding: '12px 14px', color: CREAM, fontSize: 14, outline: 'none', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                    <button type="button" onClick={checkPromo} disabled={promoChecking || !form.promoCode.trim()}
                      style={{ padding: '12px 16px', background: 'transparent', border: '1px solid rgba(241,233,218,0.2)', borderRadius: 2, color: CREAM, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: promoChecking || !form.promoCode.trim() ? 0.5 : 1 }}>
                      {promoChecking ? '...' : 'Apply'}
                    </button>
                  </div>
                  {promoStatus && (
                    <div style={{ marginTop: 8, fontSize: 12, color: promoStatus.valid ? '#4ade80' : '#f87171' }}>
                      {promoStatus.valid ? `✓ ${promoStatus.msg}` : `✗ ${promoStatus.msg}`}
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(248,52,51,0.1)', border: '1px solid rgba(248,52,51,0.3)', borderRadius: 2, color: '#FF8060', fontSize: 13 }}>
                    {checkoutError}
                  </div>
                )}

                <button type="submit" disabled={payLoading} className="btn-orange" style={{
                  width: '100%', marginTop: 24, padding: '14px 0', background: ORANGE, border: 'none', borderRadius: 2,
                  color: DARK, fontWeight: 700, fontSize: 13.5, letterSpacing: '0.06em', textTransform: 'uppercase',
                  opacity: payLoading ? 0.65 : 1,
                }}>
                  {payLoading ? 'Processing…' : promoStatus?.valid
                    ? `Pay ${formatPrice(Math.round(selectedPlan.price_paise * (1 - promoStatus.discount / 100)))} →`
                    : `Pay ${formatPrice(selectedPlan.price_paise)} →`}
                </button>
                <p style={{ color: FAINT, fontSize: 11, textAlign: 'center', marginTop: 12 }}>Secured by Razorpay · 256-bit SSL encryption</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
