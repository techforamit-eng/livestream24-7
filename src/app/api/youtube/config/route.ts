import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
import { getCleanOrigin } from '@/lib/youtube';
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
  const origin = getCleanOrigin(req);
  const defaultRedirect = `${origin}/api/youtube/callback`;

  const apiConfig = config.googleApiConfig || {
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  };

  let effectiveRedirect = process.env.GOOGLE_REDIRECT_URI || apiConfig.redirectUri || defaultRedirect;
  // If previously saved as localhost or 0.0.0.0, auto-adapt to current clean origin
  if (effectiveRedirect.includes('localhost') || effectiveRedirect.includes('0.0.0.0')) {
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

  let { clientId, clientSecret, redirectUri } = await req.json();
  const config = getConfig();
  const existing = config.googleApiConfig || { clientId: '', clientSecret: '', redirectUri: '' };

  clientId = clientId !== undefined ? clientId.trim() : existing.clientId;
  clientSecret = clientSecret ? clientSecret.trim() : existing.clientSecret;

  // Auto-correct if user accidentally swapped Client ID and Secret in settings
  if (clientId.startsWith('GOCSPX-') && clientSecret.includes('.apps.googleusercontent.com')) {
    const temp = clientId;
    clientId = clientSecret;
    clientSecret = temp;
  }

  const updated = {
    clientId,
    clientSecret,
    redirectUri: redirectUri !== undefined ? redirectUri.trim() : existing.redirectUri
  };

  saveConfig({ googleApiConfig: updated });
  return NextResponse.json({ success: true, message: 'Google API settings saved successfully.' });
}
