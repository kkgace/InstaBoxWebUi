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
