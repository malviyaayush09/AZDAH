export const runtime = 'edge';

import { getServiceClient } from '@/lib/supabase';

// Generic rate limiter using Supabase login_attempts table concept
// key = endpoint:identifier (e.g. "booking:memberId")
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMinutes: number
): Promise<boolean> {
  const db = getServiceClient();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count } = await db
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart);

  return (count ?? 0) >= maxRequests;
}

export async function recordRequest(key: string) {
  const db = getServiceClient();
  await db.from('rate_limits').insert({ key });
  // Clean up entries older than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  db.from('rate_limits').delete().lt('created_at', oneHourAgo).then(() => {});
}
