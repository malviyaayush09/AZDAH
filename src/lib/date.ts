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

// A class's class_date + start_time are IST wall-clock values. Building a Date
// from `${date}T${time}` with no offset makes the runtime read them in ITS OWN
// zone — UTC on Vercel — so every class looked 5h30m later than it really is.
// That let members book/cancel a class for 5.5h after it started, and blocked
// the studio from marking attendance until 5.5h in. Always pin the IST offset.
export function classStartsAt(classDate: string, startTime: string): Date {
  const t = startTime.length === 5 ? `${startTime}:00` : startTime; // HH:MM -> HH:MM:SS
  return new Date(`${classDate}T${t}+05:30`);
}

export function classHasStarted(classDate: string, startTime: string): boolean {
  return classStartsAt(classDate, startTime).getTime() <= Date.now();
}
