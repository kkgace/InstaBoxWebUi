/** 概览：生命周期操作、活动租约、错误信息 */
import { useEffect, useState } from 'react';
import { Play, Square, Pause, RotateCcw, Trash2, Zap, Timer, XCircle } from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Badge, ErrorBox, OkBox, Confirm, Field, Input, Table, Td, Empty } from '@/components/ui';
import { fmtDuration, fmtTime, OP_TYPE_ZH } from '@/utils/format';
import type { Machine, ActivityLease } from '@/api/types';

export default function Overview({ m, reload }: { m: Machine; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [leaseId, setLeaseId] = useState('');
  const [leaseSec, setLeaseSec] = useState('600');
  const [leases, setLeases] = useState<Record<string, ActivityLease>>({});

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr(null); setOk(null);
    try {
      const r = (await fn()) as { operationId?: string; type?: string } | null;
      const opId = r?.operationId;
      if (opId) {
        await waitForOperation(opId, (op) => setOk(`${OP_TYPE_ZH[op.type] || op.type}：${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
        setOk(`${OP_TYPE_ZH[r.type || ''] || '操作'}完成`);
      } else setOk('完成');
      reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const putLease = async () => {
    if (!leaseId.trim()) return;
    setBusy('lease'); setErr(null);
    try {
      const l = await machinesApi.putLease(m.id, leaseId.trim(), Number(leaseSec) || 600);
      setLeases((p) => ({ ...p, [leaseId.trim()]: l }));
      setOk('租约已创建/续期');
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };
  const dropLease = async (id: string) => {
    try { await machinesApi.deleteLease(m.id, id); setLeases((p) => { const q = { ...p }; delete q[id]; return q; }); } catch (e) { setErr(errText(e)); }
  };

  const canStart = m.state === 'stopped' || m.state === 'suspended';
  const canStop = m.state === 'running';
  const canSuspend = m.state === 'running';
  const canResume = m.state === 'suspended';
  const cooling = m.cooldownUntil && new Date(m.cooldownUntil).getTime() > Date.now();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="生命周期">
        <div className="flex flex-wrap gap-2">
          {canStart && <Button variant="primary" loading={busy === 'start'} onClick={() => run('start', () => machinesApi.start(m.id))}><Play size={14} /> 启动</Button>}
          {canStop && <Button loading={busy === 'stop'} onClick={() => run('stop', () => machinesApi.stop(m.id))}><Square size={14} /> 停止</Button>}
          {canSuspend && <Button loading={busy === 'suspend'} onClick={() => run('suspend', () => machinesApi.suspend(m.id))}><Pause size={14} /> 暂停（保留进程）</Button>}
          {canResume && <Button variant="primary" loading={busy === 'resume'} onClick={() => run('resume', () => machinesApi.resume(m.id))}><RotateCcw size={14} /> 恢复</Button>}
          {m.state === 'running' && m.autoSuspendedAt && <Button loading={busy === 'wake'} onClick={() => run('wake', () => machinesApi.wake(m.id))}><Zap size={14} /> 唤醒</Button>}
          <Button variant="danger" onClick={() => setDelOpen(true)}><Trash2 size={14} /> 删除</Button>
        </div>
        <div className="mt-3 space-y-1 text-xs text-dim">
          <div>停止 = 关机（进程结束、文件保留）；暂停 = 冻结（进程与内存保留，恢复后继续）。</div>
          {cooling && <div className="text-amber-400">冷却中至 {fmtTime(m.cooldownUntil)}（{m.cooldownReason || 'max_run'}）：期间唤醒/启动会被拒绝。</div>}
          {m.lastError && <div className="text-red-400">最近错误：{m.lastError.code} — {m.lastError.message}</div>}
          {m.readyAt && <div>本次就绪时间：{fmtTime(m.readyAt)} · 连续运行 {m.runStartedAt ? fmtDuration((Date.now() - new Date(m.runStartedAt).getTime()) / 1000) : '—'}</div>}
        </div>
        <div className="mt-3">{err && <ErrorBox>{err}</ErrorBox>}{!err && ok && <OkBox>{ok}</OkBox>}</div>
      </Card>

      <Card title="活动租约（保持机器唤醒）">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="租约 ID（任务名）"><Input value={leaseId} onChange={(e) => setLeaseId(e.target.value)} placeholder="my-task" className="w-full" /></Field></div>
          <div className="w-28"><Field label="时长（秒）"><Input type="number" value={leaseSec} onChange={(e) => setLeaseSec(e.target.value)} /></Field></div>
          <Button variant="primary" loading={busy === 'lease'} onClick={putLease}><Timer size={14} /> 创建/续期</Button>
        </div>
        <p className="mt-2 text-xs text-dim">租约让空闲暂停暂不生效；任务结束后释放。到期后机器进入完整空闲期。</p>
        <div className="mt-3">
          {Object.keys(leases).length === 0 ? <Empty>本页会话内创建的租约（服务端租约列表见日志页操作记录）</Empty> : (
            <Table head={['ID', '到期', '']}>
              {Object.entries(leases).map(([id, l]) => (
                <tr key={id}>
                  <Td className="mono text-xs">{id}</Td>
                  <Td className="text-xs">{fmtTime(l.expiresAt)}</Td>
                  <Td><Button variant="ghost" className="!px-2 !py-1" onClick={() => dropLease(id)}><XCircle size={13} /> 释放</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Confirm
        open={delOpen} onClose={() => setDelOpen(false)}
        onConfirm={() => run('delete', () => machinesApi.delete(m.id))}
        title={`删除沙箱 ${m.name}`}
        message="将删除沙箱、系统文件与全部存储数据（已保存的快照保留）。不可撤销。"
        confirmText="确认删除" danger requireText={m.name}
      />
    </div>
  );
}
