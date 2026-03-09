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
    </div>
  );
}
