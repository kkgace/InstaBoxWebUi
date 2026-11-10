/** 操作审计：本地记录 UI 发起的写操作（非 GET），可回溯 */
export interface AuditEntry {
  at: string;
  method: string;
  path: string;
  status: number;
  account?: string;
  ok: boolean;
}

const KEY = 'instabox-ui.audit';
const MAX = 300;

export function getAudit(): AuditEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(list: AuditEntry[]) { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); }

export function recordAudit(e: Omit<AuditEntry, 'at'>) {
  // 只记写操作
  if (e.method === 'GET' || e.method === 'HEAD') return;
  const list = [{ ...e, at: new Date().toISOString() }, ...getAudit()].slice(0, MAX);
  save(list);
}
export function clearAudit() { save([]); }
