import Link from 'next/link';

const DARK = '#0D0B08';
const CARD = '#1A1410';
const BORDER = '#2A2118';
const CREAM = '#F5F0E8';
const MUTED = '#8A7A6A';
const ORANGE = '#F83433';
const SERIF = 'var(--font-bodoni), Georgia, serif';

export const metadata = { title: 'Privacy Policy — AZDAH Fitness' };

export default function PrivacyPage() {
  return (
    <main style={{ background: DARK, minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: CREAM }}>
      <style dangerouslySetInnerHTML={{ __html: `* { box-sizing: border-box; margin: 0; padding: 0; } a { color: ${ORANGE}; } h2 { font-family: ${SERIF}; }` }} />

      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${BORDER}`, padding: '18px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/"><img src="/azdahlogo.png" alt="AZDAH" style={{ height: 28, width: 'auto' }} /></Link>
        <Link href="/" style={{ color: MUTED, fontSize: 13, textDecoration: 'none' }}>← Back to home</Link>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 28px 100px' }}>
        <p style={{ color: ORANGE, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Legal</p>
        <h1 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, marginBottom: 12, lineHeight: 1.1 }}>Privacy Policy</h1>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 56 }}>Last updated: June 2026</p>

        {[
          {
            title: '1. Information We Collect',
            body: `When you purchase a membership or interact with the AZDAH website, we collect:
• Name, phone number, and email address provided during checkout
• Payment reference details (we never store card numbers — all payments are processed by Razorpay)
• Class booking history and attendance records
• Login activity (timestamps, not passwords in plain text)`,
          },
          {
            title: '2. How We Use Your Information',
            body: `We use the information we collect to:
• Create and manage your AZDAH membership account
• Send booking confirmations, reminders, and important updates via WhatsApp
• Process membership renewals and payment records
• Improve our class schedule and studio offerings
• Comply with applicable laws and regulations`,
          },
          {
            title: '3. WhatsApp Communications',
            body: `By providing your phone number, you consent to receiving WhatsApp messages from AZDAH for:
• Class booking confirmations and reminders
• Membership expiry notices
• Studio announcements directly relevant to your membership

We do not send promotional spam. You may opt out at any time by messaging us on WhatsApp.`,
          },
          {
            title: '4. Data Storage & Security',
            body: `Your data is stored securely in Supabase (a GDPR-compliant cloud database). Passwords are hashed using bcrypt and never stored in plain text. All data transmissions are encrypted using TLS/SSL.`,
          },
          {
            title: '5. Payments',
            body: `All payments are handled by Razorpay, a PCI DSS-compliant payment gateway. AZDAH does not have access to your card or bank details. Razorpay's privacy policy applies to payment processing.`,
          },
          {
            title: '6. Data Sharing',
            body: `We do not sell or rent your personal information to third parties. We may share data only with:
• Razorpay (for payment processing)
• Meta / WhatsApp (for sending communications you opted into)
• Law enforcement when required by law`,
          },
          {
            title: '7. Your Rights',
            body: `You may request to:
• Access the personal data we hold about you
• Correct inaccurate data
• Delete your account and associated data (subject to our retention obligations)

To exercise these rights, contact us at hello@azdahfit.in or via WhatsApp.`,
          },
          {
            title: '8. Cookies',
            body: `Our website uses a single session cookie (HttpOnly, Secure) to keep you logged in. We do not use advertising or third-party tracking cookies.`,
          },
          {
            title: '9. Changes to This Policy',
            body: `We may update this Privacy Policy from time to time. Continued use of the AZDAH website or app after changes constitutes acceptance of the updated policy.`,
          },
          {
            title: '10. Contact',
            body: `For privacy-related questions or requests:\nEmail: hello@azdahfit.in\nWhatsApp: +91 99999 99999\nAddress: 549/3, 9th A Main, Indiranagar, Bangalore — 560038`,
          },
        ].map(({ title, body }) => (
          <section key={title} style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: CREAM }}>{title}</h2>
            <p style={{ color: MUTED, fontSize: 14.5, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{body}</p>
          </section>
        ))}

        <div style={{ marginTop: 64, paddingTop: 32, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/terms" style={{ fontSize: 13 }}>Terms & Conditions →</Link>
          <Link href="/" style={{ color: MUTED, fontSize: 13, textDecoration: 'none' }}>← Back to AZDAH</Link>
        </div>
      </div>
    </main>
  );
}
