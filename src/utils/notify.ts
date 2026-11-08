/** 通知中心：轮询沙箱列表对比状态变化 → 站内事件流 + 浏览器 Notification */
import { getApiKey } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { getLang } from '@/i18n';
import type { Machine } from '@/api/types';

export interface NotifyEvent {
  id: string;
  at: string;
  kind: 'state' | 'error';
  machineId: string;
  machineName: string;
  from?: string;
  to?: string;
  message?: string;
}

const EVT_KEY = 'instabox-ui.notify.events';
const STATE_KEY = 'instabox-ui.notify.states';
const MAX_EVENTS = 100;

export function getEvents(): NotifyEvent[] {
  try { return JSON.parse(localStorage.getItem(EVT_KEY) || '[]'); } catch { return []; }
}
function saveEvents(list: NotifyEvent[]) {
  localStorage.setItem(EVT_KEY, JSON.stringify(list.slice(0, MAX_EVENTS)));
}
export function pushEvent(e: NotifyEvent): NotifyEvent[] {
  const list = [e, ...getEvents()].slice(0, MAX_EVENTS);
  saveEvents(list);
  return list;
}
export function clearEvents() { saveEvents([]); }

/** 浏览器通知权限 */
export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}
export function notifyPermission(): string {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function browserNotify(ev: NotifyEvent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const en = getLang() === 'en';
  const title = ev.kind === 'error'
    ? (en ? `Sandbox ${ev.machineName} error` : `沙箱 ${ev.machineName} 出现错误`)
    : (en ? `Sandbox ${ev.machineName}: ${ev.from} → ${ev.to}` : `沙箱 ${ev.machineName}：${ev.from} → ${ev.to}`);
  try {
    const n = new Notification(title, { tag: ev.id, silent: false });
    setTimeout(() => n.close(), 8000);
  } catch { /* ignore */ }
}

/** 已知状态快照：machineId → state */
type KnownStates = Record<string, { name: string; state: string; hasError: boolean }>;

function loadKnown(): KnownStates {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch { return {}; }
}
function saveKnown(k: KnownStates) {
  localStorage.setItem(STATE_KEY, JSON.stringify(k));
}

let timer: ReturnType<typeof setInterval> | null = null;

export function stopNotifyPolling() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** 全局轮询：60s 一次，对比状态翻转 → 事件 + 浏览器通知 */
export function startNotifyPolling(onChange: (events: NotifyEvent[]) => void, intervalMs = 60000) {
  if (timer) clearInterval(timer);
  const tick = async () => {
    if (!getApiKey()) return;
    let machines: Machine[];
    try {
      machines = (await machinesApi.list({ limit: 200 })).machines || [];
    } catch { return; }
    const known = loadKnown();
    let changed = false;
    const now = new Date().toISOString();
    for (const m of machines) {
      const prev = known[m.id];
      const hasErr = !!m.lastError || m.state === 'error';
      if (!prev) {
        known[m.id] = { name: m.name, state: m.state, hasError: hasErr };
        changed = true;
        continue;
      }
      if (prev.state !== m.state) {
        const ev: NotifyEvent = {
          id: `st-${m.id}-${m.state}-${now}`,
          at: now, kind: 'state', machineId: m.id, machineName: m.name,
          from: prev.state, to: m.state,
        };
        onChange(pushEvent(ev));
        browserNotify(ev);
      } else if (hasErr && !prev.hasError && m.lastError) {
        const ev: NotifyEvent = {
          id: `err-${m.id}-${now}`,
          at: now, kind: 'error', machineId: m.id, machineName: m.name,
          message: `${m.lastError.code}: ${m.lastError.message.slice(0, 120)}`,
        };
        onChange(pushEvent(ev));
        browserNotify(ev);
      }
      if (prev.name !== m.name || prev.state !== m.state || prev.hasError !== hasErr) {
        known[m.id] = { name: m.name, state: m.state, hasError: hasErr };
        changed = true;
      }
    }
    // 移除已消失的沙箱
    for (const id of Object.keys(known)) {
      if (!machines.some((m) => m.id === id)) { delete known[id]; changed = true; }
    }
    if (changed) saveKnown(known);
  };
  // 启动后先等 3s 做首次基线，再周期轮询
  setTimeout(tick, 3000);
  timer = setInterval(tick, intervalMs);
}
