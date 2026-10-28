import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getConfig, saveConfig, AutoStreamTask } from './config';
import { createLiveBroadcastAndStream, transitionBroadcast, endOrCleanupBroadcast } from './youtube';
import { getFFmpegPath } from './ffmpegPath';

const VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');
const AUTO_PIDS_FILE = path.join(process.cwd(), 'active_auto_pids.json');

// Global mutex to prevent duplicate parallel start executions
const startingTasks: Set<string> = (global as any).startingTasks || new Set<string>();
(global as any).startingTasks = startingTasks;

export interface ActiveAutoTaskInfo {
  process?: ChildProcess;
  pid?: number;
  activeBroadcasts?: Record<string, { broadcastId: string; streamId: string; streamKey: string; rtmpUrl: string }>;
  logs: string[];
  stopTimer?: NodeJS.Timeout;
  isStopping?: boolean;
}

// Preserve activeAutoTasks across hot-reloads and module evaluations
export const activeAutoTasks: Map<string, ActiveAutoTaskInfo> =
  (global as any).activeAutoTasks || new Map<string, ActiveAutoTaskInfo>();
(global as any).activeAutoTasks = activeAutoTasks;

function addAutoLog(taskId: string, message: string) {
  let active = activeAutoTasks.get(taskId);
  if (!active) {
    active = { logs: [] };
    activeAutoTasks.set(taskId, active);
  }
  const time = new Date().toLocaleTimeString();
  active.logs.push(`[${time}] ${message}`);
  if (active.logs.length > 150) active.logs.shift();
}

// Persist PIDs on disk for reliable multi-process cleanup
function saveAutoTaskPid(taskId: string, pid: number) {
  try {
    const pids = fs.existsSync(AUTO_PIDS_FILE) ? JSON.parse(fs.readFileSync(AUTO_PIDS_FILE, 'utf8')) : {};
    pids[taskId] = pid;
    fs.writeFileSync(AUTO_PIDS_FILE, JSON.stringify(pids, null, 2));
  } catch (e) { }
}

function removeAutoTaskPid(taskId: string) {
  try {
    if (fs.existsSync(AUTO_PIDS_FILE)) {
      const pids = JSON.parse(fs.readFileSync(AUTO_PIDS_FILE, 'utf8'));
      delete pids[taskId];
      fs.writeFileSync(AUTO_PIDS_FILE, JSON.stringify(pids, null, 2));
    }
  } catch (e) { }
}

function getTaskPid(taskId: string): number | undefined {
  const active = activeAutoTasks.get(taskId);
  if (active?.pid) return active.pid;
  if (active?.process?.pid) return active.process.pid;

  // Check data.json
  const config = getConfig();
  const task = (config.autoTasks || []).find(t => t.id === taskId);
  if (task?.pid) return task.pid;

  // Check active_auto_pids.json
  try {
    if (fs.existsSync(AUTO_PIDS_FILE)) {
      const pids = JSON.parse(fs.readFileSync(AUTO_PIDS_FILE, 'utf8'));
      if (pids[taskId]) return pids[taskId];
    }
  } catch (e) { }

  return undefined;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function killProcess(pid: number) {
  try {
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } catch (e) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (e2) { }
      }
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (e) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (e2) { }
      }
      try {
        execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore' });
      } catch (e) { }
    }
  } catch (e) { }
}

// Cleanup orphaned AutoStream processes on startup
(function cleanupAutoOrphans() {
  if (fs.existsSync(AUTO_PIDS_FILE)) {
    try {
      const pids = JSON.parse(fs.readFileSync(AUTO_PIDS_FILE, 'utf8'));
      for (const taskId in pids) {
        const pid = pids[taskId];
        if (pid && isProcessRunning(pid)) {
          console.log(`[Scheduler] Cleaning orphaned Auto-Stream FFmpeg process ${pid} for container ${taskId}`);
          killProcess(pid);
        }
      }
      fs.writeFileSync(AUTO_PIDS_FILE, '{}');
    } catch (e) { }
  }
})();

/**
 * Handle stream duration completion (Loop Cooldown or Permanent Stop)
 */
export async function handleDurationCompleted(taskId: string) {
  const config = getConfig();
  const task = (config.autoTasks || []).find(t => t.id === taskId);
  if (!task) return;

  // Clear timer if set
  const active = activeAutoTasks.get(taskId);
  if (active?.stopTimer) {
    clearTimeout(active.stopTimer);
    active.stopTimer = undefined;
  }

  // 1. Stop streaming and complete YouTube broadcast
  await stopAutoStreamTask(taskId, 'Run duration completed');

  // 2. Decide next state
  if (task.mode === 'loop') {
    const duration = Number(task.loopSettings?.runDurationMins) || 5;
    const cooldownMins = Number(task.loopSettings?.cooldownMins) || 2;
    const cooldownEnd = new Date(Date.now() + cooldownMins * 60 * 1000).toISOString();

    addAutoLog(taskId, `Stream duration (${duration}m) complete! Taking a ${cooldownMins}m cooldown break. Next stream will restart at ${new Date(cooldownEnd).toLocaleTimeString()}...`);

    const updated = (getConfig().autoTasks || []).map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          state: 'cooldown' as const,
          nextEventAt: cooldownEnd,
          pid: undefined,
          sessionStartTime: undefined,
          activeBroadcasts: undefined
        };
      }
      return t;
    });
    saveConfig({ autoTasks: updated });

    // Set dedicated timer to automatically restart next cycle after cooldown
    const cooldownMs = cooldownMins * 60 * 1000;
    const restartTimer = setTimeout(async () => {
      const cfg = getConfig();
      const current = (cfg.autoTasks || []).find(t => t.id === taskId);
      if (current && current.enabled && current.state === 'cooldown') {
        addAutoLog(taskId, `Cooldown break (${cooldownMins}m) complete! Restarting loop cycle now...`);
        await startAutoStreamTask(current);
      }
    }, cooldownMs);

    const activeInfo = activeAutoTasks.get(taskId);
    if (activeInfo) activeInfo.stopTimer = restartTimer;

    return;
  } else if (task.mode === 'scheduled') {
    addAutoLog(taskId, `Scheduled slot duration completed. Stream stopped.`);
    const updated = (getConfig().autoTasks || []).map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          state: 'scheduled' as const,
          activeSlotId: undefined,
          pid: undefined,
          sessionStartTime: undefined,
          nextEventAt: undefined,
          activeBroadcasts: undefined
        };
      }
      return t;
    });
    saveConfig({ autoTasks: updated });
  }
}

/**
 * Start streaming for an automated task
 */
export async function startAutoStreamTask(task: AutoStreamTask, customDurationMins?: number, slotId?: string): Promise<{ success: boolean; message: string }> {
  // 1. Guard against duplicate concurrent executions
  if (startingTasks.has(task.id)) {
    addAutoLog(task.id, 'Task initialization already in progress. Duplicate start call ignored.');
    return { success: false, message: 'Stream initialization is already in progress.' };
  }

  const existingPid = getTaskPid(task.id);
  const existing = activeAutoTasks.get(task.id);
  if ((existing && existing.process && existing.process.pid) || (existingPid && existingPid > 0 && task.state === 'streaming')) {
    addAutoLog(task.id, 'Task is already actively streaming. Duplicate start ignored.');
    return { success: false, message: 'Stream is already actively running.' };
  }

  // Acquire lock immediately
  startingTasks.add(task.id);

  try {
    addAutoLog(task.id, `Preparing stream session for task "${task.name}"...`);

    // Mark task state as 'starting' in config immediately to prevent scheduler ticks or API hits from re-triggering
    const preUpdated = (getConfig().autoTasks || []).map(t => {
      if (t.id === task.id) {
        return { ...t, state: 'starting' as const };
      }
      return t;
    });
    saveConfig({ autoTasks: preUpdated });

    // Clear previous timer if any
    if (existing?.stopTimer) {
      clearTimeout(existing.stopTimer);
      existing.stopTimer = undefined;
    }

    // Clean up any lingering previous broadcasts for this task to avoid YouTube duplicates
    if (task.activeBroadcasts) {
      for (const [chId, bInfo] of Object.entries(task.activeBroadcasts)) {
        if (bInfo?.broadcastId) {
          try {
            await endOrCleanupBroadcast(chId, bInfo.broadcastId);
          } catch (e) { }
        }
      }
    }

    // 1. Check video
    const role = task.userId || 'admin';
    const videoPath = path.join(VIDEOS_DIR, role, task.video);
    if (!fs.existsSync(videoPath)) {
      addAutoLog(task.id, `Error: Video file "${task.video}" not found on disk.`);
      const resetTasks = (getConfig().autoTasks || []).map(t => {
        if (t.id === task.id) return { ...t, state: (t.mode === 'loop' ? 'idle' : 'scheduled') as any };
        return t;
      });
      saveConfig({ autoTasks: resetTasks });
      return { success: false, message: `Video file "${task.video}" not found on disk.` };
    }

    // 2. Check target channels (Deduplicated)
    const uniqueChannels = Array.from(new Set(task.channelIds || []));
    if (uniqueChannels.length === 0) {
      addAutoLog(task.id, `Error: No target YouTube channels selected.`);
      const resetTasks = (getConfig().autoTasks || []).map(t => {
        if (t.id === task.id) return { ...t, state: (t.mode === 'loop' ? 'idle' : 'scheduled') as any };
        return t;
      });
      saveConfig({ autoTasks: resetTasks });
      return { success: false, message: 'No target YouTube channels selected.' };
    }

    addAutoLog(task.id, `Connecting to ${uniqueChannels.length} YouTube channel(s) via API...`);
    const activeBroadcasts: Record<string, { broadcastId: string; streamId: string; streamKey: string; rtmpUrl: string }> = {};
    const endpoints: { url: string; key: string }[] = [];

    // Resolve thumbnail path if set
    const thumbnailPath = task.broadcastSettings?.thumbnail
      ? path.join(process.cwd(), 'public', 'thumbnails', role, task.broadcastSettings.thumbnail)
      : undefined;

    // Create YouTube broadcast & stream for each unique channel
    for (const channelId of uniqueChannels) {
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
      const resetTasks = (getConfig().autoTasks || []).map(t => {
        if (t.id === task.id) return { ...t, state: (t.mode === 'loop' ? 'idle' : 'scheduled') as any };
        return t;
      });
      saveConfig({ autoTasks: resetTasks });
      return { success: false, message: 'Could not create broadcasts on any connected channel.' };
    }

    // 3. Duration setup
    const scheduledSlotDuration = task.scheduleSettings?.timeSlots?.[0]?.durationMins || task.scheduleSettings?.durationMins || 15;
    const durationMins = Number(customDurationMins) || (
      task.mode === 'loop'
        ? (Number(task.loopSettings?.runDurationMins) || 5)
        : Number(scheduledSlotDuration)
    );
    const durationSeconds = Math.max(30, Math.floor(durationMins * 60));
    const nextEventAt = new Date(Date.now() + durationMins * 60 * 1000).toISOString();

    // 4. Build FFmpeg command with ultra-low CPU optimization
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
        '-threads', '2',
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

    // Hard duration limit flag: FFmpeg automatically closes after exact duration!
    args.push('-t', durationSeconds.toString());

    if (outputFormat === 'tee') {
      args.push('-f', 'tee', '-map', '0:v', '-map', '0:a', '-flags', '+global_header');
    } else {
      args.push('-f', 'flv', '-flvflags', 'no_duration_filesize');
    }

    args.push('-flush_packets', '1');
    args.push(outputUrl);

    const ffmpegBin = getFFmpegPath();
    addAutoLog(task.id, `Starting FFmpeg process (${isUltraLow ? 'Ultra-low CPU Copy Mode' : 'Custom Transcode Mode'}) for ${durationMins} minutes...`);
    const proc = spawn(ffmpegBin, args, { stdio: 'pipe' });

    if (!proc.pid) {
      throw new Error('Failed to spawn FFmpeg process');
    }

    // Persist PID to active_auto_pids.json
    saveAutoTaskPid(task.id, proc.pid);

    // Set dedicated real-time timer for auto-stop guarantee
    const durationMs = durationMins * 60 * 1000;
    const stopTimer = setTimeout(async () => {
      addAutoLog(task.id, `⏱ Duration timer (${durationMins}m) reached! Auto-stopping stream...`);
      await handleDurationCompleted(task.id);
    }, durationMs);

    activeAutoTasks.set(task.id, {
      process: proc,
      pid: proc.pid,
      activeBroadcasts,
      logs: activeAutoTasks.get(task.id)?.logs || [],
      stopTimer
    });

    // Update task in config
    const config = getConfig();
    const updatedTasks = (config.autoTasks || []).map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          state: 'streaming' as const,
          activeSlotId: slotId,
          pid: proc.pid,
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

    proc.on('close', async (code) => {
      addAutoLog(task.id, `FFmpeg process exited (Code: ${code})`);
      removeAutoTaskPid(task.id);

      const current = activeAutoTasks.get(task.id);
      if (current) {
        current.process = undefined;
        current.pid = undefined;
      }

      // If intentionally stopped or container deleted, do NOT trigger duration completion or auto-restarts!
      if (current?.isStopping) {
        addAutoLog(task.id, 'Container stream process stopped as requested.');
        return;
      }

      // If task is still marked as streaming, trigger completion transition
      const currentConfig = getConfig();
      const currentTask = (currentConfig.autoTasks || []).find(t => t.id === task.id);
      if (currentTask && currentTask.state === 'streaming') {
        await handleDurationCompleted(task.id);
      }
    });

    addAutoLog(task.id, `Stream is LIVE! Will run for ${durationMins} minutes until ${new Date(nextEventAt).toLocaleTimeString()}`);
    return { success: true, message: 'Stream started successfully.' };

  } catch (err: any) {
    addAutoLog(task.id, `Failed to start stream: ${err.message}`);
    const resetTasks = (getConfig().autoTasks || []).map(t => {
      if (t.id === task.id) return { ...t, state: (t.mode === 'loop' ? 'idle' : 'scheduled') as any };
      return t;
    });
    saveConfig({ autoTasks: resetTasks });
    return { success: false, message: err.message };
  } finally {
    startingTasks.delete(task.id);
  }
}

/**
 * Stop streaming for an automated task / container
 */
export async function stopAutoStreamTask(taskId: string, reason: string = 'Session completed'): Promise<{ success: boolean; message: string }> {
  try {
    addAutoLog(taskId, `Stopping container stream (${reason})...`);

    // Clear dedicated auto-stop timer and set isStopping flag
    const active = activeAutoTasks.get(taskId);
    if (active) {
      active.isStopping = true;
      if (active.stopTimer) {
        clearTimeout(active.stopTimer);
        active.stopTimer = undefined;
      }
    }

    // 1. Forcefully kill ONLY this container's FFmpeg process
    const pid = getTaskPid(taskId);
    if (pid) {
      addAutoLog(taskId, `Terminating FFmpeg process for container (PID ${pid})...`);
      killProcess(pid);
      removeAutoTaskPid(taskId);
    }
    if (active?.process) {
      try {
        active.process.kill('SIGKILL');
      } catch (e) { }
    }
    if (active) {
      active.process = undefined;
      active.pid = undefined;
    }

    // 2. Complete/clean YouTube broadcasts for this container
    const config = getConfig();
    const task = (config.autoTasks || []).find(t => t.id === taskId);
    const broadcasts = active?.activeBroadcasts || task?.activeBroadcasts || {};

    for (const [channelId, info] of Object.entries(broadcasts)) {
      if (info && info.broadcastId) {
        try {
          const res = await endOrCleanupBroadcast(channelId, info.broadcastId);
          if (res.success) {
            addAutoLog(taskId, `Live stream ended for broadcast ${info.broadcastId} on channel ${channelId}. Saved permanently as video.`);
          } else {
            addAutoLog(taskId, `Broadcast note: ${res.message || 'Already completed'}`);
          }
        } catch (e: any) {
          addAutoLog(taskId, `Error ending YouTube broadcast: ${e.message}`);
        }
      }
    }

    // Clean PID, activeBroadcasts, and reset state in saved config
    const updated = (getConfig().autoTasks || []).map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          state: (t.mode === 'loop' ? 'idle' : 'scheduled') as any,
          pid: undefined,
          sessionStartTime: undefined,
          nextEventAt: undefined,
          activeBroadcasts: undefined
        };
      }
      return t;
    });
    saveConfig({ autoTasks: updated });

    if (active) {
      active.isStopping = false;
    }

    return { success: true, message: 'Container stream stopped successfully.' };
  } catch (err: any) {
    addAutoLog(taskId, `Error stopping container stream: ${err.message}`);
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

    // 1. Loop Mode Handling (Duration Run -> Cooldown Break -> Auto-Restart)
    if (task.mode === 'loop') {
      if (task.state === 'idle' && !startingTasks.has(task.id)) {
        // Start stream immediately if enabled
        await startAutoStreamTask(task);
      } else if (task.state === 'streaming') {
        // Check if stream run duration is over
        if (task.nextEventAt && now >= new Date(task.nextEventAt).getTime()) {
          await handleDurationCompleted(task.id);
        }
      } else if (task.state === 'cooldown' && !startingTasks.has(task.id)) {
        // Check if cooldown break is over
        if (task.nextEventAt && now >= new Date(task.nextEventAt).getTime()) {
          addAutoLog(task.id, `Cooldown break completed! Restarting loop cycle...`);
          await startAutoStreamTask(task);
        }
      }
    }

    // 2. Scheduled Mode Handling
    else if (task.mode === 'scheduled') {
      const tz = task.scheduleSettings?.timezone || 'Asia/Kolkata';
      let currentH: number;
      let currentM: number;
      let currentDay: number;

      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour12: false,
          hour: 'numeric',
          minute: 'numeric',
          weekday: 'short'
        }).formatToParts(new Date());

        const hVal = parts.find(p => p.type === 'hour')?.value || '0';
        const mVal = parts.find(p => p.type === 'minute')?.value || '0';
        currentH = parseInt(hVal, 10);
        if (currentH === 24) currentH = 0;
        currentM = parseInt(mVal, 10);

        const weekdayVal = parts.find(p => p.type === 'weekday')?.value || 'Sun';
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        currentDay = dayMap[weekdayVal] ?? new Date().getDay();
      } catch (e) {
        const d = new Date();
        currentH = d.getHours();
        currentM = d.getMinutes();
        currentDay = d.getDay();
      }

      // Support multiple time slots per day!
      const slots = (task.scheduleSettings?.timeSlots && task.scheduleSettings.timeSlots.length > 0)
        ? task.scheduleSettings.timeSlots
        : [{
          id: 'default',
          label: 'Default Schedule',
          startTime: task.scheduleSettings?.startTime || '18:00',
          durationMins: Number(task.scheduleSettings?.durationMins) || 15,
          days: task.scheduleSettings?.days
        }];

      if (task.state === 'streaming') {
        // Check if duration expired
        if (task.nextEventAt && now >= new Date(task.nextEventAt).getTime()) {
          await handleDurationCompleted(task.id);
        }
      } else {
        // Check if current time matches ANY active time slot for today
        for (const slot of slots) {
          if (slot.days && slot.days.length > 0 && !slot.days.includes(currentDay)) {
            continue;
          }

          const [slotH, slotM] = (slot.startTime || '18:00').split(':').map(Number);
          if (currentH === slotH && currentM === slotM && !startingTasks.has(task.id) && task.state !== 'starting') {
            const lastStart = task.sessionStartTime ? new Date(task.sessionStartTime).getTime() : 0;
            // Prevent multiple triggers within the same 2 minutes
            if (now - lastStart > 120 * 1000) {
              const runDuration = Number(slot.durationMins) || 15;
              addAutoLog(task.id, `Clock reached ${slot.startTime} (${tz})! Launching scheduled slot "${slot.label || slot.startTime}" for ${runDuration} minutes...`);
              await startAutoStreamTask(task, runDuration, slot.id);
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
  // Check every 5 seconds for responsive auto-stop and scheduling
  setInterval(() => {
    processAutomationTick().catch(err => {
      console.error('[Scheduler] Error in tick:', err);
    });
  }, 5000);
}

export function getAutoTaskStatuses() {
  const config = getConfig();
  const tasks = config.autoTasks || [];
  const result: Record<string, any> = {};

  tasks.forEach(t => {
    const active = activeAutoTasks.get(t.id);
    result[t.id] = {
      state: t.state,
      pid: t.pid || active?.pid,
      sessionStartTime: t.sessionStartTime,
      nextEventAt: t.nextEventAt,
      logs: active?.logs || [],
      enabled: t.enabled
    };
  });

  return result;
}
