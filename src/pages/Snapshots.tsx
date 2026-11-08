/** 快照列表：从快照创建沙箱、删除、浏览文件 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Trash2, Camera, FolderOpen, Rocket } from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Confirm, Modal, Crumbs, JsonView } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Snapshot, Files, FileEntry } from '@/api/types';

export default function Snapshots() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [del, setDel] = useState<Snapshot | null>(null);
  const [browse, setBrowse] = useState<Snapshot | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setSnaps((await miscApi.snapshots()).snapshots || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const doDel = async () => {
    if (!del) return;
    try { await miscApi.deleteSnapshot(del.id); setOk(`快照 ${del.name} 已删除（引用它的沙箱不受影响）`); load(); }
    catch (e) { setErr(errText(e)); }
  };

  const createFrom = async (s: Snapshot) => {
    try {
      const r = await machinesApi.create({
        snapshotId: s.id,
        name: `from-${s.name}`.slice(0, 63),
      });
      if (r.operationId) await import('@/api/client').then(({ waitForOperation }) => waitForOperation(r.operationId!));
      navigate(`/machines/${r.machineId || ''}`);
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">快照</h1>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {loading && !snaps.length ? <Spinner /> : snaps.length === 0 ? (
        <Card><Empty>暂无快照 — 在沙箱详情页「快照/克隆」Tab 创建</Empty></Card>
      ) : (
        <Table head={['名称', '状态', '来源沙箱', '系统盘', '数据盘', '可见性', '创建时间', '']}>
          {snaps.map((s) => (
            <tr key={s.id} className="hover:bg-white/[0.03]">
              <Td>
                <div className="font-medium">{s.name}</div>
                <div className="mono text-[10px] text-dim">{s.id}</div>
                {s.description && <div className="text-xs text-dim">{s.description}</div>}
              </Td>
              <Td><Badge value={s.status} />{s.error && <div className="mt-1 text-[10px] text-red-400">{s.error}</div>}</Td>
              <Td><Link to={`/machines/${s.sourceMachineId}`} className="text-xs text-sky-400 hover:underline">{s.sourceMachineId}</Link></Td>
              <Td className="mono text-xs">{fmtBytes(s.rootSizeBytes)}</Td>
              <Td className="mono text-xs">{fmtBytes(s.dataSizeBytes)}</Td>
              <Td className="text-xs">{s.visibility || 'private'}</Td>
              <Td className="text-xs text-dim">{fmtTime(s.createdAt)}</Td>
              <Td>
                <div className="flex gap-1">
                  <Button className="!px-2 !py-1" title="浏览文件" onClick={() => setBrowse(s)}><FolderOpen size={13} /></Button>
                  <Button className="!px-2 !py-1" title="从此快照创建沙箱" onClick={() => createFrom(s)}><Rocket size={13} /></Button>
                  <Button className="!px-2 !py-1" variant="danger" title="删除" onClick={() => setDel(s)}><Trash2 size={13} /></Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={doDel}
        title={`删除快照 ${del?.name || ''}`} message="从此快照创建的沙箱不受影响，其数据在不再被引用后清理。" confirmText="删除" danger />
      {browse && <BrowseModal snap={browse} onClose={() => setBrowse(null)} />}
    </div>
  );
}

function BrowseModal({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const [path, setPath] = useState('/');
  const [data, setData] = useState<Files | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true); setErr(null);
    miscApi.snapshotFiles(snap.id, path)
      .then((d) => setData(d))
      .catch((e: unknown) => setErr(errText(e)))
      .finally(() => setLoading(false));
  }, [snap.id, path]);

  const parts = path.split('/').filter(Boolean);
  return (
    <Modal open onClose={onClose} title={`浏览快照文件 — ${snap.name}`} width="max-w-3xl">
      <Crumbs parts={parts} onNav={(d) => setPath('/' + parts.slice(0, d).join('/') || '/')} />
      <ErrorBox>{err}</ErrorBox>
      {loading ? <Spinner /> : data?.type === 'dir' ? (
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-line/50">
            {(data.entries || []).map((e: FileEntry) => (
              <tr key={e.name} className="hover:bg-white/[0.03]">
                <td className="py-1.5">
                  {e.type === 'dir'
                    ? <button className="text-sky-400 hover:underline" onClick={() => setPath(`${path === '/' ? '' : path}/${e.name}`)}>{e.name}/</button>
                    : <span className="text-slate-300">{e.name}</span>}
                </td>
                <td className="mono w-24 py-1.5 text-xs text-dim">{e.type === 'dir' ? '—' : fmtBytes(e.size)}</td>
                <td className="w-40 py-1.5 text-xs text-dim">{fmtTime(e.modTime)}</td>
              </tr>
            ))}
            {!data.entries?.length && <tr><td className="py-3 text-center text-dim">空目录</td></tr>}
          </tbody>
        </table>
      ) : data?.type === 'file' ? (
        data.binary ? <div className="mt-2 text-sm text-dim">二进制文件（{fmtBytes(data.size)}）</div> : <JsonView data={data.content || ''} />
      ) : null}
    </Modal>
  );
}
