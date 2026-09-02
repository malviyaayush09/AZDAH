/**
 * One fetch wrapper that cannot throw.
 *
 * Every screen in this app used to call fetch and res.json() bare:
 *
 *     setBusy(true);
 *     const res = await fetch(url, opts);
 *     const data = await res.json();
 *     setBusy(false);
 *
 * If the connection dropped, or the server answered with an HTML error page so
 * res.json() threw, the promise rejected before setBusy(false) ran. The button
 * stayed on "Booking..." or "Saving..." for as long as the member cared to
 * wait, with no message and nothing to report. A member hit exactly this on the
 * login screen -- "it's showing logging in for 3-4 mins" -- and nothing was
 * recorded server-side, so there was no way to tell what had gone wrong.
 *
 * This returns a result instead of throwing, always carries a message a member
 * can act on, and gives up after 20 seconds rather than hanging forever.
 */
export type ApiResult<T> = {
  ok: boolean;
  status: number;          // 0 when the request never reached the server
  data: T | null;
  error: string | null;    // null only when ok
};

const NETWORK = 'Could not reach the server. Check your internet connection and try again.';
const SLOW = 'That took too long to respond. Check your connection and try again.';
const SERVER = 'Something went wrong at our end. Please try again in a moment.';
const GENERIC = 'Something went wrong. Please try again.';

export const TIMEOUT_MS = 20_000;

/**
 * Pass `json` and the method defaults to POST with the right Content-Type, so
 * call sites stop repeating the same three lines of boilerplate.
 */
// The default matches what res.json() gave before -- these call sites were
// already untyped, and pretending otherwise would only mean 29 casts that
// assert something nobody checked. Pass a generic where the shape is known.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  timeoutMs: number = TIMEOUT_MS,
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      ...(json !== undefined
        ? {
            method: rest.method ?? 'POST',
            headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
            body: JSON.stringify(json),
          }
        : {}),
      signal: controller.signal,
    });

    // A 500 or a gateway timeout answers with HTML, so this must not throw.
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    const body = (data ?? {}) as { error?: string; success?: boolean };
    const ok = res.ok && !body.error && body.success !== false;
    const error = ok ? null : body.error || (res.status >= 500 ? SERVER : GENERIC);
    return {
      ok,
      status: res.status,
      // On a failure with no body of its own, `data` carries the message too.
      // Plenty of call sites read `data.error || 'Failed'`, and 'Failed' tells
      // nobody anything; this way they inherit a usable sentence for free.
      data: (data ?? { error }) as T,
      error,
    };
  } catch (err) {
    const error = (err as Error)?.name === 'AbortError' ? SLOW : NETWORK;
    return {
      ok: false,
      status: 0,
      data: { error } as unknown as T,
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}
