import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let cachedFFmpegPath: string | null = null;

export function getFFmpegPath(): string {
  if (cachedFFmpegPath) return cachedFFmpegPath;

  // 1. Explicit env override
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFFmpegPath = process.env.FFMPEG_PATH;
    return cachedFFmpegPath;
  }

  // 2. Check if ffmpeg is in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const result = execSync(cmd, { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
    if (result && fs.existsSync(result)) {
      cachedFFmpegPath = result;
      return cachedFFmpegPath;
    }
  } catch (e) {}

  // 3. Known Windows locations
  if (process.platform === 'win32') {
    const commonPaths = [
      'C:\\Program Files (x86)\\FormatFactory\\ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        cachedFFmpegPath = p;
        return cachedFFmpegPath;
      }
    }

    // Check WinGet Packages
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(wingetDir)) {
        try {
          const files = fs.readdirSync(wingetDir);
          for (const dir of files) {
            if (dir.toLowerCase().includes('ffmpeg')) {
              const binDir = path.join(wingetDir, dir);
              // Check subdirectories
              const subItems = fs.readdirSync(binDir);
              for (const sub of subItems) {
                const candidate = path.join(binDir, sub, 'bin', 'ffmpeg.exe');
                if (fs.existsSync(candidate)) {
                  cachedFFmpegPath = candidate;
                  return cachedFFmpegPath;
                }
                const directCandidate = path.join(binDir, sub, 'ffmpeg.exe');
                if (fs.existsSync(directCandidate)) {
                  cachedFFmpegPath = directCandidate;
                  return cachedFFmpegPath;
                }
              }
            }
          }
        } catch (e) {}
      }
    }
  }

  // Fallback to default command name
  cachedFFmpegPath = 'ffmpeg';
  return cachedFFmpegPath;
}
