import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { getStreamStatus, activeStreams } from '@/lib/stream';
import { getConfig } from '@/lib/config';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import os from 'os';
import pidusage from 'pidusage';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    let currentUserId = 'admin';

    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.role || 'admin';
      } catch (e) { }
    }

    let cpuUsage = '0.0';
    let ramUsage = '0.0';
    let diskUsage = '0.0';
    let netRx = 0;
    let netTx = 0;

    if (currentUserId === 'admin') {
      const [cpu, mem, fsSize, networkStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
      ]);

      cpuUsage = cpu.currentLoad.toFixed(1);
      ramUsage = ((mem.active / mem.total) * 100).toFixed(1);
      
      const mainDisk = fsSize.find(d => d.mount === '/') || fsSize[0] || { use: 0 };
      diskUsage = mainDisk.use.toFixed(1);

      netRx = networkStats.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0) / 1024 / 1024;
      netTx = networkStats.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0) / 1024 / 1024;
    } else {
      const [fsSize, networkStats] = await Promise.all([
        si.fsSize(),
        si.networkStats(),
      ]);

      const mainDisk = fsSize.find(d => d.mount === '/') || fsSize[0] || { use: 0 };
      diskUsage = mainDisk.use.toFixed(1);

      netRx = networkStats.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0) / 1024 / 1024;
      netTx = networkStats.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0) / 1024 / 1024;

      const config = getConfig();
      const userActivePids: number[] = [];

      for (const [streamId, activeStream] of activeStreams.entries()) {
        const streamConfig = config.streams.find(s => s.id === streamId);
        const streamOwner = streamConfig?.userId || 'admin';
        if (streamOwner === currentUserId && activeStream.process?.pid) {
          try {
            process.kill(activeStream.process.pid, 0); // Check if alive
            userActivePids.push(activeStream.process.pid);
          } catch (e) { }
        }
      }

      let totalUserCpu = 0;
      let totalUserMemBytes = 0;

      if (userActivePids.length > 0) {
        const statsPromises = userActivePids.map(pid => {
          return new Promise<{ cpu: number; memory: number } | null>(resolve => {
            pidusage(pid, (err, stats) => {
              if (err || !stats) {
                resolve(null);
              } else {
                resolve({ cpu: stats.cpu, memory: stats.memory });
              }
            });
          });
        });

        const statsList = await Promise.all(statsPromises);
        for (const stat of statsList) {
          if (stat) {
            totalUserCpu += stat.cpu;
            totalUserMemBytes += stat.memory;
          }
        }
      }

      cpuUsage = totalUserCpu.toFixed(1);
      const totalMem = os.totalmem();
      ramUsage = ((totalUserMemBytes / totalMem) * 100).toFixed(1);
    }

    const stream = getStreamStatus(currentUserId);

    return NextResponse.json({
      cpu: cpuUsage,
      ram: ramUsage,
      disk: diskUsage,
      network: {
        rx: netRx.toFixed(2),
        tx: netTx.toFixed(2)
      },
      stream,
      currentUserId
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch sysinfo' }, { status: 500 });
  }
}
