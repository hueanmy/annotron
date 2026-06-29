import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.ANNOTRON_PORT || '7321', 10);
const HOST = process.env.ANNOTRON_HOST || '127.0.0.1';

// --- State ---
const sessions = new Map();   // filePath -> { hash, watchers, sseClients, pollWaiters, agentReplies }
const allowList = new Set();  // registered canonical paths

function getSession(file) {
  if (!sessions.has(file)) {
    sessions.set(file, {
      hash: null,
      sseClients: new Set(),
      pollWaiters: [],
      pendingFeedback: null,
      finalized: false,
    });
  }
  return sessions.get(file);
}

// --- File watcher ---
const watchIntervals = new Map();

function watchFile(file) {
  if (watchIntervals.has(file)) return;
  let lastHash = hashFile(file);
  const iv = setInterval(() => {
    const h = hashFile(file);
    if (h && h !== lastHash) {
      lastHash = h;
      const sess = sessions.get(file);
      if (!sess) return;
      // Only trigger reload if not a programmatic finalize write
      if (sess._suppressReload) { sess._suppressReload = false; return; }
      broadcastSSE(file, 'reload', '{}');
    }
  }, 800);
  watchIntervals.set(file, iv);
}

function hashFile(file) {
  try {
    const buf = fs.readFileSync(file);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch { return null; }
}

// --- SSE broadcast ---
function broadcastSSE(file, event, data) {
  const sess = sessions.get(file);
  if (!sess) return;
  const msg = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of sess.sseClients) {
    try { res.write(msg); } catch {}
  }
}

// --- Poll wake ---
function wakePoll(file, payload) {
  const sess = sessions.get(file);
  if (!sess) return;
  for (const resolve of sess.pollWaiters) resolve(payload);
  sess.pollWaiters = [];
}

// --- SDK injection ---
const SDK_PATH = path.join(__dirname, 'sdk.js');
const CHROME_PATH = path.join(__dirname, 'chrome.html');
const CHROME_HTML = fs.readFileSync(CHROME_PATH, 'utf8');

function injectSDK(html) {
  const sdkJs = fs.readFileSync(SDK_PATH, 'utf8');
  const tag = `<script data-annotron="1">\n${sdkJs}\n</script>`;
  if (html.includes('</body>')) return html.replace('</body>', tag + '\n</body>');
  return html + '\n' + tag;
}

// --- Request helpers ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function send(res, status, body, ct = 'application/json') {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

// --- Router ---
async function handler(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method.toUpperCase();
  const pathname = u.pathname;

  // CORS preflight
  if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }

  if (pathname === '/health' && method === 'GET') {
    return send(res, 200, { ok: true });
  }

  if (pathname === '/session' && method === 'POST') {
    const { file } = await readBody(req);
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) return send(res, 404, { error: 'file not found' });
    if (!abs.endsWith('.html')) return send(res, 400, { error: 'must be .html' });
    allowList.add(abs);
    getSession(abs);
    watchFile(abs);
    return send(res, 200, { ok: true, file: abs });
  }

  if (pathname === '/' && method === 'GET') {
    const file = u.searchParams.get('file') || '';
    const html = CHROME_HTML; // file param handled client-side
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (pathname === '/sdk.js' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(SDK_JS);
    return;
  }

  if (pathname === '/artifact' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    let html;
    try { html = fs.readFileSync(abs, 'utf8'); } catch { return send(res, 404, { error: 'not found' }); }
    const injected = injectSDK(html);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(injected);
    return;
  }

  if (pathname === '/feedback' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    sess.pendingFeedback = body;
    sess.finalized = false;
    wakePoll(abs, { feedback: body, finalized: false });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/poll' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);

    // If there's already feedback waiting, return it immediately
    if (sess.pendingFeedback) {
      const payload = { feedback: sess.pendingFeedback, finalized: sess.finalized };
      sess.pendingFeedback = null;
      return send(res, 200, payload);
    }
    if (sess.finalized) {
      sess.finalized = false;
      return send(res, 200, { finalized: true });
    }

    // Long-poll
    const timeout = setTimeout(() => {
      sess.pollWaiters = sess.pollWaiters.filter(r => r !== resolve);
      send(res, 200, { feedback: null, finalized: false });
    }, 25000);

    let resolve;
    const p = new Promise(r => { resolve = r; });
    sess.pollWaiters.push(resolve);
    const payload = await p;
    clearTimeout(timeout);
    sess.pendingFeedback = null;
    return send(res, 200, payload);
  }

  if (pathname === '/finalize' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.html) return send(res, 400, { error: 'missing file or html' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    sess._suppressReload = true;
    fs.writeFileSync(abs, body.html, 'utf8');
    sess.finalized = true;
    wakePoll(abs, { finalized: true });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/agent-reply' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.message) return send(res, 400, { error: 'missing file or message' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    broadcastSSE(abs, 'agent-reply', JSON.stringify({ message: body.message }));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/events' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    // Allow events even if not in allowList (browser may connect before register)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    const sess = getSession(abs);
    sess.sseClients.add(res);
    req.on('close', () => { sess.sseClients.delete(res); });
    // Keep-alive ping
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 20000);
    req.on('close', () => clearInterval(ping));
    return;
  }

  if (pathname === '/stop' && method === 'POST') {
    send(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 100);
    return;
  }

  send(res, 404, { error: 'not found' });
}

const server = http.createServer(handler);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another server already owns the port — exit quietly
    process.exit(0);
  }
  console.error('[annotron server]', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`annotron server listening on http://${HOST}:${PORT}`);
});
