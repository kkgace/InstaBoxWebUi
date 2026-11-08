/** 全局端口列表 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { Card, Button, Badge, ErrorBox, Table, Td, Empty, Spinner, CopyButton } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { PublicPort } from '@/api/types';

export default function Ports() {
  const [ports, setPorts] = useState<PublicPort[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setPorts((await miscApi.allPorts()).ports || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">端口发布</h1>
          <p className="text-xs text-dim">所有沙箱的已发布端口。发布/取消在对应沙箱的「端口」Tab 操作。</p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {loading && !ports.length ? <Spinner /> : ports.length === 0 ? (
        <Card><Empty>暂无已发布端口 — 到沙箱详情页「端口」Tab 发布</Empty></Card>
      ) : (
        <Table head={['沙箱', '端口', '名称', 'URL', '访问', '发布时间']}>
          {ports.map((p) => (
            <tr key={p.id} className="hover:bg-white/[0.03]">
              <Td><Link to={`/machines/${p.machineId}`} className="text-sky-400 hover:underline">{p.machineName || p.machineId}</Link></Td>
              <Td className="mono">{p.port}</Td>
              <Td className="text-xs">{p.name}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  <a href={p.url} target="_blank" rel="noreferrer" className="mono max-w-72 truncate text-xs text-sky-400 hover:underline">{p.url}</a>
                  <ExternalLink size={11} className="text-dim" />
                  <CopyButton text={p.url} />
                </div>
              </Td>
              <Td>{p.access === 'private'
                ? <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">私有</Badge>
                : <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">公开</Badge>}</Td>
              <Td className="text-xs text-dim">{fmtTime(p.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
