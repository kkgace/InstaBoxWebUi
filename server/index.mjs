/**
 * InstaBox WebUI 代理服务
 *
 * 职责：
 *  1. REST 透传：/p/<path>  →  https://api.instabox.sh/<path>
 *     转发 X-API-Key / Authorization / Idempotency-Key / X-Confirm-Delete / Range 等头，
 *     流式转发请求与响应体（支持文件上传/下载、长轮询 ?wait=25s）。
 *  2. WebSocket 透传：/ws?url=<encoded wss-url>
 *     用于沙箱终端（PTY）与桌面（VNC）。目标域强制限定 *.instabox.sh，防止开放中继。
 *  3. 静态托管 dist/（SPA fallback 到 index.html）。
 *
 * 环境变量：
 *  PORT               监听端口（默认：生产 3000 / 开发 8787）
 *  INSTABOX_API       上游 API（默认 https://api.instabox.sh）
 *  INSTABOX_API_KEY   可选：客户端未带 X-API-Key 时由服务端注入（部署到机器上时可用来收口）
 *  ALLOW_WS_HOSTS     可选：额外的 WS 目标域后缀，逗号分隔
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 8787));
const UPSTREAM = (process.env.INSTABOX_API || 'https://api.instabox.sh').replace(/\/+$/, '');
const SERVER_KEY = process.env.INSTABOX_API_KEY || '';
// 访问保护：设置 CONSOLE_PASSWORD 后，/p/* 与 /ws 需要登录（静态资源放行以便加载登录页）。
// 浏览器流程：401 console_auth → 前端弹密码框 → POST /auth → HttpOnly cookie 会话。
const CONSOLE_PASSWORD = process.env.CONSOLE_PASSWORD || '';
const AUTH_COOKIE = 'console_auth';
const AUTH_TOKEN = CONSOLE_PASSWORD ? crypto.createHash('sha256').update(`instabox-ui:${CONSOLE_PASSWORD}`).digest('hex') : '';

function authOk(req) {
  if (!CONSOLE_PASSWORD) return true;
  const cookies = req.headers.cookie || '';
  const m = cookies.split(/;\s*/).find((c) => c.startsWith(AUTH_COOKIE + '='));
  return !!m && m.slice(AUTH_COOKIE.length + 1) === AUTH_TOKEN;
}

function handleAuth(req, res) {
  // POST /auth {password}：校验并种 cookie；GET /auth：检查当前会话是否有效
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    if (req.method === 'GET') {
      res.writeHead(authOk(req) ? 200 : 401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: authOk(req) }));
      return;
    }
    let pass = '';
    try { pass = String(JSON.parse(body || '{}').password || ''); } catch { /* ignore */ }
    const good = CONSOLE_PASSWORD && pass === CONSOLE_PASSWORD;
    if (good) {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': `${AUTH_COOKIE}=${AUTH_TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      });
      res.end(JSON.stringify({ ok: true }));
      log('auth: 登录成功');
    } else {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'bad_password', message: 'wrong password' } }));
      log('auth: 密码错误');
    }
  });
}
const WS_HOST_SUFFIXES = ['.instabox.sh', '.instabox.tech', ...(process.env.ALLOW_WS_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)];

const upstreamUrl = new URL(UPSTREAM);
const agent = new https.Agent({ keepAlive: true, maxSockets: 64 });

// ---------------------------------------------------------------- Webhook 收件箱
// 接收 InstaBox webhook 推送（POST /hook），供 UI 直接查看事件，无需外部服务。
// - 事件存内存 + 磁盘（data/hook-events.json），上限 200 条，正文截断 8KB
// - 启用 CONSOLE_PASSWORD 时 /hook 要求 ?token=（AUTH_TOKEN 前 16 位），URL 从 UI 复制
// - GET/DELETE /hook-events 需登录会话
const HOOK_DIR = path.join(__dirname, '..', 'data');
const HOOK_FILE = path.join(HOOK_DIR, 'hook-events.json');
const HOOK_MAX = 200;
let hookEvents = [];
try { hookEvents = JSON.parse(fs.readFileSync(HOOK_FILE, 'utf8')); } catch { hookEvents = []; }
function saveHookEvents() {
  try {
    fs.mkdirSync(HOOK_DIR, { recursive: true });
    fs.writeFileSync(HOOK_FILE, JSON.stringify(hookEvents.slice(0, HOOK_MAX)));
  } catch (e) { log('hook save fail:', e.message); }
}
const HOOK_TOKEN = AUTH_TOKEN ? AUTH_TOKEN.slice(0, 16) : '';

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= limit) chunks.push(c); if (size > limit) req.destroy(); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

async function handleHook(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/hook') {
    if (CONSOLE_PASSWORD) {
      const u = new URL(req.url, 'http://x');
      if (u.searchParams.get('token') !== HOOK_TOKEN) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'bad_hook_token', message: 'missing/invalid ?token=' } }));
        return;
      }
    }
    const body = await readBody(req, 64 * 1024);
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    hookEvents.unshift({
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      event: parsed?.type || parsed?.event || 'unknown',
      headers: {
        signature: req.headers['webhook-signature'] || null,
        'user-agent': req.headers['user-agent'] || null,
      },
      body: body.slice(0, 8192),
    });
    hookEvents = hookEvents.slice(0, HOOK_MAX);
    saveHookEvents();
    log('hook: 收到事件', hookEvents[0].event);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, received: hookEvents.length }));
    return;
  }
  if ((pathname === '/hook-events') && (req.method === 'GET' || req.method === 'DELETE')) {
    if (!authOk(req)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'console_auth', message: 'console login required' } }));
      return;
    }
    if (req.method === 'DELETE') { hookEvents = []; saveHookEvents(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ events: hookEvents, token: HOOK_TOKEN || null }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'not_found', message: 'route not found' } }));
}

/** 转发到上游的请求头白名单（其余一律丢弃，避免 Host/Origin/Cookie 干扰） */
const FWD_REQ_HEADERS = new Set([
  'x-api-key', 'authorization', 'content-type', 'idempotency-key',
  'x-confirm-delete', 'range', 'if-range', 'accept', 'x-desktop-token',
]);
/** 回给浏览器的响应头白名单 */
const FWD_RES_HEADERS = new Set([
  'content-type', 'content-length', 'content-disposition', 'content-encoding',
  'content-range', 'accept-ranges', 'etag', 'x-instabox-file-path',
  'x-instabox-file-mode', 'deprecation', 'cache-control', 'retry-after',
]);

function log(...args) { console.log(new Date().toISOString(), ...args); }

// ---------------------------------------------------------------- REST 代理
function proxyRest(req, res) {
  if (!authOk(req)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'console_auth', message: 'console login required' } }));
    return;
  }
  const start = Date.now();
  // 解析 /p/<path>?<query>；剥掉内部参数 __key / __ct 并注入请求头
  // （InstaBox 端口边缘代理会剥掉自定义请求头，浏览器因此经查询串传 Key 与 Content-Type）
  const inner = req.url.slice(3); // 去掉 '/p/'
  const qi = inner.indexOf('?');
  const innerPath = qi === -1 ? inner : inner.slice(0, qi);
  const sp = new URLSearchParams(qi === -1 ? '' : inner.slice(qi + 1));
  const qKey = sp.get('__key');
  const qCT = sp.get('__ct');
  sp.delete('__key'); sp.delete('__ct');
  const restQuery = sp.toString();
  const target = new URL(UPSTREAM + '/' + innerPath.replace(/^\/+/, '') + (restQuery ? `?${restQuery}` : ''));

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (FWD_REQ_HEADERS.has(k.toLowerCase()) && v != null) headers[k] = v;
  }
  if (qKey) headers['x-api-key'] = qKey;
  if (qCT) headers['content-type'] = qCT;
  headers['accept-encoding'] = 'identity';
  headers.host = upstreamUrl.host;
  if (!headers['x-api-key'] && !headers.authorization && SERVER_KEY) {
    headers['x-api-key'] = SERVER_KEY;
  }
  // 诊断行：只记来源与存在性，不记任何值
  log('in:', req.method, `key=${qKey ? 'q' : headers['x-api-key'] ? 'hdr' : 'none'}`, `ct=${qCT || req.headers['content-type'] || '-'}`);

  const upReq = https.request(
    {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 443,
      method: req.method,
      path: target.pathname + target.search,
      headers,
      agent,
    },
    (upRes) => {
      const out = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (FWD_RES_HEADERS.has(k.toLowerCase()) && v != null) out[k] = v;
      }
      if (!out['cache-control']) out['cache-control'] = 'no-store';

      // 临时诊断：access 票据响应脱敏记录（token 只留前 6 字符），定位 WS 401/1006
      const isAccess = req.method === 'POST' && /\/access$/.test(target.pathname);
      if (isAccess) {
        const chunks = [];
        upRes.on('data', (c) => chunks.push(c));
        upRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          try {
            const j = JSON.parse(buf.toString('utf8'));
            const masked = { ...j };
            if (masked.token) masked.token = String(masked.token).slice(0, 6) + '…';
            if (masked.url) masked.url = String(masked.url).replace(/([?&](token|ticket)=)[^&]+/gi, '$1…');
            log('access-resp:', upRes.statusCode, JSON.stringify(masked));
          } catch { log('access-resp:', upRes.statusCode, '(non-json)'); }
          res.writeHead(upRes.statusCode || 502, out);
          res.end(buf);
        });
        upRes.on('error', () => res.destroy());
        return;
      }

      res.writeHead(upRes.statusCode || 502, out);
      upRes.pipe(res);
      upRes.on('error', () => res.destroy());
      // 访问日志：只记方法/路径/状态/耗时，不含查询串与请求头（不落盘 API Key）
      res.on('finish', () => {
        log(req.method, target.pathname, '→', upRes.statusCode, `${Date.now() - start}ms`);
      });
    }
  );

  upReq.on('error', (err) => {
    log('upstream error:', req.method, innerPath, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'proxy_upstream', message: `上游连接失败: ${err.message}`, retryable: true } }));
    } else res.destroy();
  });
  req.on('aborted', () => upReq.destroy());
  req.pipe(upReq);
}

// ---------------------------------------------------------------- 静态托管
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, upstream: UPSTREAM, serverKeyInjected: !!SERVER_KEY }));
    return;
  }
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    } else {
      // SPA fallback
      const idx = path.join(DIST, 'index.html');
      fs.readFile(idx, (e2, buf) => {
        if (e2) {
          res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<h3>dist/ 不存在</h3><p>请先运行 <code>npm run build</code>，开发模式请使用 <code>npm run dev</code>。</p>');
        } else {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(buf);
        }
      });
    }
  });
}

// ---------------------------------------------------------------- WebSocket 代理
const wss = new WebSocketServer({ noServer: true });

function wsAllowed(host) {
  const h = host.toLowerCase();
  return WS_HOST_SUFFIXES.some(sfx => h === sfx.slice(1) || h.endsWith(sfx));
}

function handleUpgrade(req, socket, head) {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname !== '/ws') return; // 交给其他 handler（vite dev 不走这里）
  if (u.pathname === '/ws' && !authOk(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }

  // 自测端点：回显边缘代理是否保留了 Sec-WebSocket-Protocol 头（?__echo=1）
  if (u.searchParams.get('__echo') === '1') {
    wss.handleUpgrade(req, socket, head, (client) => {
      client.send(JSON.stringify({
        protocolsHeader: req.headers['sec-websocket-protocol'] || null,
      }));
      setTimeout(() => client.close(1000, 'echo-done'), 300);
    });
    return;
  }

  const target = u.searchParams.get('url');
  if (!target) return socket.destroy();
  let t;
  try { t = new URL(target); } catch { return socket.destroy(); }
  if (t.protocol !== 'wss:' && t.protocol !== 'ws:') return socket.destroy();
  if (!wsAllowed(t.hostname)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    return socket.destroy();
  }

  wss.handleUpgrade(req, socket, head, (client) => {
    // 子协议恢复：浏览器经 InstaBox 边缘代理时 Sec-WebSocket-Protocol 头可能被剥掉，
    // 客户端因此同时把子协议放进查询参数 __subproto，优先用它。
    const subprotocols = u.searchParams.get('__subproto') || req.headers['sec-websocket-protocol'] || '';
    const upHeaders = { Host: t.host };
    // access ticket 与浏览器 Origin 绑定：必须原样转发，否则上游校验失败立即断开
    if (req.headers.origin) upHeaders['Origin'] = req.headers.origin;
    // 子协议必须走 ws 库的 protocols 参数（headers 方式传的子协议不会被登记，
    // 服务器回应选择的子协议时会报 "Server sent a subprotocol but none was requested"）
    const protoList = subprotocols ? subprotocols.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const up = protoList.length
      ? new WebSocket(target, protoList, { headers: upHeaders, handshakeTimeout: 15000 })
      : new WebSocket(target, { headers: upHeaders, handshakeTimeout: 15000 });

    log('ws:', t.host + t.pathname, 'sub=' + (subprotocols ? subprotocols.split(',').map(s => s.trim().split('.')[0]).join('|') : 'none'), 'origin=' + (req.headers.origin ? 'yes' : 'no'));

    const pipe = (from, to) => {
      from.on('message', (data, isBinary) => { if (to.readyState === WebSocket.OPEN) to.send(data, { binary: isBinary }); });
      from.on('close', (code, reason) => {
        log('ws-close:', t.host, 'code=' + code, 'reason=' + reason.toString().slice(0, 120));
        if (to.readyState === WebSocket.OPEN) to.close(code, reason.toString());
      });
      from.on('error', () => { try { to.close(1011, 'proxy error'); } catch {} });
      from.on('ping', (d) => { if (to.readyState === WebSocket.OPEN) to.ping(d); });
      from.on('pong', (d) => { if (to.readyState === WebSocket.OPEN) to.pong(d); });
    };
    up.on('open', () => { log('ws-open:', t.host); pipe(client, up); });
    up.on('unexpected-response', (_req, resp) => {
      log('ws-reject:', t.host, 'upstream-status=' + resp.statusCode);
      client.close(1011, `upstream ${resp.statusCode}`);
    });
    up.on('error', (err) => {
      log('ws-err:', t.host, err.message);
      try { client.close(1011, err.message); } catch {}
    });
    if (client.readyState === WebSocket.OPEN) pipe(up, client);
    else client.on('open', () => pipe(up, client));
  });
}

// ---------------------------------------------------------------- 启动
// ---------------------------------------------------------------- 飞书推送代理
// POST /feishu {url, secret?, payload} → 转发到飞书自定义机器人。
// URL 域白名单（open.feishu.cn / *.feishu.cn / *.larksuite.com）防 SSRF；
// 提供 secret 时按飞书签名规范计算（timestamp\nsecret 为 key，空串为内容，HMAC-SHA256 → base64）。
const FEISHU_HOSTS = new Set(['open.feishu.cn', 'feishu.cn', 'open.larksuite.com', 'larksuite.com']);

async function handleFeishu(req, res) {
  if (!authOk(req)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'console_auth', message: 'console login required' } }));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'method_not_allowed', message: 'POST only' } }));
    return;
  }
  const body = await readBody(req);
  let url = '', secret = '', payload = '';
  try {
    const j = JSON.parse(body || '{}');
    url = String(j.url || '');
    secret = String(j.secret || '');
    payload = j.payload ? (typeof j.payload === 'string' ? j.payload : JSON.stringify(j.payload)) : '';
  } catch { /* ignore */ }
  let target;
  try { target = new URL(url); } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'bad_url', message: 'invalid webhook url' } }));
    return;
  }
  const host = target.hostname.toLowerCase();
  if (target.protocol !== 'https:' || !(FEISHU_HOSTS.has(host) || [...FEISHU_HOSTS].some((h) => host.endsWith('.' + h)))) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'host_not_allowed', message: 'only Feishu/Lark webhook hosts are allowed' } }));
    return;
  }
  let finalPayload = payload || '{}';
  if (secret) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sign = crypto.createHmac('sha256', `${ts}\n${secret}`).update('').digest('base64');
    try {
      const j = JSON.parse(finalPayload);
      finalPayload = JSON.stringify({ timestamp: ts, sign, ...j });
    } catch { /* keep as-is */ }
  }
  const upReq = https.request(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(finalPayload) },
    timeout: 15000,
  }, (upRes) => {
    const chunks = [];
    upRes.on('data', (c) => chunks.push(c));
    upRes.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').slice(0, 2000);
      log('feishu →', upRes.statusCode, text.slice(0, 120));
      res.writeHead(upRes.statusCode || 502, { 'content-type': 'application/json' });
      res.end(text || '{}');
    });
  });
  upReq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'feishu_forward_fail', message: err.message } }));
  });
  upReq.write(finalPayload);
  upReq.end();
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (req.url === '/auth' || req.url.startsWith('/auth?')) return handleAuth(req, res);
  if (pathname === '/hook' || pathname === '/hook-events') return handleHook(req, res, pathname);
  if (pathname === '/feishu') return handleFeishu(req, res);
  if (req.url.startsWith('/p/')) return proxyRest(req, res);
  return serveStatic(req, res);
});
server.on('upgrade', handleUpgrade);
// 长轮询（wait=25s）与慢速上传需要更宽的超时
server.requestTimeout = 0;
server.headersTimeout = 120000;

server.listen(PORT, () => {
  log(`InstaBox WebUI 代理已启动: http://localhost:${PORT}  →  ${UPSTREAM}${SERVER_KEY ? '（服务端注入 API Key）' : ''}`);
  if (!fs.existsSync(DIST)) log('提示: dist/ 不存在，开发模式请另开终端运行 npm run dev');
});
