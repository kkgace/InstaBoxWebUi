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
# 解析 ssh -p PORT USER@HOST
PORT=$(echo "$SSH_LINE" | grep -oP '(?<=-p )\d+' || echo 22)
DEST=$(echo "$SSH_LINE" | grep -oP '[\w.]+@[\w.-]+$')
SSH="ssh -p $PORT -o BatchMode=yes $DEST"
SCP="scp -P $PORT -o BatchMode=yes"
CONSOLE_DIR=/data/workspace/console

echo "==> 构建（如未构建）"
[ -d dist ] || npm run build

echo "==> 打包上传"
tar czf /tmp/console-deploy.tar.gz dist server package.json
$SCP /tmp/console-deploy.tar.gz "$DEST:$CONSOLE_DIR-deploy.tar.gz"

echo "==> 解压 + 安装依赖 + 启动"
$SSH "cd /data/workspace && rm -rf $CONSOLE_DIR && mkdir -p $CONSOLE_DIR && \
  tar xzf $CONSOLE_DIR-deploy.tar.gz -C $CONSOLE_DIR && \
  cd $CONSOLE_DIR && npm install ws@8 --omit=dev --no-audit --no-fund >/dev/null 2>&1; \
  (pkill -f 'node server/index.mjs' 2>/dev/null || true); \
  (nohup env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 &); sleep 2; \
  curl -s http://localhost:3000/healthz"

echo
echo "==> 发布/确认公网端口（已发布过会报已存在，忽略即可）"
$SSH "instabox-port publish 3000" || true
echo
echo "完成！访问 https://3000-<machine-id>.instabox.tech （以上面 publish 输出为准）"
