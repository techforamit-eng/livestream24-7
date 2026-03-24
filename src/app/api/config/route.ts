import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

async function getUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return { role: 'admin', isImpersonating: false };
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string; isImpersonating?: boolean };
    return {
      role: decoded.role || 'admin',
      isImpersonating: !!decoded.isImpersonating
    };
  } catch (err) {
    return { role: 'admin', isImpersonating: false };
  }
}

export async function GET() {
  const session = await getUserSession();
  const role = session.role;
  const config = getConfig();

  // Filter streams and streamKeys based on role
  // If role is admin, show where userId is 'admin' or undefined
  const filteredStreams = config.streams.filter(s => {
    const sUserId = s.userId || 'admin';
    return sUserId === role;
  });

  const filteredKeys = config.streamKeys.filter(k => {
    const kUserId = k.userId || 'admin';
    return kUserId === role;
  });

  const { adminPassHash, ...safeConfig } = config;

  return NextResponse.json({
    ...safeConfig,
    streams: filteredStreams,
    streamKeys: filteredKeys,
    userRole: role,
    isImpersonating: session.isImpersonating
  });
}

export async function POST(req: Request) {
  try {
    const data = await req.json();

    // Validate if necessary, but for now we just save partial updates
    // Optional: if data includes a new password, we'd hash it here before saving.
    const session = await getUserSession();
    const role = session.role;

    const currentConfig = getConfig();
    if (data.newPassword) {
      const bcrypt = require('bcryptjs');
      const hashed = await bcrypt.hash(data.newPassword, 10);

      // Update global admin pass for backward compatibility
      if (role === 'admin') {
        data.adminPassHash = hashed;
      }

      // Update specific user in the users array
      if (currentConfig.users) {
        data.users = currentConfig.users.map((u: any) =>
          u.id === role ? { ...u, passwordHash: hashed } : u
        );
      }
      delete data.newPassword;
    }

    // Merge streams
    if (data.streams) {
      const otherUserStreams = currentConfig.streams.filter(s => {
        const sUserId = s.userId || 'admin';
        return sUserId !== role;
      });
      const userStreams = data.streams.map((s: any) => ({ ...s, userId: role }));
      data.streams = [...otherUserStreams, ...userStreams];
    }

    // Merge streamKeys
    if (data.streamKeys) {
      const otherUserKeys = currentConfig.streamKeys.filter(k => {
        const kUserId = k.userId || 'admin';
        return kUserId !== role;
      });
      const userKeys = data.streamKeys.map((k: any) => ({ ...k, userId: role }));
      data.streamKeys = [...otherUserKeys, ...userKeys];
    }

    saveConfig(data);
    return NextResponse.json({ success: true, message: 'Configuration saved.' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to save config' }, { status: 500 });
  }
}
