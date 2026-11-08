/** 快照列表：从快照创建沙箱、删除、浏览文件 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, Trash2, FolderOpen, Rocket } from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Confirm, Modal, Crumbs, JsonView } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Snapshot, Files } from '@/api/types';

export default function Snapshots() {
  const { t } = useT();
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
    try { await miscApi.deleteSnapshot(del.id); setOk(t('snl.delOk', { n: del.name })); load(); }
    catch (e) { setErr(errText(e)); }
  };

  const createFrom = async (s: Snapshot) => {
    try {
      const r = await machinesApi.create({ snapshotId: s.id, name: `from-${s.name}`.slice(0, 63) });
      if (r.operationId) await waitForOperation(r.operationId);
      navigate(`/machines/${r.machineId || ''}`);
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('snl.title')}</h1>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {loading && !snaps.length ? <Spinner /> : snaps.length === 0 ? (
        <Card><Empty>{t('snl.empty')}</Empty></Card>
      ) : (
        <Table head={[t('common.name'), t('common.status'), t('snl.colSource'), t('snl.colRoot'), t('snl.colData'), t('snl.colVis'), t('common.createdAt'), t('common.actions')]}>
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
                  <Button className="!px-2 !py-1" title={t('snl.browse')} onClick={() => setBrowse(s)}><FolderOpen size={13} /></Button>
                  <Button className="!px-2 !py-1" title={t('snl.createFrom')} onClick={() => createFrom(s)}><Rocket size={13} /></Button>
                  <Button className="!px-2 !py-1" variant="danger" title={t('common.delete')} onClick={() => setDel(s)}><Trash2 size={13} /></Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={doDel}
        title={t('snl.delTitle', { n: del?.name || '' })} message={t('snl.delMsg')} confirmText={t('common.delete')} danger />
      {browse && <BrowseModal snap={browse} onClose={() => setBrowse(null)} />}
    </div>
  );
}

function BrowseModal({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
  const { t } = useT();
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
    <Modal open onClose={onClose} title={t('snl.browseTitle', { n: snap.name })} width="max-w-3xl">
      <Crumbs parts={parts} onNav={(d) => setPath('/' + parts.slice(0, d).join('/') || '/')} />
      <ErrorBox>{err}</ErrorBox>
      {loading ? <Spinner /> : data?.type === 'dir' ? (
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-line/50">
            {(data.entries || []).map((e) => (
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
            {!data.entries?.length && <tr><td className="py-3 text-center text-dim">{t('snl.emptyDir')}</td></tr>}
          </tbody>
        </table>
      ) : data?.type === 'file' ? (
        data.binary ? <div className="mt-2 text-sm text-dim">{t('snl.binary', { s: fmtBytes(data.size) })}</div> : <JsonView data={data.content || ''} />
      ) : null}
    </Modal>
  );
}
