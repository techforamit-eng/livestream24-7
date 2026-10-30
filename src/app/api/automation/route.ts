import { NextResponse } from 'next/server';
import { getConfig, saveConfig, AutoStreamTask } from '@/lib/config';
import { initAutomationScheduler, getAutoTaskStatuses, startAutoStreamTask, stopAutoStreamTask, killAllFFmpeg } from '@/lib/scheduler';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

// Ensure scheduler is running on any API hit
initAutomationScheduler();

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

export async function GET() {
  const userId = await getUserId();
  const config = getConfig();
  let tasks = config.autoTasks || [];

  if (userId !== 'admin') {
    tasks = tasks.filter(t => (t.userId || 'admin') === userId);
  }

  const statuses = getAutoTaskStatuses();
  return NextResponse.json({ success: true, tasks, statuses, userRole: userId });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  const body = await req.json();

  // Action trigger (manual start, manual stop, toggle enable/disable, emergency kill all)
  if (body.action) {
    const { action, taskId } = body;

    // Master Emergency Kill Switch
    if (action === 'kill_all') {
      const res = await killAllFFmpeg(userId);
      return NextResponse.json(res);
    }

    const config = getConfig();
    const task = (config.autoTasks || []).find(t => t.id === taskId);

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    if (userId !== 'admin' && (task.userId || 'admin') !== userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }

    if (action === 'start') {
      if (task.state === 'streaming' || task.state === 'starting') {
        return NextResponse.json({ success: false, message: 'Stream is already actively running or starting for this task.' });
      }
      const updated = (getConfig().autoTasks || []).map(t => {
        if (t.id === taskId) {
          return { ...t, enabled: true, state: 'starting' as const };
        }
        return t;
      });
      saveConfig({ autoTasks: updated });
      const currentTask = (getConfig().autoTasks || []).find(t => t.id === taskId) || task;
      const res = await startAutoStreamTask({ ...currentTask, enabled: true, state: 'starting' });
      return NextResponse.json(res);
    }

    if (action === 'stop') {
      const res = await stopAutoStreamTask(taskId, 'Manually stopped from dashboard');
      const updated = (getConfig().autoTasks || []).map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            enabled: false, // Turn OFF so it never auto-recreates!
            state: (t.mode === 'loop' ? 'idle' : 'scheduled') as any,
            sessionStartTime: undefined,
            nextEventAt: undefined,
            activeBroadcasts: undefined
          };
        }
        return t;
      });
      saveConfig({ autoTasks: updated });
      return NextResponse.json(res);
    }

    if (action === 'toggle') {
      const newEnabled = !task.enabled;
      if (!newEnabled && task.state === 'streaming') {
        await stopAutoStreamTask(taskId, 'Task disabled');
      }
      const updated = (getConfig().autoTasks || []).map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            enabled: newEnabled,
            state: (newEnabled ? t.state : (t.mode === 'loop' ? 'idle' : 'scheduled')) as any,
            sessionStartTime: newEnabled ? t.sessionStartTime : undefined,
            nextEventAt: newEnabled ? t.nextEventAt : undefined,
            activeBroadcasts: newEnabled ? t.activeBroadcasts : undefined
          };
        }
        return t;
      });
      saveConfig({ autoTasks: updated });
      return NextResponse.json({ success: true, enabled: newEnabled });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  }

  // Create or Update task
  const { task } = body;
  if (!task) {
    return NextResponse.json({ success: false, message: 'task payload required' }, { status: 400 });
  }

  const config = getConfig();
  const existingTasks = config.autoTasks || [];

  if (task.id) {
    // Update existing
    const found = existingTasks.find(t => t.id === task.id);
    if (!found) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }
    if (userId !== 'admin' && (found.userId || 'admin') !== userId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }

    const updatedTasks = existingTasks.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          name: task.name || t.name,
          channelIds: task.channelIds || t.channelIds,
          video: task.video || t.video,
          cpuMode: task.cpuMode || t.cpuMode,
          resolution: task.resolution || t.resolution,
          bitrate: task.bitrate || t.bitrate,
          fps: task.fps || t.fps,
          mode: task.mode || t.mode,
          loopSettings: task.loopSettings ? {
            runDurationMins: Number(task.loopSettings.runDurationMins) || 5,
            cooldownMins: Number(task.loopSettings.cooldownMins) || 2
          } : t.loopSettings,
          scheduleSettings: task.scheduleSettings ? {
            ...t.scheduleSettings,
            ...task.scheduleSettings,
            timezone: task.scheduleSettings.timezone || t.scheduleSettings?.timezone || 'Asia/Kolkata',
            timeSlots: task.scheduleSettings.timeSlots && task.scheduleSettings.timeSlots.length > 0
              ? task.scheduleSettings.timeSlots.map((s: any) => ({
                id: s.id || uuidv4(),
                label: s.label || 'Scheduled Slot',
                startTime: s.startTime || '18:00',
                durationMins: Number(s.durationMins) || 15,
                days: s.days
              }))
              : t.scheduleSettings?.timeSlots
          } : t.scheduleSettings,
          broadcastSettings: task.broadcastSettings || t.broadcastSettings,
          enabled: task.enabled !== undefined ? task.enabled : t.enabled,
        };
      }
      return t;
    });

    saveConfig({ autoTasks: updatedTasks });
    return NextResponse.json({ success: true, message: 'Task updated successfully.' });
  } else {
    // Create new
    const newTask: AutoStreamTask = {
      id: uuidv4(),
      userId,
      name: task.name || 'New Auto Stream',
      channelIds: task.channelIds || [],
      video: task.video || '',
      cpuMode: task.cpuMode || 'ultralow',
      resolution: task.resolution || '1080p',
      bitrate: task.bitrate || '4000k',
      fps: task.fps || '60',
      mode: task.mode || 'loop',
      loopSettings: task.loopSettings ? {
        runDurationMins: Number(task.loopSettings.runDurationMins) || 5,
        cooldownMins: Number(task.loopSettings.cooldownMins) || 2
      } : { runDurationMins: 5, cooldownMins: 2 },
      scheduleSettings: task.scheduleSettings ? {
        startTime: task.scheduleSettings.startTime || '18:00',
        durationMins: Number(task.scheduleSettings.durationMins) || 15,
        timezone: task.scheduleSettings.timezone || 'Asia/Kolkata',
        days: task.scheduleSettings.days,
        timeSlots: task.scheduleSettings.timeSlots && task.scheduleSettings.timeSlots.length > 0
          ? task.scheduleSettings.timeSlots.map((s: any) => ({
            id: s.id || uuidv4(),
            label: s.label || 'Scheduled Slot',
            startTime: s.startTime || '18:00',
            durationMins: Number(s.durationMins) || 15,
            days: s.days
          }))
          : [{ id: uuidv4(), label: 'Daily Stream 1', startTime: '18:00', durationMins: 15 }]
      } : {
        startTime: '18:00',
        durationMins: 15,
        timezone: 'Asia/Kolkata',
        timeSlots: [{ id: uuidv4(), label: 'Daily Stream 1', startTime: '18:00', durationMins: 15 }]
      },
      broadcastSettings: task.broadcastSettings || {
        title: task.name || '24/7 Live Stream',
        description: 'Automated 24/7 Live Stream',
        tags: ['live', 'streaming'],
        thumbnail: '',
        privacyStatus: 'public',
        categoryId: '10'
      },
      enabled: task.enabled !== undefined ? task.enabled : true,
      state: task.mode === 'loop' ? 'idle' : 'scheduled'
    };

    saveConfig({ autoTasks: [...existingTasks, newTask] });
    return NextResponse.json({ success: true, message: 'Task created successfully.', task: newTask });
  }
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  const { taskId } = await req.json();

  if (!taskId) {
    return NextResponse.json({ success: false, message: 'taskId is required' }, { status: 400 });
  }

  const config = getConfig();
  const existingTasks = config.autoTasks || [];
  const found = existingTasks.find(t => t.id === taskId);

  if (!found) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  if (userId !== 'admin' && (found.userId || 'admin') !== userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
  }

  // 1. Force stop ONLY this container's FFmpeg stream and clean its YouTube broadcast
  await stopAutoStreamTask(taskId, 'Container task deleted');

  // 2. Remove container from configuration
  const filtered = (getConfig().autoTasks || []).filter(t => t.id !== taskId);
  saveConfig({ autoTasks: filtered });

  return NextResponse.json({ success: true, message: 'Container and its FFmpeg stream deleted successfully.' });
}
