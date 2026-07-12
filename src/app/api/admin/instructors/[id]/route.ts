export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession, hashPassword, generatePassword } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const db = getServiceClient();

  // Password reset — returns the new password for the admin to relay
  if (body.action === 'reset_password') {
    const { data: inst } = await db.from('instructors').select('id, name, phone').eq('id', id).single();
    if (!inst) return NextResponse.json({ error: 'Instructor not found' }, { status: 404 });
    const rawPassword = generatePassword(8);
    const hash = await hashPassword(rawPassword);
    const { error } = await db.from('instructors').update({ password_hash: hash }).eq('id', id);
    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json({ ok: true, password: rawPassword, name: inst.name, phone: inst.phone });
  }

  // Active toggle
  if (typeof body.is_active === 'boolean') {
    const { error } = await db.from('instructors').update({ is_active: body.is_active }).eq('id', id);
    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = getServiceClient();
  // Unlink from templates/classes first (FK is nullable), then remove.
  await db.from('class_templates').update({ instructor_id: null }).eq('instructor_id', id);
  await db.from('classes').update({ instructor_id: null }).eq('instructor_id', id);
  const { error } = await db.from('instructors').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
