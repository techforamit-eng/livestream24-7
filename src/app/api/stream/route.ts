import { NextResponse } from 'next/server';
import { startStream, stopStream, getStreamStatus } from '@/lib/stream';
import { getConfig } from '@/lib/config';
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

export async function GET() {
  const userId = await getUserId();
  return NextResponse.json(getStreamStatus(userId));
}

export async function POST(req: Request) {
  const { action, streamId } = await req.json();

  if (!streamId) {
    return NextResponse.json({ success: false, message: 'streamId is required' }, { status: 400 });
  }

  const userId = await getUserId();

  if (userId !== 'admin') {
    const config = getConfig();
    const streamConfig = config.streams.find(s => s.id === streamId);
    if (!streamConfig || (streamConfig.userId || 'admin') !== userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }
  }

  if (action === 'start') {
    const res = startStream(streamId);
    return NextResponse.json(res);
  }

  if (action === 'stop') {
    const res = stopStream(streamId);
    return NextResponse.json(res);
  }

  return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
}
