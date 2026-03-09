'use client'
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, Film, AlertCircle, HardDrive, CheckCircle, XCircle, Loader2, Search, Pencil, Check, X, Play, Maximize2 } from 'lucide-react';

interface VideoFile {
  name: string;
  size: string;
  date: string;
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
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetchVideos();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    // Initialise queue with 0% progress
    setUploadQueue(files.map(f => ({ name: f.name, status: 'uploading', msg: '0%', progress: 0 })));
    setUploading(true);
    setMessage('');

    const formData = new FormData();
    files.forEach(f => formData.append('file', f));

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          setUploadQueue(files.map(f => ({
            name: f.name,
            status: 'uploading',
            msg: pct < 100 ? `${pct}%` : 'Processing...',
            progress: pct,
          })));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.results) {
            setUploadQueue(data.results.map((r: any) => ({
              name: r.name,
              status: r.success ? 'done' : 'error',
              msg: r.message,
              progress: r.success ? 100 : 0,
            })));
          }
          if (data.success || data.results?.some((r: any) => r.success)) {
            fetchVideos();
            setMessage(data.message || 'Upload complete');
          } else {
            setMessage(data.message || 'Upload failed');
          }
        } catch {
          setMessage('Server response error');
        }
        setTimeout(() => { setMessage(''); setUploadQueue([]); }, 8000);
        resolve();
      };

      xhr.onerror = () => {
        setMessage('Upload error. Please try again.');
        setUploadQueue(files.map(f => ({ name: f.name, status: 'error', msg: 'Network error', progress: 0 })));
        setTimeout(() => { setMessage(''); setUploadQueue([]); }, 8000);
        resolve();
      };

      xhr.open('POST', '/api/videos');
      xhr.send(formData);
    });

    setUploading(false);
    e.target.value = '';
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

  const filteredVideos = videos.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Files Database</h2>
          <p className="text-gray-500 text-sm mt-1">All uploaded videos stored on the VPS. Use Stream Control to assign videos to playlists.</p>
        </div>
        <div className="flex items-center space-x-3 bg-[#161616] border border-gray-800 rounded-xl px-4 py-2">
          <HardDrive className="w-5 h-5 text-red-500" />
          <span className="text-white font-semibold">{videos.length}</span>
          <span className="text-gray-500 text-sm">videos stored</span>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-[#161616] border border-gray-800 rounded-3xl p-6 shadow-xl">
        <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-all group ${uploading ? 'border-red-500/60 bg-red-500/5' : 'border-gray-800 bg-[#111] hover:bg-gray-800/40 hover:border-red-500/50'}`}>
          <div className="flex flex-col items-center justify-center py-4">
            <Upload className={`w-10 h-10 mb-3 transition-all ${uploading ? 'text-red-500 animate-bounce' : 'text-gray-600 group-hover:text-red-500 group-hover:scale-110'}`} />
            <p className="text-base text-gray-400">
              <span className="font-bold text-white">Click to upload</span> &nbsp;or drag and drop
            </p>
            <p className="text-xs text-gray-600 mt-1.5">MP4 files only · Multiple files supported · Max 100 GB each</p>
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
                  {/* Progress bar */}
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
      <div className="bg-[#161616] border border-gray-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Film className="w-5 h-5 mr-2 text-red-500" /> All Videos
          </h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#111] border border-gray-800 text-white text-sm rounded-xl pl-9 pr-4 py-2 focus:border-red-500 focus:outline-none w-48"
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
                    <div className="flex items-center space-x-1 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => setPlayingVideo(vid.name)}
                        className="p-2 text-gray-500 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-all"
                        title="Play video"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button
                        onClick={() => startRename(vid.name)}
                        className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                        title="Rename video"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(vid.name)}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
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
              {/* Header */}
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
                Playing from VPS storage: public/videos/{playingVideo}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
