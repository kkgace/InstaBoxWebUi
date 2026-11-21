# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning: [SemVer](https://semver.org/).

## [1.3.0] - 2026-11-21

Open-source hardening release: the console migrates from a sandbox-only app to a self-hosted cloud-VM deployment with a usage-aware keepalive probe, plus public-repository hygiene.

### Added
- **Usage-aware keepalive probe** (`server/keepalive.mjs` + wiring in `server/index.mjs`): manages InstaBox activity leases server-side. Default mode `use` renews a lease only when real usage (exec / files / ports / desktop / terminal / SSH) happened within `KEEPALIVE_USE_WINDOW`; otherwise it releases the lease so the free-tier 30-min idle pause fires cooldown-free (resetting the max-run cooldown ladder). Modes `always` / `off` available; learned account keys persist to `KEEPALIVE_FILE` (chmod 0600).
- **Preemptive suspend** (`KEEPALIVE_PREEMPT*`): when a run is about to expire but the machine is truly idle (no usage, CPU < 5 %), suspend proactively instead of running into max-run — exits long runs without cooldown.
- **New endpoints**: `GET /keepalive`, `POST /keepalive/tick`, `POST /cooldown/reset` (reset one machine's cooldown ladder).
- **Idempotency-Key autofill**: InstaBox rejects mutating requests without one; the proxy now auto-fills when the client omits it — every button click works out of the box.
- **IP allowlist** (`ALLOW_IPS`) for the console and the front proxies (`dsh-front` / `gate-front` / `newapi-front`), evaluated on the last XFF hop, IPv4/IPv6 CIDR.
- **DSH mounts**: built-in `/dsh` plus `DSH_MOUNTS` (`prefix=https://upstream`), with `DSH_PUBLIC_HOST` authority and a Host-header-fixing front proxy (`server/dsh-front.mjs`).
- **new-api front proxy** (`server/newapi-front.mjs`) — header-fixing front for a self-hosted new-api gateway with `/sk-…` path tokens.
- **Feishu/Lark push** for cooldown events (v1.2.1 channel extended).
- **Ops**: `deploy/supervisor-vm.sh` cloud watchdog (fail-closed without `CONSOLE_PASSWORD`, env from an out-of-tree `ENV_FILE`), `.env.example` with annotated defaults, `scripts/package.sh` release tarball + sha256, nginx TLS example, systemd units for every component.
- **Docs**: screenshots (16 views), keepalive semantics section (EN/中文), full env table, CHANGELOG, release notes.

### Changed
- Repository sanitized for public release: placeholder IPs/hosts in docs, deploy scripts and git history; MIT `LICENSE`; `package.json` now carries license/repository metadata.

### Security
- Cloud deployment guide binds the node process to `127.0.0.1` behind nginx (TLS) and gates every route with the XFF-aware IP allowlist.

## [1.2.1] - 2026-11

Feishu/Lark push channel + cooldown event detection (sandbox auto-pause / max-run cooldown entries pushed to a group bot via the proxy-forwarded custom webhook).

## [1.2.0] - 2026-11

Webhook inbox (built-in `POST /hook` receiver + UI delivery list), alert rules (monthly cost cap, continuous-run limit, 6-h cooldown), command snippets, bulk operations with progress, PWA, light/dark theme, command palette (`Ctrl/⌘+K`), config backup/restore, activity log, test suite.

## [1.1.0] - 2026-11

Cross-account board (parallel multi-account overview with inline lifecycle actions), cron manager, MCP config generator, Android panel.

## [1.0.0] - 2026-11

First release: full InstaBox API console — i18n (EN/中文), access password, browser notifications, Monaco editor, mobile layout, saved create profiles, multi-tab terminal, lint CI; zero-dependency Node proxy with header/query key injection and WebSocket subprotocol passthrough; 160-operation API catalog generated from `openapi.yaml`.

[1.3.0]: https://github.com/kkgace/InstaBoxWebUi/releases/tag/v1.3.0
[1.2.1]: https://github.com/kkgace/InstaBoxWebUi/releases/tag/v1.2.1
[1.2.0]: https://github.com/kkgace/InstaBoxWebUi/releases/tag/v1.2.0
[1.1.0]: https://github.com/kkgace/InstaBoxWebUi/releases/tag/v1.1.0
[1.0.0]: https://github.com/kkgace/InstaBoxWebUi/releases/tag/v1.0.0
