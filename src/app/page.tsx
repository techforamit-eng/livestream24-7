'use client'
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Radio } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      
      if (data.success) {
        router.push('/dashboard');
      } else {
        setError(data.message || 'Invalid password');
      }
    } catch (err) {
      setError('Connection failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8 bg-[#111] rounded-2xl shadow-2xl border border-gray-800"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
            <Radio className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-widest text-center">
            V MAGIC <span className="text-red-500">LIVE</span>
          </h1>
          <p className="text-gray-400 text-sm mt-2">Control Panel Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Admin Password"
                className="w-full bg-[#1a1a1a] text-white pl-11 pr-4 py-3 rounded-xl border border-gray-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-gray-600"
              />
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)]"
          >
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
