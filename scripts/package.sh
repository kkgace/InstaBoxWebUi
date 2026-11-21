#!/usr/bin/env bash
# 打离线安装包：release/instabox-ui-<version>.tar.gz + .sha256
# 包内容：server/（含 keepalive）、构建好的 dist/、看门狗、部署配置与文档。
# 用法：npm run package   （或 bash scripts/package.sh —— 先自行 npm run build）
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
NAME="instabox-ui-${VERSION}"
OUT="release/${NAME}.tar.gz"

# dist 不存在就现场构建（需要 devDependencies）
if [ ! -f dist/index.html ]; then
  echo "dist/ 不存在，先构建..."
  npm install --no-audit --no-fund
  npm run build
fi

mkdir -p release
tar czf "$OUT" \
  --transform "s,^,${NAME}/," \
  server dist supervisor.sh deploy scripts/package.sh \
  package.json package-lock.json LICENSE README.md README.zh-CN.md CHANGELOG.md RELEASE_NOTES.md .env.example

sha256sum "$OUT" > "${OUT}.sha256"
echo "打包完成: ${OUT} ($(du -h "$OUT" | cut -f1))"
echo "校验:     $(cat "${OUT}.sha256")"
