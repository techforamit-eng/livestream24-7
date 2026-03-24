'use client'
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Play, Square, RefreshCw, Users, Activity, Clock, Cpu, Settings2, Video } from 'lucide-react';

interface StreamEntry {
  id: string;
  name: string;
  userId: string;
  username: string;
  resolution: string;
  bitrate: string;
  fps: string;
  video: string;
  profileName: string;
  status: 'Running' | 'Stopped' | 'Error' | 'Reconnecting' | 'Waiting';
  uptime: number;
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const userColors: Record<string, { bg: string; text: string; border: string }> = {};
const palette = [
  { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
];
let paletteIdx = 0;
function getColor(userId: string) {
  if (!userColors[userId]) {
    userColors[userId] = palette[paletteIdx++ % palette.length];
  }
  return userColors[userId];
}

export default function ManageStreamsPage() {
  const [streams, setStreams] = useState<StreamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [filterUser, setFilterUser] = useState('all');

  const fetchStreams = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/streams');
      if (res.ok) {
        const data = await res.json();
        setStreams(data.streams || []);
      }
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 3000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  // Local uptime incrementer for smooth real-time display
  useEffect(() => {
    const timer = setInterval(() => {
      setStreams(prev => prev.map(s => {
        if (s.status === 'Running') {
          return { ...s, uptime: s.uptime + 1 };
        }
        return s;
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAction = async (streamId: string, action: 'start' | 'stop') => {
    setActionLoading(prev => ({ ...prev, [streamId]: true }));
    try {
      const res = await fetch('/api/admin/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId, action }),
      });
      const data = await res.json();
      setMessages(prev => ({ ...prev, [streamId]: data.message }));
      setTimeout(() => setMessages(prev => { const n = { ...prev }; delete n[streamId]; return n; }), 4000);
      fetchStreams();
    } catch {
      setMessages(prev => ({ ...prev, [streamId]: 'Action failed' }));
    }
    setActionLoading(prev => ({ ...prev, [streamId]: false }));
  };

  // Get unique users from streams
  const allUsers = Array.from(new Set(streams.map(s => s.userId))).map(uid => ({
    id: uid,
    username: streams.find(s => s.userId === uid)?.username || uid,
  }));

  const filtered = filterUser === 'all' ? streams : streams.filter(s => s.userId === filterUser);

  const runningCount = streams.filter(s => s.status === 'Running').length;
  const totalCount = streams.length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white flex items-center">
            <Radio className="w-6 h-6 mr-3 text-red-500" />
            Global Stream Manager
          </h2>
          <p className="text-gray-500 text-sm mt-1">Monitor and control all user streams from one place. Admin only.</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Live stats */}
          <div className="flex items-center space-x-2 bg-[#161616] border border-gray-800 px-4 py-2 rounded-xl text-sm">
            <span className={`w-2 h-2 rounded-full ${runningCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-white font-semibold">{runningCount}</span>
            <span className="text-gray-500">/ {totalCount} Running</span>
          </div>
          <button
            onClick={fetchStreams}
            className="p-2.5 bg-[#161616] border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white rounded-xl transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* User Filter Pills */}
      <div className="flex items-center flex-wrap gap-2">
        <button
          onClick={() => setFilterUser('all')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${filterUser === 'all' ? 'bg-red-600 border-red-500 text-white' : 'bg-[#161616] border-gray-800 text-gray-400 hover:border-gray-600'}`}
        >
          All Users
        </button>
        {allUsers.map(u => {
          const c = getColor(u.id);
          return (
            <button
              key={u.id}
              onClick={() => setFilterUser(u.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${filterUser === u.id ? `${c.bg} ${c.text} ${c.border}` : 'bg-[#161616] border-gray-800 text-gray-400 hover:border-gray-600'}`}
            >
              {u.username}
            </button>
          );
        })}
      </div>

      {/* Stream Cards */}
      {loading ? (
        <div className="text-gray-400 p-8 text-center">Loading streams...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 p-12 text-center border border-gray-800 rounded-2xl">
          <Radio className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>No streams found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {filtered.map((stream, i) => {
              const isRunning = stream.status === 'Running';
              const isReconnecting = stream.status === 'Reconnecting';
              const isLoading = actionLoading[stream.id];
              const msg = messages[stream.id];
              const c = getColor(stream.userId);

              return (
                <motion.div
                  key={stream.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-[#161616] border border-gray-800 rounded-2xl overflow-hidden shadow-xl"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 bg-[#111] border-b border-gray-800">
                    <div className="flex items-center space-x-4">
                      {/* Status dot */}
                      <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_currentColor] ${isRunning ? 'bg-green-500 text-green-500 animate-pulse' :
                        isReconnecting ? 'bg-amber-500 text-amber-500 animate-pulse' :
                          stream.status === 'Error' ? 'bg-red-500 text-red-500' :
                            'bg-gray-600 text-gray-600'
                        }`} />
                      {isRunning && (
                        <Activity className="w-4 h-4 text-green-500 animate-[pulse_1.5s_infinite]" />
                      )}
                      <div>
                        <h3 className="text-white font-bold text-lg leading-tight">{stream.name}</h3>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <Users className={`w-3.5 h-3.5 ${c.text}`} />
                          <span className={`text-xs font-semibold ${c.text}`}>{stream.username}</span>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${isRunning ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                        isReconnecting ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                          stream.status === 'Error' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                            'bg-gray-800 text-gray-500 border-gray-700'
                        }`}>
                        {stream.status}
                      </span>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleAction(stream.id, 'start')}
                        disabled={isLoading || isRunning || !stream.video || stream.video === 'None'}
                        title="Start Stream"
                        className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${isRunning
                          ? 'bg-green-600 border-green-500 text-white cursor-default'
                          : 'bg-gray-900 border-gray-700 hover:bg-green-600 hover:border-green-500 text-gray-400 hover:text-white disabled:opacity-40'
                          }`}
                      >
                        <Play className={`w-4 h-4 ${isRunning ? 'fill-current animate-pulse' : ''}`} />
                        <span>{isRunning ? 'Live' : 'Start'}</span>
                      </button>
                      <button
                        onClick={() => handleAction(stream.id, 'stop')}
                        disabled={isLoading || (!isRunning && !isReconnecting)}
                        title="Stop Stream"
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-700 bg-gray-900 hover:bg-red-600 hover:border-red-500 text-gray-400 hover:text-white disabled:opacity-40 transition-all"
                      >
                        <Square className="w-4 h-4" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-800 border-b border-gray-800">
                    <div className="px-5 py-3 text-sm">
                      <p className="text-gray-600 text-[10px] uppercase font-bold mb-1">Profile</p>
                      <p className="text-white font-semibold truncate">{stream.profileName}</p>
                    </div>
                    <div className="px-5 py-3 text-sm">
                      <p className="text-gray-600 text-[10px] uppercase font-bold mb-1">Quality</p>
                      <p className="text-white font-semibold">{stream.resolution} @ {stream.fps}fps</p>
                    </div>
                    <div className="px-5 py-3 text-sm">
                      <p className="text-gray-600 text-[10px] uppercase font-bold mb-1">Bitrate</p>
                      <p className="text-white font-semibold">{stream.bitrate}</p>
                    </div>
                    <div className="px-5 py-3 text-sm">
                      <p className="text-gray-600 text-[10px] uppercase font-bold mb-1">Uptime</p>
                      <p className={`font-semibold ${isRunning ? 'text-green-400' : 'text-gray-500'}`}>
                        {isRunning ? formatUptime(stream.uptime) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Message / playlist warning */}
                  <div className="px-6 py-2.5 flex items-center justify-between min-h-[44px]">
                    <div className="flex items-center space-x-2">
                      {!stream.video || stream.video === 'None' ? (
                        <span className="text-xs text-red-500 font-semibold">⚠ No video selected</span>
                      ) : (
                        <div className="flex items-center space-x-2 overflow-hidden max-w-[400px]">
                          <Video className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="text-xs text-gray-400 truncate">{stream.video}</span>
                        </div>
                      )}
                    </div>
                    <AnimatePresence>
                      {msg && (
                        <motion.span
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="text-[10px] bg-gray-800 text-white px-2.5 py-1 rounded-full font-bold uppercase"
                        >
                          {msg}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
