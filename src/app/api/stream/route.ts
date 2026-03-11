import { NextResponse } from 'next/server';
import { startStream, stopStream, getStreamStatus } from '@/lib/stream';

export async function GET() {
  return NextResponse.json(getStreamStatus());
}

export async function POST(req: Request) {
  const { action, streamId } = await req.json();

  if (!streamId) {
    return NextResponse.json({ success: false, message: 'streamId is required' }, { status: 400 });
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
