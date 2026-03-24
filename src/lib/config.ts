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

export interface StreamInstance {
  id: string; // Unique ID for the stream process
  userId?: string; // Optional for backward compatibility, denotes the user who owns this
  name: string; // Custom name for the stream (e.g. "Main Channel")
  profileId?: string; // ID referencing a StreamKeyProfile
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

export interface AppConfig {
  adminPassHash: string;
  userRole?: string;
  users?: UserProfile[];
  streamKeys: StreamKeyProfile[];
  streams: StreamInstance[];
}

const defaultConfig: AppConfig = {
  adminPassHash: '$2b$10$4BKT.kCaV91NwZG98BlBM.i3k2KkcQkcyHDI9azCOlLs.etvAQsjK', // bcrypt hash for 'admin'
  users: [
    { id: 'admin', username: 'admin', passwordHash: '$2b$10$4BKT.kCaV91NwZG98BlBM.i3k2KkcQkcyHDI9azCOlLs.etvAQsjK' },
    { id: 'user2', username: 'user2', passwordHash: '$2b$10$wO9nQ85S1eO2/kK3H.Q2pufN7qT2K.w5WlQo.4iI1sX0A9A8C7wY2' } // hash for Sonuvmagic@8858
  ],
  streamKeys: [],
  streams: [
    {
      id: "default-stream-1",
      name: "Main Channel Live",
      profileId: undefined,
      resolution: '1080p',
      bitrate: '4000k',
      fps: '60',
      video: '',
    }
  ]
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
          profileId: newProfileId,
          resolution: parsed.resolution || '1080p',
          bitrate: parsed.bitrate || '4000k',
          fps: parsed.fps || '60',
          video: parsed.playlist?.[0] || '',
        }]
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    
    // Ensure streamKeys exists
    if (!parsed.streamKeys) parsed.streamKeys = [];
    
    // Ensure users array exists
    if (!parsed.users || parsed.users.length === 0) {
      parsed.users = [
        { id: 'admin', username: 'admin', passwordHash: parsed.adminPassHash || defaultConfig.adminPassHash },
        // Pre-create user2 for backward compatibility if we are migrating
        { id: 'user2', username: 'user2', passwordHash: '$2b$10$n4O0Hl.33kP.A9Bw00D.kOYf.1t5E.v8R7X/S2wYw0b4q4pY5tNlK' } // This is just a fallback valid hash
      ];
    }

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
