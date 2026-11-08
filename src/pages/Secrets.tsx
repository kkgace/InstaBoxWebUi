/** 组织 Secrets：创建/替换/删除/批量导入 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Upload } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Modal, Field, Input, Textarea, Select, Confirm } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Secret } from '@/api/types';

export default function Secrets() {
  const { orgId } = useGlobal();
  const { t } = useT();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [putOpen, setPutOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [del, setDel] = useState<Secret | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try { setSecrets((await miscApi.orgSecrets(orgId)).secrets || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const doDel = async () => {
    if (!del || !orgId) return;
    try { await miscApi.deleteOrgSecret(orgId, del.name); setOk(t('osec.delOk', { n: del.name })); load(); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{t('osec.title')}</h1>
          <p className="text-xs text-dim">
            {orgId ? t('osec.orgCtx', { id: orgId }) : t('osec.noCtx')} · {t('osec.desc')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button onClick={() => setImportOpen(true)}><Upload size={14} /> {t('osec.import')}</Button>
          <Button variant="primary" onClick={() => setPutOpen(true)}><Plus size={14} /> {t('osec.new')}</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {!orgId ? <Card><ErrorBox>{t('osec.noOrg')}</ErrorBox></Card>
        : loading && !secrets.length ? <Spinner /> : secrets.length === 0 ? (
          <Card><Empty>{t('osec.empty')}</Empty></Card>
        ) : (
          <Table head={[t('common.name'), t('msec.colDelivery'), t('osec.colHosts'), t('msec.colVersion'), t('osec.colSize'), t('common.updatedAt'), t('common.actions')]}>
            {secrets.map((s) => (
              <tr key={s.id} className="hover:bg-white/[0.03]">
                <Td className="mono text-sm">{s.name}</Td>
                <Td>{s.delivery === 'proxy'
                  ? <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">proxy</Badge>
                  : <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300">env</Badge>}</Td>
                <Td className="mono max-w-56 truncate text-xs text-dim" title={s.hosts?.join(', ')}>
                  {s.hosts?.length ? s.hosts.join(', ') : (s.delivery === 'proxy' ? '*' : '—')}
                </Td>
                <Td className="text-xs">v{s.version}</Td>
                <Td className="mono text-xs">{fmtBytes(s.size)}</Td>
                <Td className="text-xs text-dim">{fmtTime(s.updatedAt)}</Td>
                <Td>
                  <Button className="!px-1.5 !py-0.5" variant="danger" onClick={() => setDel(s)}><Trash2 size={12} /></Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}

      <PutDialog open={putOpen} onClose={() => setPutOpen(false)} orgId={orgId} onDone={() => { setPutOpen(false); load(); }} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} orgId={orgId} onDone={() => { setImportOpen(false); load(); }} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={doDel}
        title={t('osec.delTitle', { n: del?.name || '' })} message={t('osec.delMsg')} confirmText={t('common.delete')} danger />
    </div>
  );
}

function PutDialog({ open, onClose, orgId, onDone }: { open: boolean; onClose: () => void; orgId: string | null; onDone: () => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [delivery, setDelivery] = useState<'proxy' | 'env'>('proxy');
  const [hosts, setHosts] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !orgId) return;
    setBusy(true); setErr(null);
    try {
      const hostList = hosts.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      await miscApi.putOrgSecret(orgId, name.trim(), {
        value, delivery,
        hosts: delivery === 'proxy' && hostList.length ? hostList : undefined,
      });
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('osec.putTitle')}>
      <div className="space-y-3">
        <Field label={t('osec.putName')} hint={t('osec.putNameHint')}><Input value={name} onChange={(e) => setName(e.target.value)} className="mono w-full" autoFocus /></Field>
        <Field label={t('osec.putValue')} hint={t('osec.putValueHint')}>
          <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} className="w-full" />
        </Field>
        <Field label={t('osec.putDelivery')}>
          <Select value={delivery} onChange={(e) => setDelivery(e.target.value as 'proxy' | 'env')} className="w-full">
            <option value="proxy">{t('osec.dProxy')}</option>
            <option value="env">{t('osec.dEnv')}</option>
          </Select>
        </Field>
        {delivery === 'proxy' && (
          <Field label={t('osec.putHosts')} hint={t('osec.putHostsHint')}>
            <Textarea rows={2} value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder={'api.openai.com\n*.anthropic.com'} className="w-full" />
          </Field>
        )}
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!name.trim}>{t('common.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportDialog({ open, onClose, orgId, onDone }: { open: boolean; onClose: () => void; orgId: string | null; onDone: () => void }) {
  const { t } = useT();
  const [text, setText] = useState('');
  const [delivery, setDelivery] = useState<'proxy' | 'env'>('proxy');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!orgId) return;
    const items: { name: string; value: string }[] = [];
    for (const line of text.split('\n')) {
      const l = line.trim(); const i = l.indexOf('=');
      if (i > 0) items.push({ name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() });
    }
    if (!items.length) { setErr(t('osec.importErr')); return; }
    setBusy(true); setErr(null);
    try {
      await miscApi.importOrgSecrets(orgId, { delivery, secrets: items });
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('osec.importTitle')}>
      <div className="space-y-3">
        <Field label="NAME=value" hint={t('osec.importHint')}>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('osec.importPh')} className="w-full" />
        </Field>
        <Field label={t('osec.putDelivery')}>
          <Select value={delivery} onChange={(e) => setDelivery(e.target.value as 'proxy' | 'env')} className="w-full">
            <option value="proxy">proxy</option>
            <option value="env">env</option>
          </Select>
        </Field>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{t('osec.import')}</Button>
        </div>
      </div>
    </Modal>
  );
}
