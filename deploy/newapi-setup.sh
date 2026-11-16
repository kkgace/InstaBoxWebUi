#!/usr/bin/env bash
# 在 InstaBox 沙箱内部一键部署 new-api（模型中转站）+ 前置补头代理
# —— 在沙箱终端里直接运行，无需 ssh.txt、无需从本机上传其他文件。
#
# 架构（InstaBox 边缘会剥自定义请求头，new-api 只认请求头，所以必须前置补头）：
#   客户端 ──https──> InstaBox 边缘 ──> front 代理(:3002，补 Authorization/Content-Type) ──> new-api(:3001，仅本机，SQLite 落 /data)
#
# 获取本脚本到沙箱任选其一：
#   a. 本仓库控制台「文件」页上传到 /data/workspace/（推荐）
#   b. 终端里 heredoc 粘贴
# 运行: bash newapi-setup.sh
# 可选环境变量: NEWAPI_VERSION / NEWAPI_PORT / FRONT_PORT（同 deploy-newapi.sh）
#
# 注意：内嵌的 newapi-front.mjs / newapi-supervisor.sh / newapi.service 与仓库源文件同源，
#       改过源文件后重新生成或改用 Windows 侧的 deploy-newapi.sh。
set -euo pipefail

VER=${NEWAPI_VERSION:-v1.0.0-rc.51}
NEWAPI_PORT=${NEWAPI_PORT:-3001}
FRONT_PORT=${FRONT_PORT:-3002}
DIR=/data/workspace/newapi
mkdir -p "$DIR" /data/workspace/newapi-secrets

# ---------------------------------------------------------------- 前置补头代理
cat > "$DIR/newapi-front.mjs" <<'FRONT'
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
FRONT

# ---------------------------------------------------------------- 看门狗
cat > "$DIR/newapi-supervisor.sh" <<'SUP'
#!/usr/bin/env bash
# new-api（模型中转站）+ 前置补头代理 的看门狗：任一进程退出后 5 秒内自动拉起
# Secrets（SESSION_SECRET / NEWAPI_SERVER_TOKEN）存放在 /data/workspace/newapi-secrets/.newapi-env
# （在部署目录之外，重部署不会清掉；改了它之后重启本服务生效）
cd /data/workspace/newapi || exit 1
ENV_FILE=/data/workspace/newapi-secrets/.newapi-env
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
NEWAPI_PORT=${NEWAPI_PORT:-3001}
FRONT_PORT=${FRONT_PORT:-3002}

watch() {
  local name=$1; shift
  while true; do
    "$@" >> "$name.log" 2>&1
    echo "$(date -u +%FT%TZ) $name 退出(代码=$?)，5 秒后重启" >> supervisor.log
    sleep 5
  done
}

watch new-api env PORT="$NEWAPI_PORT" ./new-api &
watch newapi-front env PORT="$FRONT_PORT" UP="127.0.0.1:$NEWAPI_PORT" node newapi-front.mjs &
wait
SUP
chmod +x "$DIR/newapi-supervisor.sh"

# ---------------------------------------------------------------- systemd 单元
cat > "$DIR/newapi.service" <<'UNIT'
[Unit]
Description=new-api relay + front header-inject proxy (supervisor watchdog)
After=network.target

[Service]
Type=simple
WorkingDirectory=/data/workspace/newapi
ExecStart=/bin/bash /data/workspace/newapi/newapi-supervisor.sh
User=user
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# ---------------------------------------------------------------- 安装与启动
cd "$DIR"
if [ ! -x ./new-api ]; then
  case $(uname -m) in
    x86_64)  ASSET="new-api-$VER" ;;
    aarch64) ASSET="new-api-arm64-$VER" ;;
    *) echo "不支持的架构 $(uname -m)"; exit 1 ;;
  esac
  echo "==> 下载 $ASSET（~140MB，一次性）..."
  curl -fsSL -o new-api.dl "https://github.com/Calcium-Ion/new-api/releases/download/$VER/$ASSET"
  curl -fsSL -o checksums.txt "https://github.com/Calcium-Ion/new-api/releases/download/$VER/checksums-linux.txt"
  EXPECT=$(grep -i "$ASSET" checksums.txt | head -1 | awk '{print $1}')
  ACTUAL=$(sha256sum new-api.dl | awk '{print $1}')
  [ -n "$EXPECT" ] && [ "$EXPECT" = "$ACTUAL" ] || { echo "sha256 校验失败"; exit 1; }
  mv new-api.dl new-api && chmod +x new-api
fi

# 首次生成 SESSION_SECRET（登录态跨重启；文件在部署目录之外，重部署不清掉）
if [ ! -f /data/workspace/newapi-secrets/.newapi-env ]; then
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'SESSION_SECRET=%s\n' "$SECRET" > /data/workspace/newapi-secrets/.newapi-env
  chmod 600 /data/workspace/newapi-secrets/.newapi-env
fi

echo "==> 启动（systemd 优先，失败回退看门狗）"
if command -v systemctl >/dev/null 2>&1 && sudo -n install -m 644 "$DIR/newapi.service" /etc/systemd/system/newapi.service 2>/dev/null; then
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now newapi.service >/dev/null 2>&1 || true
  sudo -n systemctl restart newapi.service
else
  (pkill -f '[n]ewapi-supervisor\.sh' 2>/dev/null || true)
  (pkill -f '\./new-api' 2>/dev/null || true)
  (pkill -f '[n]ode newapi-front\.mjs' 2>/dev/null || true); sleep 1
  (cd "$DIR" && setsid bash newapi-supervisor.sh </dev/null >/dev/null 2>&1 &)
fi
sleep 3
echo "本机健康检查(/healthz): $(curl -s "http://localhost:$FRONT_PORT/healthz")"

echo "==> 发布公网端口 $FRONT_PORT（已发布过会提示已存在，忽略即可）"
PUB_URL=$(instabox-port publish "$FRONT_PORT" 2>&1 | grep -o 'https://[^[:space:]]*' | head -1 || true)
echo
if [ -n "$PUB_URL" ]; then
  echo "前端入口: $PUB_URL"
else
  echo "前端入口: https://$FRONT_PORT-<machine-id>.instabox.tech （以 publish 输出为准）"
fi
cat <<'NEXT'

后续手工步骤：
  1. 打开前端入口 → new-api 管理页 → 登录 root / 123456 → 立即改密码（URL 是公网的！）
  2. 「令牌」页创建 sk- 令牌（建议设额度/过期）
  3. （可选，让 GUI 客户端零配置）把令牌写成服务端统一注入：
       echo 'NEWAPI_SERVER_TOKEN=sk-xxx' >> /data/workspace/newapi-secrets/.newapi-env
       sudo -n systemctl restart newapi.service
  4. 关闭空闲暂停（否则 30 分钟没人用就 503）：本仓库控制台 → API 控制台 →
       PATCH /v1/machines/{id}    body: {"autoSuspendAfterSeconds": 0}
NEXT
