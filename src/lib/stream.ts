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
  '144p': '256:144',
  '240p': '426:240',
  '360p': '640:360',
  '480p': '854:480',
  '720p': '1280:720',
  '1080p': '1920:1080',
  '1440p': '2560:1440',
  '2160p': '3840:2160'
};

interface ActiveStream {
  process: ChildProcess;
  status: 'Stopped' | 'Running' | 'Error' | 'Waiting';
  startTime: Date | null;
  logs: string[];
}

const globalActiveStreams = (global as any).activeStreams || new Map<string, ActiveStream>();
if (process.env.NODE_ENV !== 'production') {
  (global as any).activeStreams = globalActiveStreams;
}
const activeStreams: Map<string, ActiveStream> = globalActiveStreams;

// Track PIDs for cross-restart cleanup
const PIDS_FILE = path.join(process.cwd(), 'active_pids.json');

function savePid(streamId: string, pid: number) {
  try {
    const pids = fs.existsSync(PIDS_FILE) ? JSON.parse(fs.readFileSync(PIDS_FILE, 'utf8')) : {};
    pids[streamId] = pid;
    fs.writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2));
  } catch (e) { }
}

function removePid(streamId: string) {
  try {
    if (fs.existsSync(PIDS_FILE)) {
      const pids = JSON.parse(fs.readFileSync(PIDS_FILE, 'utf8'));
      delete pids[streamId];
      fs.writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2));
    }
  } catch (e) { }
}

/**
 * Kill a process by PID robustly (cross-platform)
 */
function killProcess(pid: number) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (e) {
    // console.log(`Process ${pid} already dead or permission denied`);
  }
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Cleanup orphaned processes on module load
(function cleanupOrphans() {
  if (fs.existsSync(PIDS_FILE)) {
    try {
      const pids = JSON.parse(fs.readFileSync(PIDS_FILE, 'utf8'));
      for (const streamId in pids) {
        const pid = pids[streamId];
        if (isProcessRunning(pid)) {
          console.log(`[Stream] Killing orphaned FFmpeg process ${pid} for stream ${streamId}`);
          killProcess(pid);
        }
      }
      fs.writeFileSync(PIDS_FILE, '{}'); // Clear after cleanup
    } catch (e) { }
  }
})();

export function addLog(streamId: string, message: string) {
  const stream = activeStreams.get(streamId);
  if (stream) {
    const time = new Date().toLocaleTimeString();
    stream.logs.push(`[${time}] ${message}`);
    if (stream.logs.length > 200) stream.logs.shift(); // Keep more logs
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

  // Robust check: check if process object exists AND if it's actually running
  if (stream && stream.process && (stream.process.exitCode === null || isProcessRunning(stream.process.pid!))) {
    return { success: false, message: 'This stream is already running' };
  }

  // No-op for now as we removed timeouts
  if (stream) {
    // We can clear logs if needed, but usually we keep them
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
  const bitrate = (streamConfig.bitrate || '4000k').toString().replace('k', '');
  const fps = streamConfig.fps || '30';
  const resLimit = RESOLUTION_MAP[streamConfig.resolution] || '1280:720';
  const [w, h] = resLimit.split(':');

  const streamKey = (profile.streamKey || '').trim();
  const rawRtmpUrl = (profile.youtubeRtmpUrl || '').trim();
  const rtmpUrl = rawRtmpUrl.endsWith('/') ? rawRtmpUrl : rawRtmpUrl + '/';
  const outputUrl = `${rtmpUrl}${streamKey}`;

  // 3. Generate FFmpeg Arguments
  // Note: -stream_loop -1 must be before -i for concat demuxer to loop correctly
  const args = [
    '-loglevel', 'info',
    '-re',
    '-stream_loop', '-1',
    '-f', 'concat',
    '-safe', '0',
    '-i', playlistFile,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-r', fps,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', `${bitrate}k`,
    '-maxrate', `${bitrate}k`,
    '-bufsize', `${parseInt(bitrate) * 2}k`,
    '-pix_fmt', 'yuv420p',
    '-g', (parseInt(fps) * 2).toString(), // Dynamic keyframe interval
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    outputUrl
  ];

  try {
    // Kill any orphaned PID for this streamId just in case
    const pids = fs.existsSync(PIDS_FILE) ? JSON.parse(fs.readFileSync(PIDS_FILE, 'utf8')) : {};
    if (pids[streamId] && isProcessRunning(pids[streamId])) {
      killProcess(pids[streamId]);
    }

    console.log(`[Stream] Executing: ffmpeg ${args.join(' ')}`);
    const ffmpegProcess = spawn('ffmpeg', args, { stdio: 'pipe' });

    if (!ffmpegProcess.pid) {
      throw new Error('Failed to spawn FFmpeg process');
    }

    savePid(streamId, ffmpegProcess.pid);

    // Initialize/Update stream state
    activeStreams.set(streamId, {
      process: ffmpegProcess,
      status: 'Running',
      startTime: new Date(),
      logs: stream ? stream.logs : [], // Preserve logs if restarting
    });

    ffmpegProcess.stderr?.on('data', (data: any) => {
      const msg = data.toString().trim();
      if (msg) addLog(streamId, msg);
    });

    ffmpegProcess.on('close', (code: number | null) => {
      addLog(streamId, `FFmpeg process exited with code ${code}`);
      removePid(streamId);

      const current = activeStreams.get(streamId);
      if (current) {
        current.status = (code === 0 || code === 255) ? 'Stopped' : 'Error';
        current.startTime = null;
        current.process = undefined as any;
        addLog(streamId, `Stream stopped (Exit code: ${code})`);
      }
    });

    ffmpegProcess.on('error', (err: Error) => {
      addLog(streamId, `FFmpeg spawn error: ${err.message}`);
      const current = activeStreams.get(streamId);
      if (current) {
        current.status = 'Error';
        current.startTime = null;
      }
    });



    addLog(streamId, 'Stream process initialized.');
    return { success: true, message: 'Stream started successfully.' };

  } catch (err: any) {
    addLog(streamId, `Critical failure starting stream: ${err.message}`);
    return { success: false, message: 'Failed to start stream: ' + err.message };
  }
}

export function stopStream(streamId: string) {
  const stream = activeStreams.get(streamId);
  
  if (stream && stream.process) {
    const pid = stream.process.pid;
    addLog(streamId, `Stopping stream (PID ${pid})...`);

    if (pid && isProcessRunning(pid)) {
      killProcess(pid);
    }

    stream.status = 'Stopped';
    stream.startTime = null;

    removePid(streamId);
    return { success: true, message: 'Stream stopped successfully.' };
  }

  // If no process object but we have an entry, just reset it
  if (stream) {
    stream.status = 'Stopped';
    return { success: true, message: 'Stream status reset to Stopped.' };
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



