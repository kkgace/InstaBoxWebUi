/** 沙箱列表 + 创建沙箱 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Play, Square, Pause, RotateCcw, Trash2, Zap, Terminal, Clock, Hourglass } from 'lucide-react';
import { api, errText, waitForOperation, wsProxyUrl } from '@/api/client';
import { machinesApi, type CreateMachineBody } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { Button, Badge, Card, Table, Td, Modal, Field, Input, Textarea, Select, Spinner, ErrorBox, OkBox, Confirm } from '@/components/ui';
import { fmtBytes, fmtDuration, fmtTime, fmtDeadline } from '@/utils/format';
import type { Machine, MachineSpec, Template } from '@/api/types';

const parseKV = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of s.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
};

export default function Machines() {
  const { me, orgId } = useGlobal();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Machine | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setMachines((await machinesApi.list({ limit: 200 })).machines || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  /** 生命周期动作 */
  const act = async (m: Machine, action: 'start' | 'stop' | 'suspend' | 'resume' | 'wake') => {
    setBusy(m.id + action); setErr(null);
    try {
      const r = action === 'start' ? await machinesApi.start(m.id)
        : action === 'stop' ? await machinesApi.stop(m.id)
        : action === 'suspend' ? await machinesApi.suspend(m.id)
        : action === 'resume' ? await machinesApi.resume(m.id)
        : await machinesApi.wake(m.id);
      if (r && typeof r === 'object' && 'operationId' in r && r.operationId) {
        await waitForOperation(r.operationId as string);
      }
      await load();
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const del = async (m: Machine) => {
    setBusy(m.id + 'del'); setErr(null);
    try {
      const r = await machinesApi.delete(m.id);
      if (r && typeof r === 'object' && 'operationId' in r && r.operationId) {
        await waitForOperation(r.operationId as string);
      }
      await load();
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const specs: MachineSpec[] = me?.allowedSpecs || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">沙箱</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> 创建沙箱</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {loading && machines.length === 0 ? <Spinner /> : machines.length === 0 ? (
        <Card><div className="py-8 text-center text-sm text-dim">暂无沙箱。免费版限额 1 台（任意状态）。点击右上角「创建沙箱」开始。</div></Card>
      ) : (
        <Table head={['名称 / ID', '状态', '规格', '数据盘', '模板', '自动暂停', '运行/删除倒计时', '操作']}>
          {machines.map((m) => {
            const del2 = fmtDeadline(m.deleteAt);
            const arch = fmtDeadline(m.archiveAt);
            const runSec = m.runStartedAt ? (Date.now() - new Date(m.runStartedAt).getTime()) / 1000 : null;
            const canStart = m.state === 'stopped' || m.state === 'suspended';
            const canStop = m.state === 'running';
            const canSuspend = m.state === 'running';
            const canResume = m.state === 'suspended';
            return (
              <tr key={m.id} className="hover:bg-white/[0.03]">
                <Td>
                  <Link to={`/machines/${m.id}`} className="font-medium text-sky-400 hover:underline">{m.name}</Link>
                  <div className="mono text-[10px] text-dim">{m.id}</div>
                </Td>
                <Td>
                  <Badge value={m.state} />
                  {m.lastError && <div className="mt-1 max-w-40 truncate text-[10px] text-red-400" title={m.lastError.message}>{m.lastError.message}</div>}
                </Td>
                <Td className="mono text-xs">{m.spec.vcpus}C/{(m.spec.memMiB / 1024).toFixed(0)}G</Td>
                <Td className="mono text-xs">{fmtBytes((m as unknown as { storage?: { sizeBytes?: number } }).storage?.sizeBytes)}</Td>
                <Td className="mono text-xs text-dim">{m.template.id}<br />{m.template.version}</Td>
                <Td className="text-xs text-dim">{m.autoSuspendAfterSeconds ? fmtDuration(m.autoSuspendAfterSeconds) : '关闭'}</Td>
                <Td className="text-xs text-dim">
                  {runSec != null && m.state === 'running' && <div className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(runSec)}</div>}
                  {del2 && <div className={`inline-flex items-center gap-1 ${del2.urgent ? 'text-red-400' : ''}`}><Trash2 size={11} /> {del2.text}</div>}
                  {arch && !del2 && <div className="inline-flex items-center gap-1"><Hourglass size={11} /> 归档 {arch.text}</div>}
                  {!runSec && !del2 && !arch && '—'}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {canStart && <Button className="!px-2 !py-1" onClick={() => act(m, 'start')} loading={busy === m.id + 'start'} title="启动"><Play size={13} /></Button>}
                    {canStop && <Button className="!px-2 !py-1" onClick={() => act(m, 'stop')} loading={busy === m.id + 'stop'} title="停止"><Square size={13} /></Button>}
                    {canSuspend && <Button className="!px-2 !py-1" onClick={() => act(m, 'suspend')} loading={busy === m.id + 'suspend'} title="暂停（保留进程内存）"><Pause size={13} /></Button>}
                    {canResume && <Button className="!px-2 !py-1" onClick={() => act(m, 'resume')} loading={busy === m.id + 'resume'} title="恢复"><RotateCcw size={13} /></Button>}
                    {m.state === 'running' && (m as unknown as { autoSuspendedAt?: string }).autoSuspendedAt && <Button className="!px-2 !py-1" onClick={() => act(m, 'wake')} title="唤醒（空闲暂停后）"><Zap size={13} /></Button>}
                    <Button className="!px-2 !py-1" variant="danger" onClick={() => setDelTarget(m)} title="删除"><Trash2 size={13} /></Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); load(); }} specs={specs} />
      <Confirm
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && del(delTarget)}
        title={`删除沙箱 ${delTarget?.name || ''}`}
        message={<>将删除沙箱、系统文件与全部存储数据（已保存的快照保留）。此操作不可撤销。</>}
        confirmText="确认删除"
        danger
        requireText={delTarget?.name}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 创建
function CreateDialog({ open, onClose, onCreated, specs }: {
  open: boolean; onClose: () => void; onCreated: (machineId?: string) => void; specs: MachineSpec[];
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [specKey, setSpecKey] = useState('');
  const [desiredState, setDesiredState] = useState<'running' | 'stopped'>('running');
  const [env, setEnv] = useState('');
  const [metadata, setMetadata] = useState('');
  const [autoSuspend, setAutoSuspend] = useState('');
  const [maxRun, setMaxRun] = useState('');
  const [deleteAfter, setDeleteAfter] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null); setPhase(null); setBusy(false); setDoneId(null);
    miscApi.templates().then((r) => {
      const creatable = (r.templates || []).filter((t) => t.creatable !== false && !t.hidden);
      setTemplates(creatable);
      const def = creatable.find((t) => t.default) || creatable[0];
      if (def) setTemplateId(`${def.id}@${def.version}`);
    }).catch((e) => setErr(errText(e)));
  }, [open]);

  const creatable = templates.filter((t) => !t.staged);
  const selSpec = specs.find((s) => `${s.vcpus}/${s.memMiB}` === specKey);

  const submit = async () => {
    setBusy(true); setErr(null); setPhase('提交创建请求…'); setDoneId(null);
    const body: CreateMachineBody = { desiredState };
    if (name.trim()) body.name = name.trim();
    if (templateId) {
      const [tid, ver] = templateId.split('@');
      body.templateId = tid;
      if (ver && ver !== 'latest') body.templateVersion = ver;
    }
    if (selSpec) { body.vcpus = selSpec.vcpus; body.memMiB = selSpec.memMiB; }
    const envObj = parseKV(env);
    if (Object.keys(envObj).length) body.env = envObj;
    const mdObj = parseKV(metadata);
    if (Object.keys(mdObj).length) body.metadata = mdObj;
    if (autoSuspend) body.autoSuspendAfterSeconds = Number(autoSuspend);
    if (maxRun) body.maxRunMinutes = Number(maxRun);
    if (deleteAfter) body.deleteAfterSeconds = Number(deleteAfter);
    try {
      const r = await machinesApi.create(body);
      if (r.operationId) {
        setPhase('沙箱创建中（排队 → 调度 → 启动）…');
        await waitForOperation(r.operationId, (op) => setPhase(`${op.type}：${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
      }
      setDoneId(r.machineId || '');
      setTimeout(() => onCreated(r.machineId), 800);
    } catch (e) { setErr(errText(e)); setBusy(false); setPhase(null); }
  };

  return (
    <Modal open={open} onClose={onClose} title="创建沙箱" width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称（可选）" hint="1-63 位小写字母/数字/连字符">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="默认自动生成" className="w-full" />
          </Field>
          <Field label="模板">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full">
              {creatable.map((t) => (
                <option key={`${t.id}@${t.version}`} value={`${t.id}@${t.version}`}>
                  {t.id}@{t.version}{t.default ? '（默认）' : ''}{t.description ? ` — ${t.description.slice(0, 30)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="规格">
            <Select value={specKey} onChange={(e) => setSpecKey(e.target.value)} className="w-full">
              <option value="">默认（{specs[0] ? `${specs[0].vcpus} vCPU / ${specs[0].memMiB / 1024} GiB` : '4C/8G'}）</option>
              {specs.map((s) => (
                <option key={`${s.vcpus}/${s.memMiB}`} value={`${s.vcpus}/${s.memMiB}`}>{s.vcpus} vCPU / {s.memMiB / 1024} GiB</option>
              ))}
            </Select>
          </Field>
          <Field label="创建后状态">
            <Select value={desiredState} onChange={(e) => setDesiredState(e.target.value as 'running' | 'stopped')} className="w-full">
              <option value="running">立即启动</option>
              <option value="stopped">保持停止</option>
            </Select>
          </Field>
          <Field label="空闲自动暂停（秒）" hint="留空用默认；0 = 关闭">
            <Select value={autoSuspend} onChange={(e) => setAutoSuspend(e.target.value)} className="w-full">
              <option value="">默认</option>
              {[300, 600, 900, 1800].map((s) => <option key={s} value={s}>{s / 60} 分钟</option>)}
              <option value="0">关闭</option>
            </Select>
          </Field>
          <Field label="最长连续运行（分钟）" hint="超时自动暂停并进入冷却">
            <Input type="number" value={maxRun} onChange={(e) => setMaxRun(e.target.value)} placeholder="默认" className="w-full" />
          </Field>
          <Field label="定时删除（秒）" hint="60-86400；到时自动删除整个沙箱">
            <Input type="number" value={deleteAfter} onChange={(e) => setDeleteAfter(e.target.value)} placeholder="不设置" className="w-full" />
          </Field>
          <Field label="环境变量（可选）" hint="每行 KEY=value，注入所有登录 shell">
            <Textarea rows={2} value={env} onChange={(e) => setEnv(e.target.value)} placeholder={'FOO=bar\nBAZ=qux'} className="w-full" />
          </Field>
          <Field label="元数据标签（可选）" hint="每行 key=value，最多 32 个">
            <Textarea rows={2} value={metadata} onChange={(e) => setMetadata(e.target.value)} placeholder={'team=infra'} className="w-full" />
          </Field>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {phase && <div className="flex items-center gap-2 text-sm text-sky-400"><Spinner className="!size-4" /> {phase}</div>}
        {doneId && <OkBox>创建成功！沙箱 ID：{doneId}</OkBox>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy && !doneId}>关闭</Button>
          <Button variant="primary" onClick={submit} loading={busy}>创建</Button>
        </div>
      </div>
    </Modal>
  );
}
