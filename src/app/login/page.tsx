'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, RefreshCw, BarChart2, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const clean = phone.replace(/\D/g, '');
    const full = clean.length === 10 ? `91${clean}` : clean;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: full, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      router.push(data.role === 'admin' ? '/admin' : '/dashboard');
    } else {
      setError(data.error || 'Invalid phone or password');
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0D0B08', display: 'flex', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', position: 'relative' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes floatA { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-18px) rotate(3deg); } }
        @keyframes floatB { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-12px) rotate(-2deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .card-enter { animation: fadeIn .5s ease forwards; }
        .feat-item { display:flex; align-items:center; gap:10px; animation: fadeIn .5s ease forwards; }
        input { outline: none; background: transparent; width: 100%; color: #F5F0E8; font-size: 14px; font-family: inherit; border: none; }
        input::placeholder { color: #3A2B1E; }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #1A1410 inset !important; -webkit-text-fill-color: #F5F0E8 !important; }
        .eye-btn { background: none; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; }
        .submit-btn { transition: background .15s, transform .1s; cursor: pointer; }
        .submit-btn:hover:not(:disabled) { background: #FF5049 !important; }
        .submit-btn:active:not(:disabled) { transform: scale(.98); }
        .submit-btn:disabled { opacity: .6; cursor: not-allowed; }
        .back-link { transition: color .15s; }
        .back-link:hover { color: #F5F0E8 !important; }
      `}} />

      {/* ── Left panel — brand ── */}
      <div style={{ display: 'none', width: '50%', background: 'linear-gradient(160deg,#1A1410 0%,#0D0B08 50%,#150F0A 100%)', borderRight: '1px solid #2A2118', padding: '48px 56px', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }} className="left-panel">
        {/* Background glow */}
        <div style={{ position: 'absolute', top: '30%', left: '10%', width: 320, height: 320, background: 'radial-gradient(circle,rgba(248,52,51,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '5%', width: 200, height: 200, background: 'radial-gradient(circle,rgba(248,52,51,.07) 0%,transparent 70%)', pointerEvents: 'none' }} />

        {/* Floating decorative shapes */}
        <div style={{ position: 'absolute', top: '15%', right: '18%', width: 60, height: 60, border: '1px solid rgba(248,52,51,.2)', borderRadius: '50%', animation: 'floatA 6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '60%', left: '8%', width: 36, height: 36, border: '1px solid rgba(248,52,51,.15)', transform: 'rotate(45deg)', animation: 'floatB 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '28%', right: '12%', width: 18, height: 18, background: 'rgba(248,52,51,.25)', borderRadius: '50%', animation: 'floatA 5s ease-in-out infinite 1s' }} />

        {/* Logo */}
        <div>
          <a href="/"><img src="/azdahlogo.png" alt="AZDAH" style={{ height: 34, width: 'auto', display: 'block', filter: 'none' }} /></a>
          <div style={{ width: 32, height: 2, background: '#F83433', marginTop: 10, borderRadius: 999 }} />
        </div>

        {/* Headline */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 0' }}>
          <p style={{ color: 'rgba(248,52,51,.7)', fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', marginBottom: 16 }}>Member Portal</p>
          <h1 style={{ color: '#F5F0E8', fontSize: 40, fontWeight: 700, lineHeight: 1.2, fontFamily: 'var(--font-bodoni), Georgia, serif', marginBottom: 20 }}>
            Your practice,<br /><em style={{ color: '#F83433' }}>your space.</em>
          </h1>
          <p style={{ color: '#8A7A6A', fontSize: 14, lineHeight: 1.7, maxWidth: 340 }}>
            Book classes, track your membership, and manage everything from one place.
          </p>

          {/* Features */}
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { Icon: CalendarDays, text: 'Book classes in seconds' },
              { Icon: RefreshCw,    text: 'Reschedule once a month, hassle-free' },
              { Icon: BarChart2,    text: 'Track your membership & progress' },
            ].map((f, i) => (
              <div key={i} className="feat-item" style={{ animationDelay: `${i * 0.1}s` }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(248,52,51,.12)', border: '1px solid rgba(248,52,51,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><f.Icon size={16} color="#F83433" strokeWidth={1.5} /></div>
                <span style={{ color: '#8A7A6A', fontSize: 13 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ color: '#3A2B1E', fontSize: 11 }}>© 2025 AZDAH Fitness · Bangalore</p>
      </div>

      {/* ── Right panel — form ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative' }}>
        {/* Subtle radial glow behind card */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: 'radial-gradient(circle,rgba(248,52,51,.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div className="card-enter" style={{ width: '100%', maxWidth: 400, position: 'relative' }}>

          {/* Mobile logo (shown only on small screens) */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <a href="/"><img src="/azdahlogo.png" alt="AZDAH" style={{ height: 30, width: 'auto', display: 'inline-block', filter: 'none' }} /></a>
            <div style={{ width: 24, height: 2, background: '#F83433', borderRadius: 999, margin: '8px auto 0' }} />
          </div>

          {/* Card */}
          <div style={{ background: 'linear-gradient(145deg,#1A1410,#141009)', border: '1px solid #2A2118', borderRadius: 16, padding: '36px 32px', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>

            <>
            <h2 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Welcome back</h2>
            <p style={{ color: '#8A7A6A', fontSize: 13, marginBottom: 28 }}>Sign in to access your member dashboard</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Phone field */}
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8A7A6A', marginBottom: 8, letterSpacing: '.12em', textTransform: 'uppercase' }}>Phone Number</label>
                <div style={{ display: 'flex', border: `1px solid ${focused === 'phone' ? '#F83433' : '#2A2118'}`, borderRadius: 10, overflow: 'hidden', background: '#1A1410', transition: 'border-color .15s' }}>
                  <div style={{ padding: '13px 14px', borderRight: '1px solid #2A2118', background: '#131009', color: '#8A7A6A', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🇮🇳</span><span>+91</span>
                  </div>
                  <input
                    type="tel" required value={phone}
                    onChange={e => setPhone(e.target.value)}
                    onFocus={() => setFocused('phone')}
                    onBlur={() => setFocused(null)}
                    placeholder="98765 43210" maxLength={10}
                    autoComplete="username"
                    style={{ padding: '13px 14px' }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#8A7A6A', marginBottom: 8, letterSpacing: '.12em', textTransform: 'uppercase' }}>Password</label>
                <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${focused === 'password' ? '#F83433' : '#2A2118'}`, borderRadius: 10, background: '#1A1410', transition: 'border-color .15s', padding: '0 14px' }}>
                  <input
                    type={showPw ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    placeholder="Your password"
                    autoComplete="current-password"
                    style={{ flex: 1, padding: '13px 0' }}
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPw(p => !p)}
                    style={{ color: showPw ? '#F83433' : '#3A2B1E', marginLeft: 8, fontSize: 16 }}>
                    {showPw ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 14px', background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.25)', borderRadius: 8 }}>
                  <AlertCircle size={15} color="#f87171" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ color: '#f87171', fontSize: 13 }}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading} className="submit-btn"
                style={{ marginTop: 4, padding: '14px', background: '#F83433', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, letterSpacing: '.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? (
                  <>
                    <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                    Signing in...
                  </>
                ) : 'Sign In →'}
              </button>
            </form>
            </>
          </div>

          {/* Bottom links */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13, color: '#8A7A6A' }}>
              Not a member?{' '}
              <a href="/#plans" style={{ color: '#F83433', textDecoration: 'none', fontWeight: 500 }}>View Plans →</a>
            </p>
            <p style={{ fontSize: 12, color: '#3A2B1E', textAlign: 'center' }}>
              Forgot password? WhatsApp the studio and we&apos;ll reset it.
            </p>
          </div>
        </div>
      </div>

      {/* Two-column layout on larger screens */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 900px) {
          .left-panel { display: flex !important; }
        }
      ` }} />
    </main>
  );
}
