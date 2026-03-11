'use client'
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, RotateCw, Settings2, ShieldAlert, Plus, Trash2, Cpu, X, Settings, Link, Key, Video, Activity, Clock } from 'lucide-react';
import type { AppConfig, StreamInstance } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';

export default function StreamControl() {
  const [statuses, setStatuses] = useState<any>({});
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const [videos, setVideos] = useState<{ name: string }[]>([]);
  const [editingStream, setEditingStream] = useState<StreamInstance | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/stream');
      const data = await res.json();
      setStatuses(data);
    } catch (err) { }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (err) { }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch (err) { }
  };

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    fetchVideos();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (streamId: string, action: 'start' | 'stop' | 'restart') => {
    setLoading(true);
    setMessages({ ...messages, [streamId]: '' });
    try {
      const res = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId, action }),
      });
      const data = await res.json();
      setMessages({ ...messages, [streamId]: data.message });
      fetchStatus();
    } catch (err) {
      setMessages({ ...messages, [streamId]: 'Action failed' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessages(prev => ({ ...prev, [streamId]: '' })), 5000);
    }
  };

  const createNewStream = () => {
    if (!config) return;
    const newStream: StreamInstance = {
      id: uuidv4(),
      name: `Stream ${config.streams.length + 1}`,
      profileId: config.streamKeys && config.streamKeys.length > 0 ? config.streamKeys[0].id : '',
      resolution: '1080p',
      autoStop: false,
      autoStopHours: 1,
      autoRestart: false,
      autoRestartDelayMinutes: 5,
      bitrate: '4000k',
      fps: '60',
      playlist: [],
    };
    setEditingStream(newStream);
    setIsCreating(true);
  };

  const editStream = (streamId: string) => {
    const stream = config?.streams.find(s => s.id === streamId);
    if (stream) {
      setEditingStream({ ...stream });
      setIsCreating(false);
    }
  };

  const saveEditingStream = async () => {
    if (!config || !editingStream) return;
    let updatedStreams;
    if (isCreating) {
      updatedStreams = [...config.streams, editingStream];
    } else {
      updatedStreams = config.streams.map(s => s.id === editingStream.id ? editingStream : s);
    }
    setConfig({ ...config, streams: updatedStreams });
    setEditingStream(null);
    setIsCreating(false);

    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streams: updatedStreams }),
    });
  };

  const deleteStream = async (streamId: string) => {
    if (!config) return;
    if (!confirm("Are you sure you want to delete this stream? Active processes will need to be stopped manually first.")) return;
    const updatedStreams = config.streams.filter(s => s.id !== streamId);
    setConfig({ ...config, streams: updatedStreams });
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streams: updatedStreams }),
    });
  };

  const toggleVideoInPlaylist = (videoName: string) => {
    if (!editingStream) return;
    const list = editingStream.playlist || [];
    const newPlaylist = list.includes(videoName)
      ? list.filter(n => n !== videoName)
      : [...list, videoName];
    setEditingStream({ ...editingStream, playlist: newPlaylist });
  };

  const InputLabel = ({ children, icon: Icon }: any) => (
    <label className="flex items-center space-x-2 text-sm font-medium text-gray-400 mb-2">
      <Icon className="w-4 h-4 text-red-500" />
      <span>{children}</span>
    </label>
  );

  if (!config) return <div className="text-gray-400 p-8">Loading stream dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold text-white">Multi-Stream Control</h2>
        <button
          onClick={createNewStream}
          className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all font-semibold"
        >
          <Plus className="w-5 h-5" />
          <span>New Stream Instance</span>
        </button>
      </div>

      <div className="space-y-8">
        <AnimatePresence>
          {config.streams.map((streamDef) => {
            const currentStatus = statuses[streamDef.id] || { status: 'Loading', uptime: 0, logs: [] };
            const isRunning = currentStatus.status === 'Running';
            const msg = messages[streamDef.id];

            return (
              <motion.div
                key={streamDef.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#111] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl relative"
              >
                {/* Header Strip */}
                <div className="bg-[#161616] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${isRunning ? 'bg-green-500 text-green-500 animate-pulse' : 'bg-red-500 text-red-500'}`} />
                    <h3 className="text-xl font-bold text-white">{streamDef.name}</h3>
                    <span className={`text-xs px-2 py-1 rounded-md font-bold uppercase tracking-wider ${isRunning ? 'bg-green-500/10 text-green-500' : 'bg-gray-800 text-gray-400'}`}>
                      {currentStatus.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => editStream(streamDef.id)}
                      className="text-gray-400 hover:text-white transition-colors p-2 bg-gray-800/50 hover:bg-gray-700 rounded-lg flex items-center text-sm font-medium mr-2"
                      title="Edit Configuration"
                    >
                      <Settings2 className="w-4 h-4 mr-2" /> Configure
                    </button>
                    <button
                      onClick={() => deleteStream(streamDef.id)}
                      className="text-gray-500 hover:text-red-500 transition-colors p-2 bg-gray-800/20 hover:bg-red-500/10 rounded-lg"
                      title="Delete Instance"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-800">
                  {/* Stats Column */}
                  <div className="p-6">
                    <h4 className="text-sm font-semibold text-gray-500 mb-4 flex items-center">
                      <Settings2 className="w-4 h-4 mr-2" /> Configuration Active
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-gray-800/50 pb-2">
                        <span className="text-gray-500 text-sm">Profile ID</span>
                        <span className="text-gray-200 text-sm font-medium truncate max-w-[150px]">{config.streamKeys?.find(k => k.id === streamDef.profileId)?.name || 'Not config'}</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-800/50 pb-2">
                        <span className="text-gray-500 text-sm">Resolution</span>
                        <span className="text-gray-200 text-sm font-medium">{streamDef.resolution} @ {streamDef.fps}fps</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-800/50 pb-2">
                        <span className="text-gray-500 text-sm">Bitrate Limit</span>
                        <span className="text-gray-200 text-sm font-medium">{streamDef.bitrate}</span>
                      </div>
                      {isRunning && currentStatus.scheduledStop && (
                        <div className="flex justify-between border-b border-gray-800/50 pb-2">
                          <span className="text-red-500/80 text-sm font-semibold flex items-center"><Clock className="w-3 h-3 mr-1" /> Next Auto-Stop</span>
                          <span className="text-red-400 text-sm font-bold">{new Date(currentStatus.scheduledStop).toLocaleTimeString()}</span>
                        </div>
                      )}
                      {streamDef.autoRestart && (
                        <div className="flex justify-between border-b border-gray-800/50 pb-2">
                          <span className="text-blue-500/80 text-sm font-semibold flex items-center"><RotateCw className="w-3 h-3 mr-1" /> Reconnect Delay</span>
                          <span className="text-blue-400 text-sm font-bold">
                            {streamDef.autoRestartDelayMinutes === 0 ? 'Instant' : `${streamDef.autoRestartDelayMinutes} Min`}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pb-2 items-center">
                        <span className="text-gray-500 text-sm">Playlist Length</span>
                        <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${streamDef.playlist.length === 0 ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-gray-200'}`}>{streamDef.playlist.length} Videos</span>
                      </div>
                    </div>
                  </div>

                  {/* Controls Column */}
                  <div className="p-6 flex flex-col justify-center">
                    {streamDef.playlist.length === 0 && (
                      <div className="text-xs text-red-500 mb-3 font-semibold text-center border-b border-red-500/20 pb-2">Cannot start without videos in playlist. Click Configure.</div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => handleAction(streamDef.id, 'start')}
                        disabled={loading || isRunning || streamDef.playlist.length === 0}
                        className={`flex flex-col items-center justify-center space-y-2 border rounded-xl transition-all group py-4 ${isRunning
                          ? 'bg-green-600 border-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)] opacity-100'
                          : 'bg-gray-900 border-gray-800 hover:bg-green-600 hover:border-green-500 text-gray-400 hover:text-white disabled:opacity-50'
                          }`}
                      >
                        <Play className={`w-6 h-6 transition-transform ${isRunning ? 'scale-110 animate-pulse fill-current' : 'group-hover:scale-110'}`} />
                        <span className="text-xs font-bold uppercase tracking-tight">
                          {isRunning ? 'Running' : 'Start'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleAction(streamDef.id, 'stop')}
                        disabled={loading || !isRunning}
                        className="flex flex-col items-center justify-center space-y-2 bg-gray-900 border border-gray-800 hover:bg-red-600 hover:border-red-500 disabled:opacity-50 disabled:hover:bg-gray-900 disabled:hover:border-gray-800 text-gray-400 hover:text-white py-4 rounded-xl transition-all group"
                      >
                        <Square className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-semibold">Stop</span>
                      </button>

                      <button
                        onClick={() => handleAction(streamDef.id, 'restart')}
                        disabled={loading || !isRunning}
                        className="flex flex-col items-center justify-center space-y-2 bg-gray-900 border border-gray-800 hover:bg-blue-600 hover:border-blue-500 disabled:opacity-50 disabled:hover:bg-gray-900 disabled:hover:border-gray-800 text-gray-400 hover:text-white py-4 rounded-xl transition-all group"
                      >
                        <RotateCw className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-semibold">Restart</span>
                      </button>
                    </div>

                    <div className="h-4 mt-3 flex items-center justify-center">
                      <AnimatePresence>
                        {msg && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-xs font-medium bg-gray-800 px-3 py-1 rounded-full text-white"
                          >
                            {msg}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Logs Column */}
                  <div className="p-6 bg-[#0a0a0a]">
                    <h4 className="text-xs font-semibold text-gray-500 mb-3 flex items-center uppercase tracking-widest">
                      <Cpu className="w-3 h-3 mr-2" /> FFmpeg Process Log
                    </h4>
                    <div className="h-32 overflow-y-auto font-mono text-[10px] text-gray-500 pr-2 custom-scrollbar">
                      {currentStatus.logs && currentStatus.logs.length > 0 ? (
                        [...currentStatus.logs].reverse().map((log: string, i: number) => (
                          <div key={i} className="mb-0.5 border-b border-gray-900/50 pb-0.5 truncate" title={log}>{log}</div>
                        ))
                      ) : (
                        <div className="text-gray-700 italic mt-8 text-center text-xs">Waiting for process data...</div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Full Modal for Edit / Configure Stream */}
      {editingStream && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161616] border border-gray-800 rounded-3xl w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="px-8 py-5 border-b border-gray-800 flex justify-between items-center bg-[#111] z-10 shrink-0">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <Settings className="w-6 h-6 mr-3 text-red-500" />
                {isCreating ? 'Create New Stream Configuration' : `Configure Stream: ${editingStream.name}`}
              </h2>
              <button onClick={() => setEditingStream(null)} className="text-gray-500 hover:text-white transition-colors bg-gray-800/50 hover:bg-gray-700 rounded-full p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Left Column Settings */}
                <div className="space-y-6">
                  <div className="bg-[#111] p-6 rounded-2xl border border-gray-800">
                    <h3 className="text-white font-semibold flex items-center mb-5 border-b border-gray-800 pb-2"><Settings className="w-4 h-4 mr-2 text-red-500" /> Core Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <InputLabel icon={Settings}>Display Name</InputLabel>
                        <input
                          type="text"
                          value={editingStream.name}
                          onChange={e => setEditingStream({ ...editingStream, name: e.target.value })}
                          className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none"
                        />
                      </div>
                      <div>
                        <InputLabel icon={Key}>Stream Key Profile Destination</InputLabel>
                        <select
                          value={editingStream.profileId || ''}
                          onChange={e => setEditingStream({ ...editingStream, profileId: e.target.value })}
                          className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none appearance-none"
                        >
                          <option value="" disabled>-- Select a Key Profile from Pool --</option>
                          {config.streamKeys?.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </select>
                        {(!config.streamKeys || config.streamKeys.length === 0) && (
                          <p className="text-red-500 text-xs mt-2 font-medium">No API Profiles found! Build one first in Global Settings.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#111] p-6 rounded-2xl border border-gray-800">
                    <h3 className="text-white font-semibold flex items-center mb-5 border-b border-gray-800 pb-2"><Activity className="w-4 h-4 mr-2 text-red-500" /> Processing Quality</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <InputLabel icon={Video}>Resolution</InputLabel>
                        <select
                          value={editingStream.resolution}
                          onChange={e => setEditingStream({ ...editingStream, resolution: e.target.value })}
                          className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none appearance-none"
                        >
                          <option value="144p">144p (Ultra Low)</option>
                          <option value="240p">240p (Very Low)</option>
                          <option value="360p">360p (Low Quality)</option>
                          <option value="480p">480p (SD)</option>
                          <option value="720p">720p (HD)</option>
                          <option value="1080p">1080p (Full HD)</option>
                          <option value="1440p">1440p (2K QHD)</option>
                          <option value="2160p">2160p (4K UHD)</option>
                        </select>
                      </div>
                      <div>
                        <InputLabel icon={Activity}>Framerate</InputLabel>
                        <select
                          value={editingStream.fps}
                          onChange={e => setEditingStream({ ...editingStream, fps: e.target.value })}
                          className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none appearance-none"
                        >
                          <option value="24">24 FPS</option>
                          <option value="30">30 FPS</option>
                          <option value="60">60 FPS</option>
                          <option value="120">120 FPS</option>
                        </select>
                      </div>
                      <div>
                        <InputLabel icon={Settings}>Bitrate Output</InputLabel>
                        <select
                          value={editingStream.bitrate}
                          onChange={e => setEditingStream({ ...editingStream, bitrate: e.target.value })}
                          className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none appearance-none"
                        >
                          <option value="400k">400 kbps (Good for 144p)</option>
                          <option value="700k">700 kbps (Good for 240p)</option>
                          <option value="1000k">1000 kbps (Good for 360p)</option>
                          <option value="1500k">1500 kbps (Good for 480p)</option>
                          <option value="2500k">2500 kbps (Good for 720p)</option>
                          <option value="4000k">4000 kbps (Standard 1080p)</option>
                          <option value="6000k">6000 kbps (High 1080p60)</option>
                          <option value="9000k">9000 kbps (Good for 1440p)</option>
                          <option value="14000k">14000 kbps (Good for 4K)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#111] p-6 rounded-2xl border border-gray-800">
                    <h3 className="text-white font-semibold flex items-center mb-5 border-b border-gray-800 pb-2"><Clock className="w-4 h-4 mr-2 text-red-500" /> Automation Tools</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between cursor-pointer border border-gray-800 p-3 rounded-xl bg-[#161616] hover:bg-gray-900 transition-colors">
                        <span className="text-gray-300 text-sm font-medium">Enable Hard Auto-Stop (Periodic)</span>
                        <input type="checkbox" className="w-5 h-5 accent-red-500 rounded bg-gray-900 border-gray-700" checked={editingStream.autoStop} onChange={e => setEditingStream({ ...editingStream, autoStop: e.target.checked })} />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer border border-gray-800 p-3 rounded-xl bg-[#161616] hover:bg-gray-900 transition-colors">
                        <span className="text-gray-300 text-sm font-medium">Auto Restart on Connection Drops</span>
                        <input type="checkbox" className="w-5 h-5 accent-red-500 rounded bg-gray-900 border-gray-700" checked={editingStream.autoRestart} onChange={e => setEditingStream({ ...editingStream, autoRestart: e.target.checked })} />
                      </label>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <InputLabel icon={Clock}>Auto-Stop Interval (Hours)</InputLabel>
                          <input type="number" min="0" value={editingStream.autoStopHours} onChange={e => setEditingStream({ ...editingStream, autoStopHours: Number(e.target.value) })} className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none" disabled={!editingStream.autoStop} />
                          <span className="text-xs text-gray-600 mt-1 block">Every {editingStream.autoStopHours}h the stream will refresh</span>
                        </div>
                        <div>
                          <InputLabel icon={Clock}>Reconnect Timeout (Mins)</InputLabel>
                          <input type="number" step="0.1" min="0" value={editingStream.autoRestartDelayMinutes} onChange={e => setEditingStream({ ...editingStream, autoRestartDelayMinutes: Number(e.target.value) })} className="w-full bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl border border-gray-800 focus:border-red-500 outline-none" placeholder="0 for instant" />
                          <span className="text-xs text-gray-600 mt-1 block">0 = fast restart (~5s)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column Playlist Builder */}
                <div className="flex flex-col h-full space-y-4">
                  <div className="bg-[#111] p-6 rounded-2xl border border-gray-800 flex-1 flex flex-col min-h-[400px]">
                    <h3 className="text-white font-semibold flex items-center justify-between mb-4 pb-2 border-b border-gray-800">
                      <span className="flex items-center"><Video className="w-4 h-4 mr-2 text-red-500" /> Playlist Generator</span>
                      <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full text-xs">{editingStream.playlist.length} items</span>
                    </h3>

                    <div className="text-sm text-gray-500 mb-4 bg-gray-900 p-3 rounded-lg border border-gray-800 flex items-start">
                      Select the videos from your Cloud Database below that you wish to pipe into this stream process. They will loop continually.
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {videos.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-10 text-sm">No videos found. Upload some via the File Manager first.</div>
                      ) : (
                        videos.map(vid => {
                          const isSelected = editingStream.playlist.includes(vid.name);
                          return (
                            <label key={vid.name} className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? 'bg-red-500/10 border-red-500/50' : 'bg-[#1a1a1a] border-gray-800 hover:bg-gray-900'} `}>
                              <input
                                type="checkbox"
                                className="w-5 h-5 accent-red-600 shrink-0"
                                checked={isSelected}
                                onChange={() => toggleVideoInPlaylist(vid.name)}
                              />
                              <div className="flex items-center space-x-2 overflow-hidden flex-1">
                                <Video className={`w-4 h-4 shrink-0 ${isSelected ? 'text-red-500' : 'text-gray-600'}`} />
                                <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-gray-400'}`}>{vid.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setPlayingVideo(vid.name);
                                }}
                                className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all shrink-0"
                                title="Preview Video"
                              >
                                <Play className="w-4 h-4 fill-current" />
                              </button>
                            </label>
                          );
                        })
                      )}
                    </div>
                    {editingStream.playlist.length === 0 && (
                      <div className="mt-4 text-xs font-semibold text-red-500 text-center animate-pulse">Warning: Stream cannot start without at least 1 video selected.</div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="p-6 border-t border-gray-800 bg-[#111] flex justify-end space-x-4 shrink-0">
              <button onClick={() => setEditingStream(null)} className="px-6 py-3 rounded-xl text-gray-400 font-medium hover:text-white transition-colors bg-gray-800/50 hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={saveEditingStream} disabled={!editingStream.name || !editingStream.profileId} className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {isCreating ? 'Generate & Save Stream' : 'Update Stream Configuration'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-5xl bg-[#111] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#161616]">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                    <Video className="w-5 h-5" />
                  </div>
                  <span className="text-white font-medium truncate">{playingVideo}</span>
                </div>
                <button
                  onClick={() => setPlayingVideo(null)}
                  className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Video Tag */}
              <div className="aspect-video bg-black flex items-center justify-center">
                <video
                  src={`/videos/${playingVideo}`}
                  controls
                  autoPlay
                  className="w-full h-full max-h-[70vh]"
                >
                  Your browser does not support the video tag.
                </video>
              </div>

              {/* Footer info */}
              <div className="p-4 bg-[#161616] text-center text-xs text-gray-500 border-t border-gray-800">
                Previewing from VPS: public/videos/{playingVideo}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
