/** SSH：连接信息、SSH Token、证书签发 */
import { useCallback, useEffect, useState } from 'react';
import { Terminal, KeyRound, Trash2, RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Field, Input, Textarea, Table, Td, CopyButton, Empty, Confirm } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, ConnectionInfo, SSHTokenInfo, SSHConnection } from '@/api/types';

export default function SshTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [tokens, setTokens] = useState<SSHTokenInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [tokName, setTokName] = useState('');
  const [tokTtl, setTokTtl] = useState('');
  const [tokNoExpiry, setTokNoExpiry] = useState(false);
  const [tokBusy, setTokBusy] = useState(false);
  const [newTok, setNewTok] = useState<SSHTokenInfo | null>(null);

  const [pubKey, setPubKey] = useState('');
  const [certBusy, setCertBusy] = useState(false);
  const [cert, setCert] = useState<SSHConnection | null>(null);
  const [revokeTok, setRevokeTok] = useState<SSHTokenInfo | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [i, tok] = await Promise.allSettled([machinesApi.connectionInfo(m.id), machinesApi.sshTokens(m.id)]);
      if (i.status === 'fulfilled') setInfo(i.value);
      if (tok.status === 'fulfilled') setTokens((tok.value as { tokens?: SSHTokenInfo[] }).tokens || []);
    } catch (e) { setErr(errText(e)); }
  }, [m.id]);
  useEffect(() => { load(); }, [load]);

  const createToken = async () => {
    setTokBusy(true); setErr(null); setNewTok(null);
    try {
      const body: { name?: string; ttlSeconds?: number; noExpiry?: boolean } = {};
      if (tokName.trim()) body.name = tokName.trim();
      if (tokNoExpiry) body.noExpiry = true;
      else if (tokTtl) body.ttlSeconds = Number(tokTtl);
      const tok = await machinesApi.createSshToken(m.id, body);
      setNewTok(tok);
      setOk(t('ssh.tokenCreated'));
      load();
    } catch (e) { setErr(errText(e)); }
    setTokBusy(false);
  };

  const issueCert = async () => {
    setCertBusy(true); setErr(null); setCert(null);
    try {
      const c = await machinesApi.sshCert(m.id, pubKey.trim());
      setCert(c);
      setOk(t('common.done'));
    } catch (e) { setErr(errText(e)); }
    setCertBusy(false);
  };

  const doRevoke = async () => {
    if (!revokeTok) return;
    try { await machinesApi.revokeSshToken(m.id, revokeTok.id); load(); }
    catch (e) { setErr(errText(e)); }
  };

  const revokeAll = async () => {
    try { await machinesApi.revokeAllSshTokens(m.id); setOk(t('ssh.revokeAllOk')); load(); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('ssh.info')}>
        {!info ? <Empty>{t('common.loading')}</Empty> : (
          <div className="space-y-2 text-sm">
            <div className="mono rounded-md border border-line bg-bg p-3 text-xs leading-relaxed">
              <div>host: <span className="text-sky-400">{info.host}</span></div>
              <div>port: {info.port}</div>
              <div>user: {info.username} (= {t('ml.colName').split(' ')[1] || 'ID'})</div>
              <div>transport: {info.transport}{info.capabilities?.length ? ` · ${info.capabilities.join(', ')}` : ''}</div>
            </div>
            <div className="text-xs text-dim">
              {t('ssh.withOwnKey')}<code className="mono">ssh -p {info.port} {info.username}@{info.host}</code>
              <br />{t('ssh.orToken')}
            </div>
            <Button variant="ghost" onClick={load}><RefreshCw size={14} /> {t('common.refresh')}</Button>
          </div>
        )}
      </Card>

      <Card title={t('ssh.createToken')}>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('ssh.tokenName')}><Input value={tokName} onChange={(e) => setTokName(e.target.value)} placeholder="my-laptop" className="w-full" /></Field>
            <Field label={t('ssh.tokenTtl')}>
              <Input type="number" value={tokTtl} onChange={(e) => setTokTtl(e.target.value)} placeholder={t('ssh.ttlPh')} disabled={tokNoExpiry} className="w-full" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={tokNoExpiry} onChange={(e) => setTokNoExpiry(e.target.checked)} /> {t('ssh.noExpiry')}
          </label>
          <Button variant="primary" onClick={createToken} loading={tokBusy}><KeyRound size={14} /> {t('ssh.createBtn')}</Button>
          <ErrorBox>{err}</ErrorBox>
          {ok && <OkBox>{ok}</OkBox>}
          {newTok?.token && (
            <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
              <div className="mb-1 text-xs font-medium text-sky-300">{t('ssh.copyNow')}</div>
              <div className="flex items-start gap-1">
                <code className="mono min-w-0 flex-1 break-all text-xs text-slate-200">{newTok.command || `ssh -p ${newTok.port} ${newTok.token}@${newTok.host}`}</code>
                <CopyButton text={newTok.command || `ssh -p ${newTok.port} ${newTok.token}@${newTok.host}`} />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title={t('ssh.tokenList')} right={
        <Button className="!px-2" variant="danger" title={t('ssh.revokeAll')} onClick={revokeAll}><Trash2 size={13} /></Button>
      }>
        {tokens.length === 0 ? <Empty>{t('ssh.noTokens')}</Empty> : (
          <Table head={[t('common.name'), t('common.status'), t('common.createdAt'), t('common.expiresAt'), '']}>
            {tokens.map((tok) => (
              <tr key={tok.id}>
                <Td className="text-xs">{tok.name || <span className="text-dim">{tok.id.slice(0, 10)}…</span>}</Td>
                <Td>{tok.revokedAt ? <Badge value="failed">{t('ssh.revoked')}</Badge> : tok.expiresAt && new Date(tok.expiresAt) < new Date() ? <Badge value="stopped">{t('ssh.expired')}</Badge> : <Badge value="succeeded">{t('ssh.valid')}</Badge>}</Td>
                <Td className="text-xs text-dim">{fmtTime(tok.createdAt)}</Td>
                <Td className="text-xs text-dim">{tok.expiresAt ? fmtTime(tok.expiresAt) : t('common.never')}</Td>
                <Td>{!tok.revokedAt && <Button className="!px-1.5 !py-0.5" variant="danger" onClick={() => setRevokeTok(tok)}><Trash2 size={12} /></Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={t('ssh.cert')}>
        <div className="space-y-2.5">
          <Field label={t('ssh.pubKey')}>
            <Textarea rows={3} value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder="ssh-ed25519 AAAA... comment" className="w-full" />
          </Field>
          <Button variant="primary" onClick={issueCert} loading={certBusy} disabled={!pubKey.trim() || m.state !== 'running'}>
            <Terminal size={14} /> {t('ssh.certBtn')}
          </Button>
          {cert && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
              <div className="mb-1 text-emerald-300">{t('ssh.certOk', { t: fmtTime(cert.expiresAt) })}</div>
              <div className="flex items-start gap-1">
                <pre className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-slate-200">{cert.certificate}</pre>
                <CopyButton text={cert.certificate} />
              </div>
            </div>
          )}
          <p className="text-xs text-dim">{t('ssh.certHint')}</p>
        </div>
      </Card>

      <Confirm open={!!revokeTok} onClose={() => setRevokeTok(null)} onConfirm={doRevoke}
        title={t('ssh.revokeConfirm', { t: revokeTok?.name || revokeTok?.id || '' })} message={t('ssh.revokeMsg')} confirmText={t('ssh.revokeBtn')} danger />
    </div>
  );
}
