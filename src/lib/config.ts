import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data.json');

export interface StreamKeyProfile {
  id: string;
  name: string; // e.g. "Gaming Channel", "Tech Channel"
  youtubeRtmpUrl: string;
  streamKey: string;
}

export interface StreamInstance {
  id: string; // Unique ID for the stream process
  name: string; // Custom name for the stream (e.g. "Main Channel")
  profileId?: string; // ID referencing a StreamKeyProfile
  resolution: string; // '720p' | '1080p'
  autoStop: boolean;
  autoStopHours: number;
  autoRestart: boolean;
  autoRestartDelayMinutes: number;
  bitrate: string; // '2500k', '4000k'
  fps: string; // '30', '60'
  playlist: string[]; // array of filenames specific to this stream
}

export interface AppConfig {
  adminPassHash: string;
  streamKeys: StreamKeyProfile[];
  streams: StreamInstance[];
}

const defaultConfig: AppConfig = {
  adminPassHash: '$2b$10$4BKT.kCaV91NwZG98BlBM.i3k2KkcQkcyHDI9azCOlLs.etvAQsjK', // bcrypt hash for 'admin'
  streamKeys: [],
  streams: [
    {
      id: "default-stream-1",
      name: "Main Channel Live",
      profileId: undefined,
      resolution: '1080p',
      autoStop: false,
      autoStopHours: 1,
      autoRestart: false,
      autoRestartDelayMinutes: 5,
      bitrate: '4000k',
      fps: '60',
      playlist: [],
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
          autoStop: parsed.autoStop || false,
          autoStopHours: parsed.autoStopHours || 1,
          autoRestart: parsed.autoRestart || false,
          autoRestartDelayMinutes: parsed.autoRestartDelayMinutes || 5,
          bitrate: parsed.bitrate || '4000k',
          fps: parsed.fps || '60',
          playlist: parsed.playlist || [],
        }]
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    }
    
    // Ensure streamKeys exists
    if (!parsed.streamKeys) parsed.streamKeys = [];
    
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
