// Meta WhatsApp Cloud API helpers

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const ADMIN_NUMBER = process.env.WHATSAPP_ADMIN_NUMBER!; // e.g. "919876543210"

async function sendTemplate(
  to: string,
  templateName: string,
  params: string[]
) {
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
          language: { code: 'en' },
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
  await sendTemplate(phone, 'azdah_booking_confirmed', [
    memberName,
    className,
    classDate,
    classTime,
  ]);
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
