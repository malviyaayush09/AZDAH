'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: fullPhone, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.success) {
      if (data.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } else {
      setError(data.error || 'Invalid phone or password');
    }
  }

  return (
    <main className="min-h-screen bg-[#0D0B08] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <a href="/" className="text-3xl font-bold tracking-widest text-[#E1542B]" style={{ fontFamily: 'Georgia, serif' }}>
            AZDAH
          </a>
          <p className="text-[#8A7A6A] text-sm mt-2">Member Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs text-[#8A7A6A] mb-2 tracking-wider uppercase">WhatsApp Number</label>
            <div className="flex">
              <span className="bg-[#211A13] border border-r-0 border-[#2A2118] rounded-l px-3 py-3 text-[#8A7A6A] text-sm">+91</span>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                maxLength={10}
                autoComplete="username"
                className="flex-1 bg-[#1A1410] border border-[#2A2118] rounded-r px-4 py-3 text-[#F5F0E8] placeholder-[#3A2B1E] focus:outline-none focus:border-[#E1542B] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#8A7A6A] mb-2 tracking-wider uppercase">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password from WhatsApp"
              autoComplete="current-password"
              className="w-full bg-[#1A1410] border border-[#2A2118] rounded px-4 py-3 text-[#F5F0E8] placeholder-[#3A2B1E] focus:outline-none focus:border-[#E1542B] text-sm"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#E1542B] text-white py-4 rounded font-semibold tracking-wide hover:bg-[#F06040] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="text-center text-[#8A7A6A] text-xs mt-6">
          Not a member?{' '}
          <a href="/#plans" className="text-[#E1542B] hover:underline">
            View Plans →
          </a>
        </p>
        <p className="text-center text-[#8A7A6A] text-xs mt-2">
          Forgot password? WhatsApp us and we'll reset it.
        </p>
      </div>
    </main>
  );
}
