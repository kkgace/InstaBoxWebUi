/** 机器级 Secrets：选择（proxy）、env/direct 列表、投递状态、刷新 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Save } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Field, Textarea } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, MachineSecrets, Secret } from '@/api/types';

export default function SecretsTab({ m }: { m: Machine }) {
  const { orgId } = useGlobal();
  const { t } = useT();
  const [ms, setMs] = useState<MachineSecrets | null>(null);
  const [orgSecrets, setOrgSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      body.secrets = selAll ? 'all' : selNames;
      const envList = envSecrets.split('\n').map((s) => s.trim()).filter(Boolean);
      body.envSecrets = envList;
      if (direct.trim() === '') {
        body.directSecrets = [];
      } else {
        body.directSecrets = direct.split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
          const [secret, ...rest] = line.split(/\s+→\s+/);
          const d: { secret: string; env?: string; file?: string } = { secret };
          for (const r of rest) {
            if (r.startsWith('env:')) d.env = r.slice(4);
            if (r.startsWith('file:')) d.file = r.slice(5);
          }
          return d;
        });
      }
      await machinesApi.updateSecrets(m.id, body);
      setOk(t('msec.saved'));
      load();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const refreshDelivery = async () => {
    setBusy(true); setErr(null); setOk(null);
    try { await machinesApi.refreshSecrets(m.id); setOk(t('msec.refreshed')); load(); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  if (loading) return <Spinner />;
  if (err && !ms) return <ErrorBox>{err}{t('msec.unavailable')}</ErrorBox>;

  const proxyOrgSecrets = orgSecrets.filter((s) => s.delivery === 'proxy');
  const envOrgSecrets = orgSecrets.filter((s) => s.delivery === 'env');

  return (
    <div className="space-y-4">
      <div className="text-sm text-dim">
        {t('msec.desc1')}<b className="text-slate-300">{t('msec.descProxy')}</b>{t('msec.descProxy2')}<b className="text-slate-300">{t('msec.descEnv')}</b>{t('msec.descEnv2')}
      </div>
      <ErrorBox>{err}</ErrorBox>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('msec.proxySel')}>
          {proxyOrgSecrets.length === 0 ? <Empty>{t('msec.none', { d: 'proxy' })}</Empty> : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selAll} onChange={(e) => { setSelAll(e.target.checked); if (e.target.checked) setSelNames([]); }} />
                {t('msec.allInc')}
              </label>
              {!selAll && proxyOrgSecrets.map((s) => (
                <label key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selNames.includes(s.name)}
                    onChange={(e) => setSelNames((p) => e.target.checked ? [...p, s.name] : p.filter((n) => n !== s.name))}
                  />
                  <span className="mono">{s.name}</span>
                  <span className="text-xs text-dim">v{s.version} · {s.hosts?.length ? s.hosts.join(', ') : t('msec.hosts')}</span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('msec.refs')}>
          <div className="space-y-3">
            <Field label={t('msec.envList')}>
              <Textarea rows={3} value={envSecrets} onChange={(e) => setEnvSecrets(e.target.value)} placeholder={'API_TOKEN\nDB_PASSWORD'} className="w-full" />
            </Field>
            {envOrgSecrets.length > 0 && (
              <div className="text-xs text-dim">{t('msec.available', { n: envOrgSecrets.map((s) => s.name).join(', ') })}</div>
            )}
            <Field label={t('msec.directList')} hint={t('msec.directHint')}>
              <Textarea rows={3} value={direct} onChange={(e) => setDirect(e.target.value)} placeholder={'DB_URL → env:DATABASE_URL\nCERT → file:.config/cert.pem'} className="w-full" />
            </Field>
          </div>
        </Card>
      </div>

      <Card title={t('msec.deliveryState')} right={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={load}><RefreshCw size={14} /></Button>
          <Button onClick={refreshDelivery} loading={busy} disabled={m.state !== 'running'}><KeyRound size={14} /> {t('msec.refreshBtn')}</Button>
          <Button variant="primary" onClick={save} loading={busy}><Save size={14} /> {t('msec.saveSel')}</Button>
        </div>
      }>
        {!ms?.items?.length ? <Empty>{t('msec.noSelected')}</Empty> : (
          <Table head={[t('common.name'), t('msec.colDelivery'), t('msec.colVersion'), t('common.status'), t('common.updatedAt')]}>
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
