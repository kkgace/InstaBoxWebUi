/** 端口发布：列表/发布/取消/轮换 token */
import { useCallback, useEffect, useState } from 'react';
import { Globe, Trash2, RefreshCw, Lock, Unlock, RotateCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Modal, Field, Input, Select, Table, Td, CopyButton, Empty, Confirm } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, PublicPort } from '@/api/types';

export default function PortsTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [ports, setPorts] = useState<PublicPort[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [unpub, setUnpub] = useState<PublicPort | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setPorts((await machinesApi.ports(m.id)).ports || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [m.id]);
  useEffect(() => { load(); }, [load]);

  const doUnpub = async () => {
    if (!unpub) return;
    try { await machinesApi.unpublishPort(m.id, unpub.port); setOk(t('ports.unpublished', { p: unpub.port })); load(); }
    catch (e) { setErr(errText(e)); }
  };

  const rotate = async (p: PublicPort) => {
    try {
      const r = await machinesApi.publishPort(m.id, { port: p.port, rotateToken: true });
      setOk(t('ports.rotated', { p: p.port }));
      if (r?.url) setPorts((ps) => ps.map((x) => (x.port === p.port ? r : x)));
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="max-w-xl text-sm text-dim">{t('ports.desc')}</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button variant="primary" onClick={() => setPubOpen(true)}><Globe size={14} /> {t('ports.publish')}</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {loading && !ports.length ? <Empty /> : ports.length === 0 ? (
        <Card><Empty>{t('ports.none')}</Empty></Card>
      ) : (
        <Table head={[t('ports.inPort'), t('common.name'), t('ports.url'), t('ports.access'), t('ports.protocol'), t('ports.publishedAt'), t('common.actions')]}>
          {ports.map((p) => (
            <tr key={p.id} className="hover:bg-white/[0.03]">
              <Td className="mono">{p.port}</Td>
              <Td className="text-xs">{p.name}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  <a href={p.url} target="_blank" rel="noreferrer" className="mono max-w-72 truncate text-xs text-sky-400 hover:underline">{p.url}</a>
                  <CopyButton text={p.url} />
                </div>
              </Td>
              <Td>{p.access === 'private'
                ? <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300"><Lock size={10} /> {t('ports.private')}</Badge>
                : <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><Unlock size={10} /> {t('ports.public')}</Badge>}</Td>
              <Td className="text-xs">{p.protocol || 'http'}</Td>
              <Td className="text-xs text-dim">{fmtTime(p.createdAt)}</Td>
              <Td>
                <div className="flex gap-1">
                  {p.access === 'private' && <Button className="!px-1.5 !py-0.5" title={t('ports.rotate')} onClick={() => rotate(p)}><RotateCw size={12} /></Button>}
                  <Button className="!px-1.5 !py-0.5" variant="danger" title={t('ports.unpublish')} onClick={() => setUnpub(p)}><Trash2 size={12} /></Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <PublishDialog open={pubOpen} onClose={() => setPubOpen(false)} onDone={() => { setPubOpen(false); load(); }} machineId={m.id} />
      <Confirm open={!!unpub} onClose={() => setUnpub(null)} onConfirm={doUnpub}
        title={t('ports.unpubTitle', { p: unpub?.port ?? '' })} message={t('ports.unpubConfirm')} confirmText={t('ports.unpublish')} danger />
    </div>
  );
}

function PublishDialog({ open, onClose, onDone, machineId }: { open: boolean; onClose: () => void; onDone: () => void; machineId: string }) {
  const { t } = useT();
  const [port, setPort] = useState('3000');
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'public' | 'private'>('public');
  const [protocol, setProtocol] = useState<'http' | 'tcp'>('http');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PublicPort | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null); setCreated(null);
    try {
      const r = await machinesApi.publishPort(machineId, {
        port: Number(port), name: name.trim() || undefined, access, protocol,
      });
      setCreated(r);
      setTimeout(onDone, 900);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('ports.publish')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ports.inPort')}><Input type="number" value={port} onChange={(e) => setPort(e.target.value)} className="w-full" /></Field>
          <Field label={t('ports.pname')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="web" className="w-full" /></Field>
          <Field label={t('ports.ctrl')} hint={t('ports.ctrlHint')}>
            <Select value={access} onChange={(e) => setAccess(e.target.value as 'public' | 'private')} className="w-full">
              <option value="public">{t('ports.public')}</option>
              <option value="private">{t('ports.private')}</option>
            </Select>
          </Field>
          <Field label={t('ports.protocol')}>
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value as 'http' | 'tcp')} className="w-full">
              <option value="http">HTTP(S)</option>
              <option value="tcp">TCP(TLS)</option>
            </Select>
          </Field>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {created && (
          <OkBox>
            <div>{t('ports.pubOk')}<a href={created.url} target="_blank" rel="noreferrer" className="mono break-all underline">{created.url}</a></div>
            {created.access === 'private' && <div className="mt-1">{t('ports.pubToken')}<span className="mono">{created.id}</span> <CopyButton text={created.url} label={t('ports.copyLink')} /></div>}
          </OkBox>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{t('ports.publish')}</Button>
        </div>
      </div>
    </Modal>
  );
}
