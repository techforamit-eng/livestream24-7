import path from 'path';
import fs from 'fs';

const VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');

export interface ResolvedVideo {
  fullPath: string;
  owner: string;
  filename: string;
}

/**
 * Robustly find a video file on disk across user directories.
 * If preferredRole is specified, checks that folder first.
 * If not found, scans all user directories under public/videos/ (e.g. admin, user2, etc.).
 * Guarantees that admin or any stream engine can locate any user's video without error.
 */
export function findVideoPathOnDisk(filename: string, preferredRole?: string): ResolvedVideo | null {
  if (!filename) return null;

  // Clean filename: strip leading directory if already included (e.g. "user2/video.mp4" -> "video.mp4" or handled directly)
  const cleanFilename = path.basename(filename.trim());

  // 1. If filename was formatted as "owner/file.mp4"
  if (filename.includes('/') || filename.includes('\\')) {
    const directCandidate = path.join(VIDEOS_DIR, filename).replace(/\\/g, '/');
    if (fs.existsSync(directCandidate) && !fs.statSync(directCandidate).isDirectory()) {
      const parts = filename.replace(/\\/g, '/').split('/');
      const owner = parts.length > 1 ? parts[0] : 'unknown';
      return { fullPath: directCandidate, owner, filename: cleanFilename };
    }
  }

  // 2. Check preferredRole directory
  if (preferredRole) {
    const candidate = path.join(VIDEOS_DIR, preferredRole, cleanFilename).replace(/\\/g, '/');
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      return { fullPath: candidate, owner: preferredRole, filename: cleanFilename };
    }
  }

  // 3. Check 'admin' directory
  const adminCandidate = path.join(VIDEOS_DIR, 'admin', cleanFilename).replace(/\\/g, '/');
  if (fs.existsSync(adminCandidate) && !fs.statSync(adminCandidate).isDirectory()) {
    return { fullPath: adminCandidate, owner: 'admin', filename: cleanFilename };
  }

  // 4. Scan all user directories under public/videos
  if (fs.existsSync(VIDEOS_DIR)) {
    try {
      const entries = fs.readdirSync(VIDEOS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const candidate = path.join(VIDEOS_DIR, entry.name, cleanFilename).replace(/\\/g, '/');
          if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
            return { fullPath: candidate, owner: entry.name, filename: cleanFilename };
          }
        }
      }

      // 5. Check public/videos root
      const rootCandidate = path.join(VIDEOS_DIR, cleanFilename).replace(/\\/g, '/');
      if (fs.existsSync(rootCandidate) && !fs.statSync(rootCandidate).isDirectory()) {
        return { fullPath: rootCandidate, owner: 'root', filename: cleanFilename };
      }
    } catch (e) {
      console.error('[videoHelper] Error scanning directories:', e);
    }
  }

  return null;
}
