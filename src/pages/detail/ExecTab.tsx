/** 命令执行：exec + 历史记录 */
import { useEffect, useState } from 'react';
import { Play, History, Clock } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Field, Input, Textarea, ErrorBox, JsonView, Table, Td, Badge, Empty } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, ExecResult, ExecHistoryEntry } from '@/api/types';

export default function ExecTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [cmd, setCmd] = useState('uname -a && df -h /data');
  const [cwd, setCwd] = useState('');
  const [stdin, setStdin] = useState('');
  const [timeout, setTimeoutS] = useState('60');
  const [envs, setEnvs] = useState('');
  const [result, setResult] = useState<ExecResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<ExecHistoryEntry[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const running = m.state === 'running';

  const parseEnv = (s: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of s.split('\n')) {
      const l = line.trim(); const i = l.indexOf('=');
      if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
    return out;
  };

  const run = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const body: Parameters<typeof machinesApi.exec>[1] = { cmd, timeoutSeconds: Number(timeout) || 60 };
      if (cwd.trim()) body.cwd = cwd.trim();
      if (stdin) body.stdin = stdin;
      const ev = parseEnv(envs);
      if (Object.keys(ev).length) body.envs = ev;
      setResult(await machinesApi.exec(m.id, body));
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const loadHistory = async () => {
    setShowHistory(true);
    try { setHistory((await machinesApi.history(m.id, 50)).entries || []); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="space-y-3 xl:col-span-2">
        <Card title={t('exec.title')} right={<Button variant="ghost" className="!px-2" title={t('exec.history')} onClick={loadHistory}><History size={14} /></Button>}>
          <div className="space-y-2.5">
            <Field label={t('exec.cmd')} hint={t('exec.cmdHint')}>
              <Textarea rows={4} value={cmd} onChange={(e) => setCmd(e.target.value)} className="h-24 w-full" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('exec.cwd')}><Input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/data/home" className="mono w-full" /></Field>
              <Field label={t('exec.timeout')}><Input type="number" value={timeout} onChange={(e) => setTimeoutS(e.target.value)} className="w-full" /></Field>
            </div>
            <Field label={t('exec.envs')}>
              <Textarea rows={2} value={envs} onChange={(e) => setEnvs(e.target.value)} placeholder={'FOO=1'} className="w-full" />
            </Field>
            <Field label={t('exec.stdin')}><Textarea rows={2} value={stdin} onChange={(e) => setStdin(e.target.value)} className="w-full" /></Field>
            <Button variant="primary" onClick={run} loading={busy} disabled={!running || !cmd.trim()} className="w-full justify-center">
              <Play size={14} /> {t('exec.run')}
            </Button>
            {!running && <div className="text-xs text-amber-400">{t('exec.notRunning')}</div>}
          </div>
        </Card>

        {showHistory && (
          <Card title={t('exec.history')}>
            {!history?.length ? <Empty>{t('exec.noHistory')}</Empty> : (
              <Table head={[t('exec.cmd'), t('exec.output'), t('common.time')]}>
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-white/[0.03]">
                    <Td><button className="mono max-w-56 truncate text-left text-xs text-sky-400 hover:underline" onClick={() => setCmd(h.cmd || h.command || '')} title={h.cmd || h.command}>{h.cmd || h.command}</button></Td>
                    <Td>{h.exitCode != null && <Badge value={h.exitCode === 0 ? 'succeeded' : 'failed'}>{h.exitCode}</Badge>}</Td>
                    <Td className="text-xs text-dim"><Clock size={10} className="mr-1 inline" />{fmtTime(h.startedAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}
      </div>

      <div className="xl:col-span-3">
        <Card title={t('exec.output')}>
          <ErrorBox>{err}</ErrorBox>
          {!result ? <div className="py-8 text-center text-sm text-dim">{t('exec.outputHint')}</div> : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge value={result.exitCode === 0 ? 'succeeded' : 'failed'}>{t('exec.exitCode', { c: result.exitCode })}</Badge>
                {result.timedOut && <Badge value="failed">{t('exec.timedOut')}</Badge>}
                {result.signal && <Badge value="failed">{t('exec.signal', { s: result.signal })}</Badge>}
                {result.truncated && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">{t('exec.truncated')}</Badge>}
                {result.invalidUtf8 && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">{t('exec.nonUtf8')}</Badge>}
                {result.oomKilled && <Badge value="failed">{t('exec.oom')}</Badge>}
              </div>
              {result.stdout && (
                <div>
                  <div className="mb-1 text-xs font-medium text-dim">{t('exec.stdout')}</div>
                  <pre className="mono max-h-72 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-emerald-300/90">{result.stdout}</pre>
                </div>
              )}
              {result.stderr && (
                <div>
                  <div className="mb-1 text-xs font-medium text-dim">{t('exec.stderr')}</div>
                  <pre className="mono max-h-56 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-red-300/90">{result.stderr}</pre>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-dim">{t('exec.raw')}</summary>
                <JsonView data={result} max={200} />
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
