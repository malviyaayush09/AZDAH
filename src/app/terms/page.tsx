import Link from 'next/link';

const DARK = '#0D0B08';
const CARD = '#1A1410';
const BORDER = '#2A2118';
const CREAM = '#F5F0E8';
const MUTED = '#8A7A6A';
const ORANGE = '#F83433';
const SERIF = 'var(--font-bodoni), Georgia, serif';

export const metadata = { title: 'Terms & Conditions — AZDAH Fitness' };

export default function TermsPage() {
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
        <h1 style={{ fontFamily: SERIF, fontSize: 42, fontWeight: 800, marginBottom: 12, lineHeight: 1.1 }}>Terms & Conditions</h1>
        <p style={{ color: MUTED, fontSize: 14, marginBottom: 56 }}>Last updated: June 2026</p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: `By purchasing a membership, booking a class, or using the AZDAH website (azdah.in), you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our services.`,
          },
          {
            title: '2. Membership Plans',
            body: `• All memberships are personal and non-transferable.
• Membership grants access to all AZDAH disciplines and classes for the duration of your plan.
• Plans are counted from the date of payment, not first class attendance.
• AZDAH reserves the right to modify class schedules, instructors, or disciplines at any time.`,
          },
          {
            title: '3. Class Bookings',
            body: `• Classes must be booked through the AZDAH member portal.
• You may cancel a booking up to 2 hours before the class start time.
• Late cancellations (within 2 hours) or no-shows cannot be refunded or rescheduled.
• Each member receives one free reschedule per membership month. Additional rescheduling is not permitted.
• If a class is full, you may join the waitlist. Waitlist members are confirmed in order as spots open.`,
          },
          {
            title: '4. Payments & Refunds',
            body: `• All payments are final. We do not offer refunds on membership purchases.
• In exceptional circumstances (serious injury, medical emergency), please contact us. Refund decisions are at AZDAH's sole discretion.
• Payments are processed securely by Razorpay. AZDAH is not responsible for payment failures due to issues on your bank's end.`,
          },
          {
            title: '5. Membership Freeze / Pause',
            body: `• Members may pause their membership for up to 15 days per plan cycle.
• Pause requests must be submitted via WhatsApp at least 24 hours in advance.
• Pause periods extend the membership end date accordingly.`,
          },
          {
            title: '6. Studio Rules & Safety',
            body: `• Members must follow all instructions from AZDAH coaches at all times.
• Appropriate athletic wear is required. Bare feet or grip socks for aerial and pole disciplines.
• AZDAH is not liable for personal injury resulting from failure to follow safety instructions.
• Photography and video inside the studio require explicit permission from AZDAH staff.
• AZDAH reserves the right to terminate membership without refund for conduct that endangers others or disrupts the studio environment.`,
          },
          {
            title: '7. Health & Fitness Disclaimer',
            body: `• Participation in physical fitness activities carries inherent risk of injury. You assume this risk voluntarily.
• Consult a physician before beginning any fitness programme, especially if you have pre-existing medical conditions.
• Inform your coach of any injuries, health conditions, or physical limitations before class.`,
          },
          {
            title: '8. Intellectual Property',
            body: `All content on azdah.in — including the AZDAH name, logo, photographs, and text — is the property of AZDAH Fitness. Reproduction without written permission is prohibited.`,
          },
          {
            title: '9. Limitation of Liability',
            body: `AZDAH's liability for any claim arising from the use of our services is limited to the amount paid for the membership in question. We are not liable for indirect, incidental, or consequential damages.`,
          },
          {
            title: '10. Governing Law',
            body: `These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka.`,
          },
          {
            title: '11. Changes to These Terms',
            body: `AZDAH reserves the right to modify these Terms at any time. Changes take effect immediately upon posting on azdah.in. Continued use of our services constitutes acceptance.`,
          },
          {
            title: '12. Contact',
            body: `Questions about these terms?\nEmail: hello@azdahfit.in\nWhatsApp: +91 85880 56122\nAddress: 549/3, 9th A Main, Indiranagar, Bangalore — 560038`,
          },
        ].map(({ title, body }) => (
          <section key={title} style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: CREAM }}>{title}</h2>
            <p style={{ color: MUTED, fontSize: 14.5, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{body}</p>
          </section>
        ))}

        <div style={{ marginTop: 64, paddingTop: 32, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ fontSize: 13 }}>Privacy Policy →</Link>
          <Link href="/" style={{ color: MUTED, fontSize: 13, textDecoration: 'none' }}>← Back to AZDAH</Link>
        </div>
      </div>
    </main>
  );
}
