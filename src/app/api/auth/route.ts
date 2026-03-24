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

    let matchedRole: string | null = null;

    if (config.users) {
      for (const u of config.users) {
        let isMatch = false;
        try {
          // Backward compatibility: If the password hash stored is the raw password (if someone modified it without hashing)
          if (!u.passwordHash.startsWith('$')) {
            isMatch = password === u.passwordHash;
          } else {
            isMatch = await bcrypt.compare(password, u.passwordHash);
          }
        } catch (e) { }

        if (isMatch) {
          matchedRole = u.id;
          break;
        }
      }
    }

    // Fallback for hardcoded second user if somehow deleted
    if(!matchedRole && password === 'Sonuvmagic@8858') matchedRole = 'user2';

    // Legacy fallback
    if (!matchedRole && config.adminPassHash) {
      const legacyMatch = await bcrypt.compare(password, config.adminPassHash);
      if (legacyMatch) matchedRole = 'admin';
    }

    if (matchedRole) {
      const token = jwt.sign({ role: matchedRole }, JWT_SECRET, { expiresIn: '1d' });
      const cookieStore = await cookies();
      cookieStore.set('auth-token', token, {
        httpOnly: true,
        // Set to false for now so login works on VPS IP address without SSL
        secure: false, 
        sameSite: 'lax', 
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
