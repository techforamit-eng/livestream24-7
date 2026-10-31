import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { findVideoPathOnDisk } from '@/lib/videoHelper';

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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  } else if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  } else if (bytes >= 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return bytes + ' B';
  }
}

export async function GET() {
  try {
    const role = await getUserRole();
    const BASE_VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');

    if (!fs.existsSync(BASE_VIDEOS_DIR)) {
      fs.mkdirSync(BASE_VIDEOS_DIR, { recursive: true });
    }

    if (role === 'admin') {
      // Admin sees ALL videos across ALL user folders
      const allVideos: any[] = [];
      const userDirs = fs.readdirSync(BASE_VIDEOS_DIR, { withFileTypes: true });

      // Sort dirs so 'admin' appears first, then others alphabetically
      const sortedDirs = userDirs
        .filter(d => d.isDirectory())
        .sort((a, b) => (a.name === 'admin' ? -1 : b.name === 'admin' ? 1 : a.name.localeCompare(b.name)));

      for (const dir of sortedDirs) {
        const userFolder = dir.name;
        const userDirPath = path.join(BASE_VIDEOS_DIR, userFolder);
        try {
          const files = fs.readdirSync(userDirPath).filter(file => file.endsWith('.mp4'));
          for (const file of files) {
            const filePath = path.join(userDirPath, file);
            const stat = fs.statSync(filePath);
            allVideos.push({
              name: file,
              owner: userFolder,
              size: formatBytes(stat.size),
              bytes: stat.size,
              date: stat.mtime
            });
          }
        } catch (e) {}
      }

      // Also check root public/videos for any loose .mp4 files
      try {
        const rootFiles = fs.readdirSync(BASE_VIDEOS_DIR).filter(file => file.endsWith('.mp4'));
        for (const file of rootFiles) {
          const filePath = path.join(BASE_VIDEOS_DIR, file);
          const stat = fs.statSync(filePath);
          allVideos.push({
            name: file,
            owner: 'admin',
            size: formatBytes(stat.size),
            bytes: stat.size,
            date: stat.mtime
          });
        }
      } catch (e) {}

      return NextResponse.json({ videos: allVideos });
    } else {
      // Regular user sees only their own folder
      const userDir = getVideosDir(role);
      const files = fs.readdirSync(userDir).filter(file => file.endsWith('.mp4'));
      const videos = files.map(file => {
        const stat = fs.statSync(path.join(userDir, file));
        return {
          name: file,
          owner: role,
          size: formatBytes(stat.size),
          bytes: stat.size,
          date: stat.mtime,
        };
      });
      return NextResponse.json({ videos });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read videos directory' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const role = await getUserRole();
    const { filename, owner } = await req.json();
    if (!filename) {
      return NextResponse.json({ success: false, message: 'Filename required' }, { status: 400 });
    }

    const preferredOwner = (role === 'admin' && owner) ? owner : role;
    const resolved = findVideoPathOnDisk(filename, preferredOwner);

    if (resolved && fs.existsSync(resolved.fullPath)) {
      fs.unlinkSync(resolved.fullPath);
      return NextResponse.json({ success: true, message: 'File deleted' });
    }

    return NextResponse.json({ success: false, message: 'File not found' }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const role = await getUserRole();
    const { oldName, newName, owner } = await req.json();

    if (!oldName || !newName) {
      return NextResponse.json({ success: false, message: 'oldName and newName are required' }, { status: 400 });
    }

    const preferredOwner = (role === 'admin' && owner) ? owner : role;
    const resolved = findVideoPathOnDisk(oldName, preferredOwner);

    if (!resolved || !fs.existsSync(resolved.fullPath)) {
      return NextResponse.json({ success: false, message: 'Original file not found' }, { status: 404 });
    }

    const safeName = newName.trim().endsWith('.mp4') ? newName.trim() : newName.trim() + '.mp4';
    const newPath = path.join(path.dirname(resolved.fullPath), safeName);

    if (fs.existsSync(newPath)) {
      return NextResponse.json({ success: false, message: 'A file with that name already exists' }, { status: 409 });
    }

    // Rename the file on disk
    fs.renameSync(resolved.fullPath, newPath);

    // Update all streams that reference the old filename
    const { getConfig, saveConfig } = await import('@/lib/config');
    const config = getConfig();
    let changed = false;

    const updatedStreams = (config.streams || []).map(stream => {
      if (stream.video === oldName) {
        changed = true;
        return { ...stream, video: safeName };
      }
      return stream;
    });

    const updatedAutoTasks = (config.autoTasks || []).map(task => {
      if (task.video === oldName) {
        changed = true;
        return { ...task, video: safeName };
      }
      return task;
    });

    if (changed) {
      saveConfig({ ...config, streams: updatedStreams, autoTasks: updatedAutoTasks });
    }

    return NextResponse.json({ success: true, message: `Renamed to ${safeName}`, newName: safeName });
  } catch (err: any) {
    console.error('Rename error:', err);
    return NextResponse.json({ success: false, message: 'Rename failed: ' + err.message }, { status: 500 });
  }
}
