'use client'
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Cpu, HardDrive, MemoryStick, Network, Radio } from 'lucide-react';

interface SysStats {
  cpu: string;
  ram: string;
  disk: string;
  network: { rx: string; tx: string };
  stream: Record<string, {
    status: 'Running' | 'Stopped' | 'Error';
    uptime: number;
    userId: string;
  }>;
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export default function DashboardOverview() {
  const [stats, setStats] = useState<SysStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <Activity className="w-12 h-12 text-red-500 animate-spin" />
      </div>
    );
  }

  const activeStreamsCount = Object.values(stats.stream || {}).filter(s => s.status === 'Running').length;
  const totalStreamsCount = Object.keys(stats.stream || {}).length;

  // Group by userId
  const userStats: Record<string, { active: number; total: number }> = {};
  Object.values(stats.stream || {}).forEach(s => {
    if (!userStats[s.userId]) {
      userStats[s.userId] = { active: 0, total: 0 };
    }
    userStats[s.userId].total++;
    if (s.status === 'Running') {
      userStats[s.userId].active++;
    }
  });

  const cards = [
    {
      title: 'Active Streams',
      value: `${activeStreamsCount} / ${totalStreamsCount}`,
      sub: activeStreamsCount > 0 ? 'Servers Normal' : 'All Offline',
      icon: Radio,
      color: activeStreamsCount > 0 ? 'text-green-500' : 'text-red-500',
      bg: activeStreamsCount > 0 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      title: 'CPU Usage',
      value: `${stats.cpu}%`,
      sub: 'Server Load',
      icon: Cpu,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'RAM Usage',
      value: `${stats.ram}%`,
      sub: 'Memory Allocation',
      icon: MemoryStick,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      title: 'Disk Usage',
      value: `${stats.disk}%`,
      sub: 'Storage',
      icon: HardDrive,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      title: 'Network Traffic',
      value: `${stats.network.tx} MB/s`,
      sub: `RX: ${stats.network.rx} MB/s`,
      icon: Network,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-semibold text-white">System Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((item, idx) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="p-6 bg-[#161616] border border-gray-800 rounded-2xl flex items-center shadow-lg"
          >
            <div className={`p-4 rounded-xl ${item.bg} mr-6`}>
              <item.icon className={`w-8 h-8 ${item.color}`} />
            </div>
            <div>
              <p className="text-gray-400 text-sm font-medium mb-1">{item.title}</p>
              <h3 className={`text-2xl font-bold ${item.title === 'Active Streams' ? item.color : 'text-white'}`}>
                {item.value}
              </h3>
              <p className="text-gray-500 text-xs mt-1">{item.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-semibold text-white mb-4">Streams by User</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(userStats).map(([userId, userStat], idx) => (
            <motion.div
              key={userId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="p-4 bg-[#1e1e1e] border border-gray-800 rounded-xl"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-300 font-medium capitalize">{userId}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${userStat.active > 0 ? 'bg-green-500/20 text-green-500' : 'bg-gray-700 text-gray-400'}`}>
                  {userStat.active > 0 ? 'Active' : 'Idle'}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-white">{userStat.active}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Active Streams</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-400">{userStat.total}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total</div>
                </div>
              </div>
              {/* Simple progress bar */}
              <div className="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-500"
                  style={{ width: `${(userStat.active / userStat.total) * 100}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
