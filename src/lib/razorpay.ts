// Razorpay REST API helpers (no Node SDK — works on edge runtime)

const KEY_ID = process.env.RAZORPAY_KEY_ID!;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;

function authHeader() {
  return 'Basic ' + btoa(`${KEY_ID}:${KEY_SECRET}`);
}

export async function createOrder(amountPaise: number, receiptId: string) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: receiptId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let description = `Razorpay API error ${res.status}`;
    try {
      const err = JSON.parse(text);
      description = err.error?.description || err.error?.code || description;
    } catch { /* body wasn't JSON */ }
    console.error('Razorpay API response:', res.status, text.slice(0, 300));
    throw new Error(description);
  }

  return res.json() as Promise<{ id: string; amount: number; currency: string }>;
}

export async function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string
): Promise<boolean> {
  // HMAC-SHA256 of "orderId|paymentId" using key secret
  const payload = `${orderId}|${paymentId}`;

  // Web Crypto API — works on edge runtime
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(KEY_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}
