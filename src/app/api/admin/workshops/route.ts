export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { todayIST } from '@/lib/date';

function isAdmin(session: object | null) {
  return !!session && (session as { role: string }).role === 'admin';
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// List every workshop (active + inactive) with its confirmed-registration count.
export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getServiceClient();
  const { data: workshops, error } = await db
    .from('workshops')
    .select('*')
    .order('workshop_date', { ascending: false })
    .order('start_time');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = await Promise.all(
    (workshops || []).map(async (w) => {
      const { data: regs } = await db
        .from('workshop_registrations')
        .select('amount_paise')
        .eq('workshop_id', w.id)
        .eq('status', 'confirmed');
      const rows = regs || [];
      const paid = rows.filter((r) => r.amount_paise > 0);
      return {
        ...w,
        registration_count: rows.length,
        paid_count: paid.length,
        paid_total_paise: paid.reduce((s, r) => s + r.amount_paise, 0),
      };
    })
  );

  // Orphaned payments: a workshop payment was captured (intent 'completed') but
  // no registration exists for it — e.g. the "seat filled during payment" race.
  // Surface these so the studio can refund in Razorpay instead of only finding
  // them there by accident.
  const [{ data: paidIntents }, { data: regOrders }] = await Promise.all([
    db.from('payment_intents').select('order_id, phone, name, amount_paise, workshop_id').eq('intent_type', 'workshop').eq('status', 'completed'),
    db.from('workshop_registrations').select('razorpay_order_id').not('razorpay_order_id', 'is', null),
  ]);
  const regOrderSet = new Set((regOrders || []).map((r) => r.razorpay_order_id));
  const titleById = new Map((workshops || []).map((w) => [w.id, w.title]));
  const orphaned = (paidIntents || [])
    .filter((pi) => pi.order_id && !regOrderSet.has(pi.order_id))
    .map((pi) => ({
      order_id: pi.order_id,
      name: pi.name,
      phone: pi.phone,
      amount_paise: pi.amount_paise,
      workshop_title: titleById.get(pi.workshop_id) || 'Unknown workshop',
    }));

  return NextResponse.json({ workshops: list, orphaned });
}

// Create a workshop. price_paise === 0 means the workshop is free.
export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { title, description, instructor_name, workshop_date, start_time, end_time, capacity, price_paise, location } = body;

  if (!title || !workshop_date || !start_time) {
    return NextResponse.json({ error: 'title, workshop_date and start_time are required' }, { status: 400 });
  }
  const titleTrim = String(title).trim();
  if (titleTrim.length < 2 || titleTrim.length > 120) {
    return NextResponse.json({ error: 'Title must be 2–120 characters' }, { status: 400 });
  }
  if (description && String(description).length > 2000) {
    return NextResponse.json({ error: 'Description is too long (max 2000 characters)' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workshop_date))) {
    return NextResponse.json({ error: 'workshop_date must be YYYY-MM-DD' }, { status: 400 });
  }
  const today = todayIST();
  if (String(workshop_date) < today) {
    return NextResponse.json({ error: 'Workshop date cannot be in the past.' }, { status: 400 });
  }
  if (!TIME.test(String(start_time))) {
    return NextResponse.json({ error: 'start_time must be HH:MM' }, { status: 400 });
  }
  if (end_time && !TIME.test(String(end_time))) {
    return NextResponse.json({ error: 'end_time must be HH:MM' }, { status: 400 });
  }
  if (end_time && String(end_time).slice(0, 5) <= String(start_time).slice(0, 5)) {
    return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 });
  }

  const cap = parseInt(String(capacity));
  if (isNaN(cap) || cap < 1 || cap > 500) {
    return NextResponse.json({ error: 'capacity must be 1–500' }, { status: 400 });
  }

  const price = Number(price_paise);
  if (!Number.isInteger(price) || price < 0) {
    return NextResponse.json({ error: 'price_paise must be a non-negative integer' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from('workshops')
    .insert({
      title: titleTrim,
      description: description ? String(description).trim() : '',
      instructor_name: instructor_name ? String(instructor_name).trim() : null,
      workshop_date,
      start_time,
      end_time: end_time || null,
      capacity: cap,
      price_paise: price,
      location: location ? String(location).trim() : null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, workshop: data });
}
