#!/usr/bin/env bash
# 一键部署 InstaBox WebUI 控制台到你的 InstaBox 沙箱
#
# 前置：
#   1. ssh.txt 里放 SSH 命令行（如: ssh -p 2222 ibssh_xxx@ssh.instabox.sh），本脚本解析它
#   2. 本机已 npm install && npm run build
#
# 用法: bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

SSH_LINE=$(cat ssh.txt | head -1 | xargs)
# 兼容 ssh://user@host:port URL 格式（instabox 面板复制的）→ CLI 格式
case "$SSH_LINE" in
  ssh://*)
    DEST=$(echo "$SSH_LINE" | sed -E 's|^ssh://([^/@]+@[^/:]+).*|\1|')
    PORT=$(echo "$SSH_LINE" | sed -E 's|^ssh://[^/@]+@[^/:]+:([0-9]+).*|\1|'); PORT=${PORT:-22}
    SSH_LINE="ssh -p $PORT $DEST" ;;
esac
# 解析 ssh -p PORT USER@HOST
PORT=$(echo "$SSH_LINE" | grep -oP '(?<=-p )\d+' || echo 22)
DEST=$(echo "$SSH_LINE" | grep -oP '[\w.]+@[\w.-]+$')
SSH="ssh -p $PORT -o BatchMode=yes $DEST"
SCP="scp -P $PORT -o BatchMode=yes"
CONSOLE_DIR=/data/workspace/console

echo "==> 构建（如未构建）"
[ -d dist ] || npm run build

echo "==> 打包上传"
tar czf /tmp/console-deploy.tar.gz dist server package.json supervisor.sh
$SCP /tmp/console-deploy.tar.gz "$DEST:$CONSOLE_DIR-deploy.tar.gz"

echo "==> 上传 systemd 服务单元"
$SCP deploy/instabox-console.service "$DEST:/tmp/instabox-console.service" 2>/dev/null || true

echo "==> 解压 + 安装依赖 + 启动"
$SSH "cd /data/workspace && rm -rf $CONSOLE_DIR && mkdir -p $CONSOLE_DIR && \
  tar xzf $CONSOLE_DIR-deploy.tar.gz -C $CONSOLE_DIR && \
  cd $CONSOLE_DIR && npm install ws@8 --omit=dev --no-audit --no-fund >/dev/null 2>&1; \
  if command -v systemctl >/dev/null 2>&1 && sudo -n install -m 644 /tmp/instabox-console.service /etc/systemd/system/instabox-console.service 2>/dev/null; then \
    sudo -n systemctl daemon-reload && sudo -n systemctl enable --now instabox-console.service >/dev/null 2>&1; \
    sudo -n systemctl restart instabox-console.service; \
  else \
    (pkill -f '[s]upervisor\.sh$' 2>/dev/null || true); \
    (pkill -f '[n]ode server/index\.mjs' 2>/dev/null || true); sleep 1; \
    (cd $CONSOLE_DIR && setsid bash supervisor.sh </dev/null >/dev/null 2>&1 &); \
  fi; sleep 3; \
  curl -s http://localhost:3000/healthz"

echo
echo "==> 发布/确认公网端口（已发布过会报已存在，忽略即可）"
$SSH "instabox-port publish 3000" || true
echo
echo "完成！访问 https://3000-<machine-id>.instabox.tech （以上面 publish 输出为准）"
