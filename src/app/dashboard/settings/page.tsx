'use client'
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Lock, Link, Trash2, Plus, Key, Eye, EyeOff } from 'lucide-react';
import type { AppConfig, StreamKeyProfile } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [showAdminPass, setShowAdminPass] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error(err));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setMessage(data.message);
    } catch (err) {
      setMessage('Failed to save settings.');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const updateGlobal = (key: string, value: any) => {
    if (config) setConfig({ ...config, [key]: value });
  };

  const updateProfile = (profileId: string, key: keyof StreamKeyProfile, value: any) => {
    if (!config) return;
    const newKeys = config.streamKeys.map(p =>
      p.id === profileId ? { ...p, [key]: value } : p
    );
    setConfig({ ...config, streamKeys: newKeys });
  }

  const toggleKeyVisibility = (profileId: string) => {
    setVisibleKeys(prev => ({ ...prev, [profileId]: !prev[profileId] }));
  }

  const addProfile = () => {
    if (!config) return;
    const newKeys = [...config.streamKeys, { id: uuidv4(), name: 'New Key Profile', youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: '' }];
    setConfig({ ...config, streamKeys: newKeys });
  }

  const removeProfile = (profileId: string) => {
    if (!config) return;
    if (!confirm('Delete this stream key profile?')) return;
    const newKeys = config.streamKeys.filter(p => p.id !== profileId);

    // Unassign this profile from any streams using it
    const newStreams = config.streams.map(s => s.profileId === profileId ? { ...s, profileId: undefined } : s);

    setConfig({ ...config, streamKeys: newKeys, streams: newStreams });
  }

  const InputLabel = ({ children, icon: Icon }: any) => (
    <label className="flex items-center space-x-2 text-sm font-medium text-gray-400 mb-2">
      <Icon className="w-4 h-4 text-red-500" />
      <span>{children}</span>
    </label>
  );

  if (!config) return <div className="p-8 text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
        <h2 className="text-2xl font-semibold text-white">Application Global Settings</h2>
        <p className="text-xs text-gray-500 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg font-medium">Stream specific configuration has moved to the Stream Control tab.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 shadow-2xl">
            <h3 className="text-xl font-semibold text-white mb-6 border-b border-gray-800 pb-3 flex items-center">
              <Lock className="w-6 h-6 mr-3 text-red-500" /> User Security
            </h3>
            <div className="max-w-md">
              <InputLabel icon={Lock}>Update Admin Password</InputLabel>
              <div className="relative">
                <input
                  type={showAdminPass ? "text" : "password"}
                  placeholder="Leave blank to keep unchanged"
                  onChange={e => updateGlobal('newPassword', e.target.value)}
                  className="w-full bg-[#1a1a1a] text-white px-4 py-3 pr-12 rounded-xl border border-gray-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPass(!showAdminPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1"
                >
                  {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 shadow-2xl">
            <div className="mb-6 border-b border-gray-800 pb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white flex items-center">
                <Key className="w-6 h-6 mr-3 text-red-500" /> Stream Key Profiles pool
              </h3>
              <button
                type="button" onClick={addProfile}
                className="flex items-center space-x-1 text-sm bg-red-600/10 text-red-500 px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-colors border border-red-500/20 font-medium"
              >
                <Plus className="w-4 h-4" /> <span>Add Profile</span>
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-6 font-medium">Create credential profiles here and assign them to Stream instances on the Stream dashboard.</p>

            {config.streamKeys.length === 0 ? (
              <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl italic font-medium text-sm text-center py-8">No stream keys saved. Add one to use in your stream channels!</div>
            ) : (
              <div className="space-y-6">
                {config.streamKeys.map(profile => (
                  <div key={profile.id} className="bg-[#111] border border-gray-800 p-6 rounded-2xl relative shadow-lg">
                    <button type="button" onClick={() => removeProfile(profile.id)} className="absolute top-6 right-6 text-gray-500 hover:text-red-500 transition-colors bg-gray-900 hover:bg-red-500/10 p-2 rounded-lg" title="Delete Profile"><Trash2 className="w-4 h-4" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mr-8">
                      <div className="md:col-span-2">
                        <InputLabel icon={Key}>Profile Name</InputLabel>
                        <input type="text" value={profile.name} onChange={e => updateProfile(profile.id, 'name', e.target.value)} className="w-full max-w-sm bg-[#1a1a1a] text-white px-4 py-3 rounded-xl border border-gray-800 focus:border-red-500 outline-none text-sm font-medium transition-all" />
                      </div>
                      <div>
                        <InputLabel icon={Link}>RTMP Server URL</InputLabel>
                        <input type="text" value={profile.youtubeRtmpUrl} onChange={e => updateProfile(profile.id, 'youtubeRtmpUrl', e.target.value)} className="w-full bg-[#1a1a1a] text-white px-4 py-3 rounded-xl border border-gray-800 focus:border-red-500 outline-none text-sm transition-all" />
                      </div>
                      <div>
                        <InputLabel icon={Lock}>Secure Stream Key</InputLabel>
                        <div className="relative">
                          <input
                            type={visibleKeys[profile.id] ? "text" : "password"}
                            value={profile.streamKey}
                            onChange={e => updateProfile(profile.id, 'streamKey', e.target.value)}
                            className="w-full bg-[#1a1a1a] text-white px-4 py-3 pr-12 rounded-xl border border-gray-800 focus:border-red-500 outline-none text-sm font-mono transition-all"
                            placeholder="Enter stream key"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(profile.id)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1"
                          >
                            {visibleKeys[profile.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        <div className="flex items-center justify-between pt-6 mt-8 border-t border-gray-800 pb-8">
          <p className="text-gray-400 text-sm">
            {message && <span className="text-green-500 font-medium">{message}</span>}
          </p>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)]"
          >
            <Save className="w-5 h-5" />
            <span>Save Application Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
}
