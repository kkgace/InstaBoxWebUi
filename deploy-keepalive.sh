#!/usr/bin/env bash
# 一键部署「双沙箱互保活」：读 temp.txt 两个账号的 API key（第1行=账号1/沙箱1，第2行=账号2/沙箱2），
# 在每台沙箱上装看门狗（deploy/keepalive.sh + systemd timer 每 5 分钟）：
#   沙箱1 的看门狗 ping 沙箱2 的发布端口 + 沙箱2 不可达时用账号2 key 唤醒它
#   沙箱2 的看门狗 ping 沙箱1 的发布端口 + 沙箱1 不可达时用账号1 key 唤醒它
# 免费版限制（API 实测）：闲置暂停固定 30 分钟不可关（403 spec_not_allowed）；
# max-run 免费版硬顶（沙箱1 480min / 沙箱2 240min）仅管理员可改——到点强制暂停+冷却，
# 看门狗会在冷却结束后自动唤醒。两台同时到点暂停是小概率残余风险，此时需手动恢复。
# 注意：temp.txt 已 gitignore；每台沙箱只保存对端账号的 key（600 权限，/data 持久盘）。
set -euo pipefail
cd "$(dirname "$0")"

[ -f temp.txt ] || { echo "[!] 缺 temp.txt（两行 API key）"; exit 1; }
K1=$(sed -n '1p' temp.txt | xargs); K2=$(sed -n '2p' temp.txt | xargs)
[ -n "$K1" ] && [ -n "$K2" ] || { echo "[!] temp.txt 需要两行 key"; exit 1; }

parse_ssh() { # $1=ssh行 → 输出 "PORT USERHOST"
  local line=$1 port uh
  case "$line" in
    ssh://*)
      uh=$(echo "$line" | sed -E 's|^ssh://([^/@]+@[^/:]+).*|\1|')
      port=$(echo "$line" | sed -E 's|^ssh://[^/@]+@[^/:]+:([0-9]+).*|\1|'); port=${port:-22} ;;
    *) port=$(echo "$line" | grep -oP '(?<=-p )\d+' || echo 22); uh=$(echo "$line" | grep -oP '[\w.]+@[\w.-]+$') ;;
  esac
  echo "$port $uh"
}
read P1 UH1 <<< "$(parse_ssh "$(sed -n '1p' ssh.txt | xargs)")"
read P2 UH2 <<< "$(parse_ssh "$(sed -n '2p' ssh.txt | xargs)")"
SSH1="ssh -p $P1 -o BatchMode=yes $UH1"; SCP1="scp -P $P1 -o BatchMode=yes"
SSH2="ssh -p $P2 -o BatchMode=yes $UH2"; SCP2="scp -P $P2 -o BatchMode=yes"

M1=m_m_demo0000000000000   # 沙箱1（控制台，发布 3000）
M2=m_m_demo1111111111111   # 沙箱2（发布 5080=dsh front、3018=应用）
U1="https://3000-m_demo0000000000000.instabox.tech/healthz"
U2="https://5080-m_demo1111111111111.instabox.tech/healthz https://3018-m_demo1111111111111.instabox.tech/"

install_peer() { # $1=SSH $2=SCP $3=userhost $4=对端key内容 $5=对端machine $6=对端urls $7=标签
  $1 "mkdir -p /data/workspace/keepalive"
  printf '%s' "$4" | $1 "cat > /data/workspace/keepalive/peer-key && chmod 600 /data/workspace/keepalive/peer-key"
  printf '%s' "$5" | $1 "cat > /data/workspace/keepalive/peer-machine"
  printf '%s' "$6" | $1 "cat > /data/workspace/keepalive/peer-urls"
  $2 deploy/keepalive.sh deploy/keepalive.service deploy/keepalive.timer "$3:/tmp/"
  $1 "mv /tmp/keepalive.sh /tmp/keepalive.service /tmp/keepalive.timer /data/workspace/keepalive/ && \
      sudo -n install -m 644 /data/workspace/keepalive/keepalive.service /etc/systemd/system/keepalive.service && \
      sudo -n install -m 644 /data/workspace/keepalive/keepalive.timer /etc/systemd/system/keepalive.timer && \
      sudo -n systemctl daemon-reload && sudo -n systemctl enable --now keepalive.timer >/dev/null 2>&1 && \
      systemctl list-timers keepalive.timer --no-pager | head -2"
  echo "[$7] 看门狗已安装"
}

echo "==> 沙箱1 装看门狗（看护沙箱2，保存账号2 key）"
install_peer "$SSH1" "$SCP1" "$UH1" "$K2" "$M2" "$U2" "沙箱1"
echo "==> 沙箱2 装看门狗（看护沙箱1，保存账号1 key）"
install_peer "$SSH2" "$SCP2" "$UH2" "$K1" "$M1" "$U1" "沙箱2"

echo
echo "==> 立即各跑一轮验证"
$SSH1 "systemctl start keepalive.service; tail -3 /data/workspace/keepalive/keepalive.log"
$SSH2 "systemctl start keepalive.service; tail -3 /data/workspace/keepalive/keepalive.log"
echo "完成。后续可在各沙箱 /data/workspace/keepalive/keepalive.log 查看运行记录。"
