/** 用量与限额：总览、费用、按机器用量窗口 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { Card, Stat, Button, ErrorBox, Spinner, Table, Td, Empty, Input, Select } from '@/components/ui';
import { fmtBytes, fmtDuration } from '@/utils/format';
import type { Usage, OrgMachineUsage } from '@/api/types';

export default function Usage() {
  const { orgId } = useGlobal();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [byMachine, setByMachine] = useState<OrgMachineUsage[] | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try {
      setUsage(await miscApi.usage(orgId));
      const q = { org: orgId, from: from || undefined, to: to || undefined };
      const r = await miscApi.orgUsageMachines(q.org, q.from, q.to);
      setByMachine((r as { items?: OrgMachineUsage[] }).items || []);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [orgId, from, to]);
  useEffect(() => { load(); }, [load]);

  const lim = usage?.limits;
  const cost = usage?.cost;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">用量与限额</h1>
          <p className="text-xs text-dim">组织：{usage?.org?.name || orgId || '—'} · 计算于 {usage?.computedAt ? new Date(usage.computedAt).toLocaleString() : '—'}</p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {loading && !usage ? <Spinner /> : usage ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="沙箱数" value={`${usage.machines}${lim?.maxMachines ? ` / ${lim.maxMachines}` : ' / 无限'}`} sub="任意状态计数" />
            <Stat label="快照数" value={`${usage.snapshots}${lim?.maxSnapshots ? ` / ${lim.maxSnapshots}` : ' / 无限'}`} />
            <Stat label="已分配磁盘" value={`${usage.allocatedDiskGiB ?? 0} GiB`} sub={`限额 ${lim?.maxStoredGiB ? `${lim.maxStoredGiB} GiB` : '无限'}`} />
            <Stat label="存储占用" value={fmtBytes(usage.storedBytes)} sub={`逻辑 ${fmtBytes(usage.logicalBytes)}`} />
            <Stat label="本月总费用" value={cost?.costUSD != null ? `$${cost.costUSD.toFixed(4)}` : '—'} accent />
            <Stat label="默认规格" value={lim?.machineSpec ? `${lim.machineSpec.vcpus}C / ${lim.machineSpec.memMiB / 1024}G` : '—'} sub={(lim?.machineSpecs?.length ? `${lim.machineSpecs.length} 种可选` : '')} />
          </div>

          {cost && (
            <Card title="本月费用构成（USD）">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <FeeRow k="运行（vCPU+内存）" v={cost.runtimeUSD} />
                <FeeRow k="存储" v={cost.storageUSD} />
                <FeeRow k="流量" v={cost.egressUSD} />
                <FeeRow k="抵扣（credits）" v={cost.creditsUSD} />
              </div>
            </Card>
          )}

          <Card title="按机器用量（计费窗口，含已删除沙箱）"
            right={
              <div className="flex items-center gap-2 text-xs">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!py-1" />
                <span className="text-dim">至</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!py-1" />
                <Button className="!py-1" onClick={load}>查询</Button>
              </div>
            }>
            {!byMachine?.length ? <Empty>该窗口内无用量</Empty> : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byMachine.map((x) => ({ name: x.name || x.machineId.slice(0, 8), hours: Number((x.runningSeconds / 3600).toFixed(1)) }))}>
                      <CartesianGrid stroke="#1f2a3d" strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8493ab' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#8493ab' }} width={40} />
                      <Tooltip contentStyle={{ background: '#111826', border: '1px solid #1f2a3d', fontSize: 12 }} />
                      <Bar dataKey="hours" name="运行小时" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table head={['沙箱', '运行时长', 'vCPU 秒', '内存 GiB 秒', '磁盘 GiB 秒', '出站流量', '费用']}>
                  {byMachine.map((x) => (
                    <tr key={x.machineId} className="hover:bg-white/[0.03]">
                      <Td className="text-xs">{x.name || x.machineId}{x.deletedAt && <span className="ml-1 text-red-400">（已删除）</span>}</Td>
                      <Td className="text-xs">{fmtDuration(x.runningSeconds)}</Td>
                      <Td className="mono text-xs">{(x.vcpuSeconds / 3600).toFixed(1)} h</Td>
                      <Td className="mono text-xs">{(x.memGiBSeconds / 3600).toFixed(1)} h</Td>
                      <Td className="mono text-xs">{(x.diskGiBSeconds / 3600).toFixed(1)} h</Td>
                      <Td className="mono text-xs">{fmtBytes(x.egressBytes)}</Td>
                      <Td className="mono text-xs">{x.costUSD != null ? `$${x.costUSD.toFixed(4)}` : '—'}</Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Card>

          <Card title="允许的规格">
            <div className="flex flex-wrap gap-2">
              {(lim?.machineSpecs || []).map((s) => (
                <span key={`${s.vcpus}/${s.memMiB}`} className="mono rounded border border-line bg-panel2 px-2 py-1 text-xs">
                  {s.vcpus} vCPU / {s.memMiB / 1024} GiB{s.rootDiskGiB ? ` / root ${s.rootDiskGiB}G` : ''}
                </span>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function FeeRow({ k, v }: { k: string; v?: number }) {
  return (
    <div className="rounded-lg border border-line bg-panel2 p-3">
      <div className="text-xs text-dim">{k}</div>
      <div className="mt-1 text-lg font-semibold">{v != null ? `$${v.toFixed(4)}` : '—'}</div>
    </div>
  );
}
