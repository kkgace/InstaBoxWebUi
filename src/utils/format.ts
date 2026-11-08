/** 格式化工具 */

export function fmtBytes(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(n)) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function fmtDuration(sec?: number | null): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)} 秒`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分${sec % 60 ? ` ${Math.round(sec % 60)} 秒` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 时${m % 60 ? ` ${m % 60} 分` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} 天${h % 24 ? ` ${h % 24} 时` : ''}`;
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60 && diff >= 0) return '刚刚';
  if (diff < 3600 && diff >= 0) return `${Math.floor(diff / 60)} 分钟前`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtTimeFull(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'medium' });
}

/** 相对截止倒计时文案 */
export function fmtDeadline(iso?: string | null): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = (t - Date.now()) / 1000;
  if (diff <= 0) return { text: '已到期', urgent: true };
  return { text: `${fmtDuration(diff)}后`, urgent: diff < 3600 };
}

/** 沙箱状态 → 颜色 + 中文 */
export const STATE_META: Record<string, { color: string; zh: string }> = {
  running: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', zh: '运行中' },
  starting: { color: 'bg-sky-500/15 text-sky-400 border-sky-500/30', zh: '启动中' },
  creating: { color: 'bg-sky-500/15 text-sky-400 border-sky-500/30', zh: '创建中' },
  resuming: { color: 'bg-sky-500/15 text-sky-400 border-sky-500/30', zh: '恢复中' },
  stopping: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', zh: '停止中' },
  suspending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', zh: '暂停中' },
  stopped: { color: 'bg-slate-500/15 text-slate-300 border-slate-500/30', zh: '已停止' },
  suspended: { color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', zh: '已暂停' },
  deleting: { color: 'bg-red-500/15 text-red-400 border-red-500/30', zh: '删除中' },
  deleted: { color: 'bg-red-500/15 text-red-400 border-red-500/30', zh: '已删除' },
  error: { color: 'bg-red-500/15 text-red-400 border-red-500/30', zh: '错误' },
  pending: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', zh: '等待中' },
  ready: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', zh: '就绪' },
  failed: { color: 'bg-red-500/15 text-red-400 border-red-500/30', zh: '失败' },
  queued: { color: 'bg-slate-500/15 text-slate-300 border-slate-500/30', zh: '排队中' },
  succeeded: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', zh: '成功' },
};

export const OP_TYPE_ZH: Record<string, string> = {
  create: '创建', start: '启动', stop: '停止', suspend: '暂停', resume: '恢复',
  delete: '删除', restore: '还原', resize: '调整规格', move: '迁移',
};

export function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
