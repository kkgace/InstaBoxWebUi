/** 快照/克隆：创建快照、还原到快照、fork 克隆 */
import { useState } from 'react';
import { Camera, Undo2, GitFork } from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useT } from '@/i18n';
import { Card, Button, Field, Input, Textarea, Checkbox, ErrorBox, OkBox, Confirm } from '@/components/ui';
import type { Machine } from '@/api/types';

export default function SnapshotTab({ m, reload }: { m: Machine; reload: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(`${m.name}-snap-${new Date().toISOString().slice(5, 16).replace('T', '-').replace(':', '')}`);
  const [desc, setDesc] = useState('');
  const [rootOnly, setRootOnly] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const [snapOk, setSnapOk] = useState<string | null>(null);

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreId, setRestoreId] = useState('');
  const [restoreState, setRestoreState] = useState<'running' | 'stopped'>('running');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);

  const [forkName, setForkName] = useState('');
  const [forkBusy, setForkBusy] = useState(false);
  const [forkErr, setForkErr] = useState<string | null>(null);
  const [forkOk, setForkOk] = useState<string | null>(null);

  const createSnap = async () => {
    setSnapBusy(true); setSnapErr(null); setSnapOk(null);
    try {
      const r = await miscApi.createSnapshot(m.id, { name: name.trim(), description: desc.trim() || undefined, rootOnly });
      if (r.operationId) {
        setSnapOk(t('snap.processing'));
        await waitForOperation(r.operationId, (op) => setSnapOk(`${t('snap.processing')} ${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
      }
      setSnapOk(t('snap.saved', { n: name.trim(), s: r.snapshot?.status || 'ready' }));
      reload();
    } catch (e) { setSnapErr(errText(e)); }
    setSnapBusy(false);
  };

  const doRestore = async () => {
    setRestoreBusy(true); setRestoreErr(null);
    try {
      const body: { snapshotId?: string; desiredState: 'running' | 'stopped' } = { desiredState: restoreState };
      if (restoreId.trim()) body.snapshotId = restoreId.trim();
      const r = await machinesApi.restore(m.id, body);
      await waitForOperation(r.operationId, undefined);
      setRestoreOpen(false);
      reload();
    } catch (e) { setRestoreErr(errText(e)); }
    setRestoreBusy(false);
  };

  const doFork = async () => {
    setForkBusy(true); setForkErr(null); setForkOk(null);
    try {
      const body: { name?: string } = {};
      if (forkName.trim()) body.name = forkName.trim();
      const r = await machinesApi.fork(m.id, body);
      await waitForOperation(r.operationId, (op) => setForkOk(`${t('snap.forking')}${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
      setForkOk(t('snap.forkDone', { id: r.machineId || '' }));
      reload();
    } catch (e) { setForkErr(errText(e)); }
    setForkBusy(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={t('snap.save')}>
        <div className="space-y-2.5">
          <Field label={t('common.name')} hint={t('snap.nameHint')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mono w-full" />
          </Field>
          <Field label={t('snap.descOpt')}><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full" /></Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={rootOnly} onChange={(e) => setRootOnly(e.target.checked)} />
            {t('snap.rootOnly')}
          </label>
          <Button variant="primary" onClick={createSnap} loading={snapBusy} className="w-full justify-center"><Camera size={14} /> {t('snap.save')}</Button>
          <p className="text-xs text-dim">{t('snap.hint')}</p>
          <ErrorBox>{snapErr}</ErrorBox>
          {snapOk && <OkBox>{snapOk}</OkBox>}
        </div>
      </Card>

      <Card title={t('snap.restoreTitle')}>
        <div className="space-y-2.5">
          <Field label={t('snap.restoreId')} hint={t('snap.restoreIdHint')}>
            <Input value={restoreId} onChange={(e) => setRestoreId(e.target.value)} placeholder="sn_..." className="mono w-full" />
          </Field>
          <Field label={t('snap.restoreState')}>
            <select value={restoreState} onChange={(e) => setRestoreState(e.target.value as 'running' | 'stopped')}
              className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm">
              <option value="running">{t('mc.postRunning')}</option>
              <option value="stopped">{t('mc.postStopped')}</option>
            </select>
          </Field>
          <Button variant="danger" onClick={() => setRestoreOpen(true)} className="w-full justify-center"><Undo2 size={14} /> {t('snap.restoreBtn')}</Button>
          <p className="text-xs text-dim">{t('snap.restoreHint')}</p>
          <ErrorBox>{restoreErr}</ErrorBox>
        </div>
      </Card>

      <Card title={t('snap.forkTitle')}>
        <div className="space-y-2.5">
          <Field label={t('snap.forkName')} hint={t('snap.forkNameHint')}>
            <Input value={forkName} onChange={(e) => setForkName(e.target.value)} className="mono w-full" />
          </Field>
          <Button variant="primary" onClick={doFork} loading={forkBusy} className="w-full justify-center"><GitFork size={14} /> {t('snap.forkBtn')}</Button>
          <p className="text-xs text-dim">{t('snap.forkHint')}</p>
          <ErrorBox>{forkErr}</ErrorBox>
          {forkOk && <OkBox>{forkOk}</OkBox>}
        </div>
      </Card>

      <Confirm
        open={restoreOpen} onClose={() => setRestoreOpen(false)}
        onConfirm={doRestore}
        title={`${t('snap.restoreBtn')} ${m.name}`}
        message={t('snap.restoreConfirm', { t: restoreId.trim() ? t('snap.restoreTo', { id: restoreId.trim() }) : t('snap.restoreToOrigin') })}
        confirmText={t('snap.restoreBtn')} danger requireText={m.name}
      />
    </div>
  );
}
