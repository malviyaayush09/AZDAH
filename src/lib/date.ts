// AZDAH is a Bengaluru studio, but Vercel runs in UTC. Computing "today" from
// UTC means a same-day workshop would drop off the public list (or a past-date
// check would trip) at the wrong moment near midnight. Compute the calendar
// date in India Standard Time instead so day boundaries match the studio's.
export function todayIST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}
