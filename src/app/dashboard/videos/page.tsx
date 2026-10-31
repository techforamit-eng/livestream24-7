'use client'
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Trash2, Film, AlertCircle, HardDrive, CheckCircle, XCircle,
  Loader2, Search, Pencil, Check, X, Play, Maximize2, Zap, Clock, RefreshCw
} from 'lucide-react';

interface VideoFile {
  name: string;
  size: string;
  date: string;
}

interface ConvertJob {
  id: string;
  inputFile: string;
  outputFile: string;
  status: 'converting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentTime: string;
  totalTime: string;
  speed: string;
  error?: string;
  createdAt: number;
}

export default function FilesDB() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; msg: string; progress: number }[]>([]);
  const [search, setSearch] = useState('');
  const [loadingPage, setLoadingPage] = useState(true);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('admin');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Video Converter Modal State
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedInputVideo, setSelectedInputVideo] = useState('');
  const [outputVideoName, setOutputVideoName] = useState('');
  const [convertResolution, setConvertResolution] = useState('720p');
  const [convertBitrate, setConvertBitrate] = useState('2500k');
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');
  const [convertJobs, setConvertJobs] = useState<ConvertJob[]>([]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.userRole) setUserRole(data.userRole);
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
    setLoadingPage(false);
  };

  const fetchConvertJobs = async () => {
    try {
      const res = await fetch('/api/videos/convert');
      if (res.ok) {
        const data = await res.json();
        setConvertJobs(data.jobs || []);
      }
    } catch (err) { }
  };

  useEffect(() => {
    fetchConfig();
    fetchVideos();
    fetchConvertJobs();
  }, []);

  // Poll conversion jobs if any is actively converting
  useEffect(() => {
    const hasActive = convertJobs.some(j => j.status === 'converting');
    if (!hasActive) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/videos/convert');
        if (res.ok) {
          const data = await res.json();
          const newJobs: ConvertJob[] = data.jobs || [];

          // Check if any job just completed
          const justFinished = newJobs.some(
            nj => nj.status === 'completed' && convertJobs.find(oj => oj.id === nj.id && oj.status === 'converting')
          );
          if (justFinished) {
            fetchVideos();
          }
          setConvertJobs(newJobs);
        }
      } catch (e) { }
    }, 2000);

    return () => clearInterval(interval);
  }, [convertJobs]);

  const openConvertModal = (defaultVideo?: string) => {
    const videoToUse = defaultVideo || (videos[0]?.name || '');
    setSelectedInputVideo(videoToUse);
    const base = videoToUse.replace(/\.mp4$/i, '');
    setOutputVideoName(base ? `${base}_ultralow.mp4` : '');
    setConvertError('');
    setIsConvertModalOpen(true);
  };

  const handleStartConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInputVideo || !outputVideoName) return;

    setConverting(true);
    setConvertError('');

    try {
      const res = await fetch('/api/videos/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputFile: selectedInputVideo,
          outputFile: outputVideoName,
          resolution: convertResolution,
          bitrate: convertBitrate
        })
      });

      const data = await res.json();
      if (data.success) {
        setIsConvertModalOpen(false);
        fetchConvertJobs();
      } else {
        setConvertError(data.message || 'Conversion failed to start');
      }
    } catch (err: any) {
      setConvertError(err.message || 'Network error');
    } finally {
      setConverting(false);
    }
  };

  const handleDismissJob = async (jobId: string) => {
    try {
      await fetch('/api/videos/convert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      setConvertJobs(prev => prev.filter(j => j.id !== jobId));
      fetchVideos();
    } catch (err) { }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const target = e.target;

    setUploading(true);
    setMessage('');

    // Initialize queue
    setUploadQueue(files.map(f => ({ name: f.name, status: 'uploading', msg: 'Queued', progress: 0 })));

    // Process files one by one for maximum reliability
    const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await new Promise<void>((resolve, reject) => {
          const formData = new FormData();
          formData.append('file', chunk);

          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const uploadedBytes = start + event.loaded;
              const totalPct = Math.round((uploadedBytes / file.size) * 100);

              setUploadQueue(prev => prev.map((item, idx) =>
                idx === i ? {
                  ...item,
                  msg: totalPct < 100 ? `${totalPct}%` : 'Processing...',
                  progress: totalPct
                } : item
              ));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                const result = data.results?.[0];

                if (chunkIndex === totalChunks - 1) {
                  setUploadQueue(prev => prev.map((item, idx) =>
                    idx === i ? {
                      ...item,
                      status: (result?.success || data.success) ? 'done' : 'error',
                      msg: result?.message || data.message || 'Complete',
                      progress: 100
                    } : item
                  ));
                }
                resolve();
              } catch {
                reject(new Error('Invalid server response'));
              }
            } else {
              reject(new Error(`Server returned ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error'));

          xhr.open('POST', '/api/videos');
          xhr.setRequestHeader('x-filename', file.name);
          xhr.setRequestHeader('x-chunk-index', chunkIndex.toString());
          xhr.setRequestHeader('x-total-chunks', totalChunks.toString());
          xhr.send(formData);
        }).catch((err) => {
          setUploadQueue(prev => prev.map((item, idx) =>
            idx === i ? { ...item, status: 'error', msg: err.message || 'Error', progress: 0 } : item
          ));
          chunkIndex = totalChunks;
        });
      }
    }

    setUploading(false);
    fetchVideos();
    if (target) target.value = '';

    setTimeout(() => {
      setUploadQueue(prev => prev.filter(item => item.status === 'error'));
    }, 10000);
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}"? This will also remove it from all playlists.`)) return;
    try {
      const res = await fetch('/api/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos(prev => prev.filter(v => v.name !== filename));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startRename = (name: string) => {
    setRenamingFile(name);
    setRenameValue(name.replace(/\.mp4$/i, ''));
    setRenameError('');
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const cancelRename = () => {
    setRenamingFile(null);
    setRenameValue('');
    setRenameError('');
  };

  const confirmRename = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed + '.mp4' === oldName) {
      cancelRename();
      return;
    }

    try {
      const res = await fetch('/api/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName: trimmed + '.mp4' }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos(prev => prev.map(v => v.name === oldName ? { ...v, name: data.newName } : v));
        cancelRename();
      } else {
        setRenameError(data.message || 'Rename failed');
        renameInputRef.current?.focus();
      }
    } catch {
      setRenameError('Network error, try again');
    }
  };

  const filteredVideos = (videos || []).filter(v =>
    v && v.name && v.name.toLowerCase().includes((search || '').toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
            <span>Files Database</span>
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            All uploaded videos stored on VPS. Direct copy, preview, rename, or optimize for 24/7 Live Stream.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto shrink-0">
          <button
            onClick={() => openConvertModal()}
            className="flex items-center space-x-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95"
          >
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400/30" />
            <span>⚡ Ultra-Low Converter</span>
          </button>

          <div className="flex items-center space-x-2.5 bg-[#161616] border border-gray-800 rounded-xl px-4 py-2">
            <HardDrive className="w-4 h-4 text-red-500" />
            <span className="text-white font-bold text-sm">{videos.length}</span>
            <span className="text-gray-500 text-xs">videos</span>
          </div>
        </div>
      </div>

      {/* Active Conversion Jobs Panel */}
      <AnimatePresence>
        {convertJobs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#161616] border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Video Optimization Queue (Strict 2s Keyframe & 30fps CFR)</span>
              </h3>
              <span className="text-xs text-gray-500">
                {convertJobs.filter(j => j.status === 'converting').length} active job(s)
              </span>
            </div>

            <div className="space-y-2.5">
              {convertJobs.map((job) => (
                <div
                  key={job.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    job.status === 'completed'
                      ? 'bg-green-500/10 border-green-500/30'
                      : job.status === 'failed'
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-[#111] border-amber-500/30'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      {job.status === 'converting' ? (
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                      ) : job.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-gray-400 truncate max-w-[150px] sm:max-w-[200px]" title={job.inputFile}>
                            {job.inputFile}
                          </span>
                          <span className="text-gray-600">➔</span>
                          <span className="text-white font-bold truncate max-w-[180px] sm:max-w-[240px]" title={job.outputFile}>
                            {job.outputFile}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0 text-xs">
                      {job.status === 'converting' && (
                        <div className="flex items-center space-x-2 text-amber-300 font-mono text-[11px]">
                          <span>{job.currentTime} / {job.totalTime || '...'}</span>
                          {job.speed && <span className="text-gray-500 font-sans">({job.speed})</span>}
                          <span className="font-bold text-amber-400 ml-1">{job.progress}%</span>
                        </div>
                      )}
                      {job.status === 'completed' && (
                        <span className="text-green-400 font-semibold text-xs">
                          ✓ Ready for 24/7 Ultra-Low Stream!
                        </span>
                      )}
                      {job.status === 'failed' && (
                        <span className="text-red-400 font-semibold text-xs">
                          {job.error || 'Conversion Failed'}
                        </span>
                      )}

                      <button
                        onClick={() => handleDismissJob(job.id)}
                        className="p-1 text-gray-500 hover:text-white rounded hover:bg-gray-800 transition-colors"
                        title={job.status === 'converting' ? 'Cancel conversion' : 'Dismiss'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {job.status === 'converting' && (
                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                        animate={{ width: `${job.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Zone */}
      <div className="bg-[#161616] border border-gray-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl">
        <label className={`flex flex-col items-center justify-center w-full h-32 sm:h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-all group ${uploading ? 'border-red-500/60 bg-red-500/5' : 'border-gray-800 bg-[#111] hover:bg-gray-800/40 hover:border-red-500/50'}`}>
          <div className="flex flex-col items-center justify-center py-4 text-center px-4">
            <Upload className={`w-8 h-8 sm:w-10 sm:h-10 mb-2.5 transition-all ${uploading ? 'text-red-500 animate-bounce' : 'text-gray-600 group-hover:text-red-500 group-hover:scale-110'}`} />
            <p className="text-sm sm:text-base text-gray-400">
              <span className="font-bold text-white">Click to upload</span> &nbsp;or drag and drop
            </p>
            <p className="text-xs text-gray-600 mt-1">MP4 files only · Multiple files supported</p>
          </div>
          <input type="file" className="hidden" accept=".mp4" multiple onChange={handleUpload} disabled={uploading} />
        </label>

        {/* Upload Queue Status */}
        <AnimatePresence>
          {uploadQueue.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar"
            >
              {uploadQueue.map((item, i) => (
                <div key={i} className={`px-4 py-3 rounded-xl text-sm font-medium border ${item.status === 'done' ? 'bg-green-500/10 border-green-500/30'
                  : item.status === 'error' ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-gray-900 border-gray-800'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2 overflow-hidden">
                      {item.status === 'done' ? <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
                        : item.status === 'error' ? <XCircle className="w-4 h-4 shrink-0 text-red-500" />
                          : <Loader2 className="w-4 h-4 shrink-0 text-blue-400 animate-spin" />
                      }
                      <span className={`truncate text-xs ${item.status === 'done' ? 'text-green-300' : item.status === 'error' ? 'text-red-400' : 'text-gray-300'
                        }`} title={item.name}>{item.name}</span>
                    </div>
                    <span className={`shrink-0 ml-3 text-xs font-bold ${item.status === 'done' ? 'text-green-400' : item.status === 'error' ? 'text-red-400' : 'text-blue-400'
                      }`}>{item.msg}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${item.status === 'done' ? 'bg-green-500' : item.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${item.progress}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search + Grid of Videos */}
      <div className="bg-[#161616] border border-gray-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Film className="w-5 h-5 mr-2 text-red-500" /> All Videos ({filteredVideos.length})
          </h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#111] border border-gray-800 text-white text-sm rounded-xl pl-9 pr-4 py-2 focus:border-red-500 focus:outline-none w-full sm:w-56"
            />
          </div>
        </div>

        {loadingPage ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600 space-y-3">
            <AlertCircle className="w-10 h-10" />
            <p className="text-sm">{search ? 'No videos match your search.' : 'No videos uploaded yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredVideos.map((vid, idx) => (
                <motion.div
                  key={vid.name}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.03 }}
                  className="group flex items-center justify-between p-4 bg-[#111] border border-gray-800 rounded-2xl hover:border-gray-700 transition-all hover:shadow-lg"
                >
                  <div className="flex items-center space-x-3 overflow-hidden min-w-0 flex-1">
                    <div className="shrink-0 w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                      <Film className="w-5 h-5 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {renamingFile === vid.name ? (
                        <div className="space-y-1">
                          <div className="flex items-center space-x-1">
                            <input
                              ref={renameInputRef}
                              type="text"
                              value={renameValue}
                              onChange={e => { setRenameValue(e.target.value); setRenameError(''); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmRename(vid.name);
                                if (e.key === 'Escape') cancelRename();
                              }}
                              className="w-full bg-[#1a1a1a] border border-red-500/60 text-white text-sm font-medium rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-red-500"
                              autoFocus
                            />
                            <span className="text-gray-500 text-xs shrink-0">.mp4</span>
                          </div>
                          {renameError && <p className="text-red-500 text-xs">{renameError}</p>}
                          <div className="flex items-center space-x-2">
                            <button onClick={() => confirmRename(vid.name)} className="flex items-center space-x-1 text-xs bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-lg hover:bg-green-500/20 transition-all">
                              <Check className="w-3 h-3" /> <span>Save</span>
                            </button>
                            <button onClick={cancelRename} className="flex items-center space-x-1 text-xs text-gray-500 hover:text-red-400 transition-colors">
                              <X className="w-3 h-3" /> <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-white truncate" title={vid.name}>{vid.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{vid.size}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {renamingFile !== vid.name && (
                    <div className="flex items-center space-x-1 shrink-0 ml-2">
                      <button
                        onClick={() => openConvertModal(vid.name)}
                        className="p-2 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                        title="⚡ Convert for 24/7 Ultra-Low Stream (2s Keyframe)"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPlayingVideo(vid.name)}
                        className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-all"
                        title="Play video"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button
                        onClick={() => startRename(vid.name)}
                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                        title="Rename video"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(vid.name)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Delete video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-5xl bg-[#111] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#161616]">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                    <Film className="w-5 h-5" />
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

              <div className="aspect-video bg-black flex items-center justify-center">
                <video
                  src={`/videos/${userRole}/${playingVideo}`}
                  controls
                  autoPlay
                  className="w-full h-full max-h-[70vh]"
                >
                  Your browser does not support the video tag.
                </video>
              </div>

              <div className="p-4 bg-[#161616] text-center text-xs text-gray-500 border-t border-gray-800">
                Playing from VPS storage: public/videos/{playingVideo}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ultra-Low Video Optimizer Modal */}
      <AnimatePresence>
        {isConvertModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl bg-[#141414] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-[#181818]">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
                    <Zap className="w-5 h-5 fill-amber-400/40" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white">24/7 Ultra-Low Stream Optimizer</h3>
                    <p className="text-xs text-gray-400">Convert video with strict 2s Keyframe (GOP 60) & 30 FPS CFR</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsConvertModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleStartConversion} className="p-5 sm:p-6 space-y-4">
                {/* Select Input Video */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                    Select Input Video
                  </label>
                  <select
                    value={selectedInputVideo}
                    onChange={(e) => {
                      setSelectedInputVideo(e.target.value);
                      const base = e.target.value.replace(/\.mp4$/i, '');
                      setOutputVideoName(`${base}_ultralow.mp4`);
                    }}
                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none"
                    required
                  >
                    <option value="" disabled>-- Select a Video --</option>
                    {videos.map(v => (
                      <option key={v.name} value={v.name}>{v.name} ({v.size})</option>
                    ))}
                  </select>
                </div>

                {/* Output File Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                    New Output File Name
                  </label>
                  <input
                    type="text"
                    value={outputVideoName}
                    onChange={(e) => setOutputVideoName(e.target.value)}
                    placeholder="e.g. video_ultralow.mp4"
                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-amber-500 focus:outline-none font-mono"
                    required
                  />
                  <p className="text-[11px] text-gray-500 mt-1">This new file will be saved in your VPS video library.</p>
                </div>

                {/* Resolution & Bitrate */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                      Target Resolution
                    </label>
                    <select
                      value={convertResolution}
                      onChange={(e) => setConvertResolution(e.target.value)}
                      className="w-full bg-[#111] border border-gray-800 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none"
                    >
                      <option value="1080p">1080p (Full HD)</option>
                      <option value="720p">720p (Recommended)</option>
                      <option value="480p">480p (Lightweight)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase mb-1.5">
                      Target Bitrate
                    </label>
                    <select
                      value={convertBitrate}
                      onChange={(e) => setConvertBitrate(e.target.value)}
                      className="w-full bg-[#111] border border-gray-800 rounded-xl px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none"
                    >
                      <option value="3500k">3500 kbps (1080p)</option>
                      <option value="2500k">2500 kbps (Recommended)</option>
                      <option value="1500k">1500 kbps (480p)</option>
                    </select>
                  </div>
                </div>

                {/* Information Box */}
                <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs space-y-1.5 text-amber-200/90">
                  <div className="font-semibold text-amber-300 flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Why optimize with this tool?</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-gray-400 text-[11px]">
                    <li>Forces exact <strong className="text-gray-300">2-second Keyframe (GOP 60)</strong> required by YouTube Live.</li>
                    <li>Locks continuous <strong className="text-gray-300">30 FPS Constant Frame Rate</strong> so 24/7 loops never drop timestamps.</li>
                    <li>Once ready, stream this video in <strong className="text-amber-300 font-semibold">Ultra-Low CPU Direct Copy</strong> at 0% CPU with zero buffering!</li>
                  </ul>
                </div>

                {convertError && (
                  <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300">
                    {convertError}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsConvertModalOpen(false)}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={converting || !selectedInputVideo || !outputVideoName}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg transition-all active:scale-95"
                  >
                    {converting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Starting Conversion...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-white/20" />
                        <span>Convert Video Now</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
