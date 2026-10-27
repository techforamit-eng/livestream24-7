import { NextResponse } from 'next/server';
import { exchangeCodeForChannel, getCleanOrigin } from '@/lib/youtube';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

async function getUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return 'admin';
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    return decoded.role || 'admin';
  } catch (e) {
    return 'admin';
  }
}

export async function GET(req: Request) {
  const origin = getCleanOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard/auto-stream?error=' + encodeURIComponent(error || 'No code provided'), origin));
  }

  const userId = await getUserId();
  const result = await exchangeCodeForChannel(code, userId, origin);

  if (!result.success) {
    return NextResponse.redirect(new URL('/dashboard/auto-stream?error=' + encodeURIComponent(result.message || 'Authorization failed'), origin));
  }

  return NextResponse.redirect(new URL('/dashboard/auto-stream?connected=true&channel=' + encodeURIComponent(result.channel?.title || ''), origin));
}
