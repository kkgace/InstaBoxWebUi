/** 总览：账户、统计、用量卡片、沙箱速览 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Camera, Database, Coins, RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Stat, Badge, Button, Spinner, Table, Td } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Machine, Usage, Stats } from '@/api/types';

export default function Dashboard() {
  const { me, orgId } = useGlobal();
  const { t } = useT();
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
          <h1 className="text-lg font-bold">{t('dash.title')}</h1>
          <p className="text-xs text-dim">
            {me ? `${me.login}${me.email ? ` · ${me.email}` : ''}${t('dash.computedAt', { t: fmtTime(usage?.computedAt) })}` : ' '}
          </p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
      </div>

      {err && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
      {loading && !usage ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label={t('dash.running')} value={running} sub={t('dash.total', { n: machines.length })} accent />
            <Stat label={t('dash.platform')} value={stats?.runningMachines ?? '—'} sub={t('dash.updatedAt', { t: fmtTime(stats?.at) })} />
            <Stat label={t('dash.snapshots')} value={usage ? `${usage.snapshots}${usage.limits?.maxSnapshots ? ` / ${usage.limits.maxSnapshots}` : ''}` : '—'} sub={<span className="inline-flex items-center gap-1"><Camera size={11} /> {t('dash.snapQuota')}</span>} />
            <Stat label={t('dash.stored')} value={fmtBytes(usage?.storedBytes)} sub={t('dash.logical', { s: fmtBytes(usage?.logicalBytes) })} />
            <Stat label={t('dash.diskQuota')} value={usage?.limits?.maxStoredGiB ? `${usage.limits.maxStoredGiB} GiB` : t('usage.unlimited')} sub={<span className="inline-flex items-center gap-1"><Database size={11} /> {usage?.allocatedDiskGiB ? t('dash.allocated', { n: usage.allocatedDiskGiB }) : ''}</span>} />
            <Stat label={t('dash.monthCost')} value={cost != null ? `$${cost.toFixed(3)}` : '$0'} sub={<span className="inline-flex items-center gap-1"><Coins size={11} /> {t('dash.costSub')}</span>} />
          </div>

          <Card title={<Link to="/machines" className="hover:text-sky-400">{t('nav.machines')}</Link>} right={<Link to="/machines" className="text-xs text-sky-400 hover:underline">{t('dash.allMachines')}</Link>}>
            {machines.length === 0 ? (
              <div className="py-6 text-center text-sm text-dim">
                <Boxes size={28} className="mx-auto mb-2 opacity-40" />
                {t('dash.noSandbox')} <Link to="/machines" className="text-sky-400 underline">{t('dash.noSandbox2')}</Link> {t('dash.noSandbox3')}
              </div>
            ) : (
              <Table head={[t('ml.colName'), t('common.status'), t('ml.colSpec'), t('ml.colTemplate'), t('common.createdAt')]}>
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
            <Card title={t('dash.storageDetail')}>
              <Table head={['', t('common.name'), t('dash.stored')]}>
                {usage.storage.items.map((it, i) => (
                  <tr key={i}>
                    <Td className="text-xs text-dim">{it.machineId ? t('dash.objMachine') : t('dash.objSnapshot')}</Td>
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
