/** API 客户端：所有请求经本地代理 /p/* 转发到 api.instabox.sh */

const KEY_STORAGE = 'instabox-ui.apiKey';

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) || '';
}
export function setApiKey(k: string) {
  if (k) localStorage.setItem(KEY_STORAGE, k.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

// ---------- 多账号（多 API Key）管理：一个账号一个 Key，可切换 ----------
export interface AccountEntry { label: string; key: string; addedAt: string }
const ACC_LIST = 'instabox-ui.accounts';

export function getAccounts(): AccountEntry[] {
  try { return JSON.parse(localStorage.getItem(ACC_LIST) || '[]'); } catch { return []; }
}
function saveAccounts(list: AccountEntry[]) {
  localStorage.setItem(ACC_LIST, JSON.stringify(list));
}
export function upsertAccount(label: string, key: string): AccountEntry[] {
  const list = getAccounts().filter((a) => a.key !== key.trim());
  list.unshift({ label, key: key.trim(), addedAt: new Date().toISOString() });
  saveAccounts(list);
  return list;
}
export function removeAccount(key: string): AccountEntry[] {
  const list = getAccounts().filter((a) => a.key !== key);
  saveAccounts(list);
  return list;
}
export function renameAccount(key: string, label: string): AccountEntry[] {
  const list = getAccounts().map((a) => (a.key === key ? { ...a, label: label || a.label } : a));
  saveAccounts(list);
  return list;
}

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  retryable?: boolean;
  operationId?: string;
  constructor(status: number, code: string, message: string, extra?: Partial<ApiError>) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

/** 常见错误码 → 中文提示 */
const CODE_ZH: Record<string, string> = {
  missing_key: '缺少 API Key', malformed_key: 'API Key 格式错误', invalid_key: 'API Key 无效',
  expired_key: 'API Key 已过期', revoked_key: 'API Key 已被撤销', session_expired: '会话过期',
  missing_scope: 'API Key 权限范围（scope）不足，请在官方 dashboard 检查该 Key 的 scopes',
  permission_denied: '没有权限执行此操作',
  machine_not_running: '沙箱不在运行状态，请先启动',
  machine_not_stopped: '沙箱未处于停止状态',
  operation_conflict: '操作冲突：已有操作正在进行或状态不匹配',
  delete_confirmation_required: '需要确认删除：请输入沙箱 ID 确认（本界面已自动带上确认头）',
  not_found: '资源不存在',
  rate_limited: '请求过于频繁，请稍后再试',
  no_capacity: '暂时没有可用宿主机容量，请稍后重试',
  quota_exceeded: '超出配额限制（免费版 1 台沙箱 / 5 个快照 / 200GiB）',
  spend_limit_reached: '已达到本月消费上限',
  too_large: '文件过大',
  invite_required: '账号需要邀请码激活',
  proxy_upstream: '代理无法连接上游 api.instabox.sh',
};

export function errText(e: unknown): string {
  if (e instanceof ApiError) return CODE_ZH[e.code] ? `${CODE_ZH[e.code]}（${e.code}）` : e.message || e.code;
  if (e instanceof Error) return e.message;
  return String(e);
}

export interface ApiOptions {
  body?: unknown;               // JSON 序列化；Blob/ArrayBuffer 直接发送
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;           // 默认 120s（长轮询 wait=25s 需要）；传 Infinity 关闭
  raw?: boolean;                // 返回原始 Response（下载用）
}

export async function api<T = unknown>(method: string, path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await apiRaw(method, path, opts);
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const err = (data as { error?: Record<string, string> })?.error;
    throw new ApiError(res.status, err?.code || `http_${res.status}`, err?.message || res.statusText, {
      requestId: err?.requestId,
      retryable: err ? 'retryable' in err && String(err.retryable) === 'true' : undefined,
    });
  }
  return data as T;
}

async function apiRaw(method: string, path: string, opts: ApiOptions): Promise<Response> {
  const key = getApiKey();
  const headers: Record<string, string> = { ...opts.headers };
  // API Key 与 Content-Type 经查询参数传递：
  // InstaBox 的端口边缘代理会剥掉自定义请求头（X-API-Key/Authorization），查询串则总是保留。
  // 本地代理收到 __key/__ct 后注入请求头并从上游查询串中剥离。
  const sp = new URLSearchParams();
  if (key) sp.set('__key', key);
  if (opts.body !== undefined) {
    if (opts.body instanceof Blob || opts.body instanceof ArrayBuffer) {
      const t = opts.body instanceof Blob && opts.body.type ? opts.body.type : 'application/octet-stream';
      sp.set('__ct', t);
      delete headers['Content-Type'];
    } else {
      sp.set('__ct', 'application/json');
      delete headers['Content-Type'];
    }
  }
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const qs = sp.toString() ? `?${sp}` : '';
  const ctrl = new AbortController();
  const timer = opts.timeoutMs === Infinity ? undefined : setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120000);
  if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    return await fetch(`/p/${path.replace(/^\/+/, '')}${qs}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined
        : (opts.body instanceof Blob || opts.body instanceof ArrayBuffer ? opts.body : JSON.stringify(opts.body)),
      signal: ctrl.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 下载类端点：返回 blob（保留 Content-Disposition 文件名） */
export async function apiDownload(path: string, query?: ApiOptions['query']): Promise<{ blob: Blob; filename?: string }> {
  const res = await apiRaw('GET', path, { query, timeoutMs: Infinity });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let code = `http_${res.status}`, msg = res.statusText;
    try { const j = JSON.parse(text); code = j.error?.code || code; msg = j.error?.message || msg; } catch { /* ignore */ }
    throw new ApiError(res.status, code, msg);
  }
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return { blob: await res.blob(), filename: m?.[1] };
}

/** 生成浏览器侧 WebSocket 代理地址（目标必须是 *.instabox.sh）
 *  subprotocol 可选：InstaBox 边缘代理可能剥掉 Sec-WebSocket-Protocol 头，
 *  故同时经查询参数 __subproto 传递，代理端恢复（双保险）。 */
export function wsProxyUrl(target: string, subprotocol?: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sp = new URLSearchParams({ url: target });
  if (subprotocol) sp.set('__subproto', subprotocol);
  return `${proto}://${location.host}/ws?${sp}`;
}

/** Operation 长轮询：直到 succeeded / failed */
export async function waitForOperation(
  opId: string,
  onProgress?: (op: OperationLike) => void,
  signal?: AbortSignal,
): Promise<OperationLike> {
  for (;;) {
    const op = await api<OperationLike>('GET', `v1/operations/${opId}`, { query: { wait: '25s' }, signal, timeoutMs: 40000 });
    onProgress?.(op);
    if (op.state === 'succeeded') return op;
    if (op.state === 'failed') {
      const e = op.error;
      throw new ApiError(409, e?.code || 'operation_failed', e?.message || `操作失败（${op.type}）`, { operationId: opId });
    }
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  }
}

export interface OperationLike {
  id: string; machineId: string; type: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  phase?: string; error?: { code: string; message: string } | null;
}

/** 简易 uuid（Idempotency-Key 用） */
export function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
