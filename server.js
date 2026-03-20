const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = 3456;
const BEATS_DIR = path.join(__dirname, 'beats');
const BEAT_SCRIPT = path.join(__dirname, '..', 'generators', 'clawbeats', 'beat_engine.py');

// Ensure beats directory exists
if (!fs.existsSync(BEATS_DIR)) fs.mkdirSync(BEATS_DIR, { recursive: true });

const GENRES = ['hiphop', 'dubstep', 'lofi', 'trap', 'synthwave', 'drill'];

// MIME types
const mimeTypes = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css'
};

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Serve static beats
  if (req.method === 'GET' && pathname.startsWith('/beats/')) {
    const file = pathname.slice('/beats/'.length);
    const ext = path.extname(file);
    const mime = mimeTypes[ext] || 'application/octet-stream';
    sendFile(res, path.join(BEATS_DIR, file), mime);
    return;
  }

  // List available beats
  if (req.method === 'GET' && pathname === '/beats') {
    const files = fs.readdirSync(BEATS_DIR)
      .filter(f => f.endsWith('.wav'))
      .map(f => {
        const stat = fs.statSync(path.join(BEATS_DIR, f));
        return { name: f, size: stat.size, mtime: stat.mtime };
      });
    sendJSON(res, 200, { beats: files });
    return;
  }

  // Generate a beat
  if (req.method === 'POST' && pathname === '/generate') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let params;
      try { params = JSON.parse(body); } catch { params = {}; }

      const genre = GENRES.includes(params.genre) ? params.genre : 'hiphop';
      const bpm = Math.max(40, Math.min(220, parseInt(params.bpm) || 90));
      const style = params.style || genre;

      const filename = `beat_${genre}_${bpm}_${Date.now()}.wav`;
      const outputPath = path.join(BEATS_DIR, filename);

      // Run beat_engine.py and save to our beats dir
      const workDir = path.join(__dirname, 'beats');
      const proc = spawn('python', [
        BEAT_SCRIPT,
        '--genre', genre,
        '--bpm', bpm.toString()
      ], {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', (code) => {
        // beat_engine saves to cwd as clawbeat_genre_bpm.wav, rename to our tracking name
        const defaultOutput = path.join(workDir, `clawbeat_${genre}_${bpm}.wav`);

        setTimeout(() => {
          try {
            if (fs.existsSync(defaultOutput)) {
              // Move/rename to our tracking filename
              fs.renameSync(defaultOutput, outputPath);
              // Also keep a copy with the default name for future reference
              sendJSON(res, 200, {
                success: true,
                filename,
                url: `http://localhost:${PORT}/beats/${filename}`,
                genre,
                bpm,
                style
              });
            } else {
              sendJSON(res, 500, { success: false, error: 'Beat file not generated', detail: stderr });
            }
          } catch (e) {
            sendJSON(res, 500, { success: false, error: e.message });
          }
        }, 500); // give file system a moment
      });
    });
    return;
  }

  // Serve frontend
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    sendFile(res, path.join(__dirname, 'index.html'), 'text/html');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🎵 RTBNXH Beat Server running at http://localhost:${PORT}`);
  console.log(`   Generate: POST /generate {genre, bpm, style}`);
  console.log(`   List beats: GET /beats`);
  console.log(`   Play: GET /beats/<filename>`);
});
