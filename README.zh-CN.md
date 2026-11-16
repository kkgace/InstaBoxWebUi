# InstaBox WebUI 控制台

[English](README.md) | **简体中文**

[![React 18](https://img.shields.io/badge/React-18-38bdf8)](https://react.dev) [![Vite 6](https://img.shields.io/badge/Vite-6-a78bfa)](https://vite.dev) [![License: MIT](https://img.shields.io/badge/License-MIT-34d399)](LICENSE) [![Node >= 20](https://img.shields.io/badge/Node-%E2%89%A520-fbbf24)](https://nodejs.org)

一个功能完整的深色主题 Web 控制台，把 **[InstaBox](https://instabox.sh/docs) 的全部 API**（`api.instabox.sh`，160 个操作）搬进浏览器——沙箱管理、终端、桌面、文件、端口、SSH、快照、Secrets、Webhook、监控与用量。只需一个 API Key，无需 CLI 和 SSH 客户端。

## 功能

| 模块 | 能力 |
|---|---|
| 总览 | 账户信息、平台统计、存储/费用/限额卡片、沙箱速览 |
| 沙箱 | 创建（模板/规格/环境变量/元数据/自动暂停/定时删除）、启动/停止/暂停/恢复/唤醒/删除、改名/调规格/扩盘、还原到快照、fork 克隆、活动租约、**创建预设**（常用参数一键复用） |
| 沙箱详情（13 个 Tab） | 概览 · **终端**（xterm.js，**多标签会话**、字号调节）· **文件**（浏览/**Monaco 编辑器**/上传/下载，最大 5 GiB）· **命令**（exec + 历史）· 进程（列表/结束）· **桌面**（安装/启动/接管 + noVNC + 免登录分享链接）· **端口**（发布 HTTPS URL、公开/私有、令牌轮换）· 快照/还原/克隆 · 串口控制台日志（增量）· **监控**图表（CPU/内存/网络/磁盘 IO）· SSH（连接信息/Token/证书签发）· 机器级 Secrets · 设置 |
| 快照 | 列表、删除、**浏览快照文件**、从快照一键建沙箱 |
| 端口 | 全局已发布端口总览 |
| Secrets | 组织 Secret 增删改、原子批量导入、proxy/env 双模式投递、目标主机限定 |
| Webhooks | 端点增删改、启用/停用、测试事件、签名密钥轮换、投递记录与重试（9 种事件） |
| 数据导出 | 沙箱/快照 `/data` 打包 `.tar.gz`、状态轮询、下载 |
| 用量 | 限额与费用构成、按机器计费窗口（含已删除沙箱）、允许的规格 |
| 模板 | 全部模板/版本/内置软件/默认规格 |
| **API 控制台** | 全部 160 个端点目录（由 `openapi.yaml` 生成）+ 通用请求构造器——覆盖界面上没有专属页面的所有端点 |
| **通知与告警** | 沙箱状态变化与错误 → 浏览器推送通知 + 站内事件中心；**告警规则**（本月费用上限、连续运行时长上限，6 小时冷却） |
| **Webhook 收件箱** | 内置接收端点（`POST /hook`）——把 InstaBox Webhook 指向控制台，签名事件流直接在界面里查看，无需外部服务 |
| **飞书推送** | 沙箱事件（状态变化含自动暂停、错误、进入强制冷却、告警规则触发）推送到飞书群自定义机器人——经代理转发，域白名单 + 可选签名校验 |
| **跨账号看板** | 本地所有账号并行拉取、一屏总览，行内启停/暂停/删除（按账号 Key 直达） |
| 设置 | 多账号 API Key 管理（添加/切换/删除）、代理健康检查、部署指引 |

附加特性：**双语界面**（English / 简体中文，跟随浏览器并可一键切换）· **浅色/深色主题** · **PWA**（可安装到手机主屏）· **命令面板**（`Ctrl/⌘+K`：跳转页面/沙箱/账号）· **批量操作**（勾选多台 → 批量启停/暂停/删除，带进度）· **快捷命令库**（保存常用命令，任意沙箱一键执行）· **操作日志**（全部写请求本地可回溯）· **配置备份/恢复**（导出导入全部本地设置）· **移动端适配**（抽屉侧边栏、响应式表格）· 异步操作统一轮询 `GET /v1/operations/{id}?wait=25s` 实时显示进度 · API 错误信封自动翻译。

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
> if [ -d /data/workspace/console ] && ! pgrep -f "[n]ode server/index\.mjs" >/dev/null 2>&1; then
>   (cd /data/workspace/console && setsid env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 < /dev/null &) 2>/dev/null
> fi
> ```

## 部署到自有云主机（推荐：不再受沙箱闲置暂停 / max-run 限制）

沙箱版控制台受免费版策略约束（闲置 30 分钟自动暂停、max-run 连续运行硬顶、SSH 令牌 7 天过期）。把控制台部署到自己的 VPS 上就没有这些限制了。

**前提**：本机 `~/.ssh/config` 里有目标主机别名（免密登录 + sudo 免密）；目标机已装 nginx 并有自己的域名证书。

```bash
# 1) 目标机别名（示例：复制已有隧道条目，去掉 LocalForward）
#    Host sg-ck-ssh
#        HostName 203.0.113.10
#        Port 22
#        User ubuntu
#        IdentityFile ~/.ssh/id_ed25519
#        IdentitiesOnly yes

# 2) 一键部署（构建 → 上传 → 装 Node → systemd → nginx vhost → 健康检查）
SSH_HOST=sg-ck-ssh \
PUBLIC_HOST=console.example.com NGINX_PORT=8005 CONSOLE_PORT=3010 \
ALLOW_IPS=你的出口IP \
DSH_UPSTREAM= https://5082-<沙箱1机器ID>.instabox.tech \
DSH_MOUNTS=/dsh-kk=https://5080-<沙箱2机器ID>.instabox.tech \
bash deploy-vm-console.sh
```

部署后的形态：

| 位置 | 内容 |
|---|---|
| `/data/instabox-console/` | 应用（`dist/` `server/` `package.json` `supervisor-vm.sh`） |
| `/data/instabox-console-secrets/.console-env` | 运行期配置（密码 / IP 白名单 / DSH 挂载），`chmod 600`，**在部署目录之外**——重部署不会清掉 |
| `127.0.0.1:3010` | node 进程（`HOST=127.0.0.1` 只绑回环，只有 nginx 能触达 → 客户端无法伪造 `X-Forwarded-For` 绕过 IP 门） |
| `instabox-console.service` | systemd 单元（`User=ubuntu`，`Restart=always`），看门狗 `supervisor-vm.sh` 负责拉起 node |
| nginx vhost | `deploy/nginx/instabox-console-8005.conf`，复用已有证书，WebSocket / SSE 不缓冲 |

对外地址：`https://<域名>:<端口>/`（首次部署脚本会生成 16 字节随机密码并打印；改密码只需编辑 `.console-env` 后 `sudo systemctl restart instabox-console`）。

**DSH 挂载要点**：控制台的 `/dsh` 默认指向本机 dsh；跨沙箱要用另一台沙箱的 dsh，必须先在那台沙箱上装 `dsh-front`（前置补 Host 代理）并发布端口，再把它的公网入口写进 `DSH_UPSTREAM`。边缘按 Host 路由，`/dsh` 指向远端时控制台会按远端挂载处理（呈上游自己的 authority），否则会被边缘路由回控制台自身形成自指循环。

## Docker Compose

### 方式 A — 预构建镜像（推荐，无需 clone、无需构建）

每次 push 到 `main` 会自动向 ghcr.io 发布多架构镜像（`amd64` + `arm64`，tag `:latest`；发版 tag 对应 `:vX.Y.Z`，每次提交对应 `:sha-*`）。部署三条命令：

```bash
mkdir instabox-ui && cd instabox-ui
curl -fsSL https://raw.githubusercontent.com/kkgace/InstaBoxWebUi/main/docker-compose.prebuilt.yml -o docker-compose.yml
docker compose up -d
```

浏览器打开 `http://localhost:3000`，点顶栏「配置 API Key」。镜像内置 `HEALTHCHECK`（每 30 秒探测 `/healthz`，`docker compose ps` 可查状态）；`restart: unless-stopped` 保证崩溃/重启后自动拉起。

> **注意**：仓库私有时 ghcr 镜像也默认私有——拉取前需 `docker login ghcr.io -u <用户名>`（密码用勾选 `read:packages` 的 PAT）。仓库开源后，到 GitHub → Packages → instaboxwebui → Package settings 把可见性改为 Public，即可匿名拉取。

### 方式 B — 从源码构建

```bash
git clone https://github.com/kkgace/InstaBoxWebUi.git
cd InstaBoxWebUi
docker compose up -d        # 本地构建；崩溃/重启后自动拉起
```

常用操作：`docker compose logs -f`（跟踪日志）· `docker compose down`（停止并移除）。改宿主机端口：编辑 `ports` 左侧（如 `"8080:3000"`）；服务端注入 Key：编辑 `environment` 下的 `INSTABOX_API_KEY`。

## Docker（单容器）

```bash
docker build -t instabox-ui .
docker run -d -p 3000:3000 --restart unless-stopped --name instabox-ui instabox-ui
# 服务端收口 Key（可选）：加 -e INSTABOX_API_KEY=ibk_xxx
```

## 环境变量（server/index.mjs）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 生产 3000 / 开发 8787 | 监听端口 |
| `INSTABOX_API` | https://api.instabox.sh | 上游 API 地址 |
| `INSTABOX_API_KEY` | — | 客户端未带 Key 时由服务端注入 |
| `CONSOLE_PASSWORD` | — | **控制台访问密码**——设置后 `/p/*` 与 `/ws` 需要登录（界面弹出密码框）；静态资源放行以便加载登录页。Cookie 会话 30 天 |
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
- 可选 `CONSOLE_PASSWORD` 保护代理面（`/p/*`、`/ws`），HttpOnly Cookie 会话
- 转发请求头走白名单（`X-API-Key`、`Idempotency-Key`、`X-Confirm-Delete`、`Range` 等），其余（包括 Cookie）一律剥离
- WebSocket 目标域限定 `*.instabox.sh` / `*.instabox.tech`，代理不可被当作开放中继
- 代理日志不含凭据（票据脱敏、无查询串、无请求头）
- 删除沙箱需双重确认：前端输入名称 + API 端 `X-Confirm-Delete`
- CI 在每次 push 时运行 ESLint 与完整类型检查构建

## 已知限制

- 免费账号：1 台沙箱（任意状态）/ 5 个快照；30 分钟空闲自动暂停——官方计费设计
- 安装/启动桌面组件需要几分钟（沙箱内下载 Xfce/Chromium）
- 账单/成员/API Key 创建等仅限登录会话的功能需在官方 dashboard 操作，API Key 无法调用
- 监控页的网络指标不含 SSH 与公网端口流量（API 设计如此）

## 许可

[MIT](LICENSE)
