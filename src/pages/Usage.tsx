/** 用量与限额：总览、费用、按机器用量窗口 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Stat, Button, ErrorBox, Spinner, Table, Td, Empty, Input } from '@/components/ui';
import { fmtBytes, fmtDuration } from '@/utils/format';
import type { Usage, OrgMachineUsage } from '@/api/types';

export default function Usage() {
  const { orgId } = useGlobal();
  const { t } = useT();
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
      const r = await miscApi.orgUsageMachines(orgId, from || undefined, to || undefined);
      setByMachine((r as { items?: OrgMachineUsage[] }).items || []);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [orgId, from, to]);
  useEffect(() => { load(); }, [load]);

  const lim = usage?.limits;
  const cost = usage?.cost;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{t('usage.title')}</h1>
          <p className="text-xs text-dim">{t('usage.org', { o: usage?.org?.name || orgId || '—', t: usage?.computedAt ? new Date(usage.computedAt).toLocaleString() : '—' })}</p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {loading && !usage ? <Spinner /> : usage ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label={t('usage.machines')} value={`${usage.machines}${lim?.maxMachines ? ` / ${lim.maxMachines}` : ` / ${t('usage.unlimited')}`}`} sub={t('usage.anyState')} />
            <Stat label={t('usage.snapshots')} value={`${usage.snapshots}${lim?.maxSnapshots ? ` / ${lim.maxSnapshots}` : ` / ${t('usage.unlimited')}`}`} />
            <Stat label={t('usage.allocated')} value={`${usage.allocatedDiskGiB ?? 0} GiB`} sub={lim?.maxStoredGiB ? t('usage.quota', { n: lim.maxStoredGiB }) : t('usage.unlimited')} />
            <Stat label={t('usage.stored')} value={fmtBytes(usage.storedBytes)} sub={t('dash.logical', { s: fmtBytes(usage.logicalBytes) })} />
            <Stat label={t('usage.monthCost')} value={cost?.costUSD != null ? `$${cost.costUSD.toFixed(4)}` : '—'} accent />
            <Stat label={t('usage.defaultSpec')} value={lim?.machineSpec ? `${lim.machineSpec.vcpus}C / ${lim.machineSpec.memMiB / 1024}G` : '—'} sub={lim?.machineSpecs?.length ? t('usage.nSpecs', { n: lim.machineSpecs.length }) : ''} />
          </div>

          {cost && (
            <Card title="USD">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <FeeRow k={t('usage.feeRuntime')} v={cost.runtimeUSD} />
                <FeeRow k={t('usage.feeStorage')} v={cost.storageUSD} />
                <FeeRow k={t('usage.feeEgress')} v={cost.egressUSD} />
                <FeeRow k={t('usage.feeCredits')} v={cost.creditsUSD} />
              </div>
            </Card>
          )}

          <Card title={t('usage.byMachine')}
            right={
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!py-1" />
                <span className="text-dim">{t('usage.to')}</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!py-1" />
                <Button className="!py-1" onClick={load}>{t('usage.query')}</Button>
              </div>
            }>
            {!byMachine?.length ? <Empty>{t('usage.noUse')}</Empty> : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byMachine.map((x) => ({ name: x.name || x.machineId.slice(0, 8), hours: Number((x.runningSeconds / 3600).toFixed(1)) }))}>
                      <CartesianGrid stroke="#1f2a3d" strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8493ab' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#8493ab' }} width={40} />
                      <Tooltip contentStyle={{ background: '#111826', border: '1px solid #1f2a3d', fontSize: 12 }} />
                      <Bar dataKey="hours" name={t('usage.colRunHours')} fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table head={[t('nav.machines'), t('ml.colTimers'), t('usage.colVcpu'), t('usage.colMem'), t('usage.colDisk'), t('usage.colEgress'), t('usage.colCost')]}>
                  {byMachine.map((x) => (
                    <tr key={x.machineId} className="hover:bg-white/[0.03]">
                      <Td className="text-xs">{x.name || x.machineId}{x.deletedAt && <span className="ml-1 text-red-400">{t('usage.deleted')}</span>}</Td>
                      <Td className="text-xs">{fmtDuration(x.runningSeconds)}</Td>
                      <Td className="mono text-xs">{t('usage.h', { n: (x.vcpuSeconds / 3600).toFixed(1) })}</Td>
                      <Td className="mono text-xs">{t('usage.h', { n: (x.memGiBSeconds / 3600).toFixed(1) })}</Td>
                      <Td className="mono text-xs">{t('usage.h', { n: (x.diskGiBSeconds / 3600).toFixed(1) })}</Td>
                      <Td className="mono text-xs">{fmtBytes(x.egressBytes)}</Td>
                      <Td className="mono text-xs">{x.costUSD != null ? `$${x.costUSD.toFixed(4)}` : '—'}</Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Card>

          <Card title={t('usage.specList')}>
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
