// Canonicalise an Indian mobile number to "91XXXXXXXXXX".
//
// The public registration/checkout APIs accept a phone in whatever shape the
// caller sends (with or without +91, a leading 0, spaces, dashes). Without a
// canonical form, the SAME person entering "9876543210", "+91 98765 43210" or
// "09876543210" would be stored as three different strings and could register
// for the same workshop multiple times. Reducing every input to one canonical
// value makes the (workshop_id, phone) duplicate check and unique index solid.
//
// Returns null if the input isn't a valid 10-digit Indian mobile number
// (mobiles start with 6–9), so callers can reject bad input up front.
export function canonicalPhone(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return '91' + d;
}
