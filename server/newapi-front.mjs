#!/usr/bin/env node
// new-api 前置补头代理 —— 解决 InstaBox 端口边缘代理剥掉自定义请求头的问题。
// （边缘会剥掉 Authorization / Content-Type 等头，而 new-api 只认请求头；同款坑与约定见 server/index.mjs）
//
// 客户端令牌按优先级取一个注入 Authorization，四个来源都无 → 401（fail-closed）：
//   1. 请求自带 Authorization 头（SSH 隧道直连本代理时可用）
//   2. 路径首段 /sk-xxx —— GUI 客户端把「API 地址」设为 https://<front>/sk-xxx/v1
//      （GUI 无法发自定义头和查询参数，只能把令牌拼进地址；本代理剥掉首段再转发）
//   3. 查询参数 ?__key=sk-xxx —— console /p/* 的同款约定
//   4. 环境变量 NEWAPI_SERVER_TOKEN —— 服务端统一注入，GUI 客户端零配置直接用
//
// Content-Type 同理：缺失时取 ?__ct=，再缺省 POST/PUT/PATCH 补 application/json。
// 凭据不落日志（只记令牌来源 hdr/path/q/srv，不记值）。
//
// 用法: env PORT=3002 UP=127.0.0.1:3001 NEWAPI_SERVER_TOKEN=sk-… node newapi-front.mjs

import http from 'node:http';

const PORT = Number(process.env.PORT || 3002);
const UP = process.env.UP || 'http://127.0.0.1:3001';
const SERVER_TOKEN = process.env.NEWAPI_SERVER_TOKEN || '';
const upstreamUrl = new URL(UP);

function log(...args) { console.log(new Date().toISOString(), ...args); }

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
/** 重新发起请求时必须丢弃的逐跳头 */
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'trailer']);

/** 路径首段若是 /sk-xxx 则取出令牌，返回 { key, rest }；否则 null */
function takePathKey(pathname) {
  const m = pathname.match(/^\/(sk-[^/]+)(?=\/|$)/);
  return m ? { key: m[1], rest: pathname.slice(m[0].length) || '/' } : null;
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }

  const url = new URL(req.url, 'http://x');
  const sp = url.searchParams;
  const qKey = sp.get('__key');
  const qCT = sp.get('__ct');
  sp.delete('__key'); sp.delete('__ct');

  const hit = takePathKey(url.pathname);
  const pathKey = hit ? hit.key : null;
  const outPath = hit ? hit.rest : url.pathname || '/';

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_HEADERS.has(k.toLowerCase()) && v != null) headers[k] = v;
  }
  delete headers.host;
  headers.host = upstreamUrl.host;
  headers['accept-encoding'] = 'identity';

  // 补 Authorization：自带 > 路径段 > 查询参数 > 服务端统一令牌
  let keySrc = 'hdr';
  if (!headers.authorization) {
    const k = pathKey || qKey || SERVER_TOKEN;
    if (!k) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'no_token', message: 'no token: use /sk-xxx/ path prefix, ?__key=sk-xxx, or set NEWAPI_SERVER_TOKEN server-side' } }));
      return;
    }
    headers.authorization = 'Bearer ' + k;
    keySrc = pathKey ? 'path' : qKey ? 'q' : 'srv';
  }
  // 补 Content-Type：边缘剥掉后 JSON 体会失去类型，POST/PUT/PATCH 缺省补 application/json
  if (!headers['content-type']) {
    const ct = qCT || (BODY_METHODS.has(req.method) ? 'application/json' : null);
    if (ct) headers['content-type'] = ct;
  }

  const upReq = http.request(
    {
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 80,
      method: req.method,
      path: outPath + (sp.toString() ? '?' + sp.toString() : ''),
      headers,
    },
    (upRes) => {
      const out = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (!HOP_HEADERS.has(k.toLowerCase()) && v != null) out[k] = v;
      }
      res.writeHead(upRes.statusCode, out);
      upRes.pipe(res); // SSE 流式直通
    },
  );
  upReq.on('error', (e) => {
    log('upstream error:', req.method, outPath, e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'upstream', message: e.message } }));
  });
  // 客户端断开（边缘超时/用户取消）→ 掐断上游，避免 LLM 长连接悬挂。
  // 注意不能用 req 的 'close'：GET 等空 body 请求的消息一读完它就触发（Node ≥16），会误杀刚发出的上游请求
  res.on('close', () => { if (!res.writableEnded) upReq.destroy(); });
  req.pipe(upReq);

  // 诊断行：只记来源与路径，不记任何令牌值
  log('in:', req.method, outPath, `key=${keySrc}`, `ct=${headers['content-type'] || '-'}`);
});

server.requestTimeout = 0; // LLM 长响应不被 Node 默认 300s 掐断
server.headersTimeout = 65000;
server.listen(PORT);
log(`new-api front proxy: :${PORT} → ${UP}${SERVER_TOKEN ? '（服务端统一令牌已配置）' : ''}`);
