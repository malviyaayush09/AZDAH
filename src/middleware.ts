import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { role } = session as { role: string };
  const path = req.nextUrl.pathname;

  if (path.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (path.startsWith('/dashboard') && role !== 'member') {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  return NextResponse.next();
}
