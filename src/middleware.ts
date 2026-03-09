import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

export async function middleware(request: NextRequest) {
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard');

  if (isDashboard) {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      await jwtVerify(token, secret);
    } catch (err) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Also protect API routes except /api/auth
  if (request.nextUrl.pathname.startsWith('/api/') && !request.nextUrl.pathname.startsWith('/api/auth')) {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      await jwtVerify(token, secret);
    } catch {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
