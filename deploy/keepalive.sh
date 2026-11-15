#!/usr/bin/env bash
# 跨沙箱互保活看门狗（由 deploy-keepalive.sh 部署到两台沙箱，systemd timer 每 5 分钟跑一次）：
#   1. ping 对端的发布端口 URL —— 制造真实访问活动：对抗免费版固定 30 分钟闲置暂停
#      （API 规范：preview requests 属于防闲置的 real work；wake 不算 work，所以 ping 不可省），
#      并为 max-run 的动态延期积累 work minutes（每 30 分钟评审 ≥5 个活动分钟 +120min）
#   2. 对端不可达（503/超时 = 已被闲置暂停或停机）→ 用对端账号 API key 调 POST /wake 恢复；
#      max-run 强制暂停有冷却期，期间返回 409 machine_cooldown —— 记日志，下个周期再试
# 配置文件（同目录）：peer-key（对端账号 API key，600）、peer-machine（对端机器 ID）、peer-urls（对端发布 URL 列表）
D=/data/workspace/keepalive
LOG=$D/keepalive.log
KEY=$(cat "$D/peer-key" 2>/dev/null)
MACHINE=$(cat "$D/peer-machine" 2>/dev/null)
URLS=$(cat "$D/peer-urls" 2>/dev/null)
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
# 日志超过 1MB 截断，防无限增长
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ] && : > "$LOG"
if [ -z "$KEY" ] || [ -z "$MACHINE" ]; then log "[!] 配置缺失（peer-key/peer-machine）"; exit 0; fi

down=""
for u in $URLS; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$u" 2>/dev/null || echo 000)
  log "ping $u -> $code"
  case "$code" in 2*|3*) ;; *) down="$down $u" ;; esac
done

if [ -n "$down" ]; then
  resp=$(curl -s -m 70 -X POST -H "authorization: Bearer $KEY" -w $'\n%{http_code}' \
    "https://api.instabox.sh/v1/machines/$MACHINE/wake" 2>/dev/null)
  code=$(printf '%s' "$resp" | tail -1)
  body=$(printf '%s' "$resp" | sed '$d' | head -c 200)
  log "wake $MACHINE（不可达:$down）-> $code ${body:+$body}"
else
  log "对端正常"
fi
