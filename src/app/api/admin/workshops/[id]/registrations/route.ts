export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Roster for one workshop — who's registered, what they paid.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await verifySession(req.cookies.get('session')?.value || '');
  if (!session || (session as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('workshop_registrations')
    .select('id, name, phone, email, amount_paise, status, created_at')
    .eq('workshop_id', params.id)
    .eq('status', 'confirmed')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registrations: data || [] });
}
