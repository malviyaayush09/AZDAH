export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession, hashPassword, generatePassword } from '@/lib/auth';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;
  return session && (session as { role: string }).role === 'admin' ? session : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('instructors')
    .select('id, name, phone, is_active, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: 'Failed to load instructors' }, { status: 500 });
  return NextResponse.json({ instructors: data });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { name, phone } = body as { name?: string; phone?: string };

  const trimmedName = (name || '').trim();
  if (trimmedName.length < 2) return NextResponse.json({ error: 'Enter the instructor name' }, { status: 400 });

  const clean = String(phone || '').replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(clean)) return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 });
  const fullPhone = clean.length === 10 ? `91${clean}` : clean;

  const db = getServiceClient();

  // Phone must be unique across instructors
  const { data: existing } = await db.from('instructors').select('id').eq('phone', fullPhone).maybeSingle();
  if (existing) return NextResponse.json({ error: 'An instructor with this phone already exists' }, { status: 409 });

  const rawPassword = generatePassword(8);
  const passwordHash = await hashPassword(rawPassword);

  const { data: created, error } = await db
    .from('instructors')
    .insert({ name: trimmedName, phone: fullPhone, password_hash: passwordHash, is_active: true })
    .select('id, name, phone')
    .single();

  if (error || !created) return NextResponse.json({ error: 'Failed to create instructor' }, { status: 500 });

  // Auto-link any templates/classes whose trainer name matches this instructor,
  // so their existing schedule shows up on the instructor dashboard immediately.
  await db.from('class_templates').update({ instructor_id: created.id }).eq('instructor_name', trimmedName).is('instructor_id', null);
  await db.from('classes').update({ instructor_id: created.id }).eq('trainer_name', trimmedName).is('instructor_id', null);

  // Return the generated password once so the admin can share it.
  return NextResponse.json({ success: true, instructor: created, password: rawPassword });
}
