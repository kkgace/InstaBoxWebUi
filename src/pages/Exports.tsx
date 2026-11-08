/** 数据导出：创建（机器/快照 /data 打包）、状态轮询、下载 tar.gz */
import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Download } from 'lucide-react';
import { errText, apiDownload } from '@/api/client';
import { miscApi } from '@/api/misc';
import { machinesApi } from '@/api/machines';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Modal, Field, Select, CopyButton } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { ExportItem, Machine, Snapshot } from '@/api/types';

export default function Exports() {
  const { orgId } = useGlobal();
  const { t } = useT();
  const [list, setList] = useState<ExportItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try {
      const [e, m, s] = await Promise.allSettled([miscApi.exports(orgId), machinesApi.list({ limit: 200 }), miscApi.snapshots()]);
      if (e.status === 'fulfilled') setList((e.value as { exports?: ExportItem[] }).exports || []);
      else setErr(errText(e.reason));
      if (m.status === 'fulfilled') setMachines((m.value as { machines: Machine[] }).machines || []);
      if (s.status === 'fulfilled') setSnaps((s.value as { snapshots: Snapshot[] }).snapshots || []);
    } catch (e2) { setErr(errText(e2)); }
    setLoading(false);
  }, [orgId]);
  useEffect(() => { load(); }, [load]);
  // building 中的导出自动轮询
  useEffect(() => {
    if (!list.some((x) => x.status === 'queued' || x.status === 'building')) return;
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [list, load]);

  const download = async (x: ExportItem) => {
    try {
      setOk(t('files.downloading', { n: x.name }));
      const { blob, filename } = await apiDownload(`v1/exports/${x.id}/download`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || x.fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      setOk(t('files.downloaded', { n: x.name, s: fmtBytes(blob.size) }));
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{t('exp.title')}</h1>
          <p className="text-xs text-dim">{t('exp.desc')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> {t('exp.new')}</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {!orgId ? <Card><ErrorBox>{t('exp.noCtx')}</ErrorBox></Card>
        : loading && !list.length ? <Spinner /> : list.length === 0 ? (
          <Card><Empty>{t('exp.none')}</Empty></Card>
        ) : (
          <Table head={[t('common.name'), t('exp.colSource'), t('common.status'), t('exp.colSize'), t('exp.colSha'), t('common.expiresAt'), t('common.actions')]}>
            {list.map((x) => (
              <tr key={x.id} className="hover:bg-white/[0.03]">
                <Td>
                  <div className="text-sm">{x.name}</div>
                  <div className="mono text-[10px] text-dim">{x.fileName}</div>
                </Td>
                <Td className="mono text-xs text-dim">{x.machineId ? `machine ${x.machineId.slice(0, 12)}…` : `snapshot ${x.snapshotId?.slice(0, 12)}…`}</Td>
                <Td>
                  <Badge value={x.status === 'ready' ? 'succeeded' : x.status === 'failed' ? 'failed' : 'pending'}>{x.status}</Badge>
                  {x.error && <div className="mt-1 text-[10px] text-red-400">{x.error}</div>}
                </Td>
                <Td className="mono text-xs">{fmtBytes(x.bytes)}</Td>
                <Td>
                  {x.sha256 ? (
                    <div className="flex items-center gap-1">
                      <span className="mono max-w-24 truncate text-[10px] text-dim" title={x.sha256}>{x.sha256.slice(0, 12)}…</span>
                      <CopyButton text={x.sha256} />
                    </div>
                  ) : '—'}
                </Td>
                <Td className="text-xs text-dim">{fmtTime(x.expiresAt)}</Td>
                <Td>
                  {x.status === 'ready' && <Button className="!px-2 !py-1" onClick={() => download(x)}><Download size={13} /> {t('common.download')}</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      <NewExportDialog open={newOpen} onClose={() => setNewOpen(false)} orgId={orgId} machines={machines} snaps={snaps} onDone={() => { setNewOpen(false); load(); }} />
    </div>
  );
}

function NewExportDialog({ open, onClose, orgId, machines, snaps, onDone }: {
  open: boolean; onClose: () => void; orgId: string | null; machines: Machine[]; snaps: Snapshot[]; onDone: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<'machine' | 'snapshot'>('machine');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!orgId || !targetId) return;
    setBusy(true); setErr(null);
    try {
      await miscApi.createExport(orgId, kind === 'machine' ? { machineId: targetId } : { snapshotId: targetId });
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('exp.newTitle')}>
      <div className="space-y-3">
        <Field label={t('exp.source')}>
          <Select value={kind} onChange={(e) => { setKind(e.target.value as 'machine' | 'snapshot'); setTargetId(''); }} className="w-full">
            <option value="machine">{t('exp.srcMachine')}</option>
            <option value="snapshot">{t('exp.srcSnapshot')}</option>
          </Select>
        </Field>
        <Field label={kind === 'machine' ? t('exp.pickMachine') : t('exp.pickSnap')}>
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full">
            <option value="">{t('exp.pick')}</option>
            {kind === 'machine' && machines.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.state}）</option>)}
            {kind === 'snapshot' && snaps.map((s) => <option key={s.id} value={s.id}>{s.name}{s.dataSizeBytes ? '' : t('exp.onlyRoot')}</option>)}
          </Select>
        </Field>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!targetId}>{t('common.create')}</Button>
        </div>
      </div>
    </Modal>
  );
}
