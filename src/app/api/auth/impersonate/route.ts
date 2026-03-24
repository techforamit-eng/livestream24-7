import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getConfig } from '@/lib/config';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

export async function POST(req: Request) {
  try {
    const { targetUserId } = await req.json();

    if (!targetUserId) {
      return NextResponse.json({ success: false, message: 'Target User ID required' }, { status: 400 });
    }

    // Verify current user is admin
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    let callerRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
      callerRole = decoded.role;
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
    }

    // Only admin can impersonate. When switching back to admin, callerRole is the impersonated user
    // but we stored original admin session. We allow if caller is admin OR switching back to admin.
    if (callerRole !== 'admin' && targetUserId !== 'admin') {
      return NextResponse.json({ success: false, message: 'Only admin can switch users' }, { status: 403 });
    }

    const config = getConfig();
    const targetUser = config.users?.find(u => u.id === targetUserId);

    if (!targetUser) {
      return NextResponse.json({ success: false, message: 'Target user not found' }, { status: 404 });
    }

    // Issue new token for target user with impersonation flag
    const impersonating = targetUserId !== 'admin';
    const newToken = jwt.sign(
      { role: targetUserId, isImpersonating: impersonating }, 
      JWT_SECRET, 
      { expiresIn: '1d' }
    );

    cookieStore.set('auth-token', newToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 86400,
      path: '/'
    });

    return NextResponse.json({ success: true, message: `Successfully switched to ${targetUser.username}` });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
