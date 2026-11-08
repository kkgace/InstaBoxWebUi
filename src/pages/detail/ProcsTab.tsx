/** 进程列表 + kill */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Skull } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Table, Td, Badge, ErrorBox, Input, Confirm, Spinner } from '@/components/ui';
import { fmtDuration, fmtTime } from '@/utils/format';
import type { Machine, ProcessList } from '@/api/types';

export default function ProcsTab({ m }: { m: Machine }) {
  const [pl, setPl] = useState<ProcessList | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [killPid, setKillPid] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setPl(await machinesApi.processes(m.id)); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [m.id]);
  useEffect(() => { load(); }, [load]);

  const doKill = async (pid: number) => {
    try {
      await machinesApi.exec(m.id, { cmd: `kill ${pid}` });
      setTimeout(load, 500);
    } catch (e) { setErr(errText(e)); }
  };

  const procs = (pl?.processes || []).filter((p) =>
    !filter || p.command.toLowerCase().includes(filter.toLowerCase()) || String(p.pid).includes(filter));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="按命令/PID 过滤…" className="w-56" />
        {pl && (
          <span className="text-xs text-dim">
            共 {pl.processes.length} 个进程 · {pl.live ? '实时' : '最后快照'} · 采集于 {fmtTime(pl.capturedAt)}
            {pl.truncated && '（已截断）'}
          </span>
        )}
      </div>
      <ErrorBox>{err}</ErrorBox>
      {loading && !pl ? <Spinner /> : (
        <Card>
          <Table head={['PID', 'PPID', '用户', 'CPU%', '内存%', '运行时长', '命令', '']}>
            {procs.map((p) => (
              <tr key={p.pid} className="hover:bg-white/[0.03]">
                <Td className="mono text-xs">{p.pid}</Td>
                <Td className="mono text-xs text-dim">{p.ppid}</Td>
                <Td className="text-xs">{p.user}</Td>
                <Td><span className={p.cpuPercent > 50 ? 'text-amber-400' : ''}>{p.cpuPercent.toFixed(1)}</span></Td>
                <Td><span className={p.memPercent > 50 ? 'text-amber-400' : ''}>{p.memPercent.toFixed(1)}</span></Td>
                <Td className="text-xs text-dim">{fmtDuration(p.elapsedSeconds)}</Td>
                <Td className="mono max-w-md truncate text-xs" title={p.command}>{p.command}</Td>
                <Td>
                  <Button className="!px-1.5 !py-0.5" variant="danger" onClick={() => setKillPid(p.pid)} title="结束进程">
                    <Skull size={12} />
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Confirm
        open={killPid != null} onClose={() => setKillPid(null)}
        onConfirm={() => killPid != null && doKill(killPid)}
        title={`结束进程 ${killPid ?? ''}`}
        message="将向该进程发送 SIGTERM。"
        confirmText="结束" danger
      />
    </div>
  );
}
