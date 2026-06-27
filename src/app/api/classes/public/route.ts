export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET() {
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  const { data } = await db
    .from('classes')
    .select('id, title, trainer_name, class_date, start_time, end_time, capacity, booked_count')
    .eq('is_cancelled', false)
    .gte('class_date', today)
    .lte('class_date', in14Days)
    .order('class_date')
    .order('start_time');

  return NextResponse.json({ classes: data || [] });
}
