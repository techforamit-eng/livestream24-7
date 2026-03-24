import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { getStreamStatus } from '@/lib/stream';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    let currentUserId = 'admin';

    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.role;
      } catch (e) { }
    }

    const [cpu, mem, fsSize, networkStats] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
    ]);

    // Format metrics
    const cpuUsage = cpu.currentLoad.toFixed(1);
    const ramUsage = ((mem.active / mem.total) * 100).toFixed(1);
    
    // Find main disk (usually / or C:)
    const mainDisk = fsSize.find(d => d.mount === '/') || fsSize[0] || { use: 0 };
    const diskUsage = mainDisk.use.toFixed(1);

    // Network stats
    const netRx = networkStats.reduce((acc, curr) => acc + (curr.rx_sec || 0), 0) / 1024 / 1024; // MB/s
    const netTx = networkStats.reduce((acc, curr) => acc + (curr.tx_sec || 0), 0) / 1024 / 1024; // MB/s

    const stream = getStreamStatus();

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
    return NextResponse.json({ error: 'Failed to fetch sysinfo' }, { status: 500 });
  }
}
