#!/usr/bin/env bash
# InstaBox 控制台看门狗（云主机版 —— 部署到自有 VPS，如 203.0.113.10）
#
# 与沙箱版 supervisor.sh 的区别：运行期配置全部来自 ENV_FILE（在部署目录之外，
# 重部署 rm -rf 不会清掉），用户改完密码 / IP 名单后 systemctl restart 即可生效。
#
# ENV_FILE 内容（等号分隔，shell 语法）：
#   CONSOLE_PASSWORD  必填。fail-closed：没配就拒绝启动，防止"静默无保护"上线。
#   PORT               监听端口（默认 3010；只绑 127.0.0.1，由 nginx 对外）
#   ALLOW_IPS          IP 放行名单，逗号分隔，支持 IPv4 CIDR（不设=关闭该门）
#   DSH_PUBLIC_HOST    控制台对外权威（Host[:Port]），本机 dsh 挂载靠它过 browser-trust fence
#   DSH_UPSTREAM       /dsh 的上游（本机 dsh，或另一台沙箱的 dsh-front 公网入口）
#   DSH_MOUNTS         额外挂载，逗号分隔，如 /dsh-kk=https://上游
#   INSTABOX_API       上游 API（默认 https://api.instabox.sh）
cd "$(dirname "$0")"
ENV_FILE=${ENV_FILE:-/data/instabox-console-secrets/.console-env}
while true; do
  if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
  if [ -z "${CONSOLE_PASSWORD:-}" ]; then
    echo "$(date -u +%FT%TZ) 拒绝启动：CONSOLE_PASSWORD 未配置（期望 $ENV_FILE），控制台无保护不上线" >> console.log
    sleep 10
    continue
  fi
  env PORT="${PORT:-3010}" HOST="${HOST:-127.0.0.1}" NODE_ENV=production \
    ALLOW_IPS="${ALLOW_IPS:-}" \
    DSH_PUBLIC_HOST="${DSH_PUBLIC_HOST:-}" \
    DSH_UPSTREAM="${DSH_UPSTREAM:-http://127.0.0.1:5080}" \
    DSH_MOUNTS="${DSH_MOUNTS:-}" \
    INSTABOX_API="${INSTABOX_API:-https://api.instabox.sh}" \
    node server/index.mjs >> console.log 2>&1
  echo "$(date -u +%FT%TZ) 服务退出(代码=$?)，5 秒后重启" >> console.log
  sleep 5
done
