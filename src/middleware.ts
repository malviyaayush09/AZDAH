import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/instructor/:path*',
    '/api/member/:path*',
    '/api/booking/:path*',
    '/api/admin/:path*',
    '/api/instructor/:path*',
  ],
  // /api/cron/* is excluded (protected by CRON_SECRET header, not session)
};

function homeFor(role: string) {
  return role === 'admin' ? '/admin' : role === 'instructor' ? '/instructor' : '/dashboard';
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApiRoute = path.startsWith('/api/');

  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized', redirect: '/login' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', path);
    return NextResponse.redirect(loginUrl);
  }

  const { role } = session as { role: string };

  // Page route protection — send users to their own home if they stray
  if (!isApiRoute) {
    if (path.startsWith('/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL(homeFor(role), req.url));
    }
    if (path.startsWith('/dashboard') && role !== 'member') {
      return NextResponse.redirect(new URL(homeFor(role), req.url));
    }
    if (path.startsWith('/instructor') && role !== 'instructor') {
      return NextResponse.redirect(new URL(homeFor(role), req.url));
    }
  }

  // API route protection
  if (isApiRoute) {
    if (path.startsWith('/api/admin') && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (path.startsWith('/api/member') && role !== 'member') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (path.startsWith('/api/booking') && role !== 'member') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (path.startsWith('/api/instructor') && role !== 'instructor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  /*
   * Nothing behind a session may be cached by the browser.
   *
   * These routes answered with no Cache-Control header at all, and the client
   * calls them with fetch's default cache mode. A response carrying no
   * freshness information is left to the browser's own heuristics, and Safari
   * on iOS -- which is what nearly every member here uses -- will reuse one.
   * The effect is a member holding yesterday's timetable: a class published
   * this morning does not appear for them, while the studio, on a different
   * screen, can see it perfectly well and cannot understand why nobody can
   * book.
   *
   * It is also a privacy matter: these responses carry one member's bookings
   * and pack, and a shared or restored browser session should never be able to
   * redisplay them.
   *
   * Availability changes minute to minute. There is no version of this data
   * that is safe to serve from a cache, so it is refused here once, for every
   * route the matcher covers, rather than route by route where the next new
   * endpoint would forget it.
   */
  const res = NextResponse.next();
  if (isApiRoute) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.headers.set('Pragma', 'no-cache');
  }
  return res;
}
