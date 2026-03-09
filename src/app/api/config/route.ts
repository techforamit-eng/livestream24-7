import { NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/config';

export async function GET() {
  const config = getConfig();
  // Don't send the password hash to the frontend
  const { adminPassHash, ...safeConfig } = config;
  return NextResponse.json(safeConfig);
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Validate if necessary, but for now we just save partial updates
    // Optional: if data includes a new password, we'd hash it here before saving.
    // For simplicity, we assume password updates happen elsewhere or are handled here if included.
    if (data.newPassword) {
      const bcrypt = require('bcryptjs');
      data.adminPassHash = await bcrypt.hash(data.newPassword, 10);
      delete data.newPassword;
    }

    saveConfig(data);
    return NextResponse.json({ success: true, message: 'Configuration saved.' });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to save config' }, { status: 500 });
  }
}
