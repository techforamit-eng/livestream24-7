import { spawn, ChildProcess } from 'child_process';
import { getConfig, StreamInstance } from './config';
import path from 'path';
import fs from 'fs';

const VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');
const PLAYLISTS_DIR = path.join(process.cwd(), 'public', 'playlists');

if (!fs.existsSync(PLAYLISTS_DIR)) {
  fs.mkdirSync(PLAYLISTS_DIR, { recursive: true });
}

// Resolution to scale filter mapping
const RESOLUTION_MAP: Record<string, string> = {
  '480p': '854:480',
  '720p': '1280:720',
  '1080p': '1920:1080',
  '1440p': '2560:1440',
  '2160p': '3840:2160'
};

interface ActiveStream {
  process: ChildProcess;
  status: 'Stopped' | 'Running' | 'Error';
  startTime: Date | null;
  logs: string[];
  autoStopTimeout: NodeJS.Timeout | null;
  autoRestartTimeout: NodeJS.Timeout | null;
  isScheduledRestart?: boolean;
}

const activeStreams = new Map<string, ActiveStream>();

export function addLog(streamId: string, message: string) {
  const stream = activeStreams.get(streamId);
  if (stream) {
    const time = new Date().toLocaleTimeString();
    stream.logs.push(`[${time}] ${message}`);
    if (stream.logs.length > 100) stream.logs.shift(); // Keep last 100 logs per stream
  }
}

export function startStream(streamId: string) {
  const config = getConfig();
  const streamConfig = config.streams.find((s: StreamInstance) => s.id === streamId);

  if (!streamConfig) {
    return { success: false, message: 'Stream configuration not found' };
  }

  const profile = streamConfig.profileId ? config.streamKeys.find((k: any) => k.id === streamConfig.profileId) : null;

  let stream = activeStreams.get(streamId);
  if (stream && stream.process) {
    return { success: false, message: 'This stream is already running' };
  }

  if (!profile || !profile.streamKey || !profile.youtubeRtmpUrl) {
    return { success: false, message: 'Stream Profile (URL/Key) is not selected or configured.' };
  }

  if (streamConfig.playlist.length === 0) {
    return { success: false, message: 'Playlist is empty. Add videos first.' };
  }

  // 1. Create Playlist File
  const playlistFile = path.join(PLAYLISTS_DIR, `playlist_${streamId}.txt`);
  const fileLines = streamConfig.playlist.map((video: string) => {
    // Escape single quotes for FFmpeg concat format
    const escapedVideo = video.replace(/'/g, "'\\''");
    const absolutePath = path.join(VIDEOS_DIR, escapedVideo).replace(/\\/g, '/');
    return `file '${absolutePath}'`;
  });
  fs.writeFileSync(playlistFile, fileLines.join('\n'));

  // 2. Prepare Variables
  const bitrate = streamConfig.bitrate.replace('k', ''); // Ensure we have the number
  const fps = streamConfig.fps || '30';
  const scale = RESOLUTION_MAP[streamConfig.resolution] || '1280:720';

  const rtmpUrl = profile.youtubeRtmpUrl.endsWith('/') ? profile.youtubeRtmpUrl : profile.youtubeRtmpUrl + '/';
  const outputUrl = `${rtmpUrl}${profile.streamKey}`;

  // 3. Generate FFmpeg Arguments
  const args = [
    '-re',
    '-stream_loop', '-1', // Loop indefinitely
    '-f', 'concat',
    '-safe', '0',
    '-i', playlistFile,
    '-vf', `scale=${scale}`,
    '-r', fps,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-b:v', `${bitrate}k`,
    '-maxrate', `${bitrate}k`,
    '-bufsize', `${parseInt(bitrate) * 2}k`,
    '-pix_fmt', 'yuv420p',
    '-g', '60', // Keyframe interval (approx 2s at 30fps)
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    outputUrl
  ];

  try {
    const process = spawn('ffmpeg', args, { stdio: 'pipe' });

    // Initialize stream state
    activeStreams.set(streamId, {
      process,
      status: 'Running',
      startTime: new Date(),
      logs: [],
      autoStopTimeout: null,
      autoRestartTimeout: null
    });

    const activeRecord = activeStreams.get(streamId)!;

    process.stderr?.on('data', (data: any) => {
      const msg = data.toString().trim();
      if (msg) addLog(streamId, msg);
    });

    process.on('close', (code: number | null) => {
      addLog(streamId, `FFmpeg process exited with code ${code}`);
      const current = activeStreams.get(streamId);

      if (current) {
        if (current.autoStopTimeout) clearTimeout(current.autoStopTimeout);

        // Code 255 is usually SIGINT (manual stop)
        const isManualStop = code === 255 || code === null;

        // If it's a scheduled restart or it crashed and autoRestart is on
        const shouldRestart = current.isScheduledRestart || (!isManualStop && streamConfig.autoRestart);

        if (shouldRestart) {
          current.status = 'Error';
          const delay = streamConfig.autoRestartDelayMinutes || 5;

          if (current.isScheduledRestart) {
            current.status = 'Stopped'; // Show as stopped during the scheduled wait
            addLog(streamId, `Waiting ${delay} minutes before restarting stream.`);
          } else {
            addLog(streamId, `Connection dropped/Crashed. Reconnecting in ${delay} minutes...`);
          }

          current.autoRestartTimeout = setTimeout(() => {
            activeStreams.delete(streamId);
            startStream(streamId);
          }, delay * 60000);
        } else {
          current.status = 'Stopped';
          current.startTime = null;
        }
      }
    });

    process.on('error', (err: Error) => {
      addLog(streamId, `FFmpeg process error: ${err.message}`);
      const current = activeStreams.get(streamId);
      if (current) {
        current.status = 'Error';
        current.startTime = null;
      }
    });

    if (streamConfig.autoStop && streamConfig.autoStopHours > 0) {
      activeRecord.autoStopTimeout = setTimeout(() => {
        addLog(streamId, `Hard Auto Stop reached (${streamConfig.autoStopHours} hour). Stopping stream.`);

        const current = activeStreams.get(streamId);
        if (current) {
          current.isScheduledRestart = true;
          // Kill with SIGINT to stop nicely
          current.process.kill('SIGINT');
          current.status = 'Stopped'; // Backend status update
          // We don't call stopStream here because that clears isScheduledRestart
        }
      }, streamConfig.autoStopHours * 3600000);
    }

    addLog(streamId, 'Stream started successfully');
    return { success: true, message: 'Stream started successfully.' };

  } catch (err: any) {
    return { success: false, message: 'Failed to start stream: ' + err.message };
  }
}

export function stopStream(streamId: string) {
  const stream = activeStreams.get(streamId);
  if (stream && stream.process) {
    addLog(streamId, 'Stream stopped manually.');
    stream.isScheduledRestart = false; // Break the automation loop
    stream.process.kill('SIGINT');
    stream.status = 'Stopped';
    stream.startTime = null;
    if (stream.autoStopTimeout) clearTimeout(stream.autoStopTimeout);
    if (stream.autoRestartTimeout) clearTimeout(stream.autoRestartTimeout);
    return { success: true, message: 'Stream stopped successfully.' };
  }
  return { success: false, message: 'Stream is not running.' };
}

export function getStreamStatus() {
  const config = getConfig();
  const statuses: any = {};

  config.streams.forEach((stream: StreamInstance) => {
    const active = activeStreams.get(stream.id);
    statuses[stream.id] = {
      status: active ? active.status : 'Stopped',
      uptime: active && active.startTime ? Math.floor((new Date().getTime() - active.startTime.getTime()) / 1000) : 0,
      logs: active ? active.logs : [],
    };
  });

  return statuses;
}
