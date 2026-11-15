#!/usr/bin/env bash
# 一键把第二个账号沙箱上的 dsh 接入控制台：部署前置补 Host 代理 + 重配 dsh public-url + 发布端口
#
# 架构（instabox 边缘会把 Host 改写为 127.0.0.1:<port>，而 dsh 的 /api fence 要求
# 有 Origin 时 Host 与 Origin 一致 —— 直发边缘必 403，所以必须前置补头，同 newapi-front；
# 发布端口必须指向 front，不能直发 dsh）：
#   控制台 /dsh-kk/ ──https──> 边缘(5080-<本机id>.instabox.tech) ──> front(:5080，补 Host/剥 Origin)
#     ──> dsh(127.0.0.1:5081，--public-url 指向控制台 /dsh-kk/)
#
# 前置：ssh2.txt 里放第二个沙箱的 SSH 命令行（同 ssh.txt 格式，如 ssh -p 2222 ibssh_xxx@ssh.instabox.sh）
# 可选环境变量：
#   CONSOLE_HOST=3000-<控制台机器id>.instabox.tech   # 控制台公网域名（/dsh-kk/ 挂在这里）
#   DSH_PORT=5080                 # 第二台沙箱上 dsh web 的本机端口
#   FRONT_PORT=5081               # 发布到公网的 front 端口
#   MOUNT_PATH=dsh-kk             # 控制台上的挂载前缀（不含斜杠）
#
# 用法: bash deploy-dsh-front.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ -f ssh.txt ] && [ "$(sed -n '2p' ssh.txt | xargs)" != "" ]; then SSH_LINE=$(sed -n '2p' ssh.txt | xargs)
elif [ -f ssh2.txt ]; then SSH_LINE=$(head -1 ssh2.txt | xargs)
elif [ -n "${SSH2_LINE:-}" ]; then SSH_LINE=$(echo "$SSH2_LINE" | xargs)
else
  echo "[!] 未找到 SSH 行 —— 放进 ssh.txt 第二行、ssh2.txt 或 SSH2_LINE 环境变量"; exit 1
fi
# 兼容 ssh://user@host:port URL 格式（instabox 面板复制的）→ CLI 格式
case "$SSH_LINE" in
  ssh://*)
    USERHOST=$(echo "$SSH_LINE" | sed -E 's|^ssh://([^/@]+@[^/:]+).*|\1|')
    SPORT=$(echo "$SSH_LINE" | sed -E 's|^ssh://[^/@]+@[^/:]+:([0-9]+).*|\1|')
    SSH_LINE="ssh -p ${SPORT:-22} $USERHOST" ;;
esac
PORT=$(echo "$SSH_LINE" | grep -oP '(?<=-p )\d+' || echo 22)
DEST=$(echo "$SSH_LINE" | grep -oP '[\w.]+@[\w.-]+$')
SSH="ssh -p $PORT -o BatchMode=yes $DEST"
SCP="scp -P $PORT -o BatchMode=yes"
CONSOLE_HOST=${CONSOLE_HOST:-3000-m_demo0000000000000.instabox.tech}
DSH_PORT=${DSH_PORT:-5081}    # dsh 本体监听的 127.0.0.1 端口
FRONT_PORT=${FRONT_PORT:-5080} # front 代理监听并发布的端口（发布端口必须 = front，不能 = dsh 直发）
MOUNT_PATH=${MOUNT_PATH:-dsh-kk}
DSH_VERSION=${DSH_VERSION:-0.2.2-rc.1}   # 与控制台沙箱同版本，fence 行为一致

echo "==> 上传 front 代理与 systemd 单元"
$SCP server/dsh-front.mjs deploy/dsh-front.service "$DEST:/tmp/"

echo "==> 安装 front 代理 + 重配 dsh --public-url + 发布端口"
$SSH env CONSOLE_HOST="$CONSOLE_HOST" DSH_PORT="$DSH_PORT" FRONT_PORT="$FRONT_PORT" MOUNT_PATH="$MOUNT_PATH" DSH_VERSION="$DSH_VERSION" bash -s <<'REMOTE'
set -e
DIR=/data/workspace/dsh-front
mkdir -p "$DIR"
mv /tmp/dsh-front.mjs /tmp/dsh-front.service "$DIR/"

cd "$DIR"
[ -d node_modules/ws ] || npm install ws@8 --omit=dev --no-audit --no-fund >/dev/null 2>&1

# systemd 单元里的 node 解析交给 env（沙箱镜像对 user 用户已提供 node，同 console/newapi 模式）
if command -v systemctl >/dev/null 2>&1 && sudo -n install -m 644 "$DIR/dsh-front.service" /etc/systemd/system/dsh-front.service 2>/dev/null; then
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now dsh-front.service >/dev/null 2>&1 || true
  sudo -n systemctl restart dsh-front.service
else
  (pkill -f '[n]ode dsh-front\.mjs' 2>/dev/null || true); sleep 1
  (cd "$DIR" && setsid bash -c 'while true; do node dsh-front.mjs >> front.log 2>&1; sleep 5; done' </dev/null >/dev/null 2>&1 &)
fi
sleep 2
echo "front 健康检查(/healthz): $(curl -s "http://127.0.0.1:$FRONT_PORT/healthz" || echo 失败)"

# 确保 dsh 已安装。查找顺序：/root/.nvm（root 装的，user 读不了 /root → 服务必须 root 跑）
# → /usr/local（全局）。都没有就 sudo npm 全局装一份（DSH_VERSION 由 env 传入，见 ssh 调用行）。
DSH_BIN=$(sudo -n sh -c 'for p in /root/.nvm/versions/node/*/lib/node_modules/@deepseek-ai/dsh/lib/bin.js /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js; do [ -f "$p" ] && { echo "$p"; break; }; done' || true)
if [ -z "$DSH_BIN" ]; then
  echo "==> dsh 未安装，开始全局安装 $DSH_VERSION（视网速约 1-2 分钟）"
  sudo -n npm install -g "@deepseek-ai/dsh@$DSH_VERSION" --no-audit --no-fund
  DSH_BIN=$(sudo -n sh -c '[ -f /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js ] && echo /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js')
fi
[ -n "$DSH_BIN" ] || { echo "[!] dsh 安装失败"; exit 1; }

# dsh web 单元：--public-url 指向控制台 /dsh-kk/（入口 URL/launch-token 都按它生成）；
# 不设 --trusted-host —— front 把 Host 呈现为 loopback authority，fence 直接放行（见 server/dsh-front.mjs 头注）。
# 运行身份跟着 dsh 安装位置走：在 /root 下（user 读不了）→ User=root + 同 nvm 的 node；
# 在 /usr/local 下 → User=user（状态落 $HOME=/data/home 持久盘）。
PUB_URL_FLAG="--public-url https://$CONSOLE_HOST/$MOUNT_PATH/"
if sudo -n test -f /etc/systemd/system/dsh-web.service && \
   sudo -n grep -q -- "--public-url https://$CONSOLE_HOST/$MOUNT_PATH/" /etc/systemd/system/dsh-web.service && \
   sudo -n grep -q "^ExecStart=.*$DSH_BIN" /etc/systemd/system/dsh-web.service && \
   sudo -n grep -q -- "--port $DSH_PORT" /etc/systemd/system/dsh-web.service && \
   { case "$DSH_BIN" in /root/*) sudo -n grep -q "^User=root" /etc/systemd/system/dsh-web.service;; *) sudo -n grep -q "^User=user" /etc/systemd/system/dsh-web.service;; esac; }; then
  echo "dsh-web.service 已是目标配置，跳过重写"
else
  if case "$DSH_BIN" in /root/*) true;; *) false;; esac; then
    NODE_BIN=$(sudo -n sh -c "ls -t /root/.nvm/versions/node/*/bin/node 2>/dev/null | head -1")
    UNIT_USER=root; UNIT_HOME=/root; UNIT_DIR=/root
  else
    NODE_BIN=$(command -v node || echo /usr/local/bin/node)
    UNIT_USER=user; UNIT_HOME=/data/home; UNIT_DIR=/data/home
  fi
  sudo -n tee /etc/systemd/system/dsh-web.service >/dev/null <<UNIT
[Unit]
Description=DeepSeek Harness web UI (dsh web)
After=network.target

[Service]
ExecStart=$NODE_BIN $DSH_BIN --profile web --no-open --port $DSH_PORT $PUB_URL_FLAG
WorkingDirectory=$UNIT_DIR
User=$UNIT_USER
Environment=HOME=$UNIT_HOME
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  sudo -n systemctl daemon-reload
fi
sudo -n systemctl enable --now dsh-web.service >/dev/null 2>&1 || true
sudo -n systemctl restart dsh-web.service
# dsh 启动要几秒（nvm node + profile boot），等端口就绪再取 token 入口，避免打印到旧 token
for i in $(seq 1 20); do
  ss -tln 2>/dev/null | grep -q ":$DSH_PORT " && break
  sleep 1
done
echo "dsh 状态: $(sudo -n systemctl is-active dsh-web.service 2>/dev/null)"
echo "dsh 端口: $(ss -tln 2>/dev/null | grep ":$DSH_PORT" | head -1 || echo 未监听)"

echo
echo "==> 发布 front 端口 $FRONT_PORT（已发布过会提示已存在，忽略即可）"
PUB_URL=$(instabox-port publish "$FRONT_PORT" 2>/dev/null | grep -o 'https://[^[:space:]]*' | head -1 || true)
echo "front 公网入口: ${PUB_URL:-https://$FRONT_PORT-<machine-id>.instabox.tech（以 publish 输出为准）}"

echo
echo "==> 最新 dsh 入口（launch-token URL，经控制台 /$MOUNT_PATH/ 打开）"
sudo -n journalctl -u dsh-web.service --no-pager -n 8 2>/dev/null | grep 'dsh web:' | grep -oE 'https://[^ ]*' | tail -1 || echo "（journalctl 未取到，稍后手动取）"
REMOTE

cat <<NEXT

后续步骤：
  1. 把上面输出的 front 公网入口写进本地 supervisor.sh 的 DSH_MOUNTS，例如：
       DSH_MOUNTS=/$MOUNT_PATH=https://$FRONT_PORT-<machine-id>.instabox.tech
     然后重部署控制台：bash deploy.sh
  2. 浏览器打开 https://$CONSOLE_HOST/$MOUNT_PATH/ （控制台密码 → dsh token，与 /dsh/ 同流程）
NEXT
