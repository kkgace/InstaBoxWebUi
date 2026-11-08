/** 监控：CPU/内存 30s 采样图表 + 网络与磁盘 IO + 磁盘使用 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Select, ErrorBox, Spinner, Empty } from '@/components/ui';
import { fmtBytes } from '@/utils/format';
import type { Machine, MachineMetric, MachineDisk, MachineDiskFs } from '@/api/types';

const WINDOWS: { key: string; minutes: number }[] = [
  { key: 'met.w10', minutes: 10 },
  { key: 'met.w60', minutes: 60 },
  { key: 'met.w360', minutes: 360 },
  { key: 'met.w1440', minutes: 1440 },
];

export default function MetricsTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [win, setWin] = useState('60');
  const [metrics, setMetrics] = useState<MachineMetric[]>([]);
  const [disk, setDisk] = useState<MachineDisk | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const minutes = Number(win);
      const since = new Date(Date.now() - minutes * 60000).toISOString();
      const r = await machinesApi.metrics(m.id, since);
      setMetrics(r.metrics || []);
      setDisk(r.disk || null);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [m.id, win]);
  useEffect(() => { load(); }, [load]);

  const data = metrics.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    cpu: s.cpuUsedPct != null ? Number(s.cpuUsedPct.toFixed(1)) : null,
    mem: s.memTotal ? Number(((s.memUsed / s.memTotal) * 100).toFixed(1)) : null,
    netIn: s.netInBytesPerSec ?? null,
    netOut: s.netOutBytesPerSec ?? null,
    diskR: s.diskReadBytesPerSec ?? null,
    diskW: s.diskWriteBytesPerSec ?? null,
  }));

  const last = metrics[metrics.length - 1];
  const fallbackDisk = last && last.diskTotal && !disk ? {
    data: { usedBytes: last.diskUsed, sizeBytes: last.diskTotal },
  } as MachineDisk : null;
  const diskData = disk || fallbackDisk;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={win} onChange={(e) => setWin(e.target.value)} className="w-44">
          {WINDOWS.map((w) => <option key={w.key} value={w.minutes}>{t(w.key)}</option>)}
        </Select>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
        <span className="text-xs text-dim">{t('met.sample')}</span>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {loading && !metrics.length ? <Spinner /> : metrics.length === 0 ? (
        <Card><Empty>{t('met.noData')}</Empty></Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title={t('met.cpuMem')}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2a3d" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8493ab' }} minTickGap={40} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#8493ab' }} />
                    <Tooltip contentStyle={{ background: '#111826', border: '1px solid #1f2a3d', fontSize: 12 }} formatter={(v) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="cpu" name={t('met.cpu')} stroke="#38bdf8" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="mem" name={t('met.mem')} stroke="#a78bfa" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {last && (
                <div className="mono mt-2 flex flex-wrap gap-x-4 text-xs text-dim">
                  <span>CPU {last.cpuUsedPct.toFixed(1)}% / {last.cpuCount} vCPU</span>
                  <span>{t('met.mem')} {fmtBytes(last.memUsed)} / {fmtBytes(last.memTotal)}（{last.memTotal ? ((last.memUsed / last.memTotal) * 100).toFixed(0) : '—'}%）</span>
                </div>
              )}
            </Card>

            <Card title={t('met.netIo')}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2a3d" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8493ab' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10, fill: '#8493ab' }} tickFormatter={fmtBps} width={72} />
                    <Tooltip contentStyle={{ background: '#111826', border: '1px solid #1f2a3d', fontSize: 12 }} formatter={(v) => fmtBps(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="netIn" name={t('met.netIn')} stroke="#34d399" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="netOut" name={t('met.netOut')} stroke="#fbbf24" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="diskR" name={t('met.diskR')} stroke="#60a5fa" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="diskW" name={t('met.diskW')} stroke="#f87171" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-xs text-dim">{t('met.netHint')}</div>
            </Card>
          </div>
          <DiskCard disk={diskData} />
        </>
      )}
    </div>
  );
}

function fmtBps(v: number): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (v < 1024) return `${Math.round(v)} B/s`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)} KB/s`;
  if (v < 1073741824) return `${(v / 1048576).toFixed(1)} MB/s`;
  return `${(v / 1073741824).toFixed(2)} GB/s`;
}

function DiskCard({ disk }: { disk: MachineDisk | null }) {
  const { t } = useT();
  if (!disk) return null;
  const fs = (name: string, f?: MachineDiskFs) => {
    if (!f?.sizeBytes) return null;
    const used = f.usedBytes ?? 0;
    const pct = Math.round((used / f.sizeBytes) * 100);
    return (
      <div key={name} className="min-w-64 flex-1 rounded-lg border border-line bg-panel2 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{name}</span>
          <span className={pct >= 90 ? 'text-red-400' : pct >= 75 ? 'text-amber-400' : 'text-dim'}>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-white/5">
          <div className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="mono mt-1.5 text-xs text-dim">
          {t('met.used', { u: fmtBytes(used), t: fmtBytes(f.sizeBytes), a: fmtBytes(f.availBytes) })}
          {f.inodeUsedPct != null ? t('met.inodes', { i: f.inodeUsedPct }) : ''}
        </div>
      </div>
    );
  };
  return (
    <Card title={t('met.diskUse')}>
      <div className="flex flex-wrap gap-3">
        {fs(t('met.dataDisk'), disk.data)}
        {fs(t('met.rootDisk'), disk.root)}
      </div>
      {disk.warning && <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{disk.warning}</div>}
    </Card>
  );
}
