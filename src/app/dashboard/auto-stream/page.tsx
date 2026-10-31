'use client'
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Play, Square, RotateCw, Plus, Trash2, Settings, Video, Clock,
  Repeat, ShieldAlert, CheckCircle2, AlertCircle, ExternalLink, Key,
  Sliders, Cpu, Copy, Check, Eye, EyeOff, Radio, Image as ImageIcon, Tag, Upload, FileText, Box, AlertOctagon
} from 'lucide-react';
import type { AutoStreamTask } from '@/lib/config';

interface ChannelInfo {
  id: string;
  title: string;
  thumbnail?: string;
  userId?: string;
  connectedAt: string;
}

export default function AutoStreamPage() {
  const [tasks, setTasks] = useState<AutoStreamTask[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [videos, setVideos] = useState<{ name: string }[]>([]);
  const [userRole, setUserRole] = useState<string>('admin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals & Panels
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<AutoStreamTask> | null>(null);
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null);

  // Thumbnail management
  const [thumbnails, setThumbnails] = useState<{ name: string; url: string }[]>([]);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  // Google API Settings
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tagsInputText, setTagsInputText] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isKillingAll, setIsKillingAll] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/automation');
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
        setStatuses(data.statuses || {});
        if (data.userRole) setUserRole(data.userRole);
      }
    } catch (e) { }
  };

  const fetchChannels = async () => {
    try {
      const res = await fetch('/api/youtube/channels');
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        if (data.userRole) setUserRole(data.userRole);
      }
    } catch (e) { }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch (e) { }
  };

  const fetchApiConfig = async () => {
    try {
      const res = await fetch('/api/youtube/config');
      const data = await res.json();
      if (data.success) {
        setClientId(data.clientId || '');
        setHasClientSecret(!!data.hasClientSecret);
        setRedirectUri(data.redirectUri || '');
      }
    } catch (e) { }
  };

  const fetchThumbnails = async () => {
    try {
      const res = await fetch('/api/thumbnails');
      const data = await res.json();
      if (data.success) {
        setThumbnails(data.thumbnails || []);
      }
    } catch (e) { }
  };

  const handleUploadThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingThumb(true);
    try {
      const formData = new FormData();
      formData.append('thumbnail', file);
      const res = await fetch('/api/thumbnails', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.filename) {
        fetchThumbnails();
        setEditingTask((prev: any) => ({
          ...prev,
          broadcastSettings: {
            ...(prev?.broadcastSettings || {}),
            thumbnail: data.filename
          }
        }));
        setMessage({ text: 'Thumbnail uploaded and selected!', type: 'success' });
      } else {
        setMessage({ text: data.message || 'Failed to upload thumbnail', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error uploading thumbnail: ' + err.message, type: 'error' });
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleDeleteThumbnail = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to permanently delete thumbnail "${filename}"?`)) return;
    try {
      const res = await fetch('/api/thumbnails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (data.success) {
        if (editingTask?.broadcastSettings?.thumbnail === filename) {
          setEditingTask((prev: any) => ({
            ...prev,
            broadcastSettings: {
              ...(prev?.broadcastSettings || {}),
              thumbnail: ''
            }
          }));
        }
        fetchThumbnails();
        setMessage({ text: 'Thumbnail deleted successfully.', type: 'success' });
      } else {
        setMessage({ text: data.message || 'Failed to delete thumbnail', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error deleting thumbnail: ' + err.message, type: 'error' });
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchTasks();
    fetchChannels();
    fetchVideos();
    fetchThumbnails();
    fetchApiConfig();

    // Check URL params for callback alerts
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      const channel = params.get('channel') || 'YouTube Channel';
      setMessage({ text: `Successfully connected: ${channel}!`, type: 'success' });
      window.history.replaceState({}, '', '/dashboard/auto-stream');
    } else if (params.get('error')) {
      setMessage({ text: `Connection error: ${params.get('error')}`, type: 'error' });
      window.history.replaceState({}, '', '/dashboard/auto-stream');
    }

    const interval = setInterval(fetchTasks, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectYouTube = async () => {
    if (!clientId || (!hasClientSecret && !clientSecret)) {
      setIsApiSettingsOpen(true);
      setMessage({ text: 'Please configure your Google Client ID & Secret first.', type: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/youtube/auth');
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setMessage({ text: data.message || 'Failed to generate login link', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: 'Failed to initiate Google login', type: 'error' });
    }
  };

  const handleCleanupStaleBroadcasts = async () => {
    if (!confirm('This will end/delete any stale or duplicate Live and Upcoming broadcasts in YouTube Studio for your connected channels. Do you want to proceed?')) {
      return;
    }
    setIsCleaning(true);
    try {
      const res = await fetch('/api/youtube/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || `Cleaned ${data.cleanedCount || 0} broadcast(s) successfully!`, type: 'success' });
        fetchTasks();
      } else {
        setMessage({ text: data.message || 'Cleanup failed', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error cleaning broadcasts: ' + err.message, type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleKillAllFFmpeg = async () => {
    if (!confirm('⚠️ EMERGENCY KILL SWITCH\n\nAre you sure you want to FORCEFULLY STOP all active live streams and KILL ALL FFmpeg processes across the entire VPS?\n\nThis will immediately terminate all active broadcasts on the server.')) {
      return;
    }
    setIsKillingAll(true);
    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill_all' })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || 'All FFmpeg processes killed and streams stopped!', type: 'success' });
        fetchTasks();
      } else {
        setMessage({ text: data.message || 'Failed to kill streams', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error: ' + err.message, type: 'error' });
    } finally {
      setIsKillingAll(false);
    }
  };

  const handleDisconnectChannel = async (channelId: string) => {
    if (!confirm('Are you sure you want to disconnect this YouTube channel?')) return;
    try {
      const res = await fetch('/api/youtube/channels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      const data = await res.json();
      if (data.success) {
        fetchChannels();
        setMessage({ text: 'Channel disconnected.', type: 'success' });
      }
    } catch (e) {
      setMessage({ text: 'Error disconnecting channel', type: 'error' });
    }
  };

  const handleSaveApiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/youtube/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'API Settings saved successfully!', type: 'success' });
        setIsApiSettingsOpen(false);
        fetchApiConfig();
      } else {
        setMessage({ text: data.message || 'Error saving settings', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: 'Failed to save API settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingTask({
      name: `Auto Stream ${tasks.length + 1}`,
      channelIds: channels.length > 0 ? [channels[0].id] : [],
      video: videos.length > 0 ? videos[0].name : '',
      cpuMode: 'ultralow',
      resolution: '1080p',
      bitrate: '4000k',
      fps: '60',
      streamCount: 1,
      mode: 'loop',
      loopSettings: { runDurationMins: 5, cooldownMins: 2 },
      scheduleSettings: {
        startTime: '18:00',
        durationMins: 15,
        timezone: typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Kolkata',
        timeSlots: [
          { id: 'slot-1', label: 'Slot 1', startTime: '18:00', durationMins: 15 }
        ]
      },
      broadcastSettings: {
        title: '24/7 Live Stream',
        description: 'Automated 24/7 YouTube Stream',
        privacyStatus: 'public'
      },
      enabled: false
    });
    setTagsInputText('');
    setIsTaskModalOpen(true);
  };

  const handleEditTask = (task: AutoStreamTask) => {
    const existingSlots = (task.scheduleSettings?.timeSlots && task.scheduleSettings.timeSlots.length > 0)
      ? task.scheduleSettings.timeSlots
      : [{ id: 'slot-1', label: 'Slot 1', startTime: task.scheduleSettings?.startTime || '18:00', durationMins: task.scheduleSettings?.durationMins || 60 }];

    setTagsInputText((task.broadcastSettings?.tags || []).join(', '));
    setEditingTask({
      ...task,
      streamCount: task.streamCount || 1,
      scheduleSettings: {
        startTime: task.scheduleSettings?.startTime || '18:00',
        durationMins: task.scheduleSettings?.durationMins || 60,
        timeSlots: existingSlots
      }
    });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask?.name || !editingTask.video || !editingTask.channelIds?.length) {
      alert('Please fill task name, select at least one channel, and select a video.');
      return;
    }
    setLoading(true);
    try {
      const finalTags = (editingTask?.broadcastSettings?.tags && editingTask.broadcastSettings.tags.length > 0)
        ? editingTask.broadcastSettings.tags
        : tagsInputText.split(/[,;\n]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean);

      const payload = {
        ...editingTask,
        broadcastSettings: {
          ...(editingTask.broadcastSettings || { title: '', description: '', privacyStatus: 'public' }),
          tags: finalTags
        }
      };

      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: payload })
      });
      const data = await res.json();
      if (data.success) {
        setIsTaskModalOpen(false);
        setEditingTask(null);
        fetchTasks();
        setMessage({ text: 'Task saved successfully!', type: 'success' });
      } else {
        setMessage({ text: data.message || 'Error saving task', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: 'Failed to save task', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this stream container? If it is currently live, only this container\'s FFmpeg stream will be stopped immediately. Other running streams will remain untouched.')) return;
    try {
      const res = await fetch('/api/automation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
        setMessage({ text: 'Container and its live FFmpeg stream deleted & stopped successfully.', type: 'success' });
      } else {
        setMessage({ text: data.message || 'Failed to delete container', type: 'error' });
      }
    } catch (e: any) {
      setMessage({ text: 'Failed to delete container: ' + e.message, type: 'error' });
    }
  };

  const handleTriggerAction = async (taskId: string, action: 'start' | 'stop' | 'toggle') => {
    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, taskId })
      });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
        setMessage({ text: data.message || `Action ${action} executed`, type: 'success' });
      } else {
        setMessage({ text: data.message || 'Action failed', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: 'Failed to execute action', type: 'error' });
    }
  };

  const formatRemainingTime = (isoTarget?: string) => {
    if (!mounted || !isoTarget) return '';
    const diff = new Date(isoTarget).getTime() - Date.now();
    if (diff <= 0) return 'Ending soon...';
    const totalSecs = Math.floor(diff / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <div className="p-3 sm:p-5 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8" suppressHydrationWarning>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">Auto Streamer & Scheduler</h1>
          </div>
          <p className="text-gray-400 mt-2 text-xs sm:text-sm">
            Automate 24/7 loop cycles (1 hour stream + 5 min break) & scheduled YouTube live events with ultra-low VPS CPU.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleCleanupStaleBroadcasts}
            disabled={isCleaning}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 text-amber-300 text-sm font-semibold transition-all hover:bg-amber-500/20 disabled:opacity-50"
            title="End and delete all stale/duplicate broadcasts and stream keys in YouTube Studio"
          >
            <RotateCw className={`w-4 h-4 ${isCleaning ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
            <span>{isCleaning ? 'Cleaning YouTube...' : '🧹 Clean Stale Streams'}</span>
          </button>

          <button
            onClick={handleKillAllFFmpeg}
            disabled={isKillingAll}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-600/15 border border-red-500/40 hover:border-red-500 text-red-400 text-sm font-semibold transition-all hover:bg-red-600/25 disabled:opacity-50 shadow-sm"
            title="Emergency kill switch: forcefully stop all live streams and terminate all FFmpeg processes on VPS"
          >
            <AlertOctagon className={`w-4 h-4 ${isKillingAll ? 'animate-spin text-red-400' : 'text-red-400'}`} />
            <span>{isKillingAll ? 'Stopping All...' : '🛑 Kill All FFmpeg'}</span>
          </button>

          {userRole === 'admin' && (
            <button
              onClick={() => setIsApiSettingsOpen(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-600 text-gray-200 text-sm font-semibold transition-all hover:bg-gray-800"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              <span>Google API Settings</span>
            </button>
          )}

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm font-bold shadow-lg shadow-red-900/30 transition-all hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            <span>New Stream Container</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border flex items-center justify-between ${message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/40 border-red-500/30 text-red-300'
              }`}
          >
            <div className="flex items-center space-x-3">
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-xs opacity-60 hover:opacity-100">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section 1: Connected YouTube Channels */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Radio className="w-5 h-5 text-red-500" />
            <span>
              {userRole === 'admin'
                ? `All Connected YouTube Channels (${channels.length})`
                : `My Connected YouTube Channels (${channels.length})`}
            </span>
            {userRole === 'admin' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-500/30 font-mono">
                Admin View
              </span>
            )}
          </h2>
          <button
            onClick={handleConnectYouTube}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect YouTube Channel</span>
          </button>
        </div>

        {channels.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#141414] border border-dashed border-gray-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center border border-red-500/20">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">No YouTube Channels Connected Yet</h3>
              <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
                Connect your channel with Google OAuth to enable automated Go-Live and Scheduled streams without touching YouTube Studio.
              </p>
            </div>
            <button
              onClick={handleConnectYouTube}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Connect Channel with Google Login</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="p-4 rounded-xl bg-[#161616] border border-gray-800 flex items-center justify-between hover:border-gray-700 transition-all"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  {ch.thumbnail ? (
                    <img src={ch.thumbnail} alt={ch.title} className="w-10 h-10 rounded-full border border-gray-700 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-sm shrink-0">
                      {ch.title.charAt(0)}
                    </div>
                  )}
                  <div className="truncate">
                    <h4 className="text-sm font-bold text-white truncate">{ch.title}</h4>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate">ID: {ch.id}</p>
                      {userRole === 'admin' && ch.userId && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-500/30 font-mono">
                          {ch.userId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnectChannel(ch.id)}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Disconnect Channel"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Automated Stream Containers */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Box className="w-5 h-5 text-purple-400" />
              <span>
                {userRole === 'admin'
                  ? `All Active Stream Containers (${tasks.length})`
                  : `My Active Stream Containers (${tasks.length})`}
              </span>
              {userRole === 'admin' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-500/30 font-mono">
                  Admin View
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {userRole === 'admin'
                ? 'Showing all stream containers from all users. You can start, stop, edit, and monitor any container.'
                : 'Each container runs an isolated FFmpeg process. Starting, stopping, or deleting a container controls only your own live stream.'}
            </p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-900/30 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Stream Container</span>
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#141414] border border-dashed border-gray-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-purple-500/10 text-purple-400 mx-auto flex items-center justify-center border border-purple-500/20">
              <Box className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Create Your First Stream Container</h3>
              <p className="text-gray-400 text-sm mt-1 max-w-lg mx-auto">
                Deploy an automated stream container with its own isolated FFmpeg process, video loop or fixed daily schedule.
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-all shadow-lg shadow-purple-900/30"
            >
              <Plus className="w-4 h-4" />
              <span>Deploy Stream Container</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {tasks.map((task, idx) => {
              const status = statuses[task.id] || {};
              const currentState = status.state || task.state || 'idle';
              const isStreaming = currentState === 'streaming';
              const isCooldown = currentState === 'cooldown';
              const isEnabled = task.enabled;
              const activePid = status.pid || task.pid;

              return (
                <div
                  key={task.id}
                  className={`p-6 rounded-2xl bg-[#161616] border transition-all relative overflow-hidden ${isStreaming
                    ? 'border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                    : isCooldown
                      ? 'border-amber-500/40'
                      : 'border-gray-800 hover:border-gray-700'
                    }`}
                >
                  {/* Container Header Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-gray-800/80 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-purple-950/50 text-purple-300 border border-purple-500/30 flex items-center space-x-1">
                        <Box className="w-3 h-3 text-purple-400" />
                        <span>CONTAINER #{task.id.slice(0, 8).toUpperCase()}</span>
                      </span>
                      {(task.streamCount || 1) > 1 && (
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          <span>{task.streamCount}x STREAMS</span>
                        </span>
                      )}
                      {userRole === 'admin' && (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-blue-950/80 text-blue-300 border border-blue-500/40">
                          User: {task.userId || 'admin'}
                        </span>
                      )}
                      {isStreaming && (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                          PID: {activePid || 'Active'}
                        </span>
                      )}
                    </div>
                    {/* Enable Toggle Switch */}
                    <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
                      <span className="text-gray-400 text-[10px]">{isEnabled ? 'Container Active' : 'Container Paused'}</span>
                      <button
                        onClick={() => handleTriggerAction(task.id, 'toggle')}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isEnabled ? 'bg-purple-600' : 'bg-gray-800'
                          }`}
                        title={isEnabled ? 'Container is Enabled' : 'Container is Paused'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Task Header Details */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h3 className="text-lg font-bold text-white">{task.name}</h3>
                        {/* Mode badge */}
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-800 text-gray-300 border border-gray-700 flex items-center space-x-1">
                          {task.mode === 'loop' ? (
                            <>
                              <Repeat className="w-3 h-3 text-red-400" />
                              <span>Loop ({task.loopSettings?.runDurationMins || 5}m Live / {task.loopSettings?.cooldownMins || 2}m Break)</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-blue-400" />
                              <span>
                                {task.scheduleSettings?.timeSlots?.length && task.scheduleSettings.timeSlots.length > 1
                                  ? `${task.scheduleSettings.timeSlots.length} Slots Daily`
                                  : `Daily at ${task.scheduleSettings?.timeSlots?.[0]?.startTime || task.scheduleSettings?.startTime || '18:00'}`}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 flex items-center space-x-2">
                        <Video className="w-3.5 h-3.5 text-gray-500" />
                        <span className="truncate max-w-[200px]">{task.video || 'No video selected'}</span>
                        <span>•</span>
                        <span className={task.cpuMode === 'custom' ? 'text-blue-400' : 'text-emerald-400'}>
                          {task.cpuMode === 'custom' ? 'Custom Quality' : '⚡ Ultra-Low CPU (Direct)'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div className="my-5 p-3.5 rounded-xl bg-[#111] border border-gray-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-3 h-3 rounded-full ${isStreaming
                          ? 'bg-emerald-500 animate-ping'
                          : isCooldown
                            ? 'bg-amber-500'
                            : isEnabled
                              ? 'bg-blue-500'
                              : 'bg-gray-600'
                          }`}
                      />
                      <div>
                        <div className="text-xs font-bold text-white uppercase tracking-wider">
                          {isStreaming && '🔴 CONTAINER LIVE STREAMING'}
                          {isCooldown && '☕ CONTAINER COOLDOWN BREAK'}
                          {currentState === 'scheduled' && isEnabled && '🕒 CONTAINER SCHEDULED'}
                          {currentState === 'idle' && isEnabled && '⚡ CONTAINER READY'}
                          {!isEnabled && '⏸️ CONTAINER DISABLED'}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {isStreaming && `Remaining: ${formatRemainingTime(status.nextEventAt || task.nextEventAt)}`}
                          {isCooldown && `Next loop in: ${formatRemainingTime(status.nextEventAt || task.nextEventAt)}`}
                          {currentState === 'scheduled' && (
                            task.scheduleSettings?.timeSlots?.length && task.scheduleSettings.timeSlots.length > 1
                              ? `Slots: ${task.scheduleSettings.timeSlots.map(s => s.startTime).join(', ')}`
                              : `Starts at ${task.scheduleSettings?.timeSlots?.[0]?.startTime || task.scheduleSettings?.startTime || '18:00'}`
                          )}
                          {currentState === 'idle' && 'Waiting for next trigger'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-300">
                        {task.channelIds?.length || 0} Channel(s)
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-800/80">
                    <div className="flex items-center space-x-2">
                      {isStreaming ? (
                        <button
                          onClick={() => handleTriggerAction(task.id, 'stop')}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold transition-all"
                          title="Stops ONLY this container's FFmpeg stream process"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop Container</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTriggerAction(task.id, 'start')}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all"
                          title="Starts only this container's live stream"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Start Container</span>
                        </button>
                      )}

                      <button
                        onClick={() => setActiveLogTaskId(activeLogTaskId === task.id ? null : task.id)}
                        className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-all"
                      >
                        {activeLogTaskId === task.id ? 'Hide Logs' : 'Container Logs'}
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditTask(task)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                        title="Configure Container"
                      >
                        <Sliders className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Delete container & stop only its FFmpeg stream"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Logs Dropdown */}
                  {activeLogTaskId === task.id && (
                    <div className="mt-4 p-3 bg-black/80 rounded-xl border border-gray-800 font-mono text-[11px] text-gray-300 max-h-48 overflow-y-auto space-y-1">
                      <div className="text-gray-500 text-[10px] pb-1 border-b border-gray-800 flex justify-between">
                        <span>Console Logs ({task.name}):</span>
                        <span className="font-mono text-[9px] text-purple-400">CONTAINER #{task.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                      {(status.logs || []).length === 0 ? (
                        <div className="text-gray-600 italic">No logs recorded yet.</div>
                      ) : (
                        (status.logs || []).slice(-25).map((l: string, logIdx: number) => (
                          <div key={logIdx} className="whitespace-pre-wrap">{l}</div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Creation / Edit Modal */}
      <AnimatePresence>
        {isTaskModalOpen && editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181818] border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-gray-800 p-4 sm:p-5 shrink-0 bg-[#181818]">
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center space-x-2">
                  <Box className="w-5 h-5 text-purple-400" />
                  <span>{editingTask.id ? 'Configure Stream Container' : 'Deploy New Stream Container'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form id="auto-stream-form" onSubmit={handleSaveTask} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
                {/* Container Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">Container Name</label>
                  <input
                    type="text"
                    required
                    value={editingTask.name || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-purple-500 focus:outline-none"
                    placeholder="e.g. 24/7 Bhajan Live Loop Container"
                  />
                </div>

                {/* Target Channels */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                    Target YouTube Channel(s)
                  </label>
                  {channels.length === 0 ? (
                    <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-300">
                      No channels connected! Please connect a channel first via the top section.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-[#111] rounded-xl border border-gray-800">
                      {channels.map((ch) => {
                        const isChecked = editingTask.channelIds?.includes(ch.id);
                        return (
                          <label
                            key={ch.id}
                            className={`flex items-center space-x-3 p-2 rounded-lg border cursor-pointer transition-all ${isChecked
                              ? 'bg-red-500/10 border-red-500/40 text-white'
                              : 'border-gray-800 text-gray-400 hover:border-gray-700'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const current = editingTask.channelIds || [];
                                if (e.target.checked) {
                                  setEditingTask({ ...editingTask, channelIds: [...current, ch.id] });
                                } else {
                                  setEditingTask({ ...editingTask, channelIds: current.filter(id => id !== ch.id) });
                                }
                              }}
                              className="accent-red-500 w-4 h-4 rounded"
                            />
                            <span className="text-xs font-medium truncate">{ch.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Video Selector */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                    Select Video File
                  </label>
                  <select
                    value={editingTask.video || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, video: e.target.value })}
                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-red-500 focus:outline-none"
                  >
                    <option value="" disabled>Select video...</option>
                    {videos.map((v) => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center space-x-1">
                    <span>🔁 <b>Seamless Video Loop:</b> 3 minute ya kitni bhi choti video ho, wo lagatar repeat hokar stream ke ghante khatam hone tak non-stop chalti rahegi!</span>
                  </p>
                </div>

                {/* Automation Mode Selection */}
                <div className="p-4 bg-[#111] rounded-xl border border-gray-800 space-y-4">
                  <label className="block text-xs font-bold text-gray-300 uppercase">Automation Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingTask({ ...editingTask, mode: 'loop' })}
                      className={`p-3 rounded-xl border flex flex-col items-center space-y-1 transition-all ${editingTask.mode === 'loop'
                        ? 'bg-red-500/10 border-red-500 text-white'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                    >
                      <Repeat className="w-5 h-5" />
                      <span className="text-xs font-bold">24/7 Loop Cycle</span>
                      <span className="text-[10px] text-gray-500 text-center">Stream run ➔ Cooldown break ➔ Auto-restart</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingTask({ ...editingTask, mode: 'scheduled' })}
                      className={`p-3 rounded-xl border flex flex-col items-center space-y-1 transition-all ${editingTask.mode === 'scheduled'
                        ? 'bg-red-500/10 border-red-500 text-white'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                    >
                      <Clock className="w-5 h-5" />
                      <span className="text-xs font-bold">Fixed Schedule</span>
                      <span className="text-[10px] text-gray-500 text-center">Daily start time (e.g. 18:00) + auto-stop</span>
                    </button>
                  </div>

                  {editingTask.mode === 'loop' ? (
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-300 uppercase mb-1">
                            Stream Run Duration (Mins)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            placeholder="e.g. 5"
                            value={editingTask.loopSettings?.runDurationMins ?? 5}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : parseInt(e.target.value);
                              setEditingTask({
                                ...editingTask,
                                loopSettings: {
                                  runDurationMins: val === '' ? 5 : Math.max(1, isNaN(val as number) ? 5 : (val as number)),
                                  cooldownMins: editingTask.loopSettings?.cooldownMins ?? 2
                                }
                              });
                            }}
                            className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-red-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-gray-500 mt-1 block">Live chalegi (e.g. 5 min)</span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-300 uppercase mb-1">
                            Cooldown Break (Mins)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            placeholder="e.g. 2"
                            value={editingTask.loopSettings?.cooldownMins ?? 2}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : parseInt(e.target.value);
                              setEditingTask({
                                ...editingTask,
                                loopSettings: {
                                  runDurationMins: editingTask.loopSettings?.runDurationMins ?? 5,
                                  cooldownMins: val === '' ? 2 : Math.max(1, isNaN(val as number) ? 2 : (val as number))
                                }
                              });
                            }}
                            className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-red-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-gray-500 mt-1 block">Ruk kar restart hogi (e.g. 2 min)</span>
                        </div>
                      </div>

                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs space-y-1">
                        <div className="font-bold text-red-400 flex items-center space-x-1.5">
                          <Repeat className="w-4 h-4 text-red-500" />
                          <span>24/7 Continuous Loop Workflow:</span>
                        </div>
                        <p className="text-gray-300 text-[11px]">
                          Stream <b>{editingTask.loopSettings?.runDurationMins || 5} minute</b> live chalegi ➔ phir <b>{editingTask.loopSettings?.cooldownMins || 2} minute</b> break legi ➔ phir automatically naya live shuru ho jayega.
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Ye cycle 24x7 lagatar chalta rahega jab tak aap dashboard se <b>Stop Stream</b> button nahi dabate.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-xs font-bold text-gray-300">Daily Schedule Time Slots</label>
                          <span className="text-[10px] text-gray-500">Add multiple stream timings in 1 day (e.g. Morning, Afternoon, Evening)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const currentSlots = editingTask.scheduleSettings?.timeSlots || [];
                            const newSlot = {
                              id: `slot-${Date.now()}`,
                              label: `Slot ${currentSlots.length + 1}`,
                              startTime: '12:00',
                              durationMins: 60
                            };
                            setEditingTask({
                              ...editingTask,
                              scheduleSettings: {
                                ...editingTask.scheduleSettings,
                                startTime: editingTask.scheduleSettings?.startTime || '18:00',
                                durationMins: editingTask.scheduleSettings?.durationMins || 60,
                                timeSlots: [...currentSlots, newSlot]
                              }
                            });
                          }}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add Time Slot</span>
                        </button>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {(editingTask.scheduleSettings?.timeSlots || []).map((slot, index) => (
                          <div key={slot.id || index} className="p-3 bg-[#181818] rounded-xl border border-gray-700 flex flex-wrap sm:flex-nowrap items-center gap-3">
                            <div className="w-full sm:w-1/3">
                              <label className="block text-[10px] text-gray-400 font-semibold mb-0.5">Label (e.g. Aarti / Live)</label>
                              <input
                                type="text"
                                value={slot.label || ''}
                                onChange={(e) => {
                                  const updatedSlots = (editingTask.scheduleSettings?.timeSlots || []).map((s, i) => i === index ? { ...s, label: e.target.value } : s);
                                  setEditingTask({
                                    ...editingTask,
                                    scheduleSettings: { ...editingTask.scheduleSettings!, timeSlots: updatedSlots }
                                  });
                                }}
                                placeholder={`Slot ${index + 1}`}
                                className="w-full bg-[#111] border border-gray-800 rounded-lg px-2.5 py-1.5 text-white text-xs"
                              />
                            </div>

                            <div className="w-1/2 sm:w-1/3">
                              <label className="block text-[10px] text-gray-400 font-semibold mb-0.5">Start Time (24h)</label>
                              <input
                                type="time"
                                value={slot.startTime || '18:00'}
                                onChange={(e) => {
                                  const updatedSlots = (editingTask.scheduleSettings?.timeSlots || []).map((s, i) => i === index ? { ...s, startTime: e.target.value } : s);
                                  setEditingTask({
                                    ...editingTask,
                                    scheduleSettings: { ...editingTask.scheduleSettings!, timeSlots: updatedSlots }
                                  });
                                }}
                                className="w-full bg-[#111] border border-gray-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono"
                              />
                            </div>

                            <div className="w-1/3 sm:w-1/4">
                              <label className="block text-[10px] text-gray-400 font-semibold mb-0.5">Duration (mins)</label>
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                placeholder="e.g. 5, 15, 60"
                                value={slot.durationMins ?? 15}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                  const updatedSlots = (editingTask.scheduleSettings?.timeSlots || []).map((s, i) =>
                                    i === index ? { ...s, durationMins: val === '' ? 15 : Math.max(1, isNaN(val as number) ? 15 : (val as number)) } : s
                                  );
                                  setEditingTask({
                                    ...editingTask,
                                    scheduleSettings: { ...editingTask.scheduleSettings!, timeSlots: updatedSlots }
                                  });
                                }}
                                className="w-full bg-[#111] border border-gray-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-bold focus:border-red-500 focus:outline-none"
                              />
                            </div>

                            {(editingTask.scheduleSettings?.timeSlots || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedSlots = (editingTask.scheduleSettings?.timeSlots || []).filter((_, i) => i !== index);
                                  setEditingTask({
                                    ...editingTask,
                                    scheduleSettings: { ...editingTask.scheduleSettings!, timeSlots: updatedSlots }
                                  });
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all self-end sm:self-center"
                                title="Delete this slot"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="p-2.5 bg-blue-950/20 border border-blue-500/20 rounded-xl text-[11px] flex flex-wrap items-center justify-between gap-1">
                        <span className="text-blue-300">
                          ⏱ Har slot apne <b>Start Time</b> par start hoga aur jitna <b>Duration (mins)</b> aapne dala hai (e.g. 5 min ya 15 min), utni der chalne ke baad automatically <b>STOP</b> ho jayega.
                        </span>
                        <span className="text-gray-400 font-mono text-[10px]">
                          Clock Timezone: {editingTask.scheduleSettings?.timezone || (typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Kolkata')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* CPU Optimization Mode */}
                <div className="p-4 bg-[#111] rounded-xl border border-gray-800 space-y-3">
                  <label className="block text-xs font-bold text-gray-300 uppercase">
                    VPS CPU & Quality Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingTask({ ...editingTask, cpuMode: 'ultralow' })}
                      className={`p-3 rounded-xl border flex flex-col items-start space-y-1 transition-all ${editingTask.cpuMode !== 'custom'
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                    >
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-emerald-400">
                        <Cpu className="w-4 h-4" />
                        <span>⚡ Ultra-Low CPU (Direct Copy)</span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        Passthrough stream without re-encoding. VPS CPU stays near 1-2%! (Recommended)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingTask({ ...editingTask, cpuMode: 'custom' })}
                      className={`p-3 rounded-xl border flex flex-col items-start space-y-1 transition-all ${editingTask.cpuMode === 'custom'
                        ? 'bg-blue-500/10 border-blue-500 text-white'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                    >
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-blue-400">
                        <Sliders className="w-4 h-4" />
                        <span>Transcode & Quality Adjust</span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        Enables custom resolution, bitrate & fps with ultrafast preset.
                      </span>
                    </button>
                  </div>

                  {editingTask.cpuMode === 'custom' && (
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">Resolution</label>
                        <select
                          value={editingTask.resolution || '1080p'}
                          onChange={(e) => setEditingTask({ ...editingTask, resolution: e.target.value })}
                          className="w-full bg-[#181818] border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                        >
                          <option value="1080p">1080p Full HD</option>
                          <option value="720p">720p HD</option>
                          <option value="480p">480p SD</option>
                          <option value="360p">360p Low</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">Bitrate</label>
                        <select
                          value={editingTask.bitrate || '4000k'}
                          onChange={(e) => setEditingTask({ ...editingTask, bitrate: e.target.value })}
                          className="w-full bg-[#181818] border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                        >
                          <option value="6000k">6000 kbps (High)</option>
                          <option value="4000k">4000 kbps (Standard)</option>
                          <option value="2500k">2500 kbps (Smooth)</option>
                          <option value="1500k">1500 kbps (Low Bandwidth)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-400 mb-1">FPS</label>
                        <select
                          value={editingTask.fps || '60'}
                          onChange={(e) => setEditingTask({ ...editingTask, fps: e.target.value })}
                          className="w-full bg-[#181818] border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                        >
                          <option value="60">60 FPS</option>
                          <option value="30">30 FPS</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                                {/* Concurrent Stream Count per Channel */}
                <div className="p-4 bg-[#111] rounded-xl border border-gray-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-300 uppercase flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Concurrent Stream Count (Per Channel)</span>
                    </label>
                    <span className="text-[10px] text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 font-mono">
                      {editingTask.streamCount || 1}x Live Stream{(editingTask.streamCount || 1) > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Har chune huye YouTube channel par kitne live streams ek sath chalana chahte hain? (e.g. Agar <b>3</b> select karenge, to same video, same title aur tags ke sath ek hi samay me <b>3 alag-alag live streams</b> YouTube par live chalenge).
                  </p>
                  <div className="grid grid-cols-5 gap-2 pt-1">
                    {[1, 2, 3, 4, 5].map((cnt) => {
                      const isSelected = (editingTask.streamCount || 1) === cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setEditingTask({ ...editingTask, streamCount: cnt })}
                          className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center space-y-0.5 ${isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-950/40 ring-1 ring-amber-500/50'
                            : 'bg-[#181818] border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                            }`}
                        >
                          <span className="text-sm font-extrabold">{cnt}x</span>
                          <span className="text-[9px] font-normal opacity-75">{cnt === 1 ? 'Single' : 'Streams'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* YouTube Broadcast Metadata Section */}
                <div className="p-4 bg-[#111] rounded-xl border border-gray-800 space-y-4">
                  <div className="flex items-center space-x-2 border-b border-gray-800 pb-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <label className="text-xs font-bold text-white uppercase tracking-wider">
                      YouTube Broadcast Details (Title, Description, Tags & Thumbnail)
                    </label>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                      Stream Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editingTask.broadcastSettings?.title || ''}
                      onChange={(e) => setEditingTask({
                        ...editingTask,
                        broadcastSettings: {
                          title: e.target.value,
                          description: editingTask.broadcastSettings?.description || '',
                          tags: editingTask.broadcastSettings?.tags || [],
                          thumbnail: editingTask.broadcastSettings?.thumbnail || '',
                          privacyStatus: editingTask.broadcastSettings?.privacyStatus || 'public',
                          categoryId: editingTask.broadcastSettings?.categoryId || '10'
                        }
                      })}
                      className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-red-500 focus:outline-none"
                      placeholder="e.g. 🔴 24/7 Live Bhajan | Non-Stop Devotional Stream"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                      Stream Description
                    </label>
                    <textarea
                      rows={3}
                      value={editingTask.broadcastSettings?.description || ''}
                      onChange={(e) => setEditingTask({
                        ...editingTask,
                        broadcastSettings: {
                          title: editingTask.broadcastSettings?.title || '',
                          description: e.target.value,
                          tags: editingTask.broadcastSettings?.tags || [],
                          thumbnail: editingTask.broadcastSettings?.thumbnail || '',
                          privacyStatus: editingTask.broadcastSettings?.privacyStatus || 'public',
                          categoryId: editingTask.broadcastSettings?.categoryId || '10'
                        }
                      })}
                      className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:border-red-500 focus:outline-none"
                      placeholder="Enter description, channel credits, social links, timestamps..."
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 mb-1 flex items-center space-x-1.5">
                      <Tag className="w-3.5 h-3.5 text-red-400" />
                      <span>YouTube Tags (Comma or dot separated)</span>
                    </label>
                    <input
                      type="text"
                      value={tagsInputText}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setTagsInputText(raw);
                        let parsed: string[] = [];
                        if (raw.includes(',') || raw.includes(';') || raw.includes('\n')) {
                          parsed = raw.split(/[,;\n]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean);
                        } else if (raw.includes('.') && !raw.includes(' ')) {
                          parsed = raw.split('.').map(t => t.replace(/^#+/, '').trim()).filter(Boolean);
                        } else {
                          parsed = raw.split(',').map(t => t.replace(/^#+/, '').trim()).filter(Boolean);
                        }
                        setEditingTask({
                          ...editingTask,
                          broadcastSettings: {
                            ...(editingTask.broadcastSettings || { title: '', description: '', privacyStatus: 'public' }),
                            tags: parsed
                          }
                        });
                      }}
                      className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:border-red-500 focus:outline-none"
                      placeholder="bhajan, live, music, 24/7, bhakti, hindi songs"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Separate tags with commas. Tags will be created clean without hashtags (#).</span>

                    {/* Visual Tag Badges Preview (Pure tags without #) */}
                    {editingTask.broadcastSettings?.tags && editingTask.broadcastSettings.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {editingTask.broadcastSettings.tags.map((tg, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded bg-gray-800 text-gray-200 border border-gray-700 text-[11px] font-medium">
                            {tg.replace(/^#+/, '').trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Category & Privacy */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-300 mb-1">Category</label>
                      <select
                        value={editingTask.broadcastSettings?.categoryId || '10'}
                        onChange={(e) => setEditingTask({
                          ...editingTask,
                          broadcastSettings: {
                            ...(editingTask.broadcastSettings || { title: '', description: '', privacyStatus: 'public' }),
                            categoryId: e.target.value
                          }
                        })}
                        className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs"
                      >
                        <option value="10">Music</option>
                        <option value="24">Entertainment</option>
                        <option value="22">People & Blogs</option>
                        <option value="20">Gaming</option>
                        <option value="25">News & Politics</option>
                        <option value="27">Education</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-300 mb-1">Privacy Status</label>
                      <select
                        value={editingTask.broadcastSettings?.privacyStatus || 'public'}
                        onChange={(e) => setEditingTask({
                          ...editingTask,
                          broadcastSettings: {
                            ...(editingTask.broadcastSettings || { title: '', description: '', privacyStatus: 'public' }),
                            privacyStatus: e.target.value as any
                          }
                        })}
                        className="w-full bg-[#181818] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs"
                      >
                        <option value="public">Public (Everyone can watch)</option>
                        <option value="unlisted">Unlisted (Anyone with link)</option>
                        <option value="private">Private (Only you)</option>
                      </select>
                    </div>
                  </div>

                  {/* Custom Thumbnail */}
                  <div className="pt-2 border-t border-gray-800 space-y-2">
                    <label className="block text-[11px] font-semibold text-gray-300 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-red-400" />
                        <span>Custom YouTube Live Thumbnail (JPG / PNG)</span>
                      </span>
                      {uploadingThumb && <span className="text-red-400 text-[10px] animate-pulse">Uploading...</span>}
                    </label>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold cursor-pointer transition-all border border-gray-700">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingThumb ? 'Uploading...' : 'Upload New Thumbnail'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg"
                          onChange={handleUploadThumbnail}
                          className="hidden"
                          disabled={uploadingThumb}
                        />
                      </label>

                      {editingTask.broadcastSettings?.thumbnail && (() => {
                        const thumbObj = thumbnails.find(t => t.name === editingTask.broadcastSettings?.thumbnail);
                        const imgSrc = thumbObj?.url || `/thumbnails/${(editingTask as any).userId || 'admin'}/${editingTask.broadcastSettings.thumbnail}`;
                        return (
                          <div className="flex items-center space-x-2">
                            <img
                              src={imgSrc}
                              alt="Selected Thumbnail"
                              className="w-14 h-9 object-cover rounded border border-purple-500/50 shadow"
                              onError={(e: any) => { e.target.style.display = 'none'; }}
                            />
                            <span className="text-[11px] text-emerald-400 font-medium truncate max-w-[150px]">
                              {editingTask.broadcastSettings.thumbnail}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingTask({
                                ...editingTask,
                                broadcastSettings: { ...editingTask.broadcastSettings!, thumbnail: '' }
                              })}
                              className="text-gray-500 hover:text-red-400 text-xs"
                              title="Remove Thumbnail"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Quick pick & delete from existing thumbnails */}
                    {thumbnails.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[10px] text-gray-400 block mb-1.5 font-medium">
                          Uploaded Thumbnails (Click to select, or delete):
                        </span>
                        <div className="flex items-center gap-3 overflow-x-auto py-2 px-1">
                          {thumbnails.map(t => {
                            const isSelected = editingTask.broadcastSettings?.thumbnail === t.name;
                            return (
                              <div key={t.name} className="relative group shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setEditingTask({
                                    ...editingTask,
                                    broadcastSettings: {
                                      ...(editingTask.broadcastSettings || { title: '', description: '', privacyStatus: 'public' }),
                                      thumbnail: t.name
                                    }
                                  })}
                                  className={`relative block rounded-lg border-2 p-0.5 transition-all overflow-hidden ${isSelected
                                    ? 'border-purple-500 ring-2 ring-purple-500/40 shadow-lg shadow-purple-950/40'
                                    : 'border-gray-800 hover:border-gray-600'
                                    }`}
                                  title={`Select "${t.name}"`}
                                >
                                  <img src={t.url} alt={t.name} className="w-20 h-12 object-cover rounded" />
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center">
                                      <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                                        Selected
                                      </span>
                                    </div>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteThumbnail(t.name, e)}
                                  className="absolute -top-1.5 -right-1.5 p-1 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-lg transition-transform hover:scale-110 z-10"
                                  title={`Delete "${t.name}"`}
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </form>

              {/* Fixed Modal Footer Buttons */}
              <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-800 shrink-0 bg-[#141414] rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs sm:text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="auto-stream-form"
                  disabled={loading}
                  className="px-5 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-purple-900/30 transition-all"
                >
                  {loading ? 'Saving...' : (editingTask.id ? 'Save Container Changes' : 'Deploy Container')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google API Settings Modal */}
      <AnimatePresence>
        {isApiSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#181818] border border-gray-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-gray-800 p-4 sm:p-5 shrink-0 bg-[#181818]">
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-red-500" />
                  <span>Google Cloud / YouTube API Settings</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsApiSettingsOpen(false)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form id="api-settings-form" onSubmit={handleSaveApiSettings} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">Client ID</label>
                  <input
                    type="text"
                    required
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-white text-xs font-mono focus:border-red-500 focus:outline-none"
                    placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                    Client Secret {hasClientSecret && <span className="text-emerald-400 lowercase">(currently saved)</span>}
                  </label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-white text-xs font-mono focus:border-red-500 focus:outline-none"
                    placeholder={hasClientSecret ? '•••••••••••••••••••••••• (leave blank to keep unchanged)' : 'Enter client secret'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                    Authorized Redirect URI
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={redirectUri || (mounted ? `${window.location.origin}/api/youtube/callback` : '')}
                      suppressHydrationWarning
                      className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2 text-gray-400 text-xs font-mono select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const uri = redirectUri || `${window.location.origin}/api/youtube/callback`;
                        navigator.clipboard.writeText(uri);
                        setCopiedRedirect(true);
                        setTimeout(() => setCopiedRedirect(false), 2000);
                      }}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center space-x-1"
                    >
                      {copiedRedirect ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedRedirect ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Add this exact URL to your Google Cloud Console under <b>Authorized redirect URIs</b>.
                  </p>
                </div>

                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-gray-300 space-y-1">
                  <div className="font-bold text-red-400">Quick Setup Instructions:</div>
                  <p>1. Open <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-red-400 underline">Google Cloud Console</a> and create a project.</p>
                  <p>2. Enable <b>YouTube Data API v3</b> in APIs & Services.</p>
                  <p>3. Create OAuth 2.0 Credentials (Web application) and paste the Redirect URI above.</p>
                  <p>4. Add your YouTube Gmail account to <b>Test Users</b> in OAuth Consent Screen.</p>
                </div>
              </form>

              {/* Fixed Modal Footer Buttons */}
              <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-800 shrink-0 bg-[#141414] rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setIsApiSettingsOpen(false)}
                  className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs sm:text-sm font-semibold transition-all"
                >
                  Close
                </button>
                <button
                  type="submit"
                  form="api-settings-form"
                  disabled={loading}
                  className="px-5 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-bold transition-all shadow-md"
                >
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
