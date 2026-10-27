import { NextResponse } from 'next/server';
import { exchangeCodeForChannel } from '@/lib/youtube';
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
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard/auto-stream?error=' + encodeURIComponent(error || 'No code provided'), url.origin));
  }

  const userId = await getUserId();
  const result = await exchangeCodeForChannel(code, userId, url.origin);

  if (!result.success) {
    return NextResponse.redirect(new URL('/dashboard/auto-stream?error=' + encodeURIComponent(result.message || 'Authorization failed'), url.origin));
  }

  return NextResponse.redirect(new URL('/dashboard/auto-stream?connected=true&channel=' + encodeURIComponent(result.channel?.title || ''), url.origin));
}
