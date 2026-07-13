export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isAdmin(session: object | null) {
  return !!session && (session as { role: string }).role === 'admin';
}

// Update a workshop (any subset of fields, incl. is_active to open/close it).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (t.length < 2 || t.length > 120) return NextResponse.json({ error: 'Title must be 2–120 characters' }, { status: 400 });
    patch.title = t;
  }
  if (body.description !== undefined) {
    const d = String(body.description).trim();
    if (d.length > 2000) return NextResponse.json({ error: 'Description is too long (max 2000 characters)' }, { status: 400 });
    patch.description = d;
  }
  if (body.instructor_name !== undefined) patch.instructor_name = body.instructor_name ? String(body.instructor_name).trim() : null;
  if (body.workshop_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.workshop_date))) {
      return NextResponse.json({ error: 'workshop_date must be YYYY-MM-DD' }, { status: 400 });
    }
    patch.workshop_date = body.workshop_date;
  }
  if (body.start_time !== undefined) {
    if (!TIME.test(String(body.start_time))) return NextResponse.json({ error: 'start_time must be HH:MM' }, { status: 400 });
    patch.start_time = body.start_time;
  }
  if (body.end_time !== undefined) {
    if (body.end_time && !TIME.test(String(body.end_time))) return NextResponse.json({ error: 'end_time must be HH:MM' }, { status: 400 });
    patch.end_time = body.end_time || null;
  }
  // If both ends are being set in the same request, enforce ordering.
  if (body.start_time !== undefined && body.end_time && String(body.end_time).slice(0, 5) <= String(body.start_time).slice(0, 5)) {
    return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 });
  }
  if (body.location !== undefined) patch.location = body.location ? String(body.location).trim() : null;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.capacity !== undefined) {
    const cap = parseInt(String(body.capacity));
    if (isNaN(cap) || cap < 1 || cap > 500) return NextResponse.json({ error: 'capacity must be 1–500' }, { status: 400 });
    patch.capacity = cap;
  }
  if (body.price_paise !== undefined) {
    const price = Number(body.price_paise);
    if (!Number.isInteger(price) || price < 0) return NextResponse.json({ error: 'price_paise must be a non-negative integer' }, { status: 400 });
    patch.price_paise = price;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db.from('workshops').update(patch).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, workshop: data });
}

// Delete a workshop. Refuses if it already has registrations — deactivate
// (PATCH is_active=false) instead, to preserve paid-registration history.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = getServiceClient();
  const { count } = await db
    .from('workshop_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('workshop_id', params.id);

  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: 'This workshop has registrations. Deactivate it instead of deleting.' },
      { status: 409 }
    );
  }

  const { error } = await db.from('workshops').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
