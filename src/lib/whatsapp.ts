// Meta WhatsApp Cloud API helpers

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const ADMIN_NUMBER = process.env.WHATSAPP_ADMIN_NUMBER!; // e.g. "919876543210"

async function sendTemplate(
  to: string,
  templateName: string,
  params: string[]
) {
  // Master kill switch — WhatsApp stays off until the Cloud API is live.
  // Set WHATSAPP_ENABLED=true in env to turn every message on (no code change).
  if (process.env.WHATSAPP_ENABLED !== 'true') return;

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    console.error('WhatsApp send error:', err);
    throw new Error('WhatsApp message failed');
  }
}

// ─── Send welcome message to new member ──────────────────────
// Template: azdah_welcome
// Variables: {{1}} = member name, {{2}} = plan name, {{3}} = username (phone), {{4}} = password
export async function sendMemberWelcome(
  phone: string,
  name: string,
  planName: string,
  password: string
) {
  await sendTemplate(phone, 'azdah_welcome', [name, planName, phone, password]);
}

// ─── Send new member alert to admin ──────────────────────────
// Template: azdah_admin_new_member
// Variables: {{1}} = member name, {{2}} = phone, {{3}} = plan name, {{4}} = amount paid
export async function sendAdminNewMember(
  memberName: string,
  memberPhone: string,
  planName: string,
  amountPaise: number
) {
  const amount = `₹${(amountPaise / 100).toLocaleString('en-IN')}`;
  await sendTemplate(ADMIN_NUMBER, 'azdah_admin_new_member', [
    memberName,
    memberPhone,
    planName,
    amount,
  ]);
}

// ─── Send booking confirmation to member ─────────────────────
// Template: azdah_booking_confirmed
// Variables: {{1}} = member name, {{2}} = class name, {{3}} = date, {{4}} = time
export async function sendBookingConfirmed(
  phone: string,
  memberName: string,
  className: string,
  classDate: string,
  classTime: string
) {
  await sendTemplate(phone, 'azdah_booking_confirmed', [memberName, className, classDate, classTime]);
}

// ─── Send expiry reminder to member ──────────────────────────
// Template: azdah_expiry_reminder
// Variables: {{1}} = member name, {{2}} = plan name, {{3}} = days left
export async function sendExpiryReminder(phone: string, name: string, planName: string, daysLeft: string) {
  await sendTemplate(phone, 'azdah_expiry_reminder', [name, planName, daysLeft]);
}

// ─── Admin broadcast to a single member ──────────────────────
// Template: azdah_broadcast
// Variables: {{1}} = member name, {{2}} = message body
export async function sendAdminBroadcast(phone: string, name: string, message: string) {
  await sendTemplate(phone, 'azdah_broadcast', [name, message]);
}

// ─── Admin reset member password ─────────────────────────────
// Template: azdah_password_reset
// Variables: {{1}} = member name, {{2}} = new password
export async function sendPasswordReset(phone: string, name: string, newPassword: string) {
  await sendTemplate(phone, 'azdah_password_reset', [name, newPassword]);
}

// ─── Send class reminder (2 hrs before) ──────────────────────
// Template: azdah_class_reminder
// Variables: {{1}} = member name, {{2}} = class name, {{3}} = time
export async function sendClassReminder(phone: string, name: string, className: string, time: string) {
  const [h, m] = time.split(':').map(Number);
  const fmt = `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  await sendTemplate(phone, 'azdah_class_reminder', [name, className, fmt]);
}

// ─── Waitlist promotion notification ─────────────────────────
// Template: azdah_waitlist_promoted
// Variables: {{1}} = member name, {{2}} = class name, {{3}} = date, {{4}} = time
export async function sendWaitlistPromoted(phone: string, name: string, className: string, classDate: string, classTime: string) {
  const d = new Date(classDate + 'T00:00:00');
  const dateFmt = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const [h, m] = classTime.split(':').map(Number);
  const timeFmt = `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  await sendTemplate(phone, 'azdah_waitlist_promoted', [name, className, dateFmt, timeFmt]);
}

// ─── Admin 2FA OTP ────────────────────────────────────────────
// Template: azdah_admin_otp
// Variables: {{1}} = OTP code
export async function sendAdminOtp(phone: string, otp: string) {
  await sendTemplate(phone, 'azdah_admin_otp', [otp]);
}

// ─── Send reschedule confirmation ────────────────────────────
// Template: azdah_reschedule_confirmed
// Variables: {{1}} = member name, {{2}} = new class name, {{3}} = new date, {{4}} = new time
export async function sendRescheduleConfirmed(
  phone: string,
  memberName: string,
  newClassName: string,
  newDate: string,
  newTime: string
) {
  await sendTemplate(phone, 'azdah_reschedule_confirmed', [
    memberName,
    newClassName,
    newDate,
    newTime,
  ]);
}
