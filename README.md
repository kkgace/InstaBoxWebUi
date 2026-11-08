# InstaBox WebUI Console

**English** | [简体中文](README.zh-CN.md)

[![React 18](https://img.shields.io/badge/React-18-38bdf8)](https://react.dev) [![Vite 6](https://img.shields.io/badge/Vite-6-a78bfa)](https://vite.dev) [![License: MIT](https://img.shields.io/badge/License-MIT-34d399)](LICENSE) [![Node >= 20](https://img.shields.io/badge/Node-%E2%89%A520-fbbf24)](https://nodejs.org)

A full-featured, dark-mode web console that brings **every API of [InstaBox](https://instabox.sh/docs)** (`api.instabox.sh`, 160 operations) into the browser — sandboxes, terminal, desktop, files, ports, SSH, snapshots, secrets, webhooks, monitoring and usage. Works with your API key only; no CLI, no SSH client required.

## Features

| Module | Capabilities |
|---|---|
| Dashboard | Account info, platform stats, storage / cost / quota cards, sandbox overview |
| Sandboxes | Create (template / size / env / metadata / auto-pause / scheduled delete), start / stop / suspend / resume / wake / delete, rename / resize / disk grow, restore to snapshot, fork clone, activity leases |
| Sandbox detail (13 tabs) | Overview · **Terminal** (xterm.js over WebSocket) · **Files** (browse / edit / upload / download, up to 5 GiB) · **Commands** (exec + history) · Processes (list / kill) · **Desktop** (install / start / takeover + noVNC + login-free share links) · **Ports** (publish HTTPS URLs, public/private, token rotation) · Snapshot / restore / fork · Serial console logs (incremental) · **Metrics** charts (CPU / memory / network / disk IO) · SSH (info / tokens / cert issuance) · machine-level Secrets · settings |
| Snapshots | List, delete, **browse snapshot files**, one-click create sandbox from snapshot |
| Ports | Global list of all published ports |
| Secrets | Org Secret CRUD, atomic batch import, proxy/env delivery, host scoping |
| Webhooks | Endpoint CRUD, enable / disable, test event, secret rotation, deliveries + retry (9 event types) |
| Exports | Pack a sandbox/snapshot `/data` as `.tar.gz`, poll status, download |
| Usage | Limits & cost breakdown, per-machine billing windows (incl. deleted), allowed sizes |
| Templates | All templates / versions / bundled software / default spec |
| **API console** | Browsable catalog of all 160 operations (generated from `openapi.yaml`) + generic request builder — covers every endpoint the UI doesn't have a page for |
| Settings | Multi-account API key management (add / switch / remove), proxy health, deployment guide |

Async operations (create / start / snapshot / restore …) poll `GET /v1/operations/{id}?wait=25s` with live progress; API error envelopes are translated into friendly Chinese/English messages.

## Why a proxy?

The InstaBox API does not allow cross-origin browser calls (CORS preflight returns 404), so this repo ships a zero-dependency (only `ws`) Node proxy:

```
Browser (React SPA)
   │  /p/*        REST passthrough (forwards Idempotency-Key / X-Confirm-Delete / Range, streaming, long-poll safe)
   │  /ws?url=…   WebSocket passthrough (terminal PTY / desktop VNC, target restricted to *.instabox.sh / *.instabox.tech)
   ▼
server/index.mjs  ──►  https://api.instabox.sh
   └─ Also serves dist/ statically (SPA fallback)
```

API keys live only in your **browser localStorage**; the proxy is stateless (optionally inject a server-side key via `INSTABOX_API_KEY`).

Two quirks of the InstaBox **port edge proxy** are handled transparently (these cost us a few debugging hours — read this before forking):

1. **Custom request headers are stripped** (`X-API-Key`, `Authorization` …). The browser therefore sends the key and Content-Type as **query parameters** (`?__key=…&__ct=…`); the proxy injects them as headers upstream and strips them from the upstream query. Proxy logs never contain credentials.
2. **Terminal/desktop tickets** (`POST /v1/machines/{id}/access`) return a `wss://connect.instabox.sh` URL bound to your browser Origin and requiring **two WebSocket subprotocols**: the response's `protocol` field (`instabox-access.v1`) plus `instabox-access-token.<token>`. The proxy forwards `Origin` and passes subprotocols via the WebSocket client's `protocols` argument (not custom headers — otherwise the server replies *"Server sent a subprotocol but none was requested"* and the connection drops). A `__subproto` query param acts as a fallback if the edge proxy ever starts stripping subprotocol headers.

## Getting started

```bash
npm install
npm run build     # tsc + vite → dist/
npm start         # proxy + static hosting on http://localhost:3000
```

Dev mode (optional):

```bash
node server/index.mjs   # terminal 1: proxy on 8787
npm run dev             # terminal 2: vite on 5173 (forwards /p, /ws)
```

Then click **Configure API Key** in the top bar:

1. Create a key at [dashboard.instabox.sh](https://dashboard.instabox.sh) → **API keys** (select **all scopes**: machines / images × read / write / delete), or run `instabox keys create`
2. Paste the `ibk_…` key — it is stored only in your browser's localStorage
3. To manage **another account's** sandbox (each free account gets 1), click the account button in the top bar → **Add account** and paste that account's key; switch accounts anytime

## Deploy to an InstaBox sandbox (fixed HTTPS URL)

A sandbox has no public IP, but `instabox-port publish` gives any local HTTP service a stable HTTPS URL:

```bash
# One-shot script (put your SSH command line into ssh.txt)
bash deploy.sh

# Or manually
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

> The URL stays valid while the sandbox runs and its form is permanent. To survive sandbox restarts, the following auto-start snippet in the sandbox's `~/.bashrc` re-launches the server on any login (SSH or dashboard terminal):
>
> ```bash
> if [ -d /data/workspace/console ] && ! pgrep -f "[n]ode server/index.mjs" >/dev/null 2>&1; then
>   (cd /data/workspace/console && setsid env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 < /dev/null &) 2>/dev/null
> fi
> ```

## Docker Compose

### Option A — prebuilt image (recommended, no clone / no build)

Multi-arch images (`amd64` + `arm64`) are published to ghcr.io automatically on every push to `main` (tag `:latest`, plus `:vX.Y.Z` per release tag and `:sha-*` per commit). Deployment is three commands:

```bash
mkdir instabox-ui && cd instabox-ui
curl -fsSL https://raw.githubusercontent.com/kkgace/InstaBoxWebUi/main/docker-compose.prebuilt.yml -o docker-compose.yml
docker compose up -d
```

Open `http://localhost:3000`, click **Configure API Key** in the top bar. The image ships a built-in `HEALTHCHECK` on `/healthz` (`docker compose ps` shows the status); `restart: unless-stopped` keeps it alive across crashes and reboots.

> **Note**: while this GitHub repository is private, its ghcr image is private too — pull with `docker login ghcr.io -u <user>` (PAT with `read:packages`). After the repo goes public, flip the package visibility (GitHub → Packages → instaboxwebui → Package settings → Public) and pulls become anonymous.

### Option B — build from source

```bash
git clone https://github.com/kkgace/InstaBoxWebUi.git
cd InstaBoxWebUi
docker compose up -d        # builds locally, auto-restart on crash/reboot
```

Common operations: `docker compose logs -f` (follow logs) · `docker compose down` (stop and remove). Change the host port via the left side of `ports` (`"8080:3000"`); a server-injected key goes under `environment` (`INSTABOX_API_KEY`).

## Docker (single container)

```bash
docker build -t instabox-ui .
docker run -d -p 3000:3000 --restart unless-stopped --name instabox-ui instabox-ui
# Server-side key (optional): add -e INSTABOX_API_KEY=ibk_xxx
```

## Configuration (server/index.mjs)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 (prod) / 8787 (dev) | Listen port |
| `INSTABOX_API` | https://api.instabox.sh | Upstream API |
| `INSTABOX_API_KEY` | — | Server-injected key when the client sends none |
| `ALLOW_WS_HOSTS` | — | Extra allowed WebSocket target domain suffixes (comma-separated) |

## Maintenance & upgrade

**Upgrade to a new version**

```bash
git pull && npm install && npm run build && bash deploy.sh
```

`deploy.sh` repacks `dist/ + server/`, uploads, restarts the service and re-publishes the port — the URL never changes.

**Regenerate the API catalog** after InstaBox changes its API

```bash
# refresh openapi.yaml first, then:
npm run gen:catalog && npm run build && bash deploy.sh
```

**Operate the service on the sandbox**

```bash
# start
cd /data/workspace/console && setsid env PORT=3000 NODE_ENV=production node server/index.mjs > console.log 2>&1 < /dev/null
# stop (note the [n] trick — otherwise pkill kills your own ssh session)
pkill -f "[n]ode server/index.mjs"
# logs: /data/workspace/console/console.log
```

Log lines: REST access (`method path → status, ms`, query strings and headers excluded), `access-resp:` masked ticket dumps (token truncated to 6 chars) and `ws:` / `ws-open` / `ws-close` / `ws-err` WebSocket diagnostics.

**Rotate an API key**: revoke the old one in the dashboard → create a new one → top-bar account manager → add / replace. Multiple accounts are supported and switching is instant.

**Troubleshooting**

| Symptom | Cause | Fix |
|---|---|---|
| 502 from the URL | Sandbox runs but the node service died (after a sandbox restart cycle) | Log in to the sandbox once (SSH or dashboard terminal) — the bashrc auto-start relaunches it |
| Timeout / unreachable | Sandbox is paused or stopped (free tier auto-pauses after 30 idle minutes) | Click Resume in the official dashboard |
| Terminal/desktop flashes then closes | Subprotocol / Origin not passed through | Fixed in current version; if it recurs, check `ws-err:` lines in console.log |
| `missing_scope` | API key lacks a scope | Recreate the key with all scopes selected |

## Security

- Keys live only in browser localStorage (including multi-account profiles); the proxy persists nothing
- Forwarded request headers are whitelisted (`X-API-Key`, `Idempotency-Key`, `X-Confirm-Delete`, `Range`, …); everything else — cookies included — is dropped
- WebSocket targets are restricted to `*.instabox.sh` / `*.instabox.tech`; the proxy cannot be abused as an open relay
- Proxy logs contain no credentials (masked tickets, no query strings, no headers)
- Sandbox deletion requires typing its name (frontend) plus `X-Confirm-Delete` (API)

## Known limitations

- Free accounts: 1 sandbox (any state) / 5 snapshots; auto-pause after 30 idle minutes — billing by design
- Installing/starting the desktop component takes minutes (downloads Xfce/Chromium into the sandbox)
- Billing / members / API-key creation and other session-only features must be done in the official dashboard; API keys cannot call them
- The Metrics tab's network counters exclude SSH and public-port traffic (API design)

## License

[MIT](LICENSE)
