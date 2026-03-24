import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

async function getUserRole() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return 'admin'; // Fallback
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

// POST is handled by server.js directly to bypass Next.js body limits

export async function GET() {
  try {
    const role = await getUserRole();
    const VIDEOS_DIR = getVideosDir(role);
    const files = fs.readdirSync(VIDEOS_DIR).filter(file => file.endsWith('.mp4'));
    const videos = files.map(file => {
      const stat = fs.statSync(path.join(VIDEOS_DIR, file));
      const bytes = stat.size;

      let sizeStr: string;
      if (bytes >= 1024 * 1024 * 1024) {
        sizeStr = (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      } else if (bytes >= 1024 * 1024) {
        sizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      } else if (bytes >= 1024) {
        sizeStr = (bytes / 1024).toFixed(1) + ' KB';
      } else {
        sizeStr = bytes + ' B';
      }

      return {
        name: file,
        size: sizeStr,
        bytes,
        date: stat.mtime,
      };
    });
    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read videos directory' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const role = await getUserRole();
    const VIDEOS_DIR = getVideosDir(role);

    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ success: false, message: 'Filename required' }, { status: 400 });
    }

    const filePath = path.join(VIDEOS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
    const VIDEOS_DIR = getVideosDir(role);

    const { oldName, newName } = await req.json();

    if (!oldName || !newName) {
      return NextResponse.json({ success: false, message: 'oldName and newName are required' }, { status: 400 });
    }

    // Ensure both names are .mp4
    const safeName = newName.trim().endsWith('.mp4') ? newName.trim() : newName.trim() + '.mp4';
    const oldPath = path.join(VIDEOS_DIR, oldName);
    const newPath = path.join(VIDEOS_DIR, safeName);

    if (!fs.existsSync(oldPath)) {
      return NextResponse.json({ success: false, message: 'Original file not found' }, { status: 404 });
    }

    if (fs.existsSync(newPath)) {
      return NextResponse.json({ success: false, message: 'A file with that name already exists' }, { status: 409 });
    }

    // Rename the file on disk
    fs.renameSync(oldPath, newPath);

    // Update all stream playlists that reference the old filename
    const { getConfig, saveConfig } = await import('@/lib/config');
    const config = getConfig();
    let changed = false;
    const updatedStreams = config.streams.map(stream => {
      if (stream.video === oldName) {
        changed = true;
        return { ...stream, video: safeName };
      }
      return stream;
    });

    if (changed) {
      saveConfig({ ...config, streams: updatedStreams });
    }

    return NextResponse.json({ success: true, message: `Renamed to ${safeName}`, newName: safeName });
  } catch (err: any) {
    console.error('Rename error:', err);
    return NextResponse.json({ success: false, message: 'Rename failed: ' + err.message }, { status: 500 });
  }
}

