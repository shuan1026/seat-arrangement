// 在本機開啟 HTML 原型，只用 Node 內建模組。
// 用法：node .agents/skills/sync-prototype/scripts/serve.js [根目錄] [port]
// 同一個目錄已經開著時直接沿用；port 被其他目錄占用時往後換。實際網址以印出的為準。
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || 'ui-design-system');
const firstPort = Number(process.argv[3] || 4173);
const rootHeader = 'x-prototype-root';
const rootId = encodeURIComponent(root);
const maxPortTries = 20;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

const server = http.createServer((req, res) => {
  res.setHeader(rootHeader, rootId);
  let pathname = req.url.split('?')[0];
  if (pathname === '/') {
    if (fs.existsSync(path.join(root, 'index.html'))) {
      pathname = '/index.html';
    } else {
      res.writeHead(302, { Location: '/source-reference/html/seating.html' });
      return res.end();
    }
  }
  let file;
  try {
    file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  } catch (e) {
    return send(res, 400, 'Bad request');
  }
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, types[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

const servesSameRoot = port =>
  new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: '/', method: 'HEAD', timeout: 1000 }, res => {
      res.resume();
      resolve(res.headers[rootHeader] === rootId);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end();
  });

const listen = (port, tries = 0) => {
  server.once('error', async err => {
    if (err.code !== 'EADDRINUSE' || tries >= maxPortTries) throw err;
    if (await servesSameRoot(port)) {
      console.log(`Prototype already running: http://localhost:${port}/`);
      process.exit(0);
    }
    listen(port + 1, tries + 1);
  });
  server.listen(port, '127.0.0.1');
};

server.on('listening', () => console.log(`Prototype: http://localhost:${server.address().port}/`));
listen(firstPort);
