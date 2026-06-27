// Simple password helpers using Web Crypto (edge-compatible)

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  // PBKDF2 with a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashArr = new Uint8Array(derived);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(hashArr).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;

  const salt = new Uint8Array(parts[1].match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const expectedBytes = new Uint8Array(parts[2].match(/.{2}/g)!.map((h) => parseInt(h, 16)));

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const computedBytes = new Uint8Array(derived);

  // Constant-time comparison — prevents timing attacks
  if (computedBytes.length !== expectedBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < computedBytes.length; i++) {
    diff |= computedBytes[i] ^ expectedBytes[i];
  }
  return diff === 0;
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

export function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const arr = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(arr).map((b) => chars[b % chars.length]).join('');
}

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export async function signSession(payload: object): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set');

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + SESSION_TTL };
  const data = btoa(JSON.stringify(fullPayload));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${data}.${sigHex}`;
}

export async function verifySession(token: string): Promise<object | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set');

  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time string comparison
  if (computed.length !== sigHex.length) return null;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ sigHex.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(atob(data)) as { exp?: number };
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
