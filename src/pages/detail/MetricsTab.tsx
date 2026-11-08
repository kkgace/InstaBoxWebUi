/** 监控：CPU/内存 30s 采样图表 + 磁盘使用 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Select, ErrorBox, Spinner, Empty } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Machine, MachineMetric, MachineDisk, MachineDiskFs } from '@/api/types';

const WINDOWS: { label: string; minutes?: number }[] = [
  { label: '近 10 分钟', minutes: 10 },
  { label: '近 1 小时', minutes: 60 },
  { label: '近 6 小时', minutes: 360 },
  { label: '近 24 小时', minutes: 1440 },
];

export default function MetricsTab({ m }: { m: Machine }) {
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
    time: new Date(s.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
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
      <div className="flex items-center gap-2">
        <Select value={win} onChange={(e) => setWin(e.target.value)} className="w-40">
          {WINDOWS.map((w) => <option key={w.label} value={w.minutes ?? ''}>{w.label}</option>)}
        </Select>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
        <span className="text-xs text-dim">每 30 秒一个采样点（暂停/停止期间无数据）</span>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {loading && !metrics.length ? <Spinner /> : metrics.length === 0 ? (
        <Card><Empty>该时间窗内没有采样数据（沙箱可能在暂停/停止，或刚创建）</Empty></Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="CPU / 内存使用率（%）">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2a3d" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8493ab' }} minTickGap={40} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#8493ab' }} />
                    <Tooltip contentStyle={{ background: '#111826', border: '1px solid #1f2a3d', fontSize: 12 }} formatter={(v) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="cpu" name="CPU" stroke="#38bdf8" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="mem" name="内存" stroke="#a78bfa" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {last && (
                <div className="mono mt-2 flex flex-wrap gap-x-4 text-xs text-dim">
                  <span>CPU {last.cpuUsedPct.toFixed(1)}% / {last.cpuCount} vCPU</span>
                  <span>内存 {fmtBytes(last.memUsed)} / {fmtBytes(last.memTotal)}（{last.memTotal ? ((last.memUsed / last.memTotal) * 100).toFixed(0) : '—'}%）</span>
                </div>
              )}
            </Card>

            <Card title="网络与磁盘 IO（字节/秒，90 秒平均）">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2a3d" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8493ab' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10, fill: '#8493ab' }} tickFormatter={fmtBps} width={72} />
                    <Tooltip contentStyle={{ background: '#111826', border: '1px solid #1f2a3d', fontSize: 12 }} formatter={(v) => fmtBps(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="netIn" name="网络入" stroke="#34d399" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="netOut" name="网络出" stroke="#fbbf24" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="diskR" name="磁盘读" stroke="#60a5fa" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="diskW" name="磁盘写" stroke="#f87171" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-xs text-dim">网络指标不含 SSH 与公网端口流量；宿主机未上报时为空</div>
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
  if (!disk) return null;
  const fs = (name: string, f?: MachineDiskFs) => {
    if (!f?.sizeBytes) return null;
    const used = f.usedBytes ?? 0;
    const pct = Math.round((used / f.sizeBytes) * 100);
    return (
      <div key={name} className="flex-1 rounded-lg border border-line bg-panel2 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{name}</span>
          <span className={pct >= 90 ? 'text-red-400' : pct >= 75 ? 'text-amber-400' : 'text-dim'}>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-white/5">
          <div className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="mono mt-1.5 text-xs text-dim">
          已用 {fmtBytes(used)} / 总 {fmtBytes(f.sizeBytes)} · 可用 {fmtBytes(f.availBytes)}
          {f.inodeUsedPct != null && ` · inode ${f.inodeUsedPct}%`}
        </div>
      </div>
    );
  };
  return (
    <Card title="磁盘使用">
      <div className="flex flex-wrap gap-3">
        {fs('/data（数据盘）', disk.data)}
        {fs('/（系统盘）', disk.root)}
      </div>
      {disk.warning && <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{disk.warning}</div>}
    </Card>
  );
}
