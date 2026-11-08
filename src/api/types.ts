/** InstaBox API 核心类型（依据 openapi.yaml 精简） */

export type MachineState =
  | 'creating' | 'starting' | 'running' | 'stopping' | 'stopped'
  | 'suspending' | 'suspended' | 'resuming' | 'deleting' | 'deleted' | 'error';

export interface MachineSpec { vcpus: number; memMiB: number; rootDiskGiB?: number }
export interface TemplateRef { id: string; version: string }
export interface SnapshotRef { id: string; name?: string }
export interface Storage { synced?: boolean; snapshotSeq?: number }
export interface Runtime { ready?: boolean; processesPreserved?: boolean; sshPort?: number }
export interface ErrorBody { code: string; message: string; requestId?: string; retryable?: boolean }

export interface Machine {
  id: string;
  name: string;
  desiredState: MachineState;
  state: MachineState;
  revision: number;
  operationId: string | null;
  template: TemplateRef;
  snapshot?: SnapshotRef;
  spec: MachineSpec;
  storage: Storage;
  runtime: Runtime;
  lastError?: ErrorBody;
  archiveAt?: string | null;
  deleteAt?: string | null;
  autoSuspendAfterSeconds?: number | null;
  maxRunMinutes?: number | null;
  runStartedAt?: string | null;
  readyAt?: string;
  cooldownUntil?: string | null;
  cooldownReason?: string;
  autoSuspendedAt?: string;
  metadata: Record<string, string>;
  envNames?: string[];
  vault?: boolean;
  guestUser: string;
  orgId: string;
  free?: boolean;
  oomKills?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Operation {
  id: string;
  machineId: string;
  type: 'create' | 'start' | 'stop' | 'suspend' | 'resume' | 'delete' | 'restore' | 'resize' | 'move';
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  phase?: string;
  trigger?: string;
  error?: ErrorBody | null;
  createdAt: string;
  updatedAt: string;
  machine?: Machine;
}

export interface Template {
  id: string; version: string; digest: string; arch: string;
  description?: string; runtime?: Record<string, string>;
  defaultSpec: MachineSpec; capabilities?: string[];
  creatable?: boolean; latest?: boolean; default?: boolean;
  hidden?: boolean; staged?: boolean; preboot?: boolean;
}

export interface Snapshot {
  id: string; name: string; orgId: string;
  description?: string; sourceMachineId: string;
  status: 'pending' | 'ready' | 'failed';
  error?: string;
  template: TemplateRef;
  rootSizeBytes: number; dataSizeBytes?: number;
  createdAt: string;
  guestUser?: string;
  visibility?: 'private' | 'community' | 'official';
}

export interface FileEntry {
  name: string; type: 'dir' | 'file' | 'symlink' | 'other';
  size: number; mode: string; modTime: string; target?: string;
}

export interface Files {
  path: string; type: 'dir' | 'file' | 'other';
  size: number; mode: string; modTime: string;
  entries?: FileEntry[]; content?: string; binary?: boolean; truncated?: boolean;
}

export interface PublicPort {
  id: string; machineId: string; machineName?: string;
  port: number; name: string; url: string;
  access: 'public' | 'private';
  protocol?: 'http' | 'tcp';
  address?: string;
  createdAt: string;
}

export interface ExecResult {
  stdout: string; stderr: string; exitCode: number;
  signal?: string; timedOut?: boolean; truncated?: boolean;
  invalidUtf8?: boolean; oomKilled?: boolean;
}

export interface ExecHistoryEntry {
  id: string; cmd?: string; command?: string;
  exitCode?: number; startedAt?: string; finishedAt?: string;
  user?: string; noHistory?: boolean;
}

export interface Process {
  pid: number; ppid: number; user: string;
  cpuPercent: number; memPercent: number;
  elapsedSeconds: number; command: string;
}

export interface ProcessList {
  machineId: string; state: string; live: boolean;
  capturedAt: string; trigger: string; truncated: boolean;
  processes: Process[];
}

export interface MachineMetric {
  timestamp: string; cpuUsedPct: number; cpuCount: number;
  memUsed: number; memTotal: number;
  diskUsed?: number; diskTotal: number;
  netInBytesPerSec?: number; netOutBytesPerSec?: number;
  diskReadBytesPerSec?: number; diskWriteBytesPerSec?: number;
}

export interface MachineDiskFs { usedBytes?: number; availBytes?: number; sizeBytes?: number; inodeUsedPct?: number }
export interface MachineDisk { data?: MachineDiskFs; root?: MachineDiskFs; warning?: string }

export interface MachineLogs {
  machineId: string; state: string;
  console: string; cursor: number;
  consoleReset?: boolean; consoleTruncated?: boolean; consoleUnavailable?: string;
  operations: Operation[];
}

export interface MachineUsage {
  from: string; to: string; runningSeconds: number;
  vcpuSeconds: number; memGiBSeconds: number; diskGiBSeconds: number; egressBytes: number;
}

export interface UsageLimits {
  maxMachines: number; maxSnapshots: number; maxStoredGiB: number;
  machineSpec?: MachineSpec; machineSpecs?: MachineSpec[];
  unlimited?: string[];
}

export interface UsageCost {
  costUSD?: number; runtimeUSD?: number; storageUSD?: number;
  egressUSD?: number; creditsUSD?: number;
}

export interface Usage {
  computedAt: string | null;
  logicalBytes: number; storedBytes: number; allocatedDiskGiB?: number;
  machines: number; snapshots: number;
  limits: UsageLimits;
  storage?: { items?: { machineId?: string; snapshotId?: string; name?: string; storedBytes: number }[] };
  cost?: UsageCost;
  org?: { id: string; name: string };
}

export interface Me {
  userId: number; login: string; name?: string; email?: string; avatarUrl?: string;
  admin?: boolean; orgId?: string;
  billingEnabled?: boolean; webhooksEnabled?: boolean;
  allowedSpecs?: MachineSpec[];
  org?: { id: string; name: string; tier?: string };
  workspaces?: { id: string; name: string; tier?: string }[];
  inviteRequired?: boolean; activated?: boolean;
  idleChoicesSeconds?: number[]; alwaysOnAllowed?: boolean;
}

export interface Org { id: string; name: string; tier?: string; owner?: number; usage?: unknown }

export interface SSHTokenInfo {
  id: string; name: string; createdAt: string;
  expiresAt?: string; revokedAt?: string;
  host?: string; port?: number; token?: string;
  command?: string; moshCommand?: string;
}

export interface ConnectionInfo {
  machineId: string; transport: string; host: string; port: number;
  moshHost?: string; moshPort?: number; username: string;
  capabilities?: string[];
}

export interface SSHConnection {
  id: string; machineId: string; host: string; port: number;
  username: string; certificate: string; expiresAt: string;
}

export interface AccessTicket {
  url: string; watchUrl?: string; token?: string;
  protocol?: string; expiresAt: string;
  requireTicket?: boolean;
}

export interface Secret {
  id: string; orgId: string; name: string;
  delivery: 'proxy' | 'env'; hosts?: string[];
  version: number; size: number; createdAt: string; updatedAt: string;
}

export interface SecretUsageItem { name: string; machineCount?: number }

export interface MachineSecrets {
  secrets: 'all' | string[]; envSecrets: string[];
  directSecrets: { secret: string; env?: string; file?: string }[];
  items: (Secret & { status?: string })[];
  version: number;
  proxyStatus?: unknown;
}

export interface Webhook {
  id: string; orgId: string; url: string; description?: string;
  events: string[]; enabled: boolean;
  disabledReason?: string; failingSince?: string;
  createdAt: string; updatedAt: string;
  secret?: string;
}

export interface WebhookDelivery {
  id: string; event: string; status: string;
  attempts: { at: string; code?: number; error?: string }[];
  createdAt: string; retryable?: boolean;
}

export interface ExportItem {
  id: string; orgId: string; machineId?: string; snapshotId?: string;
  name: string; fileName: string;
  status: 'queued' | 'building' | 'ready' | 'failed' | 'expired';
  error?: string; bytes?: number; sha256?: string;
  createdAt: string; readyAt?: string; expiresAt?: string;
}

export interface DesktopState {
  kind?: 'x11' | 'wayland' | 'vm';
  installed: boolean; installing: boolean; running: boolean; failed: boolean;
  log?: string; controller?: 'agent' | 'human'; yours?: boolean;
}

export interface DesktopStreamLink { url: string; expiresAt: string }

export interface ActivityLease { id: string; machineId: string; expiresAt: string }

export interface UploadURLInfo {
  url: string; method: 'PUT'; path: string; expiresAt: string; maxBytes: number;
}

export interface Stats { runningMachines: number; at: string }

export interface OrgMachineUsage {
  machineId: string; name?: string; deletedAt?: string;
  runningSeconds: number; vcpuSeconds: number; memGiBSeconds: number;
  diskGiBSeconds: number; egressBytes: number;
  costUSD?: number;
}

export type WebhookEventType =
  | 'sandbox.created' | 'sandbox.started' | 'sandbox.stopped' | 'sandbox.suspended'
  | 'sandbox.error' | 'sandbox.deleted'
  | 'snapshot.created' | 'snapshot.failed' | 'snapshot.deleted';
