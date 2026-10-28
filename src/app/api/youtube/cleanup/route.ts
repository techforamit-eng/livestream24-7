import { NextResponse } from 'next/server';
import { cleanupChannelBroadcasts } from '@/lib/youtube';
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

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const body = await req.json().catch(() => ({}));
    let { channelId } = body;
    
    const config = getConfig();
    let channels = config.connectedChannels || [];

    if (userId !== 'admin') {
      channels = channels.filter(c => (c.userId || 'admin') === userId);
    }

    if (channelId) {
      const target = (config.connectedChannels || []).find(c => c.id === channelId);
      if (!target) {
        return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
      }
      if (userId !== 'admin' && (target.userId || 'admin') !== userId) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
      }
      const res = await cleanupChannelBroadcasts(channelId);
      return NextResponse.json(res);
    }

    // Clean channels owned by user (or all if admin)
    let totalCleaned = 0;
    for (const ch of channels) {
      const res = await cleanupChannelBroadcasts(ch.id);
      if (res.success && res.cleanedCount) {
        totalCleaned += res.cleanedCount;
      }
    }

    return NextResponse.json({
      success: true,
      cleanedCount: totalCleaned,
      message: `Cleaned ${totalCleaned} duplicate/stale broadcast(s) across ${channels.length} channel(s) on YouTube!`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
