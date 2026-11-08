/** 概览：生命周期操作、活动租约 */
import { useEffect, useState } from 'react';
import { Play, Square, Pause, RotateCcw, Trash2, Zap, Timer, XCircle } from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, ErrorBox, OkBox, Confirm, Field, Input, Table, Td, Empty } from '@/components/ui';
import { fmtDuration, fmtTime } from '@/utils/format';
import type { Machine, ActivityLease } from '@/api/types';

export default function Overview({ m, reload }: { m: Machine; reload: () => void }) {
  const { t } = useT();
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
        await waitForOperation(opId, (op) => setOk(`${t(`op.${op.type}`) || op.type}: ${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
        setOk(`${t(`op.${r.type || ''}`) || '—'} · ${t('common.done')}`);
      } else setOk(t('common.done'));
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
      setOk(t('ov.leaseCreated'));
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
      <Card title={t('ov.lifecycle')}>
        <div className="flex flex-wrap gap-2">
          {canStart && <Button variant="primary" loading={busy === 'start'} onClick={() => run('start', () => machinesApi.start(m.id))}><Play size={14} /> {t('ov.start')}</Button>}
          {canStop && <Button loading={busy === 'stop'} onClick={() => run('stop', () => machinesApi.stop(m.id))}><Square size={14} /> {t('ov.stop')}</Button>}
          {canSuspend && <Button loading={busy === 'suspend'} onClick={() => run('suspend', () => machinesApi.suspend(m.id))}><Pause size={14} /> {t('ov.suspend')}</Button>}
          {canResume && <Button variant="primary" loading={busy === 'resume'} onClick={() => run('resume', () => machinesApi.resume(m.id))}><RotateCcw size={14} /> {t('ov.resume')}</Button>}
          {m.state === 'running' && m.autoSuspendedAt && <Button loading={busy === 'wake'} onClick={() => run('wake', () => machinesApi.wake(m.id))}><Zap size={14} /> {t('ov.wake')}</Button>}
          <Button variant="danger" onClick={() => setDelOpen(true)}><Trash2 size={14} /> {t('common.delete')}</Button>
        </div>
        <div className="mt-3 space-y-1 text-xs text-dim">
          <div>{t('ov.stopVsSuspend1')}</div>
          {cooling && <div className="text-amber-400">{t('ov.cooling', { t: fmtTime(m.cooldownUntil), r: m.cooldownReason || 'max_run' })}</div>}
          {m.lastError && <div className="text-red-400">{t('ov.lastError', { c: m.lastError.code, m: m.lastError.message })}</div>}
          {m.readyAt && <div>{t('ov.readyAt', { t: fmtTime(m.readyAt), d: m.runStartedAt ? fmtDuration((Date.now() - new Date(m.runStartedAt).getTime()) / 1000) : '—' })}</div>}
        </div>
        <div className="mt-3">{err && <ErrorBox>{err}</ErrorBox>}{!err && ok && <OkBox>{ok}</OkBox>}</div>
      </Card>

      <Card title={t('ov.leases')}>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label={t('ov.leaseId')}><Input value={leaseId} onChange={(e) => setLeaseId(e.target.value)} placeholder="my-task" className="w-full" /></Field></div>
          <div className="w-28"><Field label={t('ov.leaseSec')}><Input type="number" value={leaseSec} onChange={(e) => setLeaseSec(e.target.value)} /></Field></div>
          <Button variant="primary" loading={busy === 'lease'} onClick={putLease}><Timer size={14} /> {t('ov.leaseCreate')}</Button>
        </div>
        <p className="mt-2 text-xs text-dim">{t('ov.leaseHint')}</p>
        <div className="mt-3">
          {Object.keys(leases).length === 0 ? <Empty>{t('ov.leaseEmpty')}</Empty> : (
            <Table head={['ID', t('common.expiresAt'), '']}>
              {Object.entries(leases).map(([id, l]) => (
                <tr key={id}>
                  <Td className="mono text-xs">{id}</Td>
                  <Td className="text-xs">{fmtTime(l.expiresAt)}</Td>
                  <Td><Button variant="ghost" className="!px-2 !py-1" onClick={() => dropLease(id)}><XCircle size={13} /> {t('ov.release')}</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <Confirm
        open={delOpen} onClose={() => setDelOpen(false)}
        onConfirm={() => run('delete', () => machinesApi.delete(m.id))}
        title={`${t('common.delete')} ${m.name}`}
        message={t('ov.delHint')}
        confirmText={t('common.confirmDelete')} danger requireText={m.name}
      />
    </div>
  );
}
