import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getConfig, saveConfig } from '@/lib/config';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';
const VIDEOS_BASE = path.join(process.cwd(), 'public', 'videos');

async function getCallerRole() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    return decoded.role;
  } catch {
    return null;
  }
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

// GET: List all files across all users
export async function GET() {
  const role = await getCallerRole();
  if (role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 });
  }

  const config = getConfig();
  const users = config.users || [{ id: 'admin', username: 'admin' }];

  const allFiles: any[] = [];

  for (const user of users) {
    const userDir = path.join(VIDEOS_BASE, user.id);
    if (!fs.existsSync(userDir)) continue;

    const files = fs.readdirSync(userDir).filter(f => f.endsWith('.mp4'));
    for (const file of files) {
      const filePath = path.join(userDir, file);
      const stat = fs.statSync(filePath);
      allFiles.push({
        name: file,
        userId: user.id,
        username: user.username,
        size: formatSize(stat.size),
        bytes: stat.size,
        date: stat.mtime,
      });
    }
  }

  return NextResponse.json({ files: allFiles, users: users.map(u => ({ id: u.id, username: u.username })) });
}

// POST: Move file from one user to another
export async function POST(req: Request) {
  const role = await getCallerRole();
  if (role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Admin only' }, { status: 403 });
  }

  const { filename, fromUserId, toUserId } = await req.json();

  if (!filename || !fromUserId || !toUserId) {
    return NextResponse.json({ success: false, message: 'filename, fromUserId, toUserId required' }, { status: 400 });
  }

  if (fromUserId === toUserId) {
    return NextResponse.json({ success: false, message: 'Source and destination user are the same' }, { status: 400 });
  }

  const srcPath = path.join(VIDEOS_BASE, fromUserId, filename);
  const destDir = path.join(VIDEOS_BASE, toUserId);
  const destPath = path.join(destDir, filename);

  if (!fs.existsSync(srcPath)) {
    return NextResponse.json({ success: false, message: 'Source file not found' }, { status: 404 });
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (fs.existsSync(destPath)) {
    return NextResponse.json({ success: false, message: 'A file with that name already exists in the destination' }, { status: 409 });
  }

  fs.renameSync(srcPath, destPath);

  // Update stream playlists: remove from fromUser streams, the file is still same name so no update needed there
  // (The file name didn't change, only the folder. Streams reference by name, userId handles folder resolution)

  return NextResponse.json({ success: true, message: `"${filename}" moved from ${fromUserId} to ${toUserId}` });
}
