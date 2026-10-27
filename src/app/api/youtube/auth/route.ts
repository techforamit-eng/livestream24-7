import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/youtube';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.origin;
    const authUrl = getAuthUrl(origin);
    return NextResponse.json({ success: true, url: authUrl });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
