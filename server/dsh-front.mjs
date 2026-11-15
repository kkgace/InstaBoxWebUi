#!/usr/bin/env node
// dsh 前置补 Host 代理 —— 让跨沙箱 dsh 能挂在控制台 /dsh-<名>/ 下公开访问。
// 解决 InstaBox 端口边缘代理改写 Host 的问题（同款坑与约定见 server/index.mjs）：
//
//   控制台 /dsh-kk/ ──https──> 边缘(5080-<id>.instabox.tech) ──> 本代理(:5080) ──> dsh(127.0.0.1:5081)
//
// 注意：发布端口必须指向本代理，不能直发 dsh——dsh 没有任何配置能放宽 fence 的
// Origin 校验（--trusted-host 只扩 Host 名单；rewriteBrowserOrigin 是 DeepSeek
// 账号平台 OAuth 的配置，与 web fence 无关）。
//
// dsh 的 /api browser-trust fence（dsh-client-connection isTrustedApiRequest）：
//   - Host 必须是 loopback / bind 地址 / --trusted-host 之一；
//   - 请求一旦带 Origin，还要求 Origin 的 authority 与 Host 一致。
// 边缘把 Host 改写为 127.0.0.1:<port>，而浏览器 Origin 是控制台域名 → 二者不一致 → 403。
// 本代理固定把 Host 呈现为上游 authority（默认 127.0.0.1:5081，loopback → fence 直接放行），
// 并剥掉 Origin / Sec-Fetch-Site，让 fence 稳定按非浏览器放行；
// 会话 cookie 的名字含 Host authority 哈希，与控制台上其它 dsh 实例天然不冲突。
// dsh 侧用 --public-url https://<控制台>/dsh-kk/ 启动即得到正确的入口 URL（trust 与否由 fence 决定）。
//
// 鉴权：本代理不验 dsh 的令牌（dsh 自身的 launch-token + 会话 cookie 是唯一身份栅栏），
// 但可用 ALLOW_IPS 做 IP 门（与 server/index.mjs 的 ipGate 同款逻辑）：边缘恒提供
// X-Forwarded-For（实测），取最后一段为客户端 IP；127.0.0.1/::1 恒放行。
// 白名单须包含控制台沙箱的出口 IP（/dsh-kk/ 链路：控制台 → 边缘 → 本代理）。
//
// 用法: env PORT=5080 UP=http://127.0.0.1:5081 ALLOW_IPS=1.2.3.4,5.6.7.0/24 node dsh-front.mjs （需 npm i ws@8）

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 5080);
const UP = (process.env.UP || 'http://127.0.0.1:5081').replace(/\/+$/, '');
const ALLOW_IPS = (process.env.ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);

function v4ToLong(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return null;
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}
function clientIpOf(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const parts = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      let ip = parts[parts.length - 1];
      const m = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
      if (m) ip = m[1];
      return ip;
    }
  }
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
function ipAllowed(ip) {
  if (!ALLOW_IPS.length) return true;
  const norm = String(ip || '').replace(/^::ffff:/, '');
  if (norm === '127.0.0.1' || norm === '::1') return true;
  const ipL = v4ToLong(norm);
  for (const entry of ALLOW_IPS) {
    if (entry === norm) return true;
    if (entry.includes('/')) {
      const [base, bitsRaw] = entry.split('/');
      const bits = Number(bitsRaw);
      const baseL = v4ToLong(base);
      if (ipL == null || baseL == null || !(bits >= 0 && bits <= 32)) continue;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((ipL & mask) === (baseL & mask)) return true;
    } else {
      const eL = v4ToLong(entry);
      if (ipL != null && eL != null && eL === ipL) return true;
    }
  }
  return false;
}
function ipGate(req, res) {
  // res: HTTP 分支传 ServerResponse，upgrade 分支传原始 socket
  if (!ALLOW_IPS.length || ipAllowed(clientIpOf(req))) return true;
  const body = JSON.stringify({ error: { code: 'ip_not_allowed', message: `来源 IP 不在放行名单（ALLOW_IPS=${ALLOW_IPS.join(',')}）` } });
  log('ip-gate 拒绝:', clientIpOf(req), req.url || '');
  if (res instanceof http.ServerResponse) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(body);
  } else {
    res.write('HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body);
    res.destroy();
  }
  return false;
}
const upstreamUrl = new URL(UP);
// 呈现给 dsh 的 Host：默认取上游 authority（loopback 场景 fence 直接放行，且 cookie 名随之区分实例）
const HOST_OVERRIDE = process.env.HOST_OVERRIDE || upstreamUrl.host;

function log(...args) { console.log(new Date().toISOString(), ...args); }

// 逐跳头不许复制（node 自己管理），Host 由本代理固定
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
// fence 相关头：剥掉 Origin / Sec-Fetch-Site（Host 是本代理固定的，浏览器带来的 Origin 只会让
// fence 误判不一致；剥掉后按非浏览器 + loopback Host 稳定放行）
const STRIP_HEADERS = new Set(['origin', 'sec-fetch-site']);

function buildHeaders(req) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP_HEADERS.has(k.toLowerCase()) || k.toLowerCase() === 'host') continue;
    if (STRIP_HEADERS.has(k.toLowerCase())) continue;
    headers[k] = v;
  }
  headers.host = HOST_OVERRIDE;
  return headers;
}

const wss = new WebSocketServer({ noServer: true });

// 双向搬运 WS 消息（与控制台 server/index.mjs 的 pipeWs 同款，关闭码需清洗）
function pipeWs(from, to, tag) {
  from.on('message', (data, isBinary) => { if (to.readyState === WebSocket.OPEN) to.send(data, { binary: isBinary }); });
  from.on('close', (code, reason) => {
    log('ws-close:', tag, 'code=' + code, 'reason=' + reason.toString().slice(0, 120));
    const safeCode = (code === 1000 || (code >= 3000 && code <= 4999)) ? code : 1011;
    if (to.readyState === WebSocket.OPEN) {
      try { to.close(safeCode, reason.toString().slice(0, 100)); } catch { try { to.close(1000); } catch {} }
    }
  });
  from.on('error', () => { try { to.close(1011, 'proxy error'); } catch { try { to.close(1000); } catch {} } });
  from.on('ping', (d) => { if (to.readyState === WebSocket.OPEN) to.ping(d); });
  from.on('pong', (d) => { if (to.readyState === WebSocket.OPEN) to.pong(d); });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (!ipGate(req, res)) return;

  const upReq = http.request(
    { hostname: upstreamUrl.hostname, port: upstreamUrl.port || 80, method: req.method, path: req.url, headers: buildHeaders(req) },
    (upRes) => {
      const out = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (HOP_HEADERS.has(k.toLowerCase())) continue;
        out[k] = v;
      }
      res.writeHead(upRes.statusCode || 502, out);
      upRes.pipe(res);
      upRes.on('error', () => res.destroy());
    },
  );
  upReq.on('error', (e) => {
    log('upstream error:', req.method, req.url, e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'dsh_front_upstream', message: `dsh 上游连接失败: ${e.message}` } }));
  });
  req.on('aborted', () => upReq.destroy());
  req.pipe(upReq);
  log('in:', req.method, req.url);
});

// WebSocket 升级透传（dsh 实时长连接 /api/remote.mux 走这里），子协议原样带上
server.on('upgrade', (req, socket, head) => {
  if (!ipGate(req, socket)) return;
  wss.handleUpgrade(req, socket, head, (client) => {
    const protoList = (req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const headers = buildHeaders(req);
    const target = `ws://${upstreamUrl.host}${req.url}`;
    const up = protoList.length
      ? new WebSocket(target, protoList, { headers, handshakeTimeout: 15000 })
      : new WebSocket(target, { headers, handshakeTimeout: 15000 });
    log('ws-upgrade:', req.url, 'sub=' + (protoList.join('|') || 'none'));
    up.on('open', () => pipeWs(client, up, req.url));
    up.on('unexpected-response', (_req, resp) => {
      log('ws-reject:', req.url, 'upstream-status=' + resp.statusCode);
      try { client.close(1011, `upstream ${resp.statusCode}`); } catch {}
    });
    up.on('error', (err) => {
      log('ws-err:', req.url, err.message);
      try { client.close(1011, err.message); } catch {}
    });
    if (client.readyState === WebSocket.OPEN) pipeWs(up, client, req.url);
    else client.on('open', () => pipeWs(up, client, req.url));
  });
});

server.requestTimeout = 0; // dsh 会话内长请求不被 Node 默认 300s 掐断
server.headersTimeout = 120000;
// 监听所有接口（同 newapi-front）：instabox 边缘到沙箱的转发可能不走 127.0.0.1；
// 沙箱网络本身已隔离——只有发布过的端口与 SSH 可从外部到达
server.listen(PORT);
log(`dsh front proxy: :${PORT} → ${UP}（Host 呈现为 ${HOST_OVERRIDE}）`);
