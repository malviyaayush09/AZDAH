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

// AZDAH's studio policy: a member must give this much notice to CANCEL. It is
// stated in the site FAQ and in the Terms, so this constant is the single place
// it lives on the server.
//
// Rescheduling is deliberately not bound by it. The monthly reschedule is the
// one forgiving move a member gets, and the studio would rather someone moved a
// class an hour before it started than silently missed it -- so it is allowed
// any time before the class begins. Cancelling still needs the notice, because
// a cancellation gives nothing back and the seat is harder to fill.
export const NOTICE_HOURS = 6;

export function hoursUntilClass(classDate: string, startTime: string): number {
  return (classStartsAt(classDate, startTime).getTime() - Date.now()) / 3_600_000;
}

// True once it is too late to cancel or reschedule. Also true for a class that
// has already started, so callers do not need a separate started check.
export function isPastNoticeWindow(classDate: string, startTime: string): boolean {
  return hoursUntilClass(classDate, startTime) < NOTICE_HOURS;
}
