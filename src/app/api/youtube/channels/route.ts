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

export async function GET() {
  const userId = await getUserId();
  const config = getConfig();
  let channels = config.connectedChannels || [];

  if (userId !== 'admin') {
    channels = channels.filter(c => (c.userId || 'admin') === userId);
  }

  // Sanitize tokens from response
  const sanitized = channels.map(c => ({
    id: c.id,
    title: c.title,
    thumbnail: c.thumbnail,
    userId: c.userId || 'admin',
    connectedAt: c.connectedAt,
    hasRefreshToken: !!c.tokens.refresh_token
  }));

  return NextResponse.json({ success: true, channels: sanitized, userRole: userId });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  const { channelId } = await req.json();

  if (!channelId) {
    return NextResponse.json({ success: false, message: 'channelId is required' }, { status: 400 });
  }

  const config = getConfig();
  const existing = config.connectedChannels || [];
  const channel = existing.find(c => c.id === channelId);

  if (!channel) {
    return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
  }

  if (userId !== 'admin' && (channel.userId || 'admin') !== userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
  }

  const filtered = existing.filter(c => c.id !== channelId);
  saveConfig({ connectedChannels: filtered });

  return NextResponse.json({ success: true, message: 'Channel disconnected successfully.' });
}
