// Custom Next.js server that handles video uploads DIRECTLY via raw HTTP
// — bypassing Next.js's internal body parser which truncates large files.
// All other requests go through Next.js as normal.

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function handleVideoUpload(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Expected multipart/form-data' }));
    return;
  }

  const results = [];
  const filePromises = [];

  const bb = Busboy({
    headers: req.headers,
    limits: {
      fileSize: 100 * 1024 * 1024 * 1024, // 100 GB
      files: 50,
    },
  });

  bb.on('file', (fieldname, fileStream, fileInfo) => {
    const safeName = path.basename(fileInfo.filename);

    if (!safeName.toLowerCase().endsWith('.mp4')) {
      results.push({ name: safeName, success: false, message: 'Not an MP4, skipped' });
      fileStream.resume();
      return;
    }

    const destPath = path.join(VIDEOS_DIR, safeName);
    const writeStream = fs.createWriteStream(destPath);

    const p = new Promise((resolve) => {
      fileStream.pipe(writeStream);

      writeStream.on('finish', () => {
        try {
          const stat = fs.statSync(destPath);
          results.push({ name: safeName, success: true, message: `Saved (${formatSize(stat.size)})` });
        } catch (e) {
          results.push({ name: safeName, success: true, message: 'Saved' });
        }
        resolve();
      });

      writeStream.on('error', (err) => {
        results.push({ name: safeName, success: false, message: 'Write error: ' + err.message });
        resolve();
      });

      fileStream.on('error', (err) => {
        results.push({ name: safeName, success: false, message: 'Read error: ' + err.message });
        resolve();
      });
    });

    filePromises.push(p);
  });

  bb.on('finish', async () => {
    await Promise.all(filePromises);
    const successCount = results.filter(r => r.success).length;
    const allSuccess = successCount === results.length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: allSuccess,
      message: `${successCount} of ${results.length} file(s) uploaded successfully`,
      results,
    }));
  });

  bb.on('error', (err) => {
    console.error('Busboy error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Upload error: ' + err.message }));
  });

  // Pipe raw HTTP request body directly into busboy — NO Next.js buffering!
  req.pipe(bb);
}

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);

      // Intercept video POST uploads before Next.js touches the body
      if (parsedUrl.pathname === '/api/videos' && req.method === 'POST') {
        handleVideoUpload(req, res);
        return;
      }

      // All other requests handled by Next.js as normal
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Server error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }).listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Video uploads handled directly (bypassing Next.js body parser)`);
  });
});
