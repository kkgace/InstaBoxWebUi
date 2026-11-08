/** 日志：串口控制台（增量）+ 操作记录 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, Table, Td, Empty } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, MachineLogs } from '@/api/types';

export default function LogsTab({ m }: { m: Machine }) {
  const { t } = useT();
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
      requestAnimationFrame(() => {
        if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
      });
    } catch (e) { setErr(errText(e)); }
  }, [m.id]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => load(false), 4000);
    return () => clearInterval(timer);
  }, [auto, load]);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card
        className="xl:col-span-2"
        title={<span className="inline-flex items-center gap-1.5"><ScrollText size={15} /> {t('logs.console')}</span>}
        right={
          <>
            <label className="flex items-center gap-1.5 text-xs text-dim">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('logs.auto')}
            </label>
            <Button variant="ghost" className="!px-2" onClick={() => load(true)}><RefreshCw size={14} /></Button>
          </>
        }
      >
        <ErrorBox>{err}</ErrorBox>
        {logs?.consoleUnavailable && <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">{t('logs.unavailable', { r: logs.consoleUnavailable })}</div>}
        <pre ref={preRef} className="mono h-[480px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-slate-300">
          {bufRef.current.join('') || t('logs.empty')}
        </pre>
        <div className="mt-1 text-[10px] text-dim">{t('logs.footer', { c: logs?.cursor ?? '—' })}{logs?.consoleTruncated ? t('logs.moreEarly') : ''}</div>
      </Card>

      <Card title={t('logs.ops')}>
        {!logs?.operations?.length ? <Empty>{t('logs.noOps')}</Empty> : (
          <Table head={[t('common.actions'), t('common.status'), t('logs.colPhase'), t('common.time')]}>
            {logs.operations.map((op) => (
              <tr key={op.id}>
                <Td className="text-xs">{t(`op.${op.type}`) || op.type}</Td>
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
