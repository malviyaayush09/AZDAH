export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Save (upsert) a coaching note for a student, scoped to the logged-in instructor.
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session as { role: string }).role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { instructorId } = session as { instructorId: string };

  const body = await req.json().catch(() => null);
  if (!body || typeof body.memberId !== 'string' || !UUID_RE.test(body.memberId) || typeof body.note !== 'string') {
    return NextResponse.json({ error: 'memberId and note required' }, { status: 400 });
  }
  if (body.note.length > 2000) {
    return NextResponse.json({ error: 'Note too long' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db
    .from('instructor_notes')
    .upsert(
      { instructor_id: instructorId, member_id: body.memberId, note: body.note.trim() },
      { onConflict: 'instructor_id,member_id' }
    );

  if (error) return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  return NextResponse.json({ success: true });
}
