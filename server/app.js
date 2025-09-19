const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseUrl, sendJson } = require('./httpUtils');
const { DataStore } = require('./dataStore');
const { SessionManager } = require('./sessionManager');
const { createApiHandler } = require('./api');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function serveStatic(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^\/+/, '');
  const resolvedPath = path.join(PUBLIC_DIR, safePath || 'index.html');

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const finalPath = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()
    ? path.join(resolvedPath, 'index.html')
    : resolvedPath;

  fs.readFile(finalPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(finalPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function createApp(options = {}) {
  const store = options.store || new DataStore(options.databasePath);
  const sessionManager = options.sessionManager || new SessionManager(store);
  const apiHandler = createApiHandler({ store, sessionManager });

  return http.createServer((req, res) => {
    const url = parseUrl(req);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      apiHandler(req, res);
      return;
    }

    serveStatic(url.pathname, res);
  });
}

module.exports = { createApp };
