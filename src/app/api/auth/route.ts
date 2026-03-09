import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getConfig } from '@/lib/config';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    const config = getConfig();

    const isMatch = await bcrypt.compare(password, config.adminPassHash);
    
    if (isMatch) {
      const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
      const cookieStore = await cookies();
      cookieStore.set('auth-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400,
        path: '/'
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: 'Invalid password' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('auth-token');
  return NextResponse.json({ success: true });
}
