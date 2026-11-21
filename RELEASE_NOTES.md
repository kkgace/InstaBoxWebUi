# Release v1.3.0 — InstaBox WebUI Console

> GitHub Release 描述（复制到 release body）。

## v1.3.0 — self-hosted deployment + usage-aware keepalive

本版本把控制台从"沙箱里的一次性部署"升级为**可长期自托管在自有云主机**的完整方案，并新增了理解免费额度规则的保活探针。同时完成开源化清洗（历史与文档中的占位化、MIT 元数据、截图与双语文档）。

**社区项目 — 与 InstaBox 官方无任何隶属关系。**

### 亮点

- 🧠 **智能保活探针**（`server/keepalive.mjs`）——默认 `use` 模式只跟随*真实使用*：仅当 20 分钟窗口内发生过 exec/文件/端口/桌面/终端/SSH 才续 activity lease，否则放掉让机器干净闲置暂停（免费版闲置暂停**不计冷却**，冷却阶梯归零）。可选抢占式暂停在 run 快到期且机器空闲时主动 suspend，避免撞上 max-run 冷却阶梯（1/2/3 次 ≈ 5–20 / 60–75 / 120–135 分钟）。
- 🛡 **云主机部署加固**——node 绑 `127.0.0.1` + nginx TLS + XFF 感知的 IP 放行名单（IPv4/IPv6 CIDR），`/healthz` 与 `/hook` 豁免；看门狗 fail-closed（无密码拒绝启动）；配置文件放仓库目录之外，重部署不丢。
- 🔌 **Idempotency-Key 自动补全**——平台对变更类请求强制要求该头，代理在客户端未带时自动补齐，所有按钮开箱即用。
- 🏔 **DSH 挂载 + front 代理家族**——内置 `/dsh` 挂载、`DSH_MOUNTS` 额外挂载、Host 头修复的 dsh-front、通用 IP 门 gate-front、new-api 前置代理。
- 📚 **开源化配套**——16 张界面截图、双语 README（含配置表与保活语义章节）、CHANGELOG、`.env.example`、发布打包脚本；git 历史已清洗（真实 IP/域名 → 占位符）。

### 快速开始

```bash
git clone https://github.com/kkgace/InstaBoxWebUi.git
cd InstaBoxWebUi && npm install && npm run build
CONSOLE_PASSWORD=change-me-strong-password npm start
# 打开 http://localhost:3000 → 顶栏添加你的 ibk_… API Key
```

Docker / 云主机 systemd + nginx 部署见 [README](https://github.com/kkgace/InstaBoxWebUi#readme)。

### 升级

```bash
git pull && npm install && npm run build && bash deploy.sh
```

### 资产

- `instabox-ui-1.3.0.tar.gz`（+ `.sha256`）——离线安装包：`server/`、构建好的 `dist/`、看门狗与部署配置、文档。`bash scripts/package.sh` 可自行生成。

### 说明

- 保活行为详见 README 的"Keepalive semantics / 保活语义"章节；启用前请自行评估其与 InstaBox 条款的相容性。
- 历史版本 tag（v1.0.0–v1.2.1）随本次发布重写为清洗后的提交。
