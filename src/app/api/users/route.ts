import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vmagic_secure_secret_key_123';

async function getUserRole() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    return decoded.role;
  } catch (err) {
    return null;
  }
}

export async function GET() {
  const role = await getUserRole();
  if (!role) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const config = getConfig();
  // Strip password hashes before sending
  const safeUsers = (config.users || []).map(u => ({ id: u.id, username: u.username }));
  return NextResponse.json({ users: safeUsers, currentUserId: role });
}

export async function POST(req: Request) {
  const role = await getUserRole();
  if (!role) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, username, newPassword } = await req.json();

  if (!id || !username) {
    return NextResponse.json({ success: false, message: 'ID and Username are required' }, { status: 400 });
  }

  const config = getConfig();
  let users = config.users || [];

  const existingUserIndex = users.findIndex(u => u.id === id);

  if (existingUserIndex >= 0) {
    // Update existing user
    const updatedUser = { ...users[existingUserIndex], username };
    if (newPassword) {
      updatedUser.passwordHash = await bcrypt.hash(newPassword, 10);
      
      // If updating the admin user's password, also update the legacy field
      if (id === 'admin') {
        config.adminPassHash = updatedUser.passwordHash;
      }
    }
    users[existingUserIndex] = updatedUser;
  } else {
    if (!newPassword) {
      return NextResponse.json({ success: false, message: 'Password is required for new users' }, { status: 400 });
    }
    // Check if ID is somewhat safe
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) {
      return NextResponse.json({ success: false, message: 'Invalid User ID format' }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Create new
    users.push({ id: safeId, username, passwordHash });
  }

  saveConfig({ ...config, users });
  return NextResponse.json({ success: true, message: 'User saved successfully' });
}

export async function DELETE(req: Request) {
  const role = await getUserRole();
  if (!role) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ success: false, message: 'User ID is required' }, { status: 400 });
  }

  if (id === 'admin') {
    return NextResponse.json({ success: false, message: 'Cannot delete the admin user' }, { status: 403 });
  }

  if (id === role) {
    return NextResponse.json({ success: false, message: 'Cannot delete yourself' }, { status: 403 });
  }

  const config = getConfig();
  let users = config.users || [];

  const initialLength = users.length;
  users = users.filter(u => u.id !== id);

  if (users.length === initialLength) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  saveConfig({ ...config, users });
  return NextResponse.json({ success: true, message: 'User deleted successfully' });
}
