/** 日志：串口控制台（增量）+ 操作记录 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Badge, ErrorBox, Table, Td, Empty } from '@/components/ui';
import { fmtTime, OP_TYPE_ZH } from '@/utils/format';
import type { Machine, MachineLogs } from '@/api/types';

export default function LogsTab({ m }: { m: Machine }) {
  const [logs, setLogs] = useState<MachineLogs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);
  const cursorRef = useRef<number | null>(null);
  const bufRef = useRef<string[]>([]);

  const load = useCallback(async (reset = false) => {
    try {
      const after = reset ? undefined : cursorRef.current ?? undefined;
      const r = await machinesApi.logs(m.id, reset || after == null ? { tail: 500 } : { after: after as number });
      if (r.consoleReset) { cursorRef.current = null; bufRef.current = []; }
      if (after != null && !reset) {
        if (r.console) bufRef.current.push(r.console);
      } else {
        bufRef.current = r.console ? [r.console] : [];
      }
      cursorRef.current = r.cursor;
      setLogs(r);
      // 自动滚到底
      requestAnimationFrame(() => {
        if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
      });
    } catch (e) { setErr(errText(e)); }
  }, [m.id]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => load(false), 4000);
    return () => clearInterval(t);
  }, [auto, load]);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card
        className="xl:col-span-2"
        title={<span className="inline-flex items-center gap-1.5"><ScrollText size={15} /> 串口控制台（内核/systemd/错误）</span>}
        right={
          <>
            <label className="flex items-center gap-1.5 text-xs text-dim">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动刷新
            </label>
            <Button variant="ghost" className="!px-2" onClick={() => load(true)}><RefreshCw size={14} /></Button>
          </>
        }
      >
        <ErrorBox>{err}</ErrorBox>
        {logs?.consoleUnavailable && <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">无控制台输出：{logs.consoleUnavailable}</div>}
        <pre ref={preRef} className="mono h-[480px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-slate-300">
          {bufRef.current.join('') || '（暂无控制台输出）'}
        </pre>
        <div className="mt-1 text-[10px] text-dim">日志跨停止/暂停/重启保留在宿主机上 · 游标 {logs?.cursor ?? '—'}{logs?.consoleTruncated ? ' · 有更早输出未显示' : ''}</div>
      </Card>

      <Card title="最近操作">
        {!logs?.operations?.length ? <Empty>暂无操作记录</Empty> : (
          <Table head={['类型', '状态', '阶段', '时间']}>
            {logs.operations.map((op) => (
              <tr key={op.id}>
                <Td className="text-xs">{OP_TYPE_ZH[op.type] || op.type}</Td>
                <Td><Badge value={op.state} /></Td>
                <Td className="max-w-32 truncate text-xs text-dim" title={op.phase}>{op.phase || '—'}</Td>
                <Td className="text-xs text-dim">{fmtTime(op.updatedAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
