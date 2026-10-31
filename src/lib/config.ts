import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data.json');

export interface StreamKeyProfile {
  id: string;
  userId?: string; // Optional for backward compatibility, denotes the user who owns this
  name: string; // e.g. "Gaming Channel", "Tech Channel"
  youtubeRtmpUrl: string;
  streamKey: string;
}

export interface StreamKeyCollection {
  id: string;
  userId?: string;
  name: string;
  profileIds: string[];
}

export interface StreamInstance {
  id: string; // Unique ID for the stream process
  userId?: string; // Optional for backward compatibility, denotes the user who owns this
  name: string; // Custom name for the stream (e.g. "Main Channel")
  profileIds: string[]; // IDs referencing StreamKeyProfiles
  collectionId?: string; // Reference to a StreamKeyCollection
  resolution: string; // '720p' | '1080p'
  bitrate: string; // '2500k', '4000k'
  fps: string; // '30', '60'
  video?: string; // single filename specifically for this stream
}

export interface UserProfile {
  id: string; // Also serves as the role and directory name (e.g. 'admin', 'user2', 'user_id')
  username: string;
  passwordHash: string;
}

export interface ConnectedChannel {
  id: string; // YouTube Channel ID (e.g. UC...)
  title: string;
  thumbnail?: string;
  userId: string; // which system user owns this (e.g. 'admin')
  tokens: any;
  connectedAt: string;
}

export interface ScheduleTimeSlot {
  id: string;
  label?: string; // e.g. "Morning Aarti", "Evening Bhajan"
  startTime: string; // "06:00", "18:00"
  durationMins: number; // e.g. 60, 120
  days?: number[]; // [0,1,2,3,4,5,6] (Sunday=0)
}

export interface AutoStreamTask {
  id: string;
  userId: string;
  name: string;
  channelIds: string[]; // target YouTube channel IDs
  video: string; // video filename
  cpuMode: 'ultralow' | 'custom'; // 'ultralow' = passthrough copy, 'custom' = transcode
  resolution: string; // '720p', '1080p', etc.
  bitrate: string; // '2500k', '4000k', etc.
  fps: string; // '30', '60'
  streamCount?: number; // Number of concurrent streams per channel (default: 1)
  mode: 'loop' | 'scheduled'; // Loop vs Scheduled Clock Time
  loopSettings: {
    runDurationMins: number; // e.g. 60 mins
    cooldownMins: number; // e.g. 5 mins
  };
  scheduleSettings: {
    startTime: string; // "18:00" (fallback)
    durationMins: number; // 60 or 120 (fallback)
    timeSlots?: ScheduleTimeSlot[]; // multiple schedule slots per day!
    days?: number[]; // [0,1,2,3,4,5,6] (Sunday=0)
    timezone?: string; // e.g. "Asia/Kolkata"
  };
  broadcastSettings: {
    title: string;
    description: string;
    tags?: string[]; // e.g. ["bhajan", "live", "music"]
    thumbnail?: string; // filename in public/thumbnails
    privacyStatus: 'public' | 'unlisted' | 'private';
    categoryId?: string;
  };
  enabled: boolean;
  state: 'idle' | 'starting' | 'streaming' | 'cooldown' | 'scheduled';
  activeSlotId?: string;
  sessionStartTime?: string;
  nextEventAt?: string;
  activeBroadcasts?: Record<string, { broadcastId: string; streamId: string; streamKey: string; rtmpUrl: string }>;
  pid?: number;
  logs?: string[];
}

export interface GoogleApiConfig {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export interface AppConfig {
  adminPassHash: string;
  userRole?: string;
  users?: UserProfile[];
  streamKeys: StreamKeyProfile[];
  collections?: StreamKeyCollection[];
  streams: StreamInstance[];
  connectedChannels?: ConnectedChannel[];
  autoTasks?: AutoStreamTask[];
  googleApiConfig?: GoogleApiConfig;
}

const defaultConfig: AppConfig = {
  adminPassHash: '$2b$10$4BKT.kCaV91NwZG98BlBM.i3k2KkcQkcyHDI9azCOlLs.etvAQsjK', // bcrypt hash for 'admin'
  users: [
    { id: 'admin', username: 'admin', passwordHash: '$2b$10$4BKT.kCaV91NwZG98BlBM.i3k2KkcQkcyHDI9azCOlLs.etvAQsjK' },
    { id: 'user2', username: 'user2', passwordHash: '$2b$10$wO9nQ85S1eO2/kK3H.Q2pufN7qT2K.w5WlQo.4iI1sX0A9A8C7wY2' } // hash for Sonuvmagic@8858
  ],
  streamKeys: [],
  collections: [],
  streams: [
    {
      id: "default-stream-1",
      name: "Main Channel Live",
      profileIds: [],
      resolution: '1080p',
      bitrate: '4000k',
      fps: '60',
      video: '',
    }
  ],
  connectedChannels: [],
  autoTasks: [],
  googleApiConfig: {
    clientId: '',
    clientSecret: '',
    redirectUri: '',
  }
};

export function getConfig(): AppConfig {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    const parsed = JSON.parse(data);
    // Migration for older config format
    // Migration for streamKey profiles
    if (parsed.streams) {
      const migratedStreams = parsed.streams.map((s: any) => {
        if (s.youtubeRtmpUrl || s.streamKey) {
          // If no streamKeys pool exists, make one
          if (!parsed.streamKeys) parsed.streamKeys = [];
          const newProfileId = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          parsed.streamKeys.push({
            id: newProfileId,
            name: `${s.name} Key`,
            youtubeRtmpUrl: s.youtubeRtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
            streamKey: s.streamKey || ''
          });
          const { youtubeRtmpUrl, streamKey, ...rest } = s;
          return { ...rest, profileId: newProfileId };
        }
        return s;
      });
      parsed.streams = migratedStreams;
    }

    if (!parsed.streams && parsed.youtubeRtmpUrl) {
      const newProfileId = `profile-${Date.now()}`;
      const streamKeys = [{
        id: newProfileId,
        name: "Legacy Profile",
        youtubeRtmpUrl: parsed.youtubeRtmpUrl,
        streamKey: parsed.streamKey
      }];
      const migrated: AppConfig = {
        adminPassHash: parsed.adminPassHash,
        streamKeys,
        streams: [{
          id: "default-stream-1",
          name: "Main Channel",
          profileIds: [newProfileId],
          resolution: parsed.resolution || '1080p',
          bitrate: parsed.bitrate || '4000k',
          fps: parsed.fps || '60',
          video: parsed.playlist?.[0] || '',
        }]
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    
    if (parsed.streams) {
      parsed.streams = parsed.streams.map((s: any) => {
        if (s.profileId && !s.profileIds) {
          const { profileId, ...rest } = s;
          return { ...rest, profileIds: [profileId] };
        }
        if (!s.profileIds) s.profileIds = [];
        return s;
      });
    }

    // Ensure streamKeys exists
    if (!parsed.streamKeys) parsed.streamKeys = [];
    
    // Ensure collections exists
    if (!parsed.collections) parsed.collections = [];
    
    // Ensure users array exists
    if (!parsed.users || parsed.users.length === 0) {
      parsed.users = [
        { id: 'admin', username: 'admin', passwordHash: parsed.adminPassHash || defaultConfig.adminPassHash },
        // Pre-create user2 for backward compatibility if we are migrating
        { id: 'user2', username: 'user2', passwordHash: '$2b$10$n4O0Hl.33kP.A9Bw00D.kOYf.1t5E.v8R7X/S2wYw0b4q4pY5tNlK' } // This is just a fallback valid hash
      ];
    }

    if (!parsed.connectedChannels) parsed.connectedChannels = [];
    if (!parsed.autoTasks) parsed.autoTasks = [];
    if (!parsed.googleApiConfig) parsed.googleApiConfig = { clientId: '', clientSecret: '', redirectUri: '' };

    return { ...defaultConfig, ...parsed };
  } catch (e) {
    return defaultConfig;
  }
}

export function saveConfig(newConfig: Partial<AppConfig>) {
  const current = getConfig();
  const merged = { ...current, ...newConfig };
  fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
}
