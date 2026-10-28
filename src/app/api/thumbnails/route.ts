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
    return NextResponse.json({ success: true, thumbnails: [] });
  }

  const files = fs.readdirSync(userDir);
  const images = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f)).map(f => ({
    name: f,
    url: `/thumbnails/${role}/${f}`
  }));

  return NextResponse.json({ success: true, thumbnails: images });
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
    const filePath = path.join(userDir, safeName);

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
