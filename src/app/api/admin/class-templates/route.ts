export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!session || (session as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from('class_templates')
    .select('*')
    .order('day_of_week')
    .order('start_time');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!session || (session as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { title, instructor_name, day_of_week, start_time, end_time, capacity, category, notes } = body;

  if (!title || day_of_week === undefined || day_of_week === null || !start_time || !end_time || !capacity) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const dow = parseInt(String(day_of_week));
  if (isNaN(dow) || dow < 0 || dow > 6) {
    return NextResponse.json({ error: 'day_of_week must be 0–6' }, { status: 400 });
  }
  const cap = parseInt(String(capacity));
  if (isNaN(cap) || cap < 1 || cap > 100) {
    return NextResponse.json({ error: 'capacity must be 1–100' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from('class_templates')
    .insert({
      title: String(title).trim(),
      instructor_name: instructor_name ? String(instructor_name).trim() : null,
      day_of_week: dow,
      start_time,
      end_time,
      capacity: cap,
      category: category || 'pole_regular',
      notes: notes ? String(notes).trim() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, template: data });
}
