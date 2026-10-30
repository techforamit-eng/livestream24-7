import { NextResponse } from 'next/server';
import { cleanupChannelBroadcasts, cleanupChannelStreamKeys } from '@/lib/youtube';
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

    // Identify all currently active stream IDs so we NEVER delete a key in active use!
    const activeTasks = (config.autoTasks || []).filter(t => t.state === 'streaming');
    const activeStreamIds: string[] = [];
    for (const t of activeTasks) {
      if (t.activeBroadcasts) {
        for (const b of Object.values(t.activeBroadcasts)) {
          if (b.streamId) activeStreamIds.push(b.streamId);
        }
      }
    }

    if (channelId) {
      const target = (config.connectedChannels || []).find(c => c.id === channelId);
      if (!target) {
        return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
      }
      if (userId !== 'admin' && (target.userId || 'admin') !== userId) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
      }
      const bRes = await cleanupChannelBroadcasts(channelId);
      const sRes = await cleanupChannelStreamKeys(channelId, activeStreamIds);
      const total = (bRes.cleanedCount || 0) + (sRes.cleanedCount || 0);
      return NextResponse.json({
        success: true,
        cleanedCount: total,
        message: `Cleaned ${bRes.cleanedCount || 0} stale broadcast(s) and ${sRes.cleanedCount || 0} unused stream key(s) on YouTube.`
      });
    }

    // Clean channels owned by user (or all if admin)
    let totalCleanedBroadcasts = 0;
    let totalCleanedStreams = 0;

    for (const ch of channels) {
      const bRes = await cleanupChannelBroadcasts(ch.id);
      if (bRes.success && bRes.cleanedCount) {
        totalCleanedBroadcasts += bRes.cleanedCount;
      }
      const sRes = await cleanupChannelStreamKeys(ch.id, activeStreamIds);
      if (sRes.success && sRes.cleanedCount) {
        totalCleanedStreams += sRes.cleanedCount;
      }
    }

    const grandTotal = totalCleanedBroadcasts + totalCleanedStreams;
    return NextResponse.json({
      success: true,
      cleanedCount: grandTotal,
      message: `Cleaned ${totalCleanedBroadcasts} stale broadcast(s) and ${totalCleanedStreams} unused stream key(s) across ${channels.length} channel(s) on YouTube!`
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
