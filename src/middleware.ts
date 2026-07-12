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

  return NextResponse.next();
}
