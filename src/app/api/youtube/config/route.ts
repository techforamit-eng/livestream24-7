import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
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
  const config = getConfig();
  const url = new URL(req.url);
  const defaultRedirect = `${url.origin}/api/youtube/callback`;

  const apiConfig = config.googleApiConfig || {
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  };

  let effectiveRedirect = process.env.GOOGLE_REDIRECT_URI || apiConfig.redirectUri || defaultRedirect;
  // If previously saved as localhost but current request is from VPS or custom IP, auto-adapt
  if (effectiveRedirect.includes('localhost') && !url.origin.includes('localhost')) {
    effectiveRedirect = defaultRedirect;
  }

  return NextResponse.json({
    success: true,
    clientId: process.env.GOOGLE_CLIENT_ID || apiConfig.clientId || '',
    hasClientSecret: !!(process.env.GOOGLE_CLIENT_SECRET || apiConfig.clientSecret),
    redirectUri: effectiveRedirect
  });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (userId !== 'admin') {
    return NextResponse.json({ success: false, message: 'Admin access required' }, { status: 403 });
  }

  const { clientId, clientSecret, redirectUri } = await req.json();
  const config = getConfig();
  const existing = config.googleApiConfig || { clientId: '', clientSecret: '', redirectUri: '' };

  const updated = {
    clientId: clientId !== undefined ? clientId.trim() : existing.clientId,
    clientSecret: clientSecret ? clientSecret.trim() : existing.clientSecret,
    redirectUri: redirectUri !== undefined ? redirectUri.trim() : existing.redirectUri
  };

  saveConfig({ googleApiConfig: updated });
  return NextResponse.json({ success: true, message: 'Google API settings saved successfully.' });
}
