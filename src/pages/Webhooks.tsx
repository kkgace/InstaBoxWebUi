/** Webhooks：CRUD、rotate、test、投递记录与重试 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, KeyRound, Send, History, RotateCw } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi, WEBHOOK_EVENTS } from '@/api/misc';
import { useGlobal } from '@/state';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Modal, Field, Input, Select, Confirm, CopyButton } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Webhook, WebhookDelivery } from '@/api/types';

export default function Webhooks() {
  const { orgId } = useGlobal();
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
      setOk(`签名密钥已轮换（旧密钥 24h 内仍有效）：${r.secret}`);
      load();
    } catch (e) { setErr(errText(e)); }
  };
  const test = async (w: Webhook) => {
    try { await miscApi.testWebhook(orgId!, w.id); setOk('测试事件已入队，稍后查看投递记录'); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Webhooks</h1>
          <p className="text-xs text-dim">沙箱/快照事件签名 POST 推送到你的端点。签名头 <span className="mono">webhook-signature</span>（whsec_ 密钥 HMAC）。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button variant="primary" onClick={() => setEditOpen(true)}><Plus size={14} /> 添加端点</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox><div className="break-all">{ok}</div></OkBox>}
      {!orgId ? <Card><ErrorBox>无法确定组织上下文</ErrorBox></Card>
        : loading && !list.length ? <Spinner /> : list.length === 0 ? (
          <Card><Empty>暂无 Webhook 端点</Empty></Card>
        ) : (
          <Table head={['URL', '事件', '状态', '备注', '']}>
            {list.map((w) => (
              <tr key={w.id} className="hover:bg-white/[0.03]">
                <Td>
                  <div className="max-w-72 break-all text-xs text-sky-400">{w.url}</div>
                  <div className="mono text-[10px] text-dim">{w.id}</div>
                </Td>
                <Td><div className="flex max-w-72 flex-wrap gap-1">{w.events.map((e) => <Badge key={e} className="border-line text-[10px]">{e}</Badge>)}</div></Td>
                <Td>{w.enabled ? <Badge value="succeeded">启用</Badge> : <Badge value="failed">停用{w.disabledReason === 'failing' ? '（连续失败）' : ''}</Badge>}</Td>
                <Td className="text-xs text-dim">{w.description || '—'}{w.failingSince && <div className="text-red-400">自 {fmtTime(w.failingSince)} 起失败</div>}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button className="!px-1.5 !py-0.5" title="启用/停用" onClick={() => toggle(w)}>{w.enabled ? '停用' : '启用'}</Button>
                    <Button className="!px-1.5 !py-0.5" title="发送测试事件" onClick={() => test(w)}><Send size={12} /></Button>
                    <Button className="!px-1.5 !py-0.5" title="轮换签名密钥" onClick={() => rotate(w)}><KeyRound size={12} /></Button>
                    <Button className="!px-1.5 !py-0.5" title="投递记录" onClick={() => setDeliveriesOf(w)}><History size={12} /></Button>
                    <Button className="!px-1.5 !py-0.5" variant="danger" title="删除" onClick={() => setDel(w)}><Trash2 size={12} /></Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}

      <EditDialog open={editOpen} onClose={() => setEditOpen(false)} orgId={orgId} onDone={() => { setEditOpen(false); load(); }} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={async () => { if (del) { try { await miscApi.deleteWebhook(orgId!, del.id); load(); } catch (e) { setErr(errText(e)); } } }}
        title="删除 Webhook 端点" message="待投递队列与投递日志一并删除。" confirmText="删除" danger />
      {deliveriesOf && <DeliveriesModal orgId={orgId!} wh={deliveriesOf} onClose={() => setDeliveriesOf(null)} />}
    </div>
  );
}

function EditDialog({ open, onClose, orgId, onDone }: { open: boolean; onClose: () => void; orgId: string | null; onDone: () => void }) {
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
    <Modal open={open} onClose={onClose} title="添加 Webhook 端点" width="max-w-xl">
      <div className="space-y-3">
        <Field label="URL（POST 目标）"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" className="w-full" /></Field>
        <Field label="描述（可选）"><Input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full" /></Field>
        <Field label="订阅事件">
          <div className="grid grid-cols-2 gap-1.5">
            {WEBHOOK_EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={events.includes(e)} onChange={(ev) => setEvents((p) => ev.target.checked ? [...p, e] : p.filter((x) => x !== e))} className="accent-sky-500" />
                <span className="mono">{e}</span>
              </label>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-sky-500" /> 立即启用</label>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!url.trim()}>创建</Button>
        </div>
      </div>
    </Modal>
  );
}

function DeliveriesModal({ orgId, wh, onClose }: { orgId: string; wh: Webhook; onClose: () => void }) {
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
    <Modal open onClose={onClose} title={`投递记录 — ${wh.url}`} width="max-w-3xl">
      <div className="flex justify-end"><Button variant="ghost" onClick={load}><RefreshCw size={14} /> 刷新</Button></div>
      <ErrorBox>{err}</ErrorBox>
      {loading ? <Spinner /> : list.length === 0 ? <Empty>暂无投递记录（保留 30 天）</Empty> : (
        <Table head={['事件', '状态', '尝试', '时间', '']}>
          {list.map((d) => (
            <tr key={d.id}>
              <Td className="mono text-xs">{d.event}</Td>
              <Td>{d.status === 'succeeded' ? <Badge value="succeeded">成功</Badge> : d.status === 'pending' ? <Badge value="pending">待投递</Badge> : <Badge value="failed">失败</Badge>}</Td>
              <Td className="text-xs">
                {(d.attempts || []).map((a, i) => (
                  <div key={i} className="text-dim">{a.code ? `HTTP ${a.code}` : a.error || '—'} · {fmtTime(a.at)}</div>
                ))}
              </Td>
              <Td className="text-xs text-dim">{fmtTime(d.createdAt)}</Td>
              <Td>{d.status !== 'pending' && d.retryable !== false && <Button className="!px-1.5 !py-0.5" onClick={() => retry(d)}><RotateCw size={12} /> 重试</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
