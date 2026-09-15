const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive'
};

const LATEST_APP_VERSION = {
  versionCode: 2,
  versionName: '1.1.0',
  downloadUrl: 'http://localhost:8000/app-debug.apk',
  releaseNotes: 'Features In-App OTA Update Checker, refined business hours scheduling, and performance enhancements.',
  mandatory: false,
  minSupportedVersion: 1
};

const server = http.createServer((req, res) => {
  let relativePath = decodeURIComponent(req.url.split('?')[0]);
  
  // API Route: OTA Version Check
  if (relativePath === '/api/version.json' || relativePath === '/api/version') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(LATEST_APP_VERSION, null, 2));
    return;
  }

  if (relativePath === '/') {
    relativePath = '/sales_landing_page.html';
  }

  // Map /app-debug.apk from app build output if requested
  let filePath = path.join(__dirname, relativePath);
  if (relativePath === '/app-debug.apk') {
    filePath = path.join(__dirname, 'app/build/outputs/apk/debug/app-debug.apk');
  }
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + relativePath);
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
