import { google } from 'googleapis';
import fs from 'fs';
import { getConfig, saveConfig, ConnectedChannel } from './config';

/**
 * Get OAuth2 Client configured with credentials from config or env
 */
export function getOAuth2Client(customRedirectUri?: string) {
  const config = getConfig();
  const clientId = process.env.GOOGLE_CLIENT_ID || config.googleApiConfig?.clientId || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || config.googleApiConfig?.clientSecret || '';
  const redirectUri = customRedirectUri || process.env.GOOGLE_REDIRECT_URI || config.googleApiConfig?.redirectUri || 'http://localhost:3000/api/youtube/callback';

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth authorization URL
 */
export function getAuthUrl(originUrl?: string) {
  const redirectUri = originUrl ? `${originUrl.replace(/\/$/, '')}/api/youtube/callback` : undefined;
  const oauth2Client = getOAuth2Client(redirectUri);

  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent', // Ensures brand accounts & accounts can be selected repeatedly
    scope: scopes,
  });
}

/**
 * Exchange auth code for tokens and fetch YouTube channel info
 */
export async function exchangeCodeForChannel(code: string, userId: string, originUrl?: string): Promise<{ success: boolean; channel?: ConnectedChannel; message?: string }> {
  try {
    const redirectUri = originUrl ? `${originUrl.replace(/\/$/, '')}/api/youtube/callback` : undefined;
    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const res = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true
    });

    const items = res.data.items;
    if (!items || items.length === 0) {
      return { success: false, message: 'No YouTube channel found for this Google account.' };
    }

    const config = getConfig();
    let currentChannels = config.connectedChannels || [];
    let primaryChannel: ConnectedChannel | undefined;

    for (const channelItem of items) {
      const channelId = channelItem.id!;
      const title = channelItem.snippet?.title || 'YouTube Channel';
      const thumbnail = channelItem.snippet?.thumbnails?.default?.url || '';

      const previous = currentChannels.find(c => c.id === channelId);
      const newChannel: ConnectedChannel = {
        id: channelId,
        title,
        thumbnail,
        userId,
        tokens: {
          ...tokens,
          refresh_token: tokens.refresh_token || previous?.tokens?.refresh_token
        },
        connectedAt: new Date().toISOString()
      };

      currentChannels = currentChannels.filter(c => c.id !== channelId);
      currentChannels.push(newChannel);
      if (!primaryChannel) primaryChannel = newChannel;
    }

    saveConfig({ connectedChannels: currentChannels });
    return { success: true, channel: primaryChannel };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to authorize with YouTube' };
  }
}

/**
 * Get an authenticated YouTube API client for a specific channel
 */
export async function getAuthenticatedYouTube(channelId: string) {
  const config = getConfig();
  const channel = (config.connectedChannels || []).find(c => c.id === channelId);
  if (!channel) {
    throw new Error(`Channel ${channelId} not found in connected channels`);
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(channel.tokens);

  // If token is expired or expiring in next 60s, refresh it
  oauth2Client.on('tokens', (newTokens) => {
    const updatedChannel: ConnectedChannel = {
      ...channel,
      tokens: {
        ...channel.tokens,
        ...newTokens,
        refresh_token: newTokens.refresh_token || channel.tokens.refresh_token
      }
    };
    const currentChannels = (getConfig().connectedChannels || []).map(c => c.id === channelId ? updatedChannel : c);
    saveConfig({ connectedChannels: currentChannels });
  });

  return google.youtube({ version: 'v3', auth: oauth2Client });
}

/**
 * Create Live Broadcast, create Live Stream, and bind them
 * Returns RTMP Ingestion URL and Stream Key
 */
export async function createLiveBroadcastAndStream(channelId: string, options: {
  title: string;
  description: string;
  tags?: string[];
  thumbnailPath?: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  categoryId?: string;
}) {
  const youtube = await getAuthenticatedYouTube(channelId);

  // 1. Create Live Broadcast with AutoStart and AutoStop enabled
  const scheduledStartTime = new Date(Date.now() + 60 * 1000).toISOString(); // 1 minute in future
  const broadcastRes = await youtube.liveBroadcasts.insert({
    part: ['snippet', 'status', 'contentDetails'],
    requestBody: {
      snippet: {
        title: options.title || `Live Stream - ${new Date().toLocaleString()}`,
        description: options.description || 'Automated Live Stream via VMagic',
        scheduledStartTime: scheduledStartTime
      },
      status: {
        privacyStatus: options.privacyStatus || 'public',
        selfDeclaredMadeForKids: false
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        recordFromStart: true
      }
    }
  });

  const broadcastId = broadcastRes.data.id!;

  // 2. Create Live Stream (RTMP ingestion endpoint)
  const streamRes = await youtube.liveStreams.insert({
    part: ['snippet', 'cdn', 'status'],
    requestBody: {
      snippet: {
        title: `Stream for ${options.title.substring(0, 50)}`
      },
      cdn: {
        frameRate: 'variable',
        ingestionType: 'rtmp',
        resolution: 'variable'
      }
    }
  });

  const streamId = streamRes.data.id!;
  const rtmpUrl = streamRes.data.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2';
  const streamKey = streamRes.data.cdn?.ingestionInfo?.streamName || '';

  // 3. Bind Broadcast to Stream
  await youtube.liveBroadcasts.bind({
    id: broadcastId,
    part: ['id', 'contentDetails'],
    streamId: streamId
  });

  // 4. Update Video Tags & Category if specified
  if (options.tags && options.tags.length > 0) {
    try {
      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: broadcastId,
          snippet: {
            title: options.title || `Live Stream - ${new Date().toLocaleString()}`,
            description: options.description || 'Automated Live Stream via VMagic',
            categoryId: options.categoryId || '10', // Default 10 = Music
            tags: options.tags
          }
        }
      });
    } catch (tagErr: any) {
      console.warn(`[YouTube] Could not set tags for broadcast ${broadcastId}:`, tagErr.message);
    }
  }

  // 5. Upload Custom Thumbnail if provided
  if (options.thumbnailPath && fs.existsSync(options.thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId: broadcastId,
        media: {
          mimeType: options.thumbnailPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          body: fs.createReadStream(options.thumbnailPath)
        }
      });
    } catch (thumbErr: any) {
      console.warn(`[YouTube] Could not upload thumbnail for broadcast ${broadcastId}:`, thumbErr.message);
    }
  }

  return {
    broadcastId,
    streamId,
    rtmpUrl,
    streamKey
  };
}

/**
 * Transition broadcast status (e.g. 'live' or 'complete')
 */
export async function transitionBroadcast(channelId: string, broadcastId: string, broadcastStatus: 'testing' | 'live' | 'complete') {
  try {
    const youtube = await getAuthenticatedYouTube(channelId);
    const res = await youtube.liveBroadcasts.transition({
      id: broadcastId,
      broadcastStatus,
      part: ['id', 'status']
    });
    return { success: true, status: res.data.status?.lifeCycleStatus };
  } catch (err: any) {
    // Some transitions might throw if already completed or auto-transitioned
    return { success: false, message: err.message };
  }
}

/**
 * Delete a broadcast (optional cleanup)
 */
export async function deleteBroadcast(channelId: string, broadcastId: string) {
  try {
    const youtube = await getAuthenticatedYouTube(channelId);
    await youtube.liveBroadcasts.delete({ id: broadcastId });
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
