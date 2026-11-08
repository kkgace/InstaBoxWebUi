/** SSH：连接信息、SSH Token、证书签发 */
import { useCallback, useEffect, useState } from 'react';
import { Terminal, KeyRound, Trash2, RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Badge, ErrorBox, OkBox, Field, Input, Textarea, Table, Td, CopyButton, Empty, Confirm } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, ConnectionInfo, SSHTokenInfo, SSHConnection } from '@/api/types';

export default function SshTab({ m }: { m: Machine }) {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [tokens, setTokens] = useState<SSHTokenInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // token 创建
  const [tokName, setTokName] = useState('');
  const [tokTtl, setTokTtl] = useState('');
  const [tokNoExpiry, setTokNoExpiry] = useState(false);
  const [tokBusy, setTokBusy] = useState(false);
  const [newTok, setNewTok] = useState<SSHTokenInfo | null>(null);

  // 证书
  const [pubKey, setPubKey] = useState('');
  const [certBusy, setCertBusy] = useState(false);
  const [cert, setCert] = useState<SSHConnection | null>(null);

  const [revokeTok, setRevokeTok] = useState<SSHTokenInfo | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [i, t] = await Promise.allSettled([machinesApi.connectionInfo(m.id), machinesApi.sshTokens(m.id)]);
      if (i.status === 'fulfilled') setInfo(i.value);
      if (t.status === 'fulfilled') setTokens((t.value as { tokens?: SSHTokenInfo[] }).tokens || []);
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
      const t = await machinesApi.createSshToken(m.id, body);
      setNewTok(t);
      setOk('SSH Token 已创建，请立即复制（之后只显示 sha256）');
      load();
    } catch (e) { setErr(errText(e)); }
    setTokBusy(false);
  };

  const issueCert = async () => {
    setCertBusy(true); setErr(null); setCert(null);
    try {
      const c = await machinesApi.sshCert(m.id, pubKey.trim());
      setCert(c);
      setOk('证书已签发');
    } catch (e) { setErr(errText(e)); }
    setCertBusy(false);
  };

  const doRevoke = async () => {
    if (!revokeTok) return;
    try { await machinesApi.revokeSshToken(m.id, revokeTok.id); load(); }
    catch (e) { setErr(errText(e)); }
  };

  const revokeAll = async () => {
    try { await machinesApi.revokeAllSshTokens(m.id); setOk('已撤销全部 Token 并关闭连接'); load(); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="SSH 连接信息">
        {!info ? <Empty>加载中…</Empty> : (
          <div className="space-y-2 text-sm">
            <div className="mono rounded-md border border-line bg-bg p-3 text-xs leading-relaxed">
              <div>host: <span className="text-sky-400">{info.host}</span></div>
              <div>port: {info.port}</div>
              <div>user: {info.username}（= 沙箱 ID）</div>
              <div>transport: {info.transport}{info.capabilities?.length ? ` · 能力: ${info.capabilities.join(', ')}` : ''}</div>
            </div>
            <div className="text-xs text-dim">
              用自己生成并加到官方 dashboard 的密钥：<code className="mono">ssh -p {info.port} {info.username}@{info.host}</code>
              <br />或本页下方「SSH Token」直接免密登录。
            </div>
            <Button variant="ghost" onClick={load}><RefreshCw size={14} /> 刷新</Button>
          </div>
        )}
      </Card>

      <Card title="创建 SSH Token（免密登录）">
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="名称（可选）"><Input value={tokName} onChange={(e) => setTokName(e.target.value)} placeholder="my-laptop" className="w-full" /></Field>
            <Field label="有效期（秒，≤2592000）">
              <Input type="number" value={tokTtl} onChange={(e) => setTokTtl(e.target.value)} placeholder="604800（7天）" disabled={tokNoExpiry} className="w-full" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={tokNoExpiry} onChange={(e) => setTokNoExpiry(e.target.checked)} /> 永不过期（直到撤销）
          </label>
          <Button variant="primary" onClick={createToken} loading={tokBusy}><KeyRound size={14} /> 创建 Token</Button>
          <ErrorBox>{err}</ErrorBox>
          {ok && <OkBox>{ok}</OkBox>}
          {newTok?.token && (
            <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
              <div className="mb-1 text-xs font-medium text-sky-300">立即复制，仅显示一次：</div>
              <div className="flex items-start gap-1">
                <code className="mono min-w-0 flex-1 break-all text-xs text-slate-200">{newTok.command || `ssh -p ${newTok.port} ${newTok.token}@${newTok.host}`}</code>
                <CopyButton text={newTok.command || `ssh -p ${newTok.port} ${newTok.token}@${newTok.host}`} />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Token 列表（30 天内含已撤销/过期）" right={
        <Button className="!px-2" variant="danger" title="撤销全部" onClick={revokeAll}><Trash2 size={13} /></Button>
      }>
        {tokens.length === 0 ? <Empty>暂无 Token</Empty> : (
          <Table head={['名称', '状态', '创建', '到期', '']}>
            {tokens.map((t) => (
              <tr key={t.id}>
                <Td className="text-xs">{t.name || <span className="text-dim">{t.id.slice(0, 10)}…</span>}</Td>
                <Td>{t.revokedAt ? <Badge value="failed">已撤销</Badge> : t.expiresAt && new Date(t.expiresAt) < new Date() ? <Badge value="stopped">已过期</Badge> : <Badge value="succeeded">有效</Badge>}</Td>
                <Td className="text-xs text-dim">{fmtTime(t.createdAt)}</Td>
                <Td className="text-xs text-dim">{t.expiresAt ? fmtTime(t.expiresAt) : '永不过期'}</Td>
                <Td>{!t.revokedAt && <Button className="!px-1.5 !py-0.5" variant="danger" onClick={() => setRevokeTok(t)}><Trash2 size={12} /></Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="签发短期 SSH 用户证书">
        <div className="space-y-2.5">
          <Field label="公钥（authorized_keys 格式）">
            <Textarea rows={3} value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder="ssh-ed25519 AAAA... comment" className="w-full" />
          </Field>
          <Button variant="primary" onClick={issueCert} loading={certBusy} disabled={!pubKey.trim() || m.state !== 'running'}>
            <Terminal size={14} /> 签发证书（默认 1 小时）
          </Button>
          {cert && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
              <div className="mb-1 text-emerald-300">证书已签发，{fmtTime(cert.expiresAt)} 前有效：</div>
              <div className="flex items-start gap-1">
                <pre className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-slate-200">{cert.certificate}</pre>
                <CopyButton text={cert.certificate} />
              </div>
            </div>
          )}
          <p className="text-xs text-dim">证书主体是沙箱 ID；签发要求沙箱运行中。API Key 撤销/过期时证书同时失效。</p>
        </div>
      </Card>

      <Confirm open={!!revokeTok} onClose={() => setRevokeTok(null)} onConfirm={doRevoke}
        title={`撤销 Token ${revokeTok?.name || revokeTok?.id || ''}`} message="该 Token 的 SSH/mosh 连接将被关闭。" confirmText="撤销" danger />
    </div>
  );
}
