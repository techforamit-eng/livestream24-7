import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getConfig } from '@/lib/config';
import { startStream, stopStream } from '@/lib/stream';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

// Import from global activeStreams
function getActiveStreamsMap() {
  return (global as any).activeStreams as Map<string, any> | undefined;
}

async function getCallerRole() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    return decoded.role;
  } catch {
    return null;
  }
}

// GET: All streams from ALL users with live status
export async function GET() {
  const role = await getCallerRole();
  if (role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 });
  }

  const config = getConfig();
  const activeMap = getActiveStreamsMap();

  const allStreams = config.streams.map(stream => {
    const active = activeMap?.get(stream.id);
    const profile = config.streamKeys.find(k => k.id === stream.profileId);
    const owner = config.users?.find(u => u.id === (stream.userId || 'admin'));

    return {
      id: stream.id,
      name: stream.name,
      userId: stream.userId || 'admin',
      username: owner?.username || stream.userId || 'admin',
      resolution: stream.resolution,
      bitrate: stream.bitrate,
      fps: stream.fps,
      video: stream.video || 'None',
      profileName: profile?.name || 'Not configured',
      status: active ? active.status : 'Stopped',
      uptime: active && active.startTime
        ? Math.floor((new Date().getTime() - new Date(active.startTime).getTime()) / 1000)
        : 0,
    };
  });

  return NextResponse.json({ streams: allStreams });
}

// POST: start/stop any stream by admin
export async function POST(req: Request) {
  const role = await getCallerRole();
  if (role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 });
  }

  const { streamId, action } = await req.json();

  if (!streamId || !action) {
    return NextResponse.json({ success: false, message: 'streamId and action required' }, { status: 400 });
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
