#!/usr/bin/env bash
# InstaBox 控制台看门狗：node 退出后 5 秒内自动拉起
# 访问密码存放在 /data/workspace/console-secrets/.console-env（在部署目录之外，deploy.sh 不会清掉）。
# fail-closed：密码未配置时拒绝启动，防止"静默无保护"上线。
cd "$(dirname "$0")"
ENV_FILE=/data/workspace/console-secrets/.console-env
while true; do
  if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
  if [ -z "${CONSOLE_PASSWORD:-}" ]; then
    echo "$(date -u +%FT%TZ) 拒绝启动：CONSOLE_PASSWORD 未配置（期望 $ENV_FILE），控制台无保护不上线" >> console.log
    sleep 10
    continue
  fi
  # DSH_MOUNTS：跨沙箱 dsh 挂载（/dsh-kk/ → 第二台沙箱的 front 代理公网入口，见 deploy-dsh-front.sh）
  env PORT=3000 NODE_ENV=production DSH_PUBLIC_HOST=3000-m_demo0000000000000.instabox.tech DSH_MOUNTS=/dsh-kk=https://5080-m_demo1111111111111.instabox.tech ALLOW_IPS=198.51.100.20 node server/index.mjs >> console.log 2>&1
  echo "$(date -u +%FT%TZ) 服务退出(代码=$?)，5 秒后重启" >> console.log
  sleep 5
done
