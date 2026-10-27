import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getConfig, saveConfig, AutoStreamTask } from './config';
import { createLiveBroadcastAndStream, transitionBroadcast } from './youtube';
import { getFFmpegPath } from './ffmpegPath';

const VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');

interface ActiveAutoTask {
  process?: ChildProcess;
  activeBroadcasts?: Record<string, { broadcastId: string; streamId: string; streamKey: string; rtmpUrl: string }>;
  logs: string[];
}

const activeAutoTasks: Map<string, ActiveAutoTask> = (global as any).activeAutoTasks || new Map<string, ActiveAutoTask>();
(global as any).activeAutoTasks = activeAutoTasks;

function addAutoLog(taskId: string, message: string) {
  let active = activeAutoTasks.get(taskId);
  if (!active) {
    active = { logs: [] };
    activeAutoTasks.set(taskId, active);
  }
  const time = new Date().toLocaleTimeString();
  active.logs.push(`[${time}] ${message}`);
  if (active.logs.length > 100) active.logs.shift();
}

function killProcess(pid: number) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (e) {}
}

/**
 * Start streaming for an automated task
 */
export async function startAutoStreamTask(task: AutoStreamTask, customDurationMins?: number, slotId?: string): Promise<{ success: boolean; message: string }> {
  try {
    addAutoLog(task.id, `Preparing stream session for task "${task.name}"...`);

    // 1. Check video
    const role = task.userId || 'admin';
    const videoPath = path.join(VIDEOS_DIR, role, task.video);
    if (!fs.existsSync(videoPath)) {
      addAutoLog(task.id, `Error: Video file "${task.video}" not found on disk.`);
      return { success: false, message: `Video file "${task.video}" not found on disk.` };
    }

    // 2. Check target channels
    if (!task.channelIds || task.channelIds.length === 0) {
      addAutoLog(task.id, `Error: No target YouTube channels selected.`);
      return { success: false, message: 'No target YouTube channels selected.' };
    }

    addAutoLog(task.id, `Connecting to ${task.channelIds.length} YouTube channel(s) via API...`);
    const activeBroadcasts: Record<string, { broadcastId: string; streamId: string; streamKey: string; rtmpUrl: string }> = {};
    const endpoints: { url: string; key: string }[] = [];

    // Resolve thumbnail path if set
    const thumbnailPath = task.broadcastSettings?.thumbnail
      ? path.join(process.cwd(), 'public', 'thumbnails', role, task.broadcastSettings.thumbnail)
      : undefined;

    // Create YouTube broadcast & stream for each channel
    for (const channelId of task.channelIds) {
      try {
        const streamInfo = await createLiveBroadcastAndStream(channelId, {
          title: task.broadcastSettings?.title || task.name,
          description: task.broadcastSettings?.description || 'Automated 24/7 stream',
          tags: task.broadcastSettings?.tags || [],
          thumbnailPath,
          privacyStatus: task.broadcastSettings?.privacyStatus || 'public',
          categoryId: task.broadcastSettings?.categoryId || '10'
        });
        activeBroadcasts[channelId] = streamInfo;
        endpoints.push({ url: streamInfo.rtmpUrl, key: streamInfo.streamKey });
        addAutoLog(task.id, `Created YouTube broadcast for channel ${channelId} (ID: ${streamInfo.broadcastId}) with Title, Description, Tags & Thumbnail`);
      } catch (err: any) {
        addAutoLog(task.id, `Failed to create broadcast on channel ${channelId}: ${err.message}`);
      }
    }

    if (endpoints.length === 0) {
      addAutoLog(task.id, `Error: Could not create broadcasts on any channel.`);
      return { success: false, message: 'Could not create broadcasts on any connected channel.' };
    }

    // 3. Build FFmpeg command with ultra-low CPU optimization
    const isUltraLow = task.cpuMode !== 'custom';
    const normalizedVideo = videoPath.replace(/\\/g, '/');

    let outputFormat = 'flv';
    let outputUrl = '';

    if (endpoints.length === 1) {
      const ep = endpoints[0];
      const rtmpBase = ep.url.endsWith('/') ? ep.url : ep.url + '/';
      outputUrl = `${rtmpBase}${ep.key.trim()}`;
    } else {
      outputFormat = 'tee';
      outputUrl = endpoints.map(ep => {
        const rtmpBase = ep.url.endsWith('/') ? ep.url : ep.url + '/';
        const full = `${rtmpBase}${ep.key.trim()}`;
        return `[f=fifo:fifo_format=flv:onfail=ignore:drop_pkts_on_overflow=1:attempt_recovery=1:recovery_wait_time=1:format_opts=flvflags\\=no_duration_filesize]${full}`;
      }).join('|');
    }

    let args: string[] = [
      '-loglevel', 'info',
      '-re',
      '-stream_loop', '-1',
      '-fflags', '+genpts+igndts',
      '-i', normalizedVideo,
    ];

    if (isUltraLow) {
      // Direct stream copy - near 0% CPU consumption!
      args.push(
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100'
      );
    } else {
      // Transcode / custom quality with low-CPU profile
      const bitrate = (task.bitrate || '4000k').replace('k', '');
      const fps = task.fps || '30';
      const resMap: Record<string, string> = {
        '720p': '1280:720',
        '1080p': '1920:1080',
        '480p': '854:480',
        '360p': '640:360'
      };
      const [w, h] = (resMap[task.resolution] || '1280:720').split(':');

      args.push(
        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
        '-r', fps,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-threads', '2', // Prevent VPS CPU overloading
        '-b:v', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${parseInt(bitrate) * 2}k`,
        '-pix_fmt', 'yuv420p',
        '-g', (parseInt(fps) * 2).toString(),
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100'
      );
    }

    if (outputFormat === 'tee') {
      args.push('-f', 'tee', '-map', '0:v', '-map', '0:a', '-flags', '+global_header');
    } else {
      args.push('-f', 'flv', '-flvflags', 'no_duration_filesize');
    }

    args.push('-flush_packets', '1');
    args.push(outputUrl);

    const ffmpegBin = getFFmpegPath();
    addAutoLog(task.id, `Starting FFmpeg process (${isUltraLow ? 'Ultra-low CPU Copy Mode' : 'Custom Transcode Mode'})...`);
    const proc = spawn(ffmpegBin, args, { stdio: 'pipe' });

    if (!proc.pid) {
      throw new Error('Failed to spawn FFmpeg process');
    }

    const durationMins = customDurationMins || (
      task.mode === 'loop' 
        ? (task.loopSettings?.runDurationMins || 60)
        : (task.scheduleSettings?.durationMins || 60)
    );

    const nextEventAt = new Date(Date.now() + durationMins * 60 * 1000).toISOString();

    activeAutoTasks.set(task.id, {
      process: proc,
      activeBroadcasts,
      logs: activeAutoTasks.get(task.id)?.logs || []
    });

    // Update task in config
    const config = getConfig();
    const updatedTasks = (config.autoTasks || []).map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          state: 'streaming' as const,
          activeSlotId: slotId,
          sessionStartTime: new Date().toISOString(),
          nextEventAt,
          activeBroadcasts
        };
      }
      return t;
    });
    saveConfig({ autoTasks: updatedTasks });

    proc.stderr?.on('data', (d: any) => {
      const msg = d.toString().trim();
      if (msg) addAutoLog(task.id, msg);
    });

    proc.on('close', (code) => {
      addAutoLog(task.id, `FFmpeg process exited (Code: ${code})`);
      const current = activeAutoTasks.get(task.id);
      if (current) current.process = undefined;
    });

    addAutoLog(task.id, `Stream is LIVE! Will run for ${durationMins} minutes until ${new Date(nextEventAt).toLocaleTimeString()}`);
    return { success: true, message: 'Stream started successfully.' };

  } catch (err: any) {
    addAutoLog(task.id, `Failed to start stream: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Stop streaming for an automated task
 */
export async function stopAutoStreamTask(taskId: string, reason: string = 'Session completed'): Promise<{ success: boolean; message: string }> {
  try {
    addAutoLog(taskId, `Stopping stream (${reason})...`);
    const active = activeAutoTasks.get(taskId);

    if (active && active.process && active.process.pid) {
      killProcess(active.process.pid);
      active.process = undefined;
    }

    // Complete YouTube broadcasts
    const config = getConfig();
    const task = (config.autoTasks || []).find(t => t.id === taskId);
    const broadcasts = active?.activeBroadcasts || task?.activeBroadcasts || {};

    for (const [channelId, info] of Object.entries(broadcasts)) {
      if (info && info.broadcastId) {
        try {
          await transitionBroadcast(channelId, info.broadcastId, 'complete');
          addAutoLog(taskId, `Completed YouTube broadcast ${info.broadcastId} for channel ${channelId}`);
        } catch (e) {}
      }
    }

    return { success: true, message: 'Stream stopped successfully.' };
  } catch (err: any) {
    addAutoLog(taskId, `Error stopping stream: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Tick handler evaluated periodically
 */
async function processAutomationTick() {
  const config = getConfig();
  const tasks = config.autoTasks || [];
  if (tasks.length === 0) return;

  const now = Date.now();

  for (const task of tasks) {
    if (!task.enabled) continue;

    // 1. Loop Mode Handling
    if (task.mode === 'loop') {
      const runDurationMins = task.loopSettings?.runDurationMins || 60;
      const cooldownMins = task.loopSettings?.cooldownMins || 5;

      if (task.state === 'idle') {
        // Start stream immediately
        await startAutoStreamTask(task);
      } else if (task.state === 'streaming') {
        // Check if stream run duration is over
        if (task.nextEventAt && now >= new Date(task.nextEventAt).getTime()) {
          addAutoLog(task.id, `Stream duration (${runDurationMins}m) complete. Entering cooldown for ${cooldownMins} minutes...`);
          await stopAutoStreamTask(task.id, 'Run duration completed');

          const cooldownEnd = new Date(now + cooldownMins * 60 * 1000).toISOString();
          const updated = (getConfig().autoTasks || []).map(t => {
            if (t.id === task.id) {
              return {
                ...t,
                state: 'cooldown' as const,
                nextEventAt: cooldownEnd,
                sessionStartTime: undefined,
                activeBroadcasts: undefined
              };
            }
            return t;
          });
          saveConfig({ autoTasks: updated });
        }
      } else if (task.state === 'cooldown') {
        // Check if cooldown period is over
        if (task.nextEventAt && now >= new Date(task.nextEventAt).getTime()) {
          addAutoLog(task.id, `Cooldown period complete. Restarting loop cycle!`);
          await startAutoStreamTask(task);
        }
      }
    }

    // 2. Scheduled Mode Handling
    else if (task.mode === 'scheduled') {
      const currentDate = new Date();
      const currentH = currentDate.getHours();
      const currentM = currentDate.getMinutes();
      const currentDay = currentDate.getDay(); // 0 = Sunday

      // Support multiple time slots per day!
      const slots = (task.scheduleSettings?.timeSlots && task.scheduleSettings.timeSlots.length > 0)
        ? task.scheduleSettings.timeSlots
        : [{
            id: 'default',
            label: 'Default Schedule',
            startTime: task.scheduleSettings?.startTime || '18:00',
            durationMins: task.scheduleSettings?.durationMins || 60,
            days: task.scheduleSettings?.days
          }];

      if (task.state === 'streaming') {
        // Check if duration expired
        if (task.nextEventAt && now >= new Date(task.nextEventAt).getTime()) {
          addAutoLog(task.id, `Scheduled slot duration complete. Stopping stream.`);
          await stopAutoStreamTask(task.id, 'Scheduled slot duration completed');

          const updated = (getConfig().autoTasks || []).map(t => {
            if (t.id === task.id) {
              return {
                ...t,
                state: 'scheduled' as const,
                activeSlotId: undefined,
                sessionStartTime: undefined,
                nextEventAt: undefined,
                activeBroadcasts: undefined
              };
            }
            return t;
          });
          saveConfig({ autoTasks: updated });
        }
      } else {
        // Check if current time matches ANY active time slot for today
        for (const slot of slots) {
          if (slot.days && slot.days.length > 0 && !slot.days.includes(currentDay)) {
            continue;
          }

          const [slotH, slotM] = (slot.startTime || '18:00').split(':').map(Number);
          if (currentH === slotH && currentM === slotM) {
            const lastStart = task.sessionStartTime ? new Date(task.sessionStartTime).getTime() : 0;
            // Prevent multiple triggers within the same 2 minutes
            if (now - lastStart > 120 * 1000) {
              addAutoLog(task.id, `Clock reached ${slot.startTime}! Launching scheduled slot "${slot.label || slot.startTime}" (${slot.durationMins}m)...`);
              await startAutoStreamTask(task, slot.durationMins, slot.id);
              break;
            }
          }
        }
      }
    }
  }
}

/**
 * Initialize background scheduler daemon
 */
export function initAutomationScheduler() {
  if ((global as any).__schedulerInitialized) return;
  (global as any).__schedulerInitialized = true;

  console.log('[Scheduler] Background stream automation engine started.');
  // Check every 10 seconds
  setInterval(() => {
    processAutomationTick().catch(err => {
      console.error('[Scheduler] Error in tick:', err);
    });
  }, 10000);
}

export function getAutoTaskStatuses() {
  const config = getConfig();
  const tasks = config.autoTasks || [];
  const result: Record<string, any> = {};

  tasks.forEach(t => {
    const active = activeAutoTasks.get(t.id);
    result[t.id] = {
      state: t.state,
      sessionStartTime: t.sessionStartTime,
      nextEventAt: t.nextEventAt,
      logs: active?.logs || [],
      enabled: t.enabled
    };
  });

  return result;
}
