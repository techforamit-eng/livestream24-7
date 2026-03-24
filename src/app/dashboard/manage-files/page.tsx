'use client'
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderKanban, Film, ArrowRightLeft, RefreshCw, Users, Search, ChevronDown } from 'lucide-react';

interface FileEntry {
  name: string;
  userId: string;
  username: string;
  size: string;
  bytes: number;
  date: string;
}

interface UserEntry {
  id: string;
  username: string;
}

export default function ManageFilesPage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [movingFile, setMovingFile] = useState<FileEntry | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setUsers(data.users || []);
      }
    } catch { }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const startMove = (file: FileEntry) => {
    setMovingFile(file);
    const others = users.filter(u => u.id !== file.userId);
    setTargetUserId(others[0]?.id || '');
  };

  const handleMove = async () => {
    if (!movingFile || !targetUserId) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: movingFile.name,
          fromUserId: movingFile.userId,
          toUserId: targetUserId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setMovingFile(null);
        fetchData();
      } else {
        showToast(data.message || 'Failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setActionLoading(false);
  };

  // Group by user
  const filtered = files.filter(f => {
    const matchUser = filterUser === 'all' || f.userId === filterUser;
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    return matchUser && matchSearch;
  });

  // Stats
  const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
  const formatTotal = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const userColors: Record<string, string> = {};
  const palette = ['text-blue-400', 'text-amber-400', 'text-green-400', 'text-purple-400', 'text-pink-400'];
  users.forEach((u, i) => { userColors[u.id] = palette[i % palette.length]; });

  const userBgColors: Record<string, string> = {};
  const bgPalette = ['bg-blue-500/10 border-blue-500/20', 'bg-amber-500/10 border-amber-500/20', 'bg-green-500/10 border-green-500/20', 'bg-purple-500/10 border-purple-500/20', 'bg-pink-500/10 border-pink-500/20'];
  users.forEach((u, i) => { userBgColors[u.id] = bgPalette[i % bgPalette.length]; });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white flex items-center">
            <FolderKanban className="w-6 h-6 mr-3 text-red-500" />
            Global File Manager
          </h2>
          <p className="text-gray-500 text-sm mt-1">View and reassign all video files across users. Admin only.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-[#161616] border border-gray-800 px-4 py-2 rounded-xl">
            <Film className="w-4 h-4 text-red-500" />
            <span className="text-white font-semibold">{files.length}</span>
            <span className="text-gray-500 text-sm">files</span>
            <span className="text-gray-700">·</span>
            <span className="text-gray-400 text-sm">{formatTotal(totalBytes)}</span>
          </div>
          <button
            onClick={fetchData}
            className="p-2.5 bg-[#161616] border border-gray-800 hover:border-gray-600 text-gray-400 hover:text-white rounded-xl transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* User Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {users.map(u => {
          const userFiles = files.filter(f => f.userId === u.id);
          const userBytes = userFiles.reduce((a, f) => a + f.bytes, 0);
          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setFilterUser(filterUser === u.id ? 'all' : u.id)}
              className={`cursor-pointer border rounded-2xl p-4 transition-all ${filterUser === u.id ? userBgColors[u.id] + ' scale-[1.02]' : 'bg-[#161616] border-gray-800 hover:border-gray-700'}`}
            >
              <div className="flex items-center space-x-2 mb-2">
                <Users className={`w-4 h-4 ${userColors[u.id] || 'text-gray-400'}`} />
                <span className={`font-semibold text-sm ${userColors[u.id] || 'text-white'}`}>{u.username}</span>
              </div>
              <p className="text-2xl font-bold text-white">{userFiles.length}</p>
              <p className="text-xs text-gray-500">{formatTotal(userBytes)}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-3 flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#161616] border border-gray-800 text-white text-sm rounded-xl pl-9 pr-4 py-2.5 focus:border-red-500 focus:outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="bg-[#161616] border border-gray-800 text-white text-sm rounded-xl px-4 py-2.5 focus:border-red-500 focus:outline-none appearance-none pr-8"
          >
            <option value="all">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* File List */}
      {loading ? (
        <div className="text-gray-400 p-8 text-center">Loading all files...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 p-12 text-center border border-gray-800 rounded-2xl">
          <Film className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No files found.</p>
        </div>
      ) : (
        <div className="bg-[#161616] border border-gray-800 rounded-3xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs font-semibold text-gray-500 uppercase tracking-widest px-6 py-3 border-b border-gray-800 bg-[#111]">
            <span>File Name</span>
            <span className="text-right pr-6">Owner</span>
            <span className="text-right pr-6">Size</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            <AnimatePresence>
              {filtered.map((file, i) => (
                <motion.div
                  key={`${file.userId}_${file.name}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.02 }}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center px-6 py-4 hover:bg-gray-900/40 transition-colors group"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center shrink-0">
                      <Film className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="text-white text-sm font-medium truncate" title={file.name}>{file.name}</span>
                  </div>
                  <div className="pr-6">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${userBgColors[file.userId] || 'bg-gray-800 border-gray-700'} ${userColors[file.userId] || 'text-gray-300'}`}>
                      {file.username}
                    </span>
                  </div>
                  <div className="pr-6">
                    <span className="text-gray-500 text-sm">{file.size}</span>
                  </div>
                  <div>
                    <button
                      onClick={() => startMove(file)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 hover:border-red-500/50 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-lg transition-all text-xs font-semibold opacity-0 group-hover:opacity-100"
                      title="Reassign to another user"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Reassign</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Move Modal */}
      <AnimatePresence>
        {movingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#161616] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="px-6 py-5 border-b border-gray-800 bg-[#111]">
                <h3 className="text-lg font-bold text-white flex items-center">
                  <ArrowRightLeft className="w-5 h-5 mr-3 text-red-500" />
                  Reassign File Ownership
                </h3>
                <p className="text-sm text-gray-500 mt-1 truncate">File: <span className="text-gray-300 font-medium">{movingFile.name}</span></p>
              </div>

              <div className="p-6 space-y-5">
                {/* From */}
                <div className="flex items-center space-x-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <Users className={`w-5 h-5 shrink-0 ${userColors[movingFile.userId] || 'text-gray-400'}`} />
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Current Owner</p>
                    <p className={`font-bold ${userColors[movingFile.userId] || 'text-white'}`}>{movingFile.username} <span className="font-mono text-gray-600 font-normal text-xs">({movingFile.userId})</span></p>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <div className="w-8 h-8 bg-red-600/20 border border-red-500/30 rounded-full flex items-center justify-center">
                    <ArrowRightLeft className="w-4 h-4 text-red-500" />
                  </div>
                </div>

                {/* To */}
                <div>
                  <label className="text-sm font-medium text-gray-400 block mb-2">Transfer To User</label>
                  <div className="relative">
                    <select
                      value={targetUserId}
                      onChange={e => setTargetUserId(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-gray-800 focus:border-red-500 text-white text-sm rounded-xl px-4 py-3 outline-none appearance-none pr-8"
                    >
                      {users.filter(u => u.id !== movingFile.userId).map(u => (
                        <option key={u.id} value={u.id}>{u.username} ({u.id})</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs px-4 py-3 rounded-xl">
                  ⚠️ The file will be moved to the selected user's folder. Any stream playlist referencing this file will need manual update.
                </div>

                <div className="flex justify-end space-x-3 pt-2 border-t border-gray-800">
                  <button
                    onClick={() => setMovingFile(null)}
                    className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMove}
                    disabled={actionLoading || !targetUserId}
                    className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>{actionLoading ? 'Moving...' : 'Confirm Transfer'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-10 left-1/2 px-6 py-3 rounded-full shadow-2xl font-semibold z-50 text-sm text-white ${toastType === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
