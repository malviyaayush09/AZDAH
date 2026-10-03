export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { generatePassword, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { todayIST } from '@/lib/date';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin'
    ? (session as { phone: string })
    : null;
}

/**
 * Put a member on a pack without a payment going through Razorpay.
 *
 * Until now the only door into membership was a completed Razorpay payment,
 * which caused two separate problems the studio hit every week:
 *
 *   · A payment captured with no account -- browser closed mid-checkout -- left
 *     the studio with a paying customer it could not create. The dashboard told
 *     it to "create the member manually", which was not possible. In practice
 *     the member was asked to pay a second time behind a 99% discount code.
 *
 *   · A free place could not be given at all. A 100% discount makes the amount
 *     zero and Razorpay refuses an order under one rupee, so the three codes
 *     set to 100% never once completed. 99% codes were made instead, and the
 *     member paid Rs 23.60 for something meant to be free.
 *
 * Both are the same missing door, so this is one route rather than two.
 *
 * It mirrors verify-payment deliberately: the same password generation, the
 * same must_change_password, the same plan snapshotting onto the pack. A member
 * created here must be indistinguishable from one who paid, or every screen
 * that reads them has a second case to get wrong.
 *
 * amount_paise is accepted rather than assumed. Zero is right for a free
 * place, but for a stuck payment the money was genuinely taken, and recording
 * zero would quietly understate revenue and leave the figures disagreeing with
 * Razorpay. The payment reference is accepted for the same reason -- it also
 * makes the dashboard's orphan warning clear itself, because the warning is
 * driven by a payment with no account behind it.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const rawPhone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
  const planId = typeof body.planId === 'string' ? body.planId : '';
  const startsOn = typeof body.startsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)
    ? body.startsOn : todayIST();
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : null;

  // Money, only when the studio says there was money. Both optional.
  const amountPaise = Number.isFinite(body.amountPaise) && body.amountPaise >= 0
    ? Math.round(body.amountPaise) : 0;
  const paymentRef = typeof body.razorpayPaymentId === 'string' && body.razorpayPaymentId.trim()
    ? body.razorpayPaymentId.trim() : null;

  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
  // The same shape every other phone in the system has: 91 then ten digits.
  // A member saved in any other format cannot log in, because the login screen
  // normalises to this and would never find them.
  const phone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;
  if (!/^91\d{10}$/.test(phone)) {
    return NextResponse.json(
      { error: 'Phone must be a 10-digit Indian mobile number.' },
      { status: 400 },
    );
  }
  if (!planId) return NextResponse.json({ error: 'Pick a pack.' }, { status: 400 });

  const db = getServiceClient();

  const { data: plan } = await db
    .from('membership_plans')
    .select('id, name, duration_days, classes_included, allowed_categories, category_limits')
    .eq('id', planId)
    .single();
  if (!plan) return NextResponse.json({ error: 'That pack no longer exists.' }, { status: 404 });

  // A payment reference may only be used once. Without this the same stuck
  // payment could be resolved twice and hand out two packs -- which is exactly
  // how one member ended up with a duplicate in August.
  if (paymentRef) {
    /*
     * Count the rows, do not ask for one.
     *
     * This read .maybeSingle(), which ERRORS when more than one row matches
     * and hands back null data -- read as "no clash" by the line below. So the
     * guard worked against a single existing pack and silently gave up at two,
     * which is the exact case it exists for. Caught by testing it against the
     * one payment reference in the database that already had a duplicate.
     */
    const { data: clashes } = await db
      .from('member_packs')
      .select('id')
      .eq('razorpay_payment_id', paymentRef)
      .limit(1);
    if (clashes && clashes.length > 0) {
      return NextResponse.json(
        { error: 'That payment has already been used for a pack. Nothing was created.' },
        { status: 409 },
      );
    }
  }

  const endDate = new Date(startsOn + 'T00:00:00');
  endDate.setDate(endDate.getDate() + plan.duration_days);
  const expiresOn = endDate.toISOString().split('T')[0];

  /*
   * An existing member gets the pack added, not a new account.
   *
   * Their password, their reschedule allowance and their history must survive:
   * the same mistake a blind upsert made here once before, which logged members
   * out of accounts they already had.
   */
  const { data: existing } = await db
    .from('members')
    .select('id, name')
    .eq('phone', phone)
    .maybeSingle();

  let memberId: string;
  let password: string | null = null;

  if (existing) {
    memberId = existing.id as string;
    await db.from('members').update({ is_active: true, expiry_reminder_sent: false }).eq('id', memberId);
  } else {
    password = generatePassword(8);
    const passwordHash = await hashPassword(password);
    const { data: created, error: createErr } = await db
      .from('members')
      .insert({
        phone,
        name,
        email,
        password_hash: passwordHash,
        is_active: true,
        reschedule_used_this_month: false,
        reschedule_reset_date: startsOn.slice(0, 7) + '-01',
        must_change_password: true,
        expiry_reminder_sent: false,
        razorpay_payment_id: paymentRef,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      return NextResponse.json({ error: 'Could not create the member. Please try again.' }, { status: 500 });
    }
    memberId = created.id as string;
  }

  const { error: packErr } = await db.from('member_packs').insert({
    member_id: memberId,
    plan_id: plan.id,
    // Snapshotted, exactly as a purchase does: repricing the plan tomorrow
    // must not change what this member was given today.
    plan_name: plan.name,
    classes_included: plan.classes_included ?? null,
    allowed_categories: plan.allowed_categories ?? null,
    category_limits: plan.category_limits ?? null,
    starts_on: startsOn,
    expires_on: expiresOn,
    amount_paid_paise: amountPaise,
    razorpay_payment_id: paymentRef,
  });
  if (packErr) {
    return NextResponse.json({ error: 'Member saved but the pack failed. Check before retrying.' }, { status: 500 });
  }

  // plan_end summarises the packs, so read them back rather than assuming this
  // one is the furthest -- a member can already hold a longer pack than this.
  const { data: allPacks } = await db
    .from('member_packs').select('expires_on').eq('member_id', memberId);
  const furthest = (allPacks || []).map((p) => p.expires_on as string).sort().slice(-1)[0];
  if (furthest) {
    await db.from('members')
      .update({ plan_end: furthest, plan_id: plan.id, plan_start: startsOn })
      .eq('id', memberId);
  }

  await logAudit(admin.phone, 'member_added_manually', 'member', memberId, {
    name, phone,
    pack: plan.name?.trim(),
    starts_on: startsOn,
    expires_on: expiresOn,
    amount_paise: amountPaise,
    payment_ref: paymentRef,
    existing_member: !!existing,
    note,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    member_id: memberId,
    existing_member: !!existing,
    name: existing ? (existing.name as string) : name,
    phone,
    pack: plan.name?.trim(),
    expires_on: expiresOn,
    // Only ever present for a brand new account. The studio has to pass it on;
    // nothing sends it for them while WhatsApp is switched off.
    password,
  });
}
