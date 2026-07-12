export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function instructorFor(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'instructor') return null;
  return (session as { instructorId: string }).instructorId;
}

type Ctx = { params: { classId: string } };

// Roster for one of the instructor's own classes
export async function GET(req: NextRequest, { params }: Ctx) {
  const instructorId = await instructorFor(req);
  if (!instructorId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { classId } = params;
  if (!UUID_RE.test(classId)) return NextResponse.json({ error: 'Invalid classId' }, { status: 400 });

  const db = getServiceClient();

  // Ownership check — the class must belong to this instructor
  const { data: cls } = await db
    .from('classes')
    .select('id, title, class_date, start_time, instructor_id')
    .eq('id', classId)
    .single();
  if (!cls || cls.instructor_id !== instructorId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: bookings } = await db
    .from('bookings')
    .select('id, member_id, attended, members(name, phone)')
    .eq('class_id', classId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true });

  // This instructor's private coaching notes for these students
  const memberIds = (bookings || []).map((b) => b.member_id).filter(Boolean);
  const { data: notes } = memberIds.length
    ? await db.from('instructor_notes').select('member_id, note').eq('instructor_id', instructorId).in('member_id', memberIds)
    : { data: [] as { member_id: string; note: string }[] };
  const noteMap = new Map((notes || []).map((n) => [n.member_id, n.note]));

  const roster = (bookings || []).map((b) => {
    const m = (Array.isArray(b.members) ? b.members[0] : b.members) as { name: string; phone: string } | null;
    return { id: b.id, member_id: b.member_id, name: m?.name || 'Member', phone: m?.phone || '', attended: b.attended, note: noteMap.get(b.member_id) || '' };
  });

  return NextResponse.json({ class: { id: cls.id, title: cls.title, class_date: cls.class_date, start_time: cls.start_time }, roster });
}

// Mark attendance for a booking in one of the instructor's classes
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const instructorId = await instructorFor(req);
  if (!instructorId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { classId } = params;
  if (!UUID_RE.test(classId)) return NextResponse.json({ error: 'Invalid classId' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.bookingId !== 'string' || typeof body.attended !== 'boolean') {
    return NextResponse.json({ error: 'bookingId and attended required' }, { status: 400 });
  }

  const db = getServiceClient();

  // Ownership check
  const { data: cls } = await db.from('classes').select('instructor_id').eq('id', classId).single();
  if (!cls || cls.instructor_id !== instructorId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await db
    .from('bookings')
    .update({ attended: body.attended })
    .eq('id', body.bookingId)
    .eq('class_id', classId);
  if (error) return NextResponse.json({ error: 'Failed to update attendance' }, { status: 500 });

  return NextResponse.json({ success: true });
}
