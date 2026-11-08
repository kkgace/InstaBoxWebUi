/** 快照/克隆：创建快照、还原到快照、fork 克隆 */
import { useState } from 'react';
import { Camera, Undo2, GitFork } from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { Card, Button, Field, Input, Textarea, Checkbox, ErrorBox, OkBox, Confirm } from '@/components/ui';
import type { Machine, Snapshot } from '@/api/types';

export default function SnapshotTab({ m, reload }: { m: Machine; reload: () => void }) {
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
      const r = await miscApi.createSnapshot(m.id, {
        name: name.trim(), description: desc.trim() || undefined, rootOnly,
      });
      if (r.operationId) {
        setSnapOk('快照处理中…');
        await waitForOperation(r.operationId, (op) => setSnapOk(`快照：${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
      }
      setSnapOk(`快照「${name.trim()}」已保存（${(r.snapshot as Snapshot)?.status || 'ready'}）`);
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
      await waitForOperation(r.operationId, (op) => setForkOk(`克隆：${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
      setForkOk(`克隆完成：${r.machineId || ''}`);
      reload();
    } catch (e) { setForkErr(errText(e)); }
    setForkBusy(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="保存快照">
        <div className="space-y-2.5">
          <Field label="快照名称" hint="小写字母/数字/连字符，唯一">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mono w-full" />
          </Field>
          <Field label="描述（可选）"><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full" /></Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={rootOnly} onChange={(e) => setRootOnly(e.target.checked)} />
            仅系统盘（不含 /data）
          </label>
          <Button variant="primary" onClick={createSnap} loading={snapBusy} className="w-full justify-center"><Camera size={14} /> 保存快照</Button>
          <p className="text-xs text-dim">运行中的沙箱可做在线快照（短暂冻结文件）；停止中的沙箱瞬时完成。免费版最多 5 个快照。</p>
          <ErrorBox>{snapErr}</ErrorBox>
          {snapOk && <OkBox>{snapOk}</OkBox>}
        </div>
      </Card>

      <Card title="还原到快照">
        <div className="space-y-2.5">
          <Field label="快照 ID（可选）" hint="留空 = 还原到创建来源快照">
            <Input value={restoreId} onChange={(e) => setRestoreId(e.target.value)} placeholder="sn_..." className="mono w-full" />
          </Field>
          <Field label="还原后状态">
            <select value={restoreState} onChange={(e) => setRestoreState(e.target.value as 'running' | 'stopped')}
              className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm">
              <option value="running">启动</option>
              <option value="stopped">保持停止</option>
            </select>
          </Field>
          <Button variant="danger" onClick={() => setRestoreOpen(true)} className="w-full justify-center"><Undo2 size={14} /> 还原</Button>
          <p className="text-xs text-dim">沙箱磁盘整体回到快照时点：ID、名称、端口 URL、SSH 配置保留，之后的数据全部丢失。</p>
          <ErrorBox>{restoreErr}</ErrorBox>
        </div>
      </Card>

      <Card title="克隆（fork，无需快照）">
        <div className="space-y-2.5">
          <Field label="新沙箱名称（可选）" hint="默认 <源名>-fork-xxxx">
            <Input value={forkName} onChange={(e) => setForkName(e.target.value)} className="mono w-full" />
          </Field>
          <Button variant="primary" onClick={doFork} loading={forkBusy} className="w-full justify-center"><GitFork size={14} /> 立即克隆</Button>
          <p className="text-xs text-dim">在宿主机上 COW 复制磁盘，秒级完成；复制的是当前（或最后）的完整系统盘与 /data。免费版限 1 台，克隆前请先删除其他沙箱。</p>
          <ErrorBox>{forkErr}</ErrorBox>
          {forkOk && <OkBox>{forkOk}</OkBox>}
        </div>
      </Card>

      <Confirm
        open={restoreOpen} onClose={() => setRestoreOpen(false)}
        onConfirm={doRestore}
        title={`还原沙箱 ${m.name}`}
        message={<>将把沙箱磁盘还原到{restoreId.trim() ? `快照 ${restoreId.trim()}` : '创建来源快照'}，之后的全部数据丢失。确认继续？</>}
        confirmText="确认还原" danger requireText={m.name}
      />
    </div>
  );
}
