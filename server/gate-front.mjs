#!/usr/bin/env node
// 通用 IP 门代理 —— 给部署在沙箱上、经 instabox 边缘发布的任意 HTTP 应用加来源 IP 白名单。
// （InstaBox 端口发布原生只有 public/private-token，没有 IP 白名单；同款门见 server/index.mjs 与
//   server/dsh-front.mjs。与 dsh-front 的区别：不改写 Host、不剥 Origin/Sec-Fetch-Site——
//   通用应用按收到什么转发什么，保持与直发时完全一致的行为。）
//
//   浏览器/白名单客户端 ──https──> 边缘(<port>-<id>.instabox.tech) ──> 本代理(:PORT) ──> 上游(UP)
//
// IP 门：边缘恒提供 X-Forwarded-For（实测），取最后一段为客户端 IP；127.0.0.1/::1 恒放行；
// /healthz 豁免（本机/看门狗探活）。REST 全量透传 + WebSocket 升级透传（子协议原样带上）。
//
// 用法: env PORT=3018 UP=http://127.0.0.1:3019 ALLOW_IPS=1.2.3.4,5.6.7.0/24 node gate-front.mjs （需 npm i ws@8）

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 3018);
const UP = (process.env.UP || 'http://127.0.0.1:3019').replace(/\/+$/, '');
const upstreamUrl = new URL(UP);
const ALLOW_IPS = (process.env.ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);

function log(...args) { console.log(new Date().toISOString(), ...args); }

// 逐跳头不许复制（node 自己管理）；Host 原样透传，与直发行为一致
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

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
function buildHeaders(req) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (HOP_HEADERS.has(k.toLowerCase())) continue;
    headers[k] = v;
  }
  return headers;
}

// 双向搬运 WS 消息（与控制台 pipeWs 同款，关闭码需清洗）
function pipeWs(from, to, tag) {
  from.on('message', (data, isBinary) => { if (to.readyState === WebSocket.OPEN) to.send(data, { binary: isBinary }); });
  from.on('close', (code, reason) => {
    log('ws-close:', tag, 'code=' + code);
    const safeCode = (code === 1000 || (code >= 3000 && code <= 4999)) ? code : 1011;
    if (to.readyState === WebSocket.OPEN) {
      try { to.close(safeCode, reason.toString().slice(0, 100)); } catch { try { to.close(1000); } catch {} }
    }
  });
  from.on('error', () => { try { to.close(1011, 'proxy error'); } catch { try { to.close(1000); } catch {} } });
  from.on('ping', (d) => { if (to.readyState === WebSocket.OPEN) to.ping(d); });
  from.on('pong', (d) => { if (to.readyState === WebSocket.OPEN) to.pong(d); });
}

const wss = new WebSocketServer({ noServer: true });

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
    res.end(JSON.stringify({ error: { code: 'gate_front_upstream', message: `上游连接失败: ${e.message}` } }));
  });
  req.on('aborted', () => upReq.destroy());
  req.pipe(upReq);
  log('in:', req.method, req.url);
});

// WebSocket 升级透传
server.on('upgrade', (req, socket, head) => {
  if (!ipGate(req, socket)) return;
  wss.handleUpgrade(req, socket, head, (client) => {
    const protoList = (req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const target = `ws://${upstreamUrl.host}${req.url}`;
    const up = protoList.length
      ? new WebSocket(target, protoList, { headers: buildHeaders(req), handshakeTimeout: 15000 })
      : new WebSocket(target, { headers: buildHeaders(req), handshakeTimeout: 15000 });
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

server.requestTimeout = 0;
server.headersTimeout = 120000;
server.listen(PORT);
log(`gate-front proxy: :${PORT} → ${UP}${ALLOW_IPS.length ? `（IP 白名单 ${ALLOW_IPS.length} 条）` : '（无 IP 门）'}`);
