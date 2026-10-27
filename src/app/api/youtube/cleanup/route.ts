import { NextResponse } from 'next/server';
import { cleanupChannelBroadcasts } from '@/lib/youtube';
import { getConfig } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let { channelId } = body;
    
    const config = getConfig();
    const channels = config.connectedChannels || [];

    if (channelId) {
      const res = await cleanupChannelBroadcasts(channelId);
      return NextResponse.json(res);
    }

    // If no channelId passed, clean all connected channels
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
