/** 其余资源 API：模板/快照/用量/账户/组织/端口/Secrets/Webhook/导出/统计 */
import { api, uuid } from './client';
import type { OperationLike } from './client';
import type {
  Template, Snapshot, Usage, Me, Org, PublicPort, Secret,
  Webhook, WebhookDelivery, ExportItem, Stats, UsageLimits,
} from './types';

export const miscApi = {
  // ---- 账户 ----
  me: () => api<Me>('GET', 'v1/me'),
  stats: () => api<Stats>('GET', 'v1/stats'),
  usage: (org?: string) => api<Usage>('GET', 'v1/usage', org ? { query: { org } } : {}),
  orgs: () => api<{ orgs: Org[] }>('GET', 'v1/orgs'),
  orgUsageMachines: (org: string | undefined, from?: string, to?: string) =>
    api<{ items: import('./types').OrgMachineUsage[] }>('GET', 'v1/usage/machines', {
      query: { org, from, to },
    }),

  // ---- 模板 ----
  templates: () => api<{ templates: Template[] }>('GET', 'v1/templates'),

  // ---- 快照 ----
  snapshots: () => api<{ snapshots: Snapshot[] }>('GET', 'v1/snapshots'),
  snapshot: (id: string) => api<Snapshot>('GET', `v1/snapshots/${id}`),
  createSnapshot: (machineId: string, body: { name: string; description?: string; rootOnly?: boolean; forFork?: boolean }) =>
    api<{ snapshot?: Snapshot; operationId?: string }>('POST', `v1/machines/${machineId}/snapshots`, {
      body, headers: { 'Idempotency-Key': uuid() },
    }),
  deleteSnapshot: (id: string) => api<unknown>('DELETE', `v1/snapshots/${id}`),
  snapshotFiles: (id: string, path: string) =>
    api<import('./types').Files>('GET', `v1/snapshots/${id}/files`, { query: { path } }),

  // ---- 端口（全局） ----
  allPorts: () => api<{ ports: PublicPort[] }>('GET', 'v1/ports'),

  // ---- 组织 Secrets ----
  orgSecrets: (orgId: string) => api<{ secrets: Secret[] }>('GET', `v1/orgs/${orgId}/secrets`),
  putOrgSecret: (orgId: string, name: string, body: {
    value: string; delivery: 'proxy' | 'env'; hosts?: string[];
  }) => api<Secret>('PUT', `v1/orgs/${orgId}/secrets/${name}`, { body }),
  deleteOrgSecret: (orgId: string, name: string) =>
    api<unknown>('DELETE', `v1/orgs/${orgId}/secrets/${name}`),
  importOrgSecrets: (orgId: string, body: {
    delivery: 'proxy' | 'env'; hosts?: string[];
    secrets: { name: string; value: string }[];
  }) => api<{ secrets: Secret[] }>('POST', `v1/orgs/${orgId}/secrets/import`, { body }),

  // ---- Webhooks ----
  webhooks: (orgId: string) => api<{ webhooks: Webhook[] }>('GET', `v1/orgs/${orgId}/webhooks`),
  createWebhook: (orgId: string, body: { url: string; description?: string; events: string[]; enabled?: boolean }) =>
    api<Webhook>('POST', `v1/orgs/${orgId}/webhooks`, { body }),
  updateWebhook: (orgId: string, whId: string, body: { url?: string; description?: string; events?: string[]; enabled?: boolean }) =>
    api<Webhook>('PATCH', `v1/orgs/${orgId}/webhooks/${whId}`, { body }),
  deleteWebhook: (orgId: string, whId: string) =>
    api<unknown>('DELETE', `v1/orgs/${orgId}/webhooks/${whId}`),
  rotateWebhook: (orgId: string, whId: string) =>
    api<Webhook>('POST', `v1/orgs/${orgId}/webhooks/${whId}/rotate`, { body: {} }),
  testWebhook: (orgId: string, whId: string) =>
    api<unknown>('POST', `v1/orgs/${orgId}/webhooks/${whId}/test`, { body: {} }),
  webhookDeliveries: (orgId: string, whId: string, limit = 50) =>
    api<{ deliveries: WebhookDelivery[] }>('GET', `v1/orgs/${orgId}/webhooks/${whId}/deliveries`, { query: { limit } }),
  retryDelivery: (orgId: string, whId: string, deliveryId: string) =>
    api<unknown>('POST', `v1/orgs/${orgId}/webhooks/${whId}/deliveries/${deliveryId}/retry`, { body: {} }),

  // ---- 导出 ----
  exports: (orgId: string) => api<{ exports: ExportItem[] }>('GET', `v1/orgs/${orgId}/exports`),
  createExport: (orgId: string, body: { machineId?: string; snapshotId?: string }) =>
    api<ExportItem>('POST', `v1/orgs/${orgId}/exports`, { body }),
  export: (id: string) => api<ExportItem>('GET', `v1/exports/${id}`),

  // ---- 操作 ----
  operation: (id: string, wait?: boolean) =>
    api<OperationLike>('GET', `v1/operations/${id}`, wait ? { query: { wait: '25s' }, timeoutMs: 40000 } : {}),
};

export const WEBHOOK_EVENTS = [
  'sandbox.created', 'sandbox.started', 'sandbox.stopped', 'sandbox.suspended',
  'sandbox.error', 'sandbox.deleted',
  'snapshot.created', 'snapshot.failed', 'snapshot.deleted',
] as const;
