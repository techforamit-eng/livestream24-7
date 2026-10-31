import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import { getFFmpegPath } from '@/lib/ffmpegPath';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

async function getUserRole() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return 'admin';
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    return decoded.role || 'admin';
  } catch (err) {
    return 'admin';
  }
}

function getVideosDir(role: string) {
  const dir = path.join(process.cwd(), 'public', 'videos', role);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export interface ConvertJob {
  id: string;
  role: string;
  inputFile: string;
  outputFile: string;
  status: 'converting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentTime: string;
  totalTime: string;
  speed: string;
  error?: string;
  createdAt: number;
  process?: any;
}

// Global in-memory storage for active jobs across API calls
const convertJobs: Map<string, ConvertJob> = (global as any).convertJobs || new Map<string, ConvertJob>();
(global as any).convertJobs = convertJobs;

function parseTimeToSeconds(timeStr: string): number {
  try {
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return h * 3600 + m * 60 + s;
    }
  } catch (e) {}
  return 0;
}

export async function GET() {
  try {
    const role = await getUserRole();
    const jobsList = Array.from(convertJobs.values())
      .filter(j => j.role === role)
      .map(({ process, ...rest }) => rest)
      .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ jobs: jobsList });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    const VIDEOS_DIR = getVideosDir(role);

    const body = await req.json();
    const { inputFile, outputFile, resolution = '720p', bitrate = '2500k' } = body;

    if (!inputFile || !outputFile) {
      return NextResponse.json({ success: false, message: 'Both input file and output file name are required.' }, { status: 400 });
    }

    const safeInput = inputFile.trim();
    const safeOutput = outputFile.trim().endsWith('.mp4') ? outputFile.trim() : outputFile.trim() + '.mp4';

    if (safeInput === safeOutput) {
      return NextResponse.json({ success: false, message: 'Output file name must be different from input file name.' }, { status: 400 });
    }

    const inputPath = path.join(VIDEOS_DIR, safeInput);
    const outputPath = path.join(VIDEOS_DIR, safeOutput);

    if (!fs.existsSync(inputPath)) {
      return NextResponse.json({ success: false, message: `Input file "${safeInput}" not found on server.` }, { status: 404 });
    }

    if (fs.existsSync(outputPath)) {
      return NextResponse.json({ success: false, message: `Output file "${safeOutput}" already exists. Please choose a different name.` }, { status: 409 });
    }

    // Check if another job is currently writing to the same output file
    for (const job of convertJobs.values()) {
      if (job.role === role && job.status === 'converting' && job.outputFile === safeOutput) {
        return NextResponse.json({ success: false, message: 'A conversion with this output file name is already running.' }, { status: 409 });
      }
    }

    const resMap: Record<string, string> = {
      '1080p': '1920:1080',
      '720p': '1280:720',
      '480p': '854:480',
      '360p': '640:360'
    };
    const [w, h] = (resMap[resolution] || '1280:720').split(':');
    const safeBitrate = (bitrate || '2500k').toString().replace('k', '') + 'k';
    const numBitrate = parseInt(safeBitrate);

    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // FFmpeg strict 2-second Keyframe (GOP 60) & Constant 30 FPS encoder
    const args = [
      '-y',
      '-i', inputPath,
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-r', '30',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-b:v', safeBitrate,
      '-maxrate', safeBitrate,
      '-bufsize', `${numBitrate * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-movflags', '+faststart',
      outputPath
    ];

    const ffmpegBin = getFFmpegPath();
    console.log(`[Video Convert] Starting job ${jobId}: ${ffmpegBin} ${args.join(' ')}`);

    const proc = spawn(ffmpegBin, args, { stdio: 'pipe' });

    let totalDurationSeconds = 0;

    const jobData: ConvertJob = {
      id: jobId,
      role,
      inputFile: safeInput,
      outputFile: safeOutput,
      status: 'converting',
      progress: 0,
      currentTime: '00:00:00',
      totalTime: '00:00:00',
      speed: '0x',
      createdAt: Date.now(),
      process: proc
    };

    convertJobs.set(jobId, jobData);

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();

      // Parse Total Duration
      if (totalDurationSeconds === 0) {
        const durMatch = text.match(/Duration:\s*(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (durMatch && durMatch[1]) {
          jobData.totalTime = durMatch[1].split('.')[0];
          totalDurationSeconds = parseTimeToSeconds(durMatch[1]);
        }
      }

      // Parse Current Progress Time
      const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (timeMatch && timeMatch[1]) {
        jobData.currentTime = timeMatch[1].split('.')[0];
        const currentSeconds = parseTimeToSeconds(timeMatch[1]);
        if (totalDurationSeconds > 0) {
          const pct = Math.min(99, Math.round((currentSeconds / totalDurationSeconds) * 100));
          jobData.progress = pct;
        }
      }

      // Parse Encoding Speed
      const speedMatch = text.match(/speed=\s*([\d\.]+)x/);
      if (speedMatch && speedMatch[1]) {
        jobData.speed = speedMatch[1] + 'x';
      }
    });

    proc.on('close', (code) => {
      console.log(`[Video Convert] Job ${jobId} finished with exit code ${code}`);
      const job = convertJobs.get(jobId);
      if (job) {
        if (code === 0) {
          job.status = 'completed';
          job.progress = 100;
        } else {
          job.status = 'failed';
          job.error = `FFmpeg conversion failed (code ${code}).`;
        }
        delete job.process;
      }
    });

    proc.on('error', (err) => {
      console.error(`[Video Convert] Job ${jobId} error:`, err);
      const job = convertJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = err.message || 'Process error';
        delete job.process;
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Conversion started in background',
      jobId,
      outputFile: safeOutput
    });

  } catch (err: any) {
    console.error('Convert API error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const role = await getUserRole();
    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json({ success: false, message: 'jobId is required' }, { status: 400 });
    }

    const job = convertJobs.get(jobId);
    if (!job || job.role !== role) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'converting' && job.process) {
      try {
        job.process.kill('SIGKILL');
      } catch (e) {}
      job.status = 'cancelled';
    }

    convertJobs.delete(jobId);
    return NextResponse.json({ success: true, message: 'Job cleared' });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
