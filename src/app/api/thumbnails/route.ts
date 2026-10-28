import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';
const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');

async function getUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return 'admin';
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    return decoded.role || 'admin';
  } catch (e) {
    return 'admin';
  }
}

export async function GET() {
  const role = await getUserId();
  const userDir = path.join(THUMBNAILS_DIR, role);

  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const thumbMap = new Map<string, { name: string; url: string }>();

  const scanDir = (dir: string, urlPrefix: string) => {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name) && !thumbMap.has(entry.name)) {
            thumbMap.set(entry.name, {
              name: entry.name,
              url: `${urlPrefix}/${entry.name}`
            });
          }
        }
      } catch (e) { }
    }
  };

  // Primary: User's directory
  scanDir(userDir, `/thumbnails/${role}`);

  // Secondary: Admin presets if regular user
  if (role !== 'admin') {
    scanDir(path.join(THUMBNAILS_DIR, 'admin'), '/thumbnails/admin');
  }

  // Tertiary: Root public/thumbnails if any
  scanDir(THUMBNAILS_DIR, '/thumbnails');

  return NextResponse.json({ success: true, thumbnails: Array.from(thumbMap.values()) });
}

export async function POST(req: Request) {
  try {
    const role = await getUserId();
    const userDir = path.join(THUMBNAILS_DIR, role);

    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const formData = await req.formData();
    const file = formData.get('thumbnail') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No thumbnail file uploaded' }, { status: 400 });
    }

    // YouTube 2MB limit check
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        message: 'YouTube limits custom thumbnails to a maximum of 2MB. Please compress or choose an image under 2MB.'
      }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return NextResponse.json({ success: false, message: 'Only JPG and PNG images are allowed for YouTube thumbnails' }, { status: 400 });
    }

    const sanitizedName = `thumb-${Date.now()}-${path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destPath = path.join(userDir, sanitizedName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    return NextResponse.json({
      success: true,
      filename: sanitizedName,
      url: `/thumbnails/${role}/${sanitizedName}`,
      message: 'Thumbnail uploaded successfully.'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const role = await getUserId();
    const { filename } = await req.json();

    if (!filename) {
      return NextResponse.json({ success: false, message: 'filename is required' }, { status: 400 });
    }

    const safeName = path.basename(filename);
    const userDir = path.join(THUMBNAILS_DIR, role);
    let filePath = path.join(userDir, safeName);

    if (!fs.existsSync(filePath)) {
      filePath = path.join(THUMBNAILS_DIR, 'admin', safeName);
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(THUMBNAILS_DIR, safeName);
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: 'Thumbnail deleted successfully.' });
    } else {
      return NextResponse.json({ success: false, message: 'Thumbnail file not found.' }, { status: 404 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
