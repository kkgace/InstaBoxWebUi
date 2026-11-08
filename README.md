# InstaBox WebUI 控制台

把 [api.instabox.sh](https://instabox.sh/docs)（InstaBox 官方管理 API，160 个操作）的全部功能搬进浏览器的深色控制台。

![架构](https://img.shields.io/badge/React18-Vite6-38bdf8) ![代理](https://img.shields.io/badge/Node%20代理-REST%20%2B%20WebSocket-38bdf8)

## 为什么需要代理服务？

InstaBox API 不允许浏览器跨域直连（CORS 预检返回 404），所以本仓库自带一个零依赖（仅 `ws`）的 Node 代理：

```
浏览器 (React SPA)
   │  /p/*        REST 透传（转发 X-API-Key / Idempotency-Key / X-Confirm-Delete / Range，流式、长轮询不超时）
   │  /ws?url=…   WebSocket 透传（终端 PTY / VNC，目标域限定 *.instabox.sh，防开放中继）
   ▼
Node server/index.mjs  ──►  https://api.instabox.sh
   └─ 兼职静态托管 dist/（SPA fallback）
```

API Key 只保存在**浏览器 localStorage**，经代理转发，代理本身无状态（也可用 `INSTABOX_API_KEY` 环境变量在服务端注入收口）。

## 功能清单

| 模块 | 能力 |
|---|---|
| 总览 | 账户信息、平台统计、存储/费用/限额卡片、沙箱速览 |
| 沙箱 | 列表、创建（模板/规格/环境变量/元数据/自动暂停/定时删除）、启动/停止/暂停/恢复/唤醒/删除 |
| 沙箱详情 | 概览与活动租约 · **终端**（xterm.js + WS）· **文件**（浏览/预览/编辑/上传/下载/新建/删除/重命名）· **命令**（exec + 历史）· 进程（列表/kill）· **桌面**（安装/启动/接管 + noVNC + 免登录分享链接）· 端口发布（公开/私有/轮换 token）· 快照/还原/克隆（fork）· 串口日志（增量）· 监控图表（CPU/内存/磁盘）· SSH（连接信息/Token/证书签发）· 机器级 Secrets 选择与投递刷新 · 设置（改名/调规格/扩盘/自动暂停/元数据） |
| 快照 | 列表、删除、**浏览快照文件**（只读）、从快照一键建沙箱 |
| 端口 | 全局已发布端口总览 |
| Secrets | 组织 Secret CRUD、批量导入（原子）、proxy/env 两种投递、目标主机限定 |
| Webhooks | 端点 CRUD、启用/停用、测试事件、签名密钥轮换、投递记录与重试（9 种事件） |
| 数据导出 | 沙箱/快照 /data 打包 .tar.gz、状态轮询、下载 |
| 用量 | 限额与费用构成、按机器计费窗口查询（含已删除沙箱）、规格清单 |
| 模板 | 全部模板/版本/内置软件/默认规格 |
| API 控制台 | 160 个端点目录（由 openapi.yaml 生成）+ 通用请求构造器，覆盖一切长尾端点 |
| 设置 | API Key 管理、代理状态、Dashboard 专属功能说明、部署指引 |

异步操作（创建/启停/快照/还原等）统一走 `GET /v1/operations/{id}?wait=25s` 长轮询，界面实时显示阶段；API 错误信封自动翻译成中文提示。

## 本地运行

```bash
npm install
npm run build     # tsc + vite 构建 dist/
npm start         # 代理 + 静态托管，http://localhost:3000
```

开发模式（可选）：

```bash
node server/index.mjs        # 终端 1：代理 8787
npm run dev                  # 终端 2：vite 5173（自动转发 /p、/ws）
```

打开界面后点「配置 API Key」：
1. [dashboard.instabox.sh](https://dashboard.instabox.sh) → API keys → **Scopes 全选**（machines/images × read/write/delete）→ 创建（只显示一次）
2. 或 CLI：`instabox keys create`
3. 粘贴 `ibk_...`，保存即用（建议设 1-30 天有效期，用完撤销）

## 部署到 InstaBox 沙箱（获得固定 HTTPS URL）

机器没有固定公网 IP，但 `instabox-port publish` 可以把机器内服务发布为稳定的 HTTPS URL：

```bash
# 方式一：一键脚本（ssh.txt 放 SSH 命令行）
bash deploy.sh

# 方式二：手动
npm run build
tar czf /tmp/console.tgz dist server package.json
ssh -p 2222 <token>@ssh.instabox.sh mkdir -p /data/workspace/console
scp -P 2222 /tmp/console.tgz <token>@ssh.instabox.sh:/data/workspace/
ssh -p 2222 <token>@ssh.instabox.sh "cd /data/workspace/console && tar xzf ../console.tgz && npm i ws@8 --omit=dev && (nohup env PORT=3000 NODE_ENV=production node server/index.mjs &); instabox-port publish 3000"
# → https://3000-<machine-id>.instabox.tech
```

> URL 在沙箱运行期间有效；沙箱重启后 URL 不变（instabox-port 重新 publish 一次即可）。撤销：`instabox-port unpublish 3000`。

## Docker

```bash
docker build -t instabox-ui .
docker run -p 3000:3000 instabox-ui
# 服务端收口 Key（可选）：-e INSTABOX_API_KEY=ibk_xxx
```

## 安全说明

- Key 仅存浏览器 localStorage；对代理的所有请求只转发白名单头（`X-API-Key`、`Idempotency-Key`、`X-Confirm-Delete`、`Range` 等），其余（Cookie 等）一律剥离。
- WebSocket 代理目标域强制限定 `*.instabox.sh` / `*.instabox.tech`，不可被当作任意中继。
- 删除沙箱必须输入名称确认（前端）+ `X-Confirm-Delete`（API）。
- 服务器端/浏览器均不落盘任何凭据。

## 环境变量（server/index.mjs）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 生产 3000 / 开发 8787 | 监听端口 |
| `INSTABOX_API` | https://api.instabox.sh | 上游 API 地址 |
| `INSTABOX_API_KEY` | — | 服务端注入 Key（客户端不带时使用） |
| `ALLOW_WS_HOSTS` | — | 额外允许的 WS 目标域后缀（逗号分隔） |

## 目录结构

```
server/index.mjs        Node 代理（REST 透传 + WS 透传 + 静态托管）
src/api/client.ts       fetch 封装、错误信封翻译、Operation 长轮询、WS 地址
src/api/machines.ts     沙箱/文件/终端/桌面/端口/SSH/Secrets 端点
src/api/misc.ts         快照/模板/用量/组织/Secrets/Webhook/导出端点
src/api/openapi-paths.json  API 目录（npm run gen:catalog 重新生成）
src/components/         布局 + 基础组件库
src/pages/              Dashboard / Machines / MachineDetail(13 Tab) / …
scripts/gen_catalog.py  从 openapi.yaml 生成端点目录
deploy.sh / Dockerfile  部署到沙箱 / 容器化
```
