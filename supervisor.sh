#!/usr/bin/env bash
# InstaBox 控制台看门狗：node 退出后 5 秒内自动拉起
cd "$(dirname "$0")"
while true; do
  env PORT=3000 NODE_ENV=production node server/index.mjs >> console.log 2>&1
  echo "$(date -u +%FT%TZ) 服务退出(代码=$?)，5 秒后重启" >> console.log
  sleep 5
done
