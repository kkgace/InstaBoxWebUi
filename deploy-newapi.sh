#!/usr/bin/env bash
# 一键部署 new-api（模型中转站）+ 前置补头代理到 ssh.txt 指向的 InstaBox 沙箱
#
# 架构（InstaBox 边缘会剥自定义请求头，new-api 只认请求头，所以必须前置补头）：
#   客户端 ──https──> InstaBox 边缘 ──> front 代理(:3002，补 Authorization/Content-Type) ──> new-api(:3001，仅本机，SQLite 落 /data)
#
# 前置：ssh.txt 里放 SSH 命令行（同 deploy.sh）
# 可选环境变量：
#   NEWAPI_VERSION=v1.0.0-rc.51   # new-api 版本，latest = 取最新 release
#   NEWAPI_PORT=3001              # new-api 本机端口
#   FRONT_PORT=3002               # 发布到公网的端口（避开 console 的 3000）
#
# 用法: bash deploy-newapi.sh
set -euo pipefail
cd "$(dirname "$0")"

SSH_LINE=$(cat ssh.txt | head -1 | xargs)
PORT=$(echo "$SSH_LINE" | grep -oP '(?<=-p )\d+' || echo 22)
DEST=$(echo "$SSH_LINE" | grep -oP '[\w.]+@[\w.-]+$')
SSH="ssh -p $PORT -o BatchMode=yes $DEST"
SCP="scp -P $PORT -o BatchMode=yes"
NEWAPI_VERSION=${NEWAPI_VERSION:-v1.0.0-rc.51}
NEWAPI_PORT=${NEWAPI_PORT:-3001}
FRONT_PORT=${FRONT_PORT:-3002}

echo "==> 上传代理脚本 / 看门狗 / systemd 单元"
$SCP server/newapi-front.mjs deploy/newapi-supervisor.sh deploy/newapi.service "$DEST:/tmp/"

echo "==> 安装与启动（首次会在沙箱内下载 ~140MB 二进制并做 sha256 校验）"
$SSH env VER="$NEWAPI_VERSION" NEWAPI_PORT="$NEWAPI_PORT" FRONT_PORT="$FRONT_PORT" bash -s <<'REMOTE'
set -e
DIR=/data/workspace/newapi
mkdir -p "$DIR" /data/workspace/newapi-secrets
mv /tmp/newapi-front.mjs /tmp/newapi-supervisor.sh /tmp/newapi.service "$DIR/"
chmod +x "$DIR/newapi-supervisor.sh"

cd "$DIR"
if [ ! -x ./new-api ]; then
  case $(uname -m) in
    x86_64)  ASSET="new-api-$VER" ;;
    aarch64) ASSET="new-api-arm64-$VER" ;;
    *) echo "不支持的架构 $(uname -m)"; exit 1 ;;
  esac
  echo "下载 $ASSET ..."
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

# systemd 优先（同 deploy.sh 的 console 模式），失败回退 setsid 看门狗
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
REMOTE

echo
echo "==> 发布公网端口 $FRONT_PORT（已发布过会提示已存在，忽略即可）"
PUB_URL=$($SSH "instabox-port publish $FRONT_PORT" | grep -o 'https://[^[:space:]]*' | head -1 || true)
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
       ssh -p 2222 <token>@ssh.instabox.sh
         echo 'NEWAPI_SERVER_TOKEN=sk-xxx' >> /data/workspace/newapi-secrets/.newapi-env
         sudo -n systemctl restart newapi.service
  4. 关闭空闲暂停（否则 30 分钟没人用就 503）：本仓库控制台 → API 控制台 →
       PATCH /v1/machines/{id}    body: {"autoSuspendAfterSeconds": 0}
NEXT
