/** 机器级 Secrets：投递状态查看、选择（proxy）、env/direct 列表、刷新投递 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Save } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Field, Textarea } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, MachineSecrets, Secret } from '@/api/types';

export default function SecretsTab({ m }: { m: Machine }) {
  const { orgId } = useGlobal();
  const [ms, setMs] = useState<MachineSecrets | null>(null);
  const [orgSecrets, setOrgSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 表单状态
  const [selAll, setSelAll] = useState(false);
  const [selNames, setSelNames] = useState<string[]>([]);
  const [envSecrets, setEnvSecrets] = useState('');
  const [direct, setDirect] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [a, b] = await Promise.allSettled([
        machinesApi.secrets(m.id),
        orgId ? miscApi.orgSecrets(orgId) : Promise.resolve({ secrets: [] as Secret[] }),
      ]);
      if (a.status === 'fulfilled') {
        const v = a.value;
        setMs(v);
        setSelAll(v.secrets === 'all');
        setSelNames(Array.isArray(v.secrets) ? v.secrets : []);
        setEnvSecrets((v.envSecrets || []).join('\n'));
        setDirect((v.directSecrets || []).map((d) => `${d.secret}${d.env ? ` → env:${d.env}` : ''}${d.file ? ` → file:${d.file}` : ''}`).join('\n'));
      } else setErr(errText(a.reason));
      if (b.status === 'fulfilled') setOrgSecrets((b.value as { secrets?: Secret[] }).secrets || []);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [m.id, orgId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr(null); setOk(null);
    try {
      const body: Parameters<typeof machinesApi.updateSecrets>[1] = {};
      if (selAll) body.secrets = 'all';
      else body.secrets = selNames;
      const envList = envSecrets.split('\n').map((s) => s.trim()).filter(Boolean);
      if (envList.length || envSecrets.trim() === '') body.envSecrets = envList;
      const dirList = direct.split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
        const [secret, ...rest] = line.split(/\s+→\s+/);
        const d: { secret: string; env?: string; file?: string } = { secret };
        for (const r of rest) {
          if (r.startsWith('env:')) d.env = r.slice(4);
          if (r.startsWith('file:')) d.file = r.slice(5);
        }
        return d;
      });
      if (direct.trim() === '') body.directSecrets = [];
      else if (!envList.length) body.directSecrets = dirList;
      await machinesApi.updateSecrets(m.id, body);
      setOk('Secret 选择已保存');
      load();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const refreshDelivery = async () => {
    setBusy(true); setErr(null); setOk(null);
    try { await machinesApi.refreshSecrets(m.id); setOk('已触发 Secret 重新投递（已运行的进程需自行重载环境变量）'); load(); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  if (loading) return <Spinner />;
  if (err && !ms) return <ErrorBox>{err}（Secrets 功能可能在此服务器未开放）</ErrorBox>;

  const proxyOrgSecrets = orgSecrets.filter((s) => s.delivery === 'proxy');
  const envOrgSecrets = orgSecrets.filter((s) => s.delivery === 'env');

  return (
    <div className="space-y-4">
      <div className="text-sm text-dim">
        组织 Secret 分两类投递：<b className="text-slate-300">proxy</b>（机器看到占位符，出站 HTTPS 代理替换真实值，值不落地）与
        <b className="text-slate-300">env</b>（直接注入环境变量/文件）。本页管理这台机器接收哪些 Secret。
      </div>
      <ErrorBox>{err}</ErrorBox>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Proxy Secret 选择">
          {proxyOrgSecrets.length === 0 ? <Empty>组织内暂无 proxy Secret</Empty> : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selAll} onChange={(e) => { setSelAll(e.target.checked); if (e.target.checked) setSelNames([]); }} />
                全部（含未来新增）
              </label>
              {!selAll && proxyOrgSecrets.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selNames.includes(s.name)}
                    onChange={(e) => setSelNames((p) => e.target.checked ? [...p, s.name] : p.filter((n) => n !== s.name))}
                  />
                  <span className="mono">{s.name}</span>
                  <span className="text-xs text-dim">v{s.version} · {s.hosts?.length ? s.hosts.join(', ') : '所有目标'}</span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card title="Env / Direct Secret 引用">
          <div className="space-y-3">
            <Field label="env Secrets（每行一个名称，空 = 清除）">
              <Textarea rows={3} value={envSecrets} onChange={(e) => setEnvSecrets(e.target.value)} placeholder={'API_TOKEN\nDB_PASSWORD'} className="w-full" />
            </Field>
            {envOrgSecrets.length > 0 && (
              <div className="text-xs text-dim">可用的 env Secret：{envOrgSecrets.map((s) => s.name).join('、')}</div>
            )}
            <Field label="Direct Secret（每行：名称 → env:VAR 或 file:path，可同时）" hint="真实值经登录 shell 导出或符号链接到文件">
              <Textarea rows={3} value={direct} onChange={(e) => setDirect(e.target.value)} placeholder={'DB_URL → env:DATABASE_URL\nCERT → file:.config/cert.pem'} className="w-full" />
            </Field>
          </div>
        </Card>
      </div>

      <Card title="投递状态" right={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load}><RefreshCw size={14} /></Button>
          <Button onClick={refreshDelivery} loading={busy} disabled={m.state !== 'running'}><KeyRound size={14} /> 刷新投递</Button>
          <Button variant="primary" onClick={save} loading={busy}><Save size={14} /> 保存选择</Button>
        </div>
      }>
        {!ms?.items?.length ? <Empty>未选择任何 Secret</Empty> : (
          <Table head={['名称', '投递方式', '版本', '状态', '更新时间']}>
            {ms.items.map((s) => (
              <tr key={s.id}>
                <Td className="mono text-xs">{s.name}</Td>
                <Td>{s.delivery === 'proxy' ? <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">proxy</Badge> : <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300">env</Badge>}</Td>
                <Td className="text-xs">v{s.version}</Td>
                <Td className="text-xs">{s.status || '—'}</Td>
                <Td className="text-xs text-dim">{fmtTime(s.updatedAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {ok && <div className="mt-3"><OkBox>{ok}</OkBox></div>}
      </Card>
    </div>
  );
}
