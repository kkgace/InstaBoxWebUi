# InstaBox WebUI 控制台

[English](README.md) | **简体中文**

[![React 18](https://img.shields.io/badge/React-18-38bdf8)](https://react.dev) [![Vite 6](https://img.shields.io/badge/Vite-6-a78bfa)](https://vite.dev) [![License: MIT](https://img.shields.io/badge/License-MIT-34d399)](LICENSE) [![Node >= 20](https://img.shields.io/badge/Node-%E2%89%A520-fbbf24)](https://nodejs.org)

一个功能完整的深色主题 Web 控制台，把 **[InstaBox](https://instabox.sh/docs) 的全部 API**（`api.instabox.sh`，160 个操作）搬进浏览器——沙箱管理、终端、桌面、文件、端口、SSH、快照、Secrets、Webhook、监控与用量。只需一个 API Key，无需 CLI 和 SSH 客户端。

## 功能

| 模块 | 能力 |
|---|---|
| 总览 | 账户信息、平台统计、存储/费用/限额卡片、沙箱速览 |
| 沙箱 | 创建（模板/规格/环境变量/元数据/自动暂停/定时删除）、启动/停止/暂停/恢复/唤醒/删除、改名/调规格/扩盘、还原到快照、fork 克隆、活动租约 |
| 沙箱详情（13 个 Tab） | 概览 · **终端**（xterm.js + WebSocket）· **文件**（浏览/编辑/上传/下载，最大 5 GiB）· **命令**（exec + 历史）· 进程（列表/结束）· **桌面**（安装/启动/接管 + noVNC + 免登录分享链接）· **端口**（发布 HTTPS URL、公开/私有、令牌轮换）· 快照/还原/克隆 · 串口控制台日志（增量）· **监控**图表（CPU/内存/网络/磁盘 IO）· SSH（连接信息/Token/证书签发）· 机器级 Secrets · 设置 |
| 快照 | 列表、删除、**浏览快照文件**、从快照一键建沙箱 |
| 端口 | 全局已发布端口总览 |
| Secrets | 组织 Secret 增删改、原子批量导入、proxy/env 双模式投递、目标主机限定 |
| Webhooks | 端点增删改、启用/停用、测试事件、签名密钥轮换、投递记录与重试（9 种事件） |
| 数据导出 | 沙箱/快照 `/data` 打包 `.tar.gz`、状态轮询、下载 |
| 用量 | 限额与费用构成、按机器计费窗口（含已删除沙箱）、允许的规格 |
| 模板 | 全部模板/版本/内置软件/默认规格 |
| **API 控制台** | 全部 160 个端点目录（由 `openapi.yaml` 生成）+ 通用请求构造器——覆盖界面上没有专属页面的所有端点 |
| 设置 | 多账号 API Key 管理（添加/切换/删除）、代理健康检查、部署指引 |

异步操作（创建/启停/快照/还原等）统一轮询 `GET /v1/operations/{id}?wait=25s` 并实时显示进度；API 错误信封自动翻译为友好提示。

## 为什么需要代理？

InstaBox API 不允许浏览器跨域直连（CORS 预检返回 404），所以本仓库自带一个零依赖（仅 `ws`）的 Node 代理：

```
浏览器 (React SPA)
   │  /p/*        REST 透传（转发 Idempotency-Key / X-Confirm-Delete / Range，流式、长轮询安全）
   │  /ws?url=…   WebSocket 透传（终端 PTY / 桌面 VNC，目标域限定 *.instabox.sh / *.instabox.tech）
   ▼
server/index.mjs  ──►  https://api.instabox.sh
   └─ 兼职静态托管 dist/（SPA fallback）
```

API Key 只保存在**浏览器 localStorage**；代理本身无状态（也可用 `INSTABOX_API_KEY` 环境变量在服务端注入收口）。

InstaBox **端口边缘代理**有两个特殊行为，本项目已透明适配（调试花了几小时的经验，fork 前值得先读）：

1. **自定义请求头会被剥掉**（`X-API-Key`、`Authorization` 等全部丢失）。因此浏览器把 Key 和 Content-Type 作为**查询参数**传递（`?__key=…&__ct=…`），代理收到后注入请求头再转发上游，并从上游查询串中剥离。代理日志不落盘任何凭据。
2. **终端/桌面票据**（`POST /v1/machines/{id}/access`）返回 `wss://connect.instabox.sh` URL，与浏览器 Origin 绑定，且握手要求**两个 WebSocket 子协议**：响应中的 `protocol` 字段（`instabox-access.v1`）加 `instabox-access-token.<token>`。代理会转发 `Origin`，并以 WebSocket 客户端的 `protocols` 参数传递子协议（不能走自定义 headers——否则服务器报 *"Server sent a subprotocol but none was requested"* 并断开）。另有 `__subproto` 查询参数兜底，防止边缘代理将来剥子协议头。

## 快速开始

```bash
npm install
npm run build     # tsc + vite → dist/
npm start         # 代理 + 静态托管，http://localhost:3000
```

开发模式（可选）：

```bash
node server/index.mjs   # 终端 1：代理 8787
npm run dev             # 终端 2：vite 5173（自动转发 /p、/ws）
```

然后点顶栏「配置 API Key」：

1. 在 [dashboard.instabox.sh](https://dashboard.instabox.sh) → **API keys** 创建 Key（**Scopes 全选**：machines / images × read / write / delete），或 CLI 执行 `instabox keys create`
2. 粘贴 `ibk_…` 开头的 Key——只存于你浏览器的 localStorage
3. 要管理**另一个账号**的沙箱（每个免费账号 1 台）：点顶栏账号按钮 → 「添加账号」→ 粘贴那个账号的 Key，之后随时一键切换

## 部署到 InstaBox 沙箱（固定 HTTPS URL）

沙箱没有固定公网 IP，但 `instabox-port publish` 可给本机 HTTP 服务一个稳定的 HTTPS URL：

```bash
# 一键脚本（把 SSH 命令行放进 ssh.txt）
bash deploy.sh

# 或手动
npm run build
tar czf /tmp/console.tgz dist server package.json
ssh -p 2222 <token>@ssh.instabox.sh mkdir -p /data/workspace/console
scp -P 2222 /tmp/console.tgz <token>@ssh.instabox.sh:/data/workspace/
ssh -p 2222 <token>@ssh.instabox.sh \
  "cd /data/workspace/console && tar xzf ../console.tgz && npm i ws@8 --omit=dev && \
   (setsid env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 < /dev/null &); \
   instabox-port publish 3000"
# → https://3000-<machine-id>.instabox.tech
```

> URL 在沙箱运行期间有效且形式固定。为在沙箱重启后自动恢复，可把下面的自启片段放进沙箱的 `~/.bashrc`——每次登录（SSH 或 dashboard 终端）自动拉起服务：
>
> ```bash
> if [ -d /data/workspace/console ] && ! pgrep -f "[n]ode server/index.mjs" >/dev/null 2>&1; then
>   (cd /data/workspace/console && setsid env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 < /dev/null &) 2>/dev/null
> fi
> ```

## Docker

```bash
docker build -t instabox-ui .
docker run -p 3000:3000 instabox-ui
# 服务端收口 Key（可选）：-e INSTABOX_API_KEY=ibk_xxx
```

## 环境变量（server/index.mjs）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 生产 3000 / 开发 8787 | 监听端口 |
| `INSTABOX_API` | https://api.instabox.sh | 上游 API 地址 |
| `INSTABOX_API_KEY` | — | 客户端未带 Key 时由服务端注入 |
| `ALLOW_WS_HOSTS` | — | 额外允许的 WS 目标域后缀（逗号分隔） |

## 维护与升级

**升级到新版本**

```bash
git pull && npm install && npm run build && bash deploy.sh
```

`deploy.sh` 会重新打包 `dist/ + server/`、上传、重启服务并重新发布端口——URL 永远不变。

**InstaBox 更新 API 后重新生成端点目录**

```bash
# 先更新 openapi.yaml，然后：
npm run gen:catalog && npm run build && bash deploy.sh
```

**沙箱内服务运维**

```bash
# 启动
cd /data/workspace/console && setsid env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 < /dev/null
# 停止（注意 [n] 转义——否则 pkill 会杀掉你自己的 SSH 会话）
pkill -f "[n]ode server/index.mjs"
# 日志：/data/workspace/console/console.log
```

日志行说明：REST 访问（`方法 路径 → 状态码, 耗时`，不含查询串与请求头）、`access-resp:` 票据脱敏记录（token 只留前 6 字符）、`ws:` / `ws-open` / `ws-close` / `ws-err` WebSocket 诊断。

**API Key 轮换**：dashboard 撤销旧 Key → 创建新 Key → 顶栏账号管理里添加/替换。支持多账号，切换即时生效。

**故障排查**

| 现象 | 原因 | 处理 |
|---|---|---|
| URL 返回 502 | 沙箱在跑但 node 服务死了（随沙箱重启周期） | 登录一次沙箱（SSH 或 dashboard 终端）——bashrc 自启会拉起 |
| 连接超时/无法访问 | 沙箱暂停或停止（免费版 30 分钟空闲自动暂停） | 官方 dashboard 点 Resume |
| 终端/桌面连上即闪断 | 子协议 / Origin 未透传 | 当前版本已修复；复发时看 console.log 的 `ws-err:` 行 |
| `missing_scope` | API Key 缺少 scope | 重新创建 Scopes 全选的 Key |

## 安全

- Key 只存浏览器 localStorage（含多账号档案），代理不落盘任何内容
- 转发请求头走白名单（`X-API-Key`、`Idempotency-Key`、`X-Confirm-Delete`、`Range` 等），其余（包括 Cookie）一律剥离
- WebSocket 目标域限定 `*.instabox.sh` / `*.instabox.tech`，代理不可被当作开放中继
- 代理日志不含凭据（票据脱敏、无查询串、无请求头）
- 删除沙箱需双重确认：前端输入名称 + API 端 `X-Confirm-Delete`

## 已知限制

- 免费账号：1 台沙箱（任意状态）/ 5 个快照；30 分钟空闲自动暂停——官方计费设计
- 安装/启动桌面组件需要几分钟（沙箱内下载 Xfce/Chromium）
- 账单/成员/API Key 创建等仅限登录会话的功能需在官方 dashboard 操作，API Key 无法调用
- 监控页的网络指标不含 SSH 与公网端口流量（API 设计如此）

## 许可

[MIT](LICENSE)
