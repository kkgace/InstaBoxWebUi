/** Webhooks：CRUD、rotate、test、投递记录与重试 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, KeyRound, Send, History, RotateCw } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi, WEBHOOK_EVENTS } from '@/api/misc';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Modal, Field, Input, Confirm } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Webhook, WebhookDelivery } from '@/api/types';

export default function Webhooks() {
  const { orgId } = useGlobal();
  const { t } = useT();
  const [list, setList] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [del, setDel] = useState<Webhook | null>(null);
  const [deliveriesOf, setDeliveriesOf] = useState<Webhook | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try { setList((await miscApi.webhooks(orgId)).webhooks || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (w: Webhook) => {
    try { await miscApi.updateWebhook(orgId!, w.id, { enabled: !w.enabled }); load(); }
    catch (e) { setErr(errText(e)); }
  };
  const rotate = async (w: Webhook) => {
    try {
      const r = await miscApi.rotateWebhook(orgId!, w.id);
      setOk(t('wh.rotateOk', { s: r.secret || '' }));
      load();
    } catch (e) { setErr(errText(e)); }
  };
  const test = async (w: Webhook) => {
    try { await miscApi.testWebhook(orgId!, w.id); setOk(t('wh.testOk')); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{t('wh.title')}</h1>
          <p className="text-xs text-dim">{t('wh.desc')}<span className="mono">webhook-signature</span>{t('wh.descKey')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button variant="primary" onClick={() => setEditOpen(true)}><Plus size={14} /> {t('wh.add')}</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox><div className="break-all">{ok}</div></OkBox>}
      {!orgId ? <Card><ErrorBox>{t('wh.noCtx')}</ErrorBox></Card>
        : loading && !list.length ? <Spinner /> : list.length === 0 ? (
          <Card><Empty>{t('wh.none')}</Empty></Card>
        ) : (
          <Table head={[t('wh.colUrl'), t('wh.colEvents'), t('common.status'), t('wh.colNote'), t('common.actions')]}>
            {list.map((w) => (
              <tr key={w.id} className="hover:bg-white/[0.03]">
                <Td>
                  <div className="max-w-72 break-all text-xs text-sky-400">{w.url}</div>
                  <div className="mono text-[10px] text-dim">{w.id}</div>
                </Td>
                <Td><div className="flex max-w-72 flex-wrap gap-1">{w.events.map((e) => <Badge key={e} className="border-line text-[10px]">{e}</Badge>)}</div></Td>
                <Td>{w.enabled ? <Badge value="succeeded">{t('wh.on')}</Badge> : <Badge value="failed">{w.disabledReason === 'failing' ? t('wh.offFailing') : t('wh.off')}</Badge>}</Td>
                <Td className="text-xs text-dim">{w.description || '—'}{w.failingSince && <div className="text-red-400">{t('wh.failingSince', { t: fmtTime(w.failingSince) })}</div>}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Button className="!px-1.5 !py-0.5" title={t('wh.toggle')} onClick={() => toggle(w)}>{w.enabled ? t('wh.off') : t('wh.on')}</Button>
                    <Button className="!px-1.5 !py-0.5" title={t('wh.test')} onClick={() => test(w)}><Send size={12} /></Button>
                    <Button className="!px-1.5 !py-0.5" title={t('wh.rotate')} onClick={() => rotate(w)}><KeyRound size={12} /></Button>
                    <Button className="!px-1.5 !py-0.5" title={t('wh.deliveries')} onClick={() => setDeliveriesOf(w)}><History size={12} /></Button>
                    <Button className="!px-1.5 !py-0.5" variant="danger" title={t('wh.del')} onClick={() => setDel(w)}><Trash2 size={12} /></Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}

      <EditDialog open={editOpen} onClose={() => setEditOpen(false)} orgId={orgId} onDone={() => { setEditOpen(false); load(); }} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={async () => { if (del) { try { await miscApi.deleteWebhook(orgId!, del.id); load(); } catch (e) { setErr(errText(e)); } } }}
        title={t('wh.delTitle')} message={t('wh.delMsg')} confirmText={t('common.delete')} danger />
      {deliveriesOf && <DeliveriesModal orgId={orgId!} wh={deliveriesOf} onClose={() => setDeliveriesOf(null)} />}
    </div>
  );
}

function EditDialog({ open, onClose, orgId, onDone }: { open: boolean; onClose: () => void; orgId: string | null; onDone: () => void }) {
  const { t } = useT();
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!orgId || !url.trim()) return;
    setBusy(true); setErr(null);
    try {
      await miscApi.createWebhook(orgId, { url: url.trim(), description: desc.trim() || undefined, events, enabled });
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={t('wh.editTitle')} width="max-w-xl">
      <div className="space-y-3">
        <Field label={t('wh.urlField')}><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" className="w-full" /></Field>
        <Field label={t('wh.descField')}><Input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full" /></Field>
        <Field label={t('wh.eventsField')}>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={events.includes(e)} onChange={(ev) => setEvents((p) => ev.target.checked ? [...p, e] : p.filter((x) => x !== e))} className="accent-sky-500" />
                <span className="mono">{e}</span>
              </label>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-sky-500" /> {t('wh.enableNow')}</label>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!url.trim}>{t('common.create')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveriesModal({ orgId, wh, onClose }: { orgId: string; wh: Webhook; onClose: () => void }) {
  const { t } = useT();
  const [list, setList] = useState<WebhookDelivery[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList((await miscApi.webhookDeliveries(orgId, wh.id, 50)).deliveries || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [orgId, wh.id]);
  useEffect(() => { load(); }, [load]);

  const retry = async (d: WebhookDelivery) => {
    try { await miscApi.retryDelivery(orgId, wh.id, d.id); load(); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <Modal open onClose={onClose} title={t('wh.delTitle2', { u: wh.url })} width="max-w-3xl">
      <div className="flex justify-end"><Button variant="ghost" onClick={load}><RefreshCw size={14} /> {t('common.refresh')}</Button></div>
      <ErrorBox>{err}</ErrorBox>
      {loading ? <Spinner /> : list.length === 0 ? <Empty>{t('wh.noDeliveries')}</Empty> : (
        <Table head={[t('wh.colEvents'), t('common.status'), t('wh.colAttempts'), t('common.time'), '']}>
          {list.map((d) => (
            <tr key={d.id}>
              <Td className="mono text-xs">{d.event}</Td>
              <Td>{d.status === 'succeeded' ? <Badge value="succeeded">{t('wh.dOk')}</Badge> : d.status === 'pending' ? <Badge value="pending">{t('wh.dPending')}</Badge> : <Badge value="failed">{t('wh.dFail')}</Badge>}</Td>
              <Td className="text-xs">
                {(d.attempts || []).map((a, i) => (
                  <div key={i} className="text-dim">{a.code ? t('wh.http', { c: a.code }) : a.error || '—'} · {fmtTime(a.at)}</div>
                ))}
              </Td>
              <Td className="text-xs text-dim">{fmtTime(d.createdAt)}</Td>
              <Td>{d.status !== 'pending' && d.retryable !== false && <Button className="!px-1.5 !py-0.5" onClick={() => retry(d)}><RotateCw size={12} /> {t('wh.retry')}</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
