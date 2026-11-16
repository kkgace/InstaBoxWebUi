#!/usr/bin/env bash
# 一键部署 InstaBox WebUI 控制台到自有云主机（自有 VPS / 云服务器）
#
# 与 deploy.sh（沙箱版）的区别：
#   - 走普通 SSH（~/.ssh/config 里的别名），不走 instabox 的 ssh.instabox.sh 令牌
#   - 目标机自己装 Node（官方 tarball，arm64/x64 都支持），不需要 InstaBox CLI
#   - nginx vhost 由脚本安装并 reload（对外 https://<域名>:<端口>）
#   - 运行期配置（密码 / IP 白名单 / DSH 挂载）放在部署目录之外，改完 restart 即生效
#
# 前置：
#   1. ~/.ssh/config 里有目标主机别名（默认 sg-ck-ssh），且目标机 sudo 免密
#   2. 本机 npm install && npm run build（脚本会自动构建）
#
# 可选环境变量：
#   SSH_HOST=sg-ck-ssh            目标主机别名
#   CONSOLE_DIR=/data/instabox-console
#   SECRET_DIR=/data/instabox-console-secrets
#   CONSOLE_PORT=3010             控制台本机端口（只绑 127.0.0.1，由 nginx 对外）
#   NGINX_PORT=8005               nginx 对外端口（8000-8009 区间内选一个没被 xray 占用的）
#   PUBLIC_HOST=console.example.com 对外域名（DSH_PUBLIC_HOST 用它 + 端口）
#   ALLOW_IPS=198.51.100.20,...  IP 放行名单（逗号分隔；留空=关闭该门）
#                                    注意：本机流量可能有两个出口 IP（curl 走 198.51.100.20、
#                                    原生 socket 走 198.51.100.21），两个都要列进去，否则会被 403
#   DSH_UPSTREAM=https://...       /dsh 的上游（本机 dsh 或另一台沙箱的 dsh-front 公网入口）
#   DSH_MOUNTS=/dsh-kk=https://... 额外挂载
#   NODE_VERSION=v24.22.3         目标机 Node 版本
#
# 用法: bash deploy-vm-console.sh
set -euo pipefail
cd "$(dirname "$0")"

SSH_HOST=${SSH_HOST:-sg-ck-ssh}
CONSOLE_DIR=${CONSOLE_DIR:-/data/instabox-console}
SECRET_DIR=${SECRET_DIR:-/data/instabox-console-secrets}
CONSOLE_PORT=${CONSOLE_PORT:-3010}
NGINX_PORT=${NGINX_PORT:-8005}
PUBLIC_HOST=${PUBLIC_HOST:-console.example.com}
ALLOW_IPS=${ALLOW_IPS:-198.51.100.20,198.51.100.21,203.0.113.11}
DSH_UPSTREAM=${DSH_UPSTREAM:-http://127.0.0.1:5080}
DSH_MOUNTS=${DSH_MOUNTS:-}
NODE_VERSION=${NODE_VERSION:-v24.22.3}

SSH="ssh -o BatchMode=yes -o ConnectTimeout=20 $SSH_HOST"
SCP="scp -o BatchMode=yes -o ConnectTimeout=20"

echo "==> 构建前端"
npm run build

echo "==> 打包（dist + server + 看门狗）"
tar czf /tmp/console-vm-deploy.tar.gz dist server package.json deploy/supervisor-vm.sh

echo "==> 上传"
$SCP /tmp/console-vm-deploy.tar.gz "$SSH_HOST:/tmp/console-vm-deploy.tar.gz"
$SCP deploy/instabox-console-vm.service "$SSH_HOST:/tmp/instabox-console-vm.service"
$SCP deploy/nginx/instabox-console-8005.conf "$SSH_HOST:/tmp/instabox-console-8005.conf"

echo "==> 远端安装（Node / 应用 / systemd / nginx）"
$SSH env CONSOLE_DIR="$CONSOLE_DIR" SECRET_DIR="$SECRET_DIR" CONSOLE_PORT="$CONSOLE_PORT" \
  NGINX_PORT="$NGINX_PORT" PUBLIC_HOST="$PUBLIC_HOST" ALLOW_IPS="$ALLOW_IPS" \
  DSH_UPSTREAM="$DSH_UPSTREAM" DSH_MOUNTS="$DSH_MOUNTS" NODE_VERSION="$NODE_VERSION" \
  bash -s <<'REMOTE'
set -euo pipefail
CONSOLE_DIR="$CONSOLE_DIR"; SECRET_DIR="$SECRET_DIR"; CONSOLE_PORT="$CONSOLE_PORT"
NGINX_PORT="$NGINX_PORT"; PUBLIC_HOST="$PUBLIC_HOST"; ALLOW_IPS="$ALLOW_IPS"
DSH_UPSTREAM="$DSH_UPSTREAM"; DSH_MOUNTS="$DSH_MOUNTS"; NODE_VERSION="$NODE_VERSION"

# ---- Node（官方二进制；机器上没有就装）----
if ! command -v node >/dev/null 2>&1; then
  case "$(uname -m)" in
    aarch64) NODE_ARCH=arm64 ;;
    x86_64|amd64) NODE_ARCH=x64 ;;
    *) echo "不支持的架构 $(uname -m)"; exit 1 ;;
  esac
  echo "安装 Node $NODE_VERSION (linux-$NODE_ARCH) ..."
  curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  sudo -n tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node.tar.xz
fi
echo "node: $(node -v)  npm: $(npm -v)"

# ---- 应用目录（/data 通常是 root 所有，用 sudo 建目录并把属主给运行用户）----
sudo -n mkdir -p "$CONSOLE_DIR" "$SECRET_DIR"
sudo -n chown "$(id -u):$(id -g)" "$CONSOLE_DIR" "$SECRET_DIR"
sudo -n chmod 700 "$SECRET_DIR"
rm -rf "$CONSOLE_DIR"/dist "$CONSOLE_DIR"/server
tar xzf /tmp/console-vm-deploy.tar.gz -C "$CONSOLE_DIR"
mv "$CONSOLE_DIR/deploy/supervisor-vm.sh" "$CONSOLE_DIR/supervisor-vm.sh" 2>/dev/null || true
rmdir "$CONSOLE_DIR/deploy" 2>/dev/null || true
chmod +x "$CONSOLE_DIR/supervisor-vm.sh"

# ---- 运行时依赖：只有 ws（前端依赖已打进 dist/，不需要）----
cd "$CONSOLE_DIR"
cat > package.json <<'JSON'
{ "name": "instabox-ui", "private": true, "type": "module", "dependencies": { "ws": "^8.18.0" } }
JSON
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1

# ---- 运行期配置（部署目录之外；密码已存在则保留，不轮换）----
ENV_FILE="$SECRET_DIR/.console-env"
GEN_PASS=""
if [ -f "$ENV_FILE" ]; then
  OLD_PASS=$(grep -E '^CONSOLE_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
else
  OLD_PASS=""
fi
if [ -z "$OLD_PASS" ]; then
  OLD_PASS=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  GEN_PASS="$OLD_PASS"
fi
cat > "$ENV_FILE" <<EOF
# InstaBox 控制台运行期配置（改完 systemctl restart instabox-console 生效）
CONSOLE_PASSWORD=$OLD_PASS
PORT=$CONSOLE_PORT
HOST=127.0.0.1
ALLOW_IPS=$ALLOW_IPS
DSH_PUBLIC_HOST=$PUBLIC_HOST:$NGINX_PORT
DSH_UPSTREAM=$DSH_UPSTREAM
DSH_MOUNTS=$DSH_MOUNTS
INSTABOX_API=https://api.instabox.sh
EOF
chmod 600 "$ENV_FILE"

# ---- systemd ----
sudo -n install -m 644 /tmp/instabox-console-vm.service /etc/systemd/system/instabox-console.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now instabox-console.service >/dev/null 2>&1 || true
sudo -n systemctl restart instabox-console.service
sleep 3

# ---- nginx ----
sudo -n install -m 644 /tmp/instabox-console-8005.conf /etc/nginx/sites-enabled/instabox-console-8005.conf
# 换端口时清掉旧 vhost（残留会和新配置抢端口）
sudo -n rm -f /etc/nginx/sites-enabled/instabox-console-8009.conf
# 端口按实际部署替换（vhost 模板默认 8005 → 控制台 3010）
sudo -n sed -i "s/\b3010\b/$CONSOLE_PORT/g; s/\b8005\b/$NGINX_PORT/g" /etc/nginx/sites-enabled/instabox-console-8005.conf
# $connection_upgrade 需要 http 级 map（vhost 里用它区分 WS 与普通请求）
if ! sudo -n grep -rq 'map .*connection_upgrade' /etc/nginx/ 2>/dev/null; then
  sudo -n tee /etc/nginx/conf.d/00-connection-upgrade.conf >/dev/null <<'MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
MAP
fi
# 主机防火墙：该机 INPUT 链末尾是 REJECT（只放行显式列出的端口），需放行对外端口并持久化
if ! sudo -n iptables -C INPUT -p tcp --dport "$NGINX_PORT" -j ACCEPT 2>/dev/null; then
  sudo -n iptables -I INPUT -p tcp --dport "$NGINX_PORT" -j ACCEPT
fi
sudo -n netfilter-persistent save >/dev/null 2>&1 || sudo -n sh -c "iptables-save > /etc/iptables/rules.v4"
sudo -n nginx -t
sudo -n systemctl reload nginx

echo "本机健康检查: $(curl -s http://127.0.0.1:$CONSOLE_PORT/healthz)"
echo "nginx 健康检查: $(curl -sk -o /dev/null -w '%{http_code}' --resolve $PUBLIC_HOST:$NGINX_PORT:127.0.0.1 https://$PUBLIC_HOST:$NGINX_PORT/healthz)"
if [ -n "$GEN_PASS" ]; then echo "NEW_PASSWORD=$GEN_PASS"; fi
REMOTE

echo
echo "==> 完成"
echo "访问地址: https://$PUBLIC_HOST:$NGINX_PORT/"
echo "（若连不上：云厂商安全组需放行 TCP $NGINX_PORT）"
