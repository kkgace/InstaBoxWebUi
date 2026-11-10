/** 沙箱（machines）相关 API */
import { api, uuid, waitForOperation } from './client';
import type {
  Machine, MachineUsage, MachineLogs, MachineMetric, MachineDisk, MachineSecrets,
  Files, ExecResult, ExecHistoryEntry, ProcessList, PublicPort, SSHTokenInfo,
  ConnectionInfo, SSHConnection, AccessTicket, DesktopState, DesktopStreamLink,
  ActivityLease, UploadURLInfo,
} from './types';
import type { OperationLike } from './client';

export interface CreateMachineBody {
  name?: string;
  templateId?: string;
  templateVersion?: string;
  snapshotId?: string;
  vcpus?: number;
  memMiB?: number;
  desiredState?: 'running' | 'stopped';
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  autoSuspendAfterSeconds?: number;
  maxRunMinutes?: number;
  archiveSeconds?: number;
  deleteAfterSeconds?: number;
  vault?: boolean;
}

export const machinesApi = {
  list: (q?: { cursor?: string; limit?: number; metadata?: string }, opts?: { overrideKey?: string }) =>
    api<{ machines: Machine[]; nextCursor?: string }>('GET', 'v1/machines', { query: q, ...opts }),

  get: (id: string, opts?: { overrideKey?: string }) =>
    api<Machine>('GET', `v1/machines/${id}`, opts),

  create: (body: CreateMachineBody, opts?: { overrideKey?: string }) =>
    api<{ operationId: string; machineId?: string }>('POST', 'v1/machines', {
      body, headers: { 'Idempotency-Key': uuid() }, ...opts,
    }),

  update: (id: string, body: Partial<CreateMachineBody> & { persistentDiskGiB?: number; apply?: 'restart' }, opts?: { overrideKey?: string }) =>
    api<Machine>('PATCH', `v1/machines/${id}`, { body, ...opts }),

  delete: (id: string, opts?: { overrideKey?: string }) =>
    api<{ operationId?: string }>('DELETE', `v1/machines/${id}`, {
      headers: { 'X-Confirm-Delete': id }, ...opts,
    }),

  start: (id: string, body: { vcpus?: number; memMiB?: number } = {}, opts?: { overrideKey?: string }) =>
    api<{ operationId: string }>('POST', `v1/machines/${id}/start`, { body, ...opts }),

  stop: (id: string, timeoutSeconds?: number, opts?: { overrideKey?: string }) =>
    api<{ operationId: string }>('POST', `v1/machines/${id}/stop`, { body: timeoutSeconds ? { timeoutSeconds } : {}, ...opts }),

  suspend: (id: string, opts?: { overrideKey?: string }) =>
    api<{ operationId: string }>('POST', `v1/machines/${id}/suspend`, { body: {}, ...opts }),

  resume: (id: string, opts?: { overrideKey?: string }) =>
    api<{ operationId: string }>('POST', `v1/machines/${id}/resume`, { body: {}, ...opts }),

  wake: (id: string) =>
    api<unknown>('POST', `v1/machines/${id}/wake`, { body: {}, timeoutMs: 60000 }),

  restore: (id: string, body: { snapshotId?: string; desiredState?: 'running' | 'stopped' } = {}) =>
    api<{ operationId: string }>('POST', `v1/machines/${id}/restore`, { body }),

  fork: (id: string, body: { name?: string; vcpus?: number; memMiB?: number; metadata?: Record<string, string> } = {}) =>
    api<{ operationId: string; machineId?: string }>('POST', `v1/machines/${id}/fork`, { body }),

  // ---- 活动 / 租约 ----
  putLease: (id: string, leaseId: string, seconds: number) =>
    api<ActivityLease>('PUT', `v1/machines/${id}/activity-leases/${leaseId}`, { body: { seconds } }),

  deleteLease: (id: string, leaseId: string) =>
    api<unknown>('DELETE', `v1/machines/${id}/activity-leases/${leaseId}`),

  // ---- 文件 ----
  readFile: (id: string, path: string) =>
    api<Files>('GET', `v1/machines/${id}/files`, { query: { path } }),

  writeFile: (id: string, path: string, data: Blob, mode?: string, parents?: boolean) => {
    const q: Record<string, string> = { path };
    if (mode) q.mode = mode;
    if (parents) q.parents = 'true';
    return api<{ path: string; size: number }>('PUT', `v1/machines/${id}/files`, {
      body: data, query: q, headers: { 'Content-Type': 'application/octet-stream' }, timeoutMs: Infinity,
    });
  },

  uploadUrl: (id: string, path: string) =>
    api<UploadURLInfo>('POST', `v1/machines/${id}/files/upload-url`, { body: { path } }),

  // ---- exec ----
  exec: (id: string, body: {
    cmd?: string; argv?: string[]; cwd?: string; envs?: Record<string, string>;
    stdin?: string; timeoutSeconds?: number;
  }, opts?: { overrideKey?: string }) => api<ExecResult>('POST', `v1/machines/${id}/exec`, { body, timeoutMs: (body.timeoutSeconds ?? 60) * 1000 + 15000, ...opts }),

  history: (id: string, limit = 50) =>
    api<{ entries: ExecHistoryEntry[] }>('GET', `v1/machines/${id}/history`, { query: { limit } }),

  historyEntry: (id: string, execId: string) =>
    api<ExecHistoryEntry>('GET', `v1/machines/${id}/history/${execId}`),

  processes: (id: string) => api<ProcessList>('GET', `v1/machines/${id}/processes`),

  // ---- 监控 / 日志 / 用量 ----
  metrics: (id: string, since?: string) =>
    api<{ metrics: MachineMetric[]; disk?: MachineDisk }>('GET', `v1/machines/${id}/metrics`, since ? { query: { since } } : {}),

  disk: (id: string) => api<MachineDisk>('GET', `v1/machines/${id}/disk`),

  logs: (id: string, q: { tail?: number; after?: number }) =>
    api<MachineLogs>('GET', `v1/machines/${id}/logs`, { query: q }),

  usage: (id: string, from?: string, to?: string) =>
    api<MachineUsage>('GET', `v1/machines/${id}/usage`, from || to ? { query: { from, to } } : {}),

  // ---- 终端 / 桌面 ----
  access: (id: string, kind: 'terminal' | 'vnc') =>
    api<AccessTicket>('POST', `v1/machines/${id}/access`, { body: { kind } }),

  desktop: (id: string, action: 'status' | 'install' | 'start' | 'takeover' | 'handback', width?: number, height?: number) =>
    api<DesktopState>('POST', `v1/machines/${id}/desktop`, {
      body: { action, ...(width ? { width } : {}), ...(height ? { height } : {}) },
      // 安装/启动桌面组件（下载 Xfce/Chromium）可能需要数分钟
      timeoutMs: action === 'install' || action === 'start' ? 600000 : 60000,
    }),

  desktopStream: (id: string) =>
    api<DesktopStreamLink>('POST', `v1/machines/${id}/desktop/stream`, { body: {} }),

  desktopStreamRevoke: (id: string) =>
    api<unknown>('DELETE', `v1/machines/${id}/desktop/stream`),

  // ---- 端口 ----
  ports: (id: string) => api<{ ports: PublicPort[] }>('GET', `v1/machines/${id}/ports`),

  publishPort: (id: string, body: {
    port: number; name?: string; protocol?: 'http' | 'tcp';
    access?: 'public' | 'private'; rotateToken?: boolean;
  }) => api<PublicPort>('POST', `v1/machines/${id}/ports`, { body }),

  unpublishPort: (id: string, port: number) =>
    api<unknown>('DELETE', `v1/machines/${id}/ports/${port}`),

  portAgent: (id: string) =>
    api<unknown>('POST', `v1/machines/${id}/port-agent`, { body: {} }),

  // ---- SSH ----
  connectionInfo: (id: string) => api<ConnectionInfo>('GET', `v1/machines/${id}/connection-info`),

  sshCert: (id: string, publicKey: string, ttlSeconds?: number) =>
    api<SSHConnection>('POST', `v1/machines/${id}/connections`, { body: { publicKey, ...(ttlSeconds ? { ttlSeconds } : {}) } }),

  sshTokens: (id: string) => api<{ tokens: SSHTokenInfo[] }>('GET', `v1/machines/${id}/ssh-tokens`),

  createSshToken: (id: string, body: { name?: string; ttlSeconds?: number; noExpiry?: boolean } = {}) =>
    api<SSHTokenInfo>('POST', `v1/machines/${id}/ssh-tokens`, { body }),

  revokeSshToken: (id: string, tokenId: string) =>
    api<unknown>('DELETE', `v1/machines/${id}/ssh-tokens/${tokenId}`),

  revokeAllSshTokens: (id: string) =>
    api<unknown>('DELETE', `v1/machines/${id}/ssh-tokens`),

  // ---- Secrets（机器级） ----
  secrets: (id: string) => api<MachineSecrets>('GET', `v1/machines/${id}/secrets`),

  updateSecrets: (id: string, body: {
    secrets?: 'all' | string[]; envSecrets?: string[];
    directSecrets?: { secret: string; env?: string; file?: string }[];
  }) => api<unknown>('PATCH', `v1/machines/${id}/secrets`, { body }),

  refreshSecrets: (id: string) => api<unknown>('POST', `v1/machines/${id}/secrets`, { body: {} }),
};

/** 发起机器生命周期操作并轮询到完成（返回最终 operation） */
export async function runOp(
  resp: { operationId?: string },
  onProgress?: (op: OperationLike) => void,
): Promise<OperationLike | null> {
  if (!resp?.operationId) return null;
  return waitForOperation(resp.operationId, onProgress);
}
