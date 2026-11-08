/** 命令执行：exec + 历史记录 */
import { useEffect, useState } from 'react';
import { Play, History, Trash, Clock } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Field, Input, Textarea, ErrorBox, JsonView, Table, Td, Badge, Empty } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, ExecResult, ExecHistoryEntry } from '@/api/types';

export default function ExecTab({ m }: { m: Machine }) {
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
      const t = line.trim(); const i = t.indexOf('=');
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
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
      const r = await machinesApi.exec(m.id, body);
      setResult(r);
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
        <Card title="执行命令" right={<Button variant="ghost" className="!px-2" title="执行历史" onClick={loadHistory}><History size={14} /></Button>}>
          <div className="space-y-2.5">
            <Field label="命令（bash -lc）" hint="以沙箱用户 user 运行，HOME=/data/home">
              <Textarea rows={4} value={cmd} onChange={(e) => setCmd(e.target.value)} className="h-24 w-full" spellCheck={false} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="工作目录（可选）"><Input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/data/home" className="mono w-full" /></Field>
              <Field label={'超时（秒，\u2264600）'}><Input type="number" value={timeout} onChange={(e) => setTimeoutS(e.target.value)} className="w-full" /></Field>
            </div>
            <Field label="环境变量（可选，每行 K=V）">
              <Textarea rows={2} value={envs} onChange={(e) => setEnvs(e.target.value)} placeholder={'FOO=1'} className="w-full" />
            </Field>
            <Field label="stdin（可选）"><Textarea rows={2} value={stdin} onChange={(e) => setStdin(e.target.value)} className="w-full" /></Field>
            <Button variant="primary" onClick={run} loading={busy} disabled={!running || !cmd.trim()} className="w-full justify-center">
              <Play size={14} /> 执行
            </Button>
            {!running && <div className="text-xs text-amber-400">沙箱未运行</div>}
          </div>
        </Card>

        {showHistory && (
          <Card title="执行历史（最近 50 条）">
            {!history?.length ? <Empty>暂无记录</Empty> : (
              <Table head={['命令', '退出码', '时间']}>
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
        <Card title="输出">
          <ErrorBox>{err}</ErrorBox>
          {!result ? <div className="py-8 text-center text-sm text-dim">执行后此处显示 stdout / stderr / 退出码</div> : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge value={result.exitCode === 0 ? 'succeeded' : 'failed'}>退出码 {result.exitCode}</Badge>
                {result.timedOut && <Badge value="failed">超时被杀</Badge>}
                {result.signal && <Badge value="failed">信号 {result.signal}</Badge>}
                {result.truncated && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">{'输出被截断（>1MiB）'}</Badge>}
                {result.invalidUtf8 && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">含非 UTF-8 字节</Badge>}
                {result.oomKilled && <Badge value="failed">OOM</Badge>}
              </div>
              {result.stdout && (
                <div>
                  <div className="mb-1 text-xs font-medium text-dim">stdout</div>
                  <pre className="mono max-h-72 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-emerald-300/90">{result.stdout}</pre>
                </div>
              )}
              {result.stderr && (
                <div>
                  <div className="mb-1 text-xs font-medium text-dim">stderr</div>
                  <pre className="mono max-h-56 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-red-300/90">{result.stderr}</pre>
                </div>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-dim">原始 JSON</summary>
                <JsonView data={result} max={200} />
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
