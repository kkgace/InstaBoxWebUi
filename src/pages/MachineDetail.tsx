/** 沙箱详情页：轮询状态 + 多 Tab */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Badge, Button, Spinner, ErrorBox, Tabs } from '@/components/ui';
import { fmtBytes } from '@/utils/format';
import type { Machine } from '@/api/types';
import Overview from './detail/Overview';
import TerminalTab from './detail/TerminalTab';
import FilesTab from './detail/FilesTab';
import ExecTab from './detail/ExecTab';
import ProcsTab from './detail/ProcsTab';
import DesktopTab from './detail/DesktopTab';
import PortsTab from './detail/PortsTab';
import SnapshotTab from './detail/SnapshotTab';
import LogsTab from './detail/LogsTab';
import MetricsTab from './detail/MetricsTab';
import SshTab from './detail/SshTab';
import SecretsTab from './detail/SecretsTab';
import SettingsTab from './detail/SettingsTab';

export default function MachineDetail() {
  const { id = '' } = useParams();
  const { t } = useT();
  const [m, setM] = useState<Machine | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setM(await machinesApi.get(id));
      setErr(null);
    } catch (e) { setErr(errText(e)); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // 状态未稳定时每 4s 轮询；稳定后 15s
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const busy = m && ['running', 'stopped', 'suspended'].includes(m.state) && !m.operationId;
    pollRef.current = setInterval(load, busy ? 15000 : 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [m, load]);

  if (err && !m) {
    return (
      <div className="space-y-3">
        <ErrorBox>{err}</ErrorBox>
        <Link to="/machines" className="text-sm text-sky-400 hover:underline">← {t('nav.machines')}</Link>
      </div>
    );
  }
  if (!m) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/machines" className="rounded p-1.5 text-dim hover:bg-white/5 hover:text-slate-200"><ArrowLeft size={18} /></Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold">{m.name}</h1>
            <Badge value={m.state} />
            {m.operationId && <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">{t('ml.opInProgress')}</Badge>}
            {m.free && <Badge className="border-line">free</Badge>}
          </div>
          <div className="mono mt-0.5 text-xs text-dim">{m.id} · {m.template.id}@{m.template.version} · {m.spec.vcpus} vCPU / {(m.spec.memMiB / 1024).toFixed(0)} GiB / {fmtBytes((m as unknown as { storage?: { sizeBytes?: number } }).storage?.sizeBytes)}</div>
        </div>
        <div className="ml-auto"><Button variant="ghost" onClick={load}><RefreshCw size={14} /></Button></div>
      </div>

      <ErrorBox>{err}</ErrorBox>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: t('tab.overview') },
          { key: 'terminal', label: t('tab.terminal') },
          { key: 'files', label: t('tab.files') },
          { key: 'exec', label: t('tab.exec') },
          { key: 'procs', label: t('tab.procs') },
          { key: 'desktop', label: t('tab.desktop') },
          { key: 'ports', label: t('tab.ports') },
          { key: 'snapshot', label: t('tab.snapshot') },
          { key: 'logs', label: t('tab.logs') },
          { key: 'metrics', label: t('tab.metrics') },
          { key: 'ssh', label: t('tab.ssh') },
          { key: 'secrets', label: t('tab.secrets') },
          { key: 'settings', label: t('tab.settings') },
        ]}
      />

      {tab === 'overview' && <Overview m={m} reload={load} />}
      {tab === 'terminal' && <TerminalTab m={m} />}
      {tab === 'files' && <FilesTab m={m} />}
      {tab === 'exec' && <ExecTab m={m} />}
      {tab === 'procs' && <ProcsTab m={m} />}
      {tab === 'desktop' && <DesktopTab m={m} />}
      {tab === 'ports' && <PortsTab m={m} />}
      {tab === 'snapshot' && <SnapshotTab m={m} reload={load} />}
      {tab === 'logs' && <LogsTab m={m} />}
      {tab === 'metrics' && <MetricsTab m={m} />}
      {tab === 'ssh' && <SshTab m={m} />}
      {tab === 'secrets' && <SecretsTab m={m} />}
      {tab === 'settings' && <SettingsTab m={m} reload={load} />}
    </div>
  );
}
