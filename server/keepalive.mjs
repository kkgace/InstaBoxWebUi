/**
 * InstaBox 保活探针（activity-lease keeper）
 *
 * 平台语义（https://instabox.sh/docs/machines/auto-pause）：
 *   1) 闲置暂停 idle pause：免费版固定 30 分钟，无法改（PATCH autoSuspendAfterSeconds 会被拒）。
 *      闲置暂停**不产生冷却**，唤醒即用。
 *   2) 运行上限 max-run：免费版每次 run 从 120 分钟起、随真实使用最多涨到 480 分钟，
 *      到点即暂停并进入冷却。冷却阶梯（免费版）：第 1 次 5–20 分钟、第 2 次 60–75 分钟、
 *      第 3 次起 120–135 分钟。只有"无冷却收尾的 run"（闲置暂停、手动暂停/停止）或
 *      "上次冷却结束后 ≥2 小时才开始的 run"才会把阶梯归零。
 *   3) lease（PUT activity-leases/{id}，ttlSeconds 30–3600）能挡住闲置暂停，
 *      但**免费版不算"使用"**、不延长 run、也压不住 max-run 冷却。
 *
 * 结论：对免费版做"无脑常驻保活"是反向优化 —— 机器永远不闲置 → 冷却阶梯永远不归零 →
 * 每次 max-run 后都要吃 120–135 分钟冷却。所以默认模式是 `use`：
 *   只在控制台里出现"真实使用"（exec / 文件 / 端口 / 桌面 / 终端 / SSH）后的
 *   KEEPALIVE_USE_WINDOW 秒内续 lease，桥接两次操作之间的空档；
 *   一旦没人用，就主动 DELETE lease，让机器自然闲置暂停（免费、且把冷却阶梯归零）。
 *
 * 环境变量：
 *   KEEPALIVE             1=启用（默认 1），0=关闭
 *   KEEPALIVE_MODE        use（默认，跟随真实使用）| always（无脑常驻，接受冷却阶梯）| off
 *   KEEPALIVE_USE_WINDOW  最近一次真实使用距今多少秒内才续 lease（默认 1200，须 < 1800 闲置阈值）
 *   KEEPALIVE_INTERVAL    续期周期秒（默认 120）
 *   KEEPALIVE_LEASE_SEC   单次 lease TTL 秒（默认 600，范围 30–3600）
 *   KEEPALIVE_LEASE_ID    lease ID（默认 console-keepalive）
 *   KEEPALIVE_WAKE        1=对已暂停机器也下 lease（会唤醒它，默认 0）
 *   KEEPALIVE_PERSIST     1=把学习到的 Key 落盘（默认 1）
 *   KEEPALIVE_FILE        账户 Key 落盘路径（默认 <CONSOLE_SECRETS_DIR>/keepalive-keys.json）
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const SECRETS_DIR = process.env.CONSOLE_SECRETS_DIR || '/data/instabox-console-secrets';
const DEFAULT_FILE = path.join(SECRETS_DIR, 'keepalive-keys.json');

function envNum(name, dflt) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

/** 平台算"真实使用"的机器级路径（列表/详情/用量/统计不算） */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 由冷却时长反推免费版冷却阶梯档位：5–20 / 60–75 / 120–135 分钟 */
export function cooldownStepOf(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes <= 20.5) return 1;
  if (minutes <= 75.5) return 2;
  return 3;
}

const USE_PATH_RE = /(?:^|\/)v1\/machines\/(m_[A-Za-z0-9]+)\/(exec|files|processes|terminal|vnc|desktop|ports|port-agent|access|connections|ssh-tokens)/;

export function createKeeper({ upstream, log = console.log } = {}) {
  const enabled = String(process.env.KEEPALIVE ?? '1') !== '0';
  const mode = (process.env.KEEPALIVE_MODE || 'use').toLowerCase();
  const intervalMs = envNum('KEEPALIVE_INTERVAL', 120) * 1000;
  const leaseSec = Math.min(Math.max(envNum('KEEPALIVE_LEASE_SEC', 600), 30), 3600);
  const useWindowMs = envNum('KEEPALIVE_USE_WINDOW', 1200) * 1000;
  const leaseId = process.env.KEEPALIVE_LEASE_ID || 'console-keepalive';
  const wakeSuspended = String(process.env.KEEPALIVE_WAKE || '0') === '1';
  const persist = String(process.env.KEEPALIVE_PERSIST ?? '1') !== '0';
  // 抢占式暂停：run 快到期且确实空闲时主动 suspend（以"无冷却方式"收尾 → 冷却阶梯归零）
  const preempt = String(process.env.KEEPALIVE_PREEMPT || '0') === '1';
  const preemptRemainMs = envNum('KEEPALIVE_PREEMPT_REMAIN', 15) * 60000;
  const preemptIdleMs = envNum('KEEPALIVE_PREEMPT_IDLE', 20) * 60000;
  const preemptCpuPct = envNum('KEEPALIVE_PREEMPT_CPU', 5);
  const keyFile = process.env.KEEPALIVE_FILE || DEFAULT_FILE;
  const up = new URL(upstream);

  const accounts = new Map(); // key → account
  const lastUse = new Map(); // machineId → ms（真实使用时间）
  const stats = {
    startedAt: new Date().toISOString(),
    mode,
    ticks: 0,
    lastTickAt: null,
    lastError: null,
    renews: 0,
    releases: 0,
    failures: 0,
  };

  const mask = (k) => (k ? `${String(k).slice(0, 6)}…${String(k).slice(-4)}` : '');

  function save() {
    if (!persist) return;
    try {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
      const data = {
        note: 'InstaBox 控制台保活探针学习到的 API Key（0600，勿外传）',
        updatedAt: new Date().toISOString(),
        accounts: [...accounts.values()].map((a) => ({ label: a.label, key: a.key, addedAt: a.addedAt })),
      };
      fs.writeFileSync(keyFile, JSON.stringify(data, null, 2), { mode: 0o600 });
      try { fs.chmodSync(keyFile, 0o600); } catch { /* ignore */ }
    } catch (e) {
      log('[keepalive] 落盘失败:', e.message);
    }
  }

  function load() {
    if (!persist) return;
    try {
      const j = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      for (const a of j.accounts || []) if (a?.key) adopt(a.key, a.label || null);
      if (accounts.size) log(`[keepalive] 从 ${keyFile} 恢复 ${accounts.size} 个账户`);
    } catch { /* 首次运行没有文件，正常 */ }
  }

  function adopt(key, label = null) {
    if (!key || typeof key !== 'string' || key.length < 8) return false;
    const cur = accounts.get(key);
    if (cur) {
      cur.lastSeenAt = new Date().toISOString();
      if (label && cur.label !== label) cur.label = label;
      return false;
    }
    accounts.set(key, {
      key,
      label: label || mask(key),
      addedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      machines: new Map(),
    });
    log(`[keepalive] 学到新账户 ${label || mask(key)}（共 ${accounts.size} 个）`);
    save();
    return true;
  }

  /** 代理层每来一个机器级"真实使用"请求就登记一次（用于 use 模式判定） */
  function markUse(raw) {
    if (!raw) return;
    const m = USE_PATH_RE.exec(String(raw));
    if (!m) return;
    lastUse.set(m[1], Date.now());
  }

  /** 公网端口主机名（5080-<machine-id>.instabox.tech）同样算真实使用 */
  function markUseHost(host) {
    const h = String(host || '').toLowerCase();
    const m = /^\d+-([a-z0-9]{16,})\./.exec(h);
    if (!m) return;
    lastUse.set(`m_${m[1]}`, Date.now());
  }

  function httpJson(method, apiPath, key, body, timeoutMs = 20000) {
    return new Promise((resolve) => {
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const req = https.request(
        {
          protocol: up.protocol,
          hostname: up.hostname,
          port: up.port || 443,
          method,
          path: apiPath,
          timeout: timeoutMs,
          headers: {
            'x-api-key': key,
            accept: 'application/json',
            // 平台要求变更类请求带 Idempotency-Key，缺了就 400
            ...(MUTATING.has(method) ? { 'idempotency-key': randomUUID() } : {}),
            ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch { json = null; }
            resolve({ status: res.statusCode || 0, json, text: text.slice(0, 300) });
          });
          res.on('error', (e) => resolve({ status: 0, json: null, text: e.message }));
        }
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => resolve({ status: 0, json: null, text: e.message }));
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** 最近 samples 个 30s 采样点的最高 CPU%（判断"机器里真的没在干活"） */
  async function cpuMaxPct(key, machineId, samples = 12) {
    const r = await httpJson('GET', `/v1/machines/${encodeURIComponent(machineId)}/metrics`, key);
    if (r.status !== 200 || !Array.isArray(r.json?.metrics)) return null;
    const tail = r.json.metrics.slice(-samples);
    const vals = tail.map((p) => Number(p.cpuUsedPct)).filter((n) => Number.isFinite(n));
    return vals.length ? Math.max(...vals) : null;
  }

  async function release(acct, rec, why) {
    const r = await httpJson('DELETE', `/v1/machines/${encodeURIComponent(rec.id)}/activity-leases/${encodeURIComponent(leaseId)}`, acct.key);
    rec.holding = false;
    if (r.status < 300 || r.status === 404) {
      stats.releases++;
      rec.lastSkip = why;
      if (!rec.loggedRelease) {
        rec.loggedRelease = true;
        log(`[keepalive] ${acct.label} / ${rec.name || rec.id}: 放掉 lease（${why}）`);
      }
    } else {
      rec.lastError = `DELETE ${r.status} ${r.json?.error?.code || r.text || ''}`.trim();
      stats.failures++;
    }
  }

  async function tickOne(acct) {
    if (!acct.labeled) {
      const me = await httpJson('GET', '/v1/me', acct.key);
      const label = me.json?.user?.email || me.json?.email || me.json?.org?.name || me.json?.orgs?.[0]?.name;
      if (label) { acct.label = String(label); save(); }
      acct.labeled = true;
    }
    const list = await httpJson('GET', '/v1/machines?limit=100', acct.key);
    if (list.status !== 200 || !list.json) {
      acct.lastError = `${list.status} ${list.json?.error?.code || list.text || ''}`.trim();
      stats.failures++;
      return;
    }
    acct.lastError = null;
    const machines = list.json.machines || list.json.items || [];
    const seen = new Set();
    for (const m of machines) {
      seen.add(m.id);
      const rec = acct.machines.get(m.id) || { id: m.id, holding: false };
      rec.name = m.name;
      rec.state = m.state;
      rec.cooldownUntil = m.cooldownUntil || null;
      rec.autoSuspendAfterSeconds = m.autoSuspendAfterSeconds;
      rec.maxRunMinutes = m.maxRunMinutes;
      rec.runStartedAt = m.runStartedAt || null;
      rec.autoSuspendedAt = m.autoSuspendedAt || null;
      acct.machines.set(m.id, rec);

      const cooling = m.cooldownUntil && new Date(m.cooldownUntil).getTime() > Date.now();
      if (cooling) {
        const waitMs = new Date(m.cooldownUntil).getTime() - Date.now();
        const leftMin = Math.round(waitMs / 60000);
        // 冷却档位：以"首次观测到该 cooldownUntil"为起点估算总时长（轮询 120s，误差 ±2 分钟）
        if (!rec.cooldown || rec.cooldown.until !== m.cooldownUntil) {
          rec.cooldown = {
            until: m.cooldownUntil,
            firstSeenAt: new Date().toISOString(),
            observedSec: 0,
          };
        }
        rec.cooldown.observedSec = Math.round((waitMs + (Date.now() - new Date(rec.cooldown.firstSeenAt).getTime())) / 1000);
        rec.cooldown.estMinutes = Math.max(1, Math.round(rec.cooldown.observedSec / 60));
        rec.cooldown.step = cooldownStepOf(rec.cooldown.estMinutes);
        rec.cooldown.resetsAt = new Date(new Date(m.cooldownUntil).getTime() + 2 * 3600 * 1000).toISOString();
        rec.lastSkip = `强制冷却中，剩 ${leftMin} 分钟（第 ${rec.cooldown.step || '?'} 档，至 ${m.cooldownUntil}）`;
        rec.holding = false; // 冷却期 lease 没意义
        continue;
      }
      if (m.state !== 'running') {
        rec.holding = false;
        rec.lastSkip = m.state === 'suspended'
          ? (wakeSuspended ? null : `已暂停（autoSuspendedAt=${m.autoSuspendedAt || '无'}），默认不唤醒`)
          : `状态 ${m.state}，无需保活`;
        if (!(m.state === 'suspended' && wakeSuspended)) continue;
      }

      if (preempt && m.state === 'running' && m.runStartedAt && m.maxRunMinutes > 0) {
        const remainMs = new Date(m.runStartedAt).getTime() + m.maxRunMinutes * 60000 - Date.now();
        const lastAt = lastUse.get(m.id) || 0;
        const idleMs = Date.now() - lastAt;
        if (remainMs > 0 && remainMs <= preemptRemainMs && idleMs >= preemptIdleMs) {
          const cpu = await cpuMaxPct(acct.key, m.id);
          if (cpu !== null && cpu < preemptCpuPct) {
            const r2 = await httpJson('POST', `/v1/machines/${encodeURIComponent(m.id)}/suspend`, acct.key, {});
            if (r2.status < 300) {
              rec.holding = false;
              rec.preemptedAt = new Date().toISOString();
              rec.lastSkip = `抢占式暂停：run 剩 ${Math.round(remainMs / 60000)} 分钟、空闲 ${Math.round(idleMs / 60000)} 分钟、CPU≈${cpu}% → 主动 suspend（零冷却，冷却阶梯归零）`;
              log(`[keepalive] ${acct.label} / ${m.name || m.id}: ${rec.lastSkip}`);
              continue;
            }
            rec.lastError = `suspend ${r2.status} ${r2.json?.error?.code || ''}`.trim();
          } else {
            rec.lastSkip = `run 剩 ${Math.round(remainMs / 60000)} 分钟，但 CPU 最高 ${cpu}%（>${preemptCpuPct}%）不算空闲，暂不抢占暂停`;
          }
        }
      }

      if (mode === 'use') {
        const at = lastUse.get(m.id) || 0;
        const idleMin = at ? Math.round((Date.now() - at) / 60000) : null;
        if (!at || Date.now() - at > useWindowMs) {
          if (rec.holding) await release(acct, rec, '近期无真实使用');
          else rec.lastSkip = at ? `最近一次真实使用 ${idleMin} 分钟前，超过窗口 ${useWindowMs / 60000} 分钟` : '本进程还没见过真实使用';
          continue;
        }
      }

      const r = await httpJson('PUT', `/v1/machines/${encodeURIComponent(m.id)}/activity-leases/${encodeURIComponent(leaseId)}`, acct.key, { ttlSeconds: leaseSec });
      if (r.status >= 200 && r.status < 300) {
        rec.holding = true;
        rec.loggedRelease = false;
        rec.lastRenewAt = new Date().toISOString();
        rec.leaseUntil = new Date(Date.now() + leaseSec * 1000).toISOString();
        rec.lastSkip = null;
        rec.lastError = null;
        stats.renews++;
        if (!rec.loggedFirst) {
          rec.loggedFirst = true;
          log(`[keepalive] ${acct.label} / ${m.name || m.id}: 首次续期成功，TTL ${leaseSec}s`);
        }
      } else {
        rec.lastError = `${r.status} ${r.json?.error?.code || r.text || ''}`.trim();
        rec.lastErrorAt = new Date().toISOString();
        stats.failures++;
        log(`[keepalive] ${acct.label} / ${m.name || m.id}: 续期失败 ${rec.lastError}`);
      }
    }
    for (const id of [...acct.machines.keys()]) if (!seen.has(id)) acct.machines.delete(id);
  }

  let running = false;
  async function tick(trigger = 'timer') {
    if (!enabled || mode === 'off') return;
    if (running) return;
    running = true;
    try {
      stats.ticks++;
      stats.lastTickAt = new Date().toISOString();
      for (const acct of accounts.values()) {
        try { await tickOne(acct); } catch (e) { acct.lastError = e.message; stats.failures++; }
      }
      stats.lastError = accounts.size ? null : '还没有任何 API Key（用浏览器打开控制台任意页面即自动学习）';
      if (trigger !== 'timer') log(`[keepalive] 手动一拍完成（${accounts.size} 个账户，模式 ${mode}）`);
    } finally {
      running = false;
    }
  }

  async function waitState(key, machineId, want, timeoutMs = 180000) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      const r = await httpJson('GET', `/v1/machines/${encodeURIComponent(machineId)}`, key);
      if (r.status === 200 && r.json) {
        last = { state: r.json.state, ready: !!r.json.runtime?.ready, cooldownUntil: r.json.cooldownUntil || null };
        if (want(last)) return { ok: true, ...last };
        if (last.cooldownUntil && new Date(last.cooldownUntil).getTime() > Date.now()) return { ok: false, reason: 'cooling', ...last };
      }
      await new Promise((r2) => setTimeout(r2, 3000));
    }
    return { ok: false, reason: 'timeout', ...(last || {}) };
  }

  function findMachine(ref) {
    for (const acct of accounts.values()) {
      for (const rec of acct.machines.values()) {
        if (rec.id === ref || rec.name === ref) return { acct, rec };
      }
    }
    return null;
  }

  /**
   * 把 max-run 冷却阶梯归零（"run 以无冷却方式收尾" —— 空闲暂停或手动暂停/停止）：
   *   运行中 → 直接 suspend；暂停/停止 → start 等就绪后再 suspend，再让它闲置。
   * 冷却未结束时不做事（暂停不能缩短已开始的冷却）。
   */
  async function resetStep(ref, { hold = 0 } = {}) {
    if (!ref) return { ok: false, error: 'machine id/name required' };
    let hit = findMachine(ref);
    if (!hit) {
      await tick('reset');
      hit = findMachine(ref);
    }
    if (!hit) return { ok: false, error: `unknown machine ${ref}` };
    const { acct, rec } = hit;
    const key = acct.key;
    const id = rec.id;
    const path = `/v1/machines/${encodeURIComponent(id)}`;

    let m = await httpJson('GET', path, key);
    if (m.status !== 200 || !m.json) return { ok: false, error: `GET ${m.status}` };
    const coolLeft = m.json.cooldownUntil ? Math.round((new Date(m.json.cooldownUntil).getTime() - Date.now()) / 1000) : 0;
    if (coolLeft > 0) {
      return { ok: false, error: 'cooling', retryAfterSeconds: coolLeft, cooldownUntil: m.json.cooldownUntil, state: m.json.state };
    }

    const log2 = [];
    if (m.json.state !== 'running') {
      const started = await httpJson('POST', `${path}/start`, key, {});
      log2.push(`start → ${started.status}${started.json?.operationId ? ` op=${started.json.operationId}` : ''}`);
      if (started.status >= 300) return { ok: false, error: `start ${started.status} ${started.json?.error?.code || ''}`.trim(), state: m.json.state };
      const up = await waitState(key, id, (s) => s.state === 'running' && s.ready);
      log2.push(`wait running → ${up.ok ? 'ok' : up.reason}`);
      if (!up.ok) return { ok: false, error: `start not ready (${up.reason})`, state: up.state };
    }
    const susp = await httpJson('POST', `${path}/suspend`, key, {});
    log2.push(`suspend → ${susp.status}${susp.json?.operationId ? ` op=${susp.json.operationId}` : ''}`);
    if (susp.status >= 300) return { ok: false, error: `suspend ${susp.status} ${susp.json?.error?.code || ''}`.trim(), log: log2 };
    const down = await waitState(key, id, (s) => s.state !== 'running');
    log2.push(`wait paused → ${down.ok ? down.state : down.reason}`);

    rec.cooldown = null;
    rec.holding = false;
    stats.releases++;
    log(`[keepalive] ${acct.label} / ${rec.name || id}: 冷却阶梯已归零（${log2.join('；')}）`);
    if (hold > 0) {
      // 可选：立刻续一个 lease 挡住 idle pause，保持"已就绪的暂停态"
      const r = await httpJson('PUT', `${path}/activity-leases/${encodeURIComponent(leaseId)}`, key, { ttlSeconds: Math.min(Math.max(hold, 30), 3600) });
      log2.push(`lease(hold ${hold}s) → ${r.status}`);
    }
    return { ok: true, machine: rec.name, id, log: log2, note: '下次 max-run 冷却回到第 1 档（5–20 分钟）；本 run 以无冷却方式收尾，阶梯已归零' };
  }

  function status() {
    return {
      enabled: enabled && mode !== 'off',
      mode,
      useWindowSec: useWindowMs / 1000,
      preempt,
      preemptRemainSec: preemptRemainMs / 1000,
      preemptIdleSec: preemptIdleMs / 1000,
      preemptCpuPct,
      intervalMs,
      leaseSec,
      leaseId,
      wakeSuspended,
      persist,
      keyFile: persist ? keyFile : null,
      accounts: [...accounts.values()].map((a) => ({
        label: a.label,
        key: mask(a.key),
        lastSeenAt: a.lastSeenAt,
        lastError: a.lastError || null,
        machines: [...a.machines.values()].map((m) => ({
          id: m.id,
          name: m.name,
          state: m.state,
          autoSuspendedAt: m.autoSuspendedAt || null,
          maxRunMinutes: m.maxRunMinutes,
          runStartedAt: m.runStartedAt || null,
          cooldownUntil: m.cooldownUntil,
          cooldownStep: m.cooldown?.step ?? null,
          cooldownEstMinutes: m.cooldown?.estMinutes ?? null,
          cooldownResetsAt: m.cooldown?.resetsAt ?? null,
          lastUseAt: lastUse.has(m.id) ? new Date(lastUse.get(m.id)).toISOString() : null,
          holding: !!m.holding,
          lastRenewAt: m.lastRenewAt || null,
          leaseUntil: m.leaseUntil || null,
          lastSkip: m.lastSkip || null,
          lastError: m.lastError || null,
        })),
      })),
      ...stats,
    };
  }

  let timer = null;
  function start() {
    if (!enabled || mode === 'off') {
      log(`[keepalive] 已禁用（enabled=${enabled} mode=${mode}）`);
      return;
    }
    load();
    log(`[keepalive] 探针启动：mode=${mode}，每 ${intervalMs / 1000}s 一拍，lease TTL ${leaseSec}s，ID ${leaseId}，唤醒暂停机=${wakeSuspended ? '是' : '否'}`);
    if (mode === 'always') {
      log('[keepalive] 注意：always 模式会挡住闲置暂停；免费版闲置暂停不计冷却，而 max-run 冷却阶梯（5–20 / 60–75 / 120–135 分钟）会因为永不闲置而不再归零');
    } else {
      log(`[keepalive] use 模式：只在最近 ${useWindowMs / 60000} 分钟内有真实使用（exec/文件/端口/桌面/终端/SSH）时续 lease，否则放掉让它自然闲置暂停（免费版闲置暂停不计冷却，并重置冷却阶梯）`);
    }
    const loop = async () => {
      await tick('timer');
      timer = setTimeout(loop, intervalMs);
      timer.unref?.();
    };
    setTimeout(() => { loop(); }, 5000).unref?.();
  }
  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { adopt, markUse, markUseHost, tick, status, start, stop, resetStep, accounts, enabled, mode, preempt };
}
