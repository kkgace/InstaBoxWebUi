/** 总览：账户、统计、用量卡片、沙箱速览 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Camera, Database, Coins, Activity, RefreshCw } from 'lucide-react';
import { api, errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { Card, Stat, Badge, Button, Spinner, Table, Td } from '@/components/ui';
import { STATE_META, fmtBytes, fmtTime } from '@/utils/format';
import type { Machine, Usage, Stats } from '@/api/types';

export default function Dashboard() {
  const { me, orgId } = useGlobal();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const [m, u, s] = await Promise.all([
        machinesApi.list({ limit: 100 }),
        miscApi.usage(orgId || undefined),
        miscApi.stats(),
      ]);
      setMachines(m.machines || []);
      setUsage(u);
      setStats(s);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  const running = machines.filter((m) => m.state === 'running').length;
  const cost = usage?.cost?.costUSD;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">总览</h1>
          <p className="text-xs text-dim">
            {me ? `${me.login}${me.email ? ` · ${me.email}` : ''} · 数据于 ${fmtTime(usage?.computedAt)} 计算` : ' '}
          </p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
      </div>

      {err && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
      {loading && !usage ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="运行中的沙箱" value={running} sub={`共 ${machines.length} 台`} accent />
            <Stat label="平台运行总数" value={stats?.runningMachines ?? '—'} sub={`更新于 ${fmtTime(stats?.at)}`} />
            <Stat label="快照" value={usage ? `${usage.snapshots}${usage.limits?.maxSnapshots ? ` / ${usage.limits.maxSnapshots}` : ''}` : '—'} sub={<span className="inline-flex items-center gap-1"><Camera size={11} /> 快照限额</span>} />
            <Stat label="已存数据" value={fmtBytes(usage?.storedBytes)} sub={`逻辑 ${fmtBytes(usage?.logicalBytes)}`} />
            <Stat label="磁盘配额" value={usage?.limits?.maxStoredGiB ? `${usage.limits.maxStoredGiB} GiB` : '无限制'} sub={<span className="inline-flex items-center gap-1"><Database size={11} /> {usage?.allocatedDiskGiB ? `已分配 ${usage.allocatedDiskGiB} GiB` : ''}</span>} />
            <Stat label="本月费用" value={cost != null ? `$${cost.toFixed(3)}` : '$0'} sub={<span className="inline-flex items-center gap-1"><Coins size={11} /> 运行+存储+流量</span>} />
          </div>

          <Card title={<Link to="/machines" className="hover:text-sky-400">沙箱</Link>} right={<Link to="/machines" className="text-xs text-sky-400 hover:underline">全部 →</Link>}>
            {machines.length === 0 ? (
              <div className="py-6 text-center text-sm text-dim">
                <Boxes size={28} className="mx-auto mb-2 opacity-40" />
                还没有沙箱，去 <Link to="/machines" className="text-sky-400 underline">沙箱页</Link> 创建第一台
              </div>
            ) : (
              <Table head={['名称', '状态', '规格', '模板', '创建时间']}>
                {machines.slice(0, 8).map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.03]">
                    <Td><Link to={`/machines/${m.id}`} className="text-sky-400 hover:underline">{m.name}</Link></Td>
                    <Td><Badge value={m.state} /></Td>
                    <Td className="mono text-xs">{m.spec.vcpus} vCPU / {(m.spec.memMiB / 1024).toFixed(0)} GiB</Td>
                    <Td className="mono text-xs">{m.template.id}</Td>
                    <Td className="text-xs text-dim">{fmtTime(m.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          {usage?.storage?.items?.length ? (
            <Card title="存储占用明细">
              <Table head={['对象', '名称', '占用']}>
                {usage.storage.items.map((it, i) => (
                  <tr key={i}>
                    <Td className="text-xs text-dim">{it.machineId ? (STATE_META.running ? '沙箱' : '沙箱') : '快照'}</Td>
                    <Td>{it.name || it.machineId || it.snapshotId}</Td>
                    <Td className="mono text-xs">{fmtBytes(it.storedBytes)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
