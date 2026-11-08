/** 组织 Secrets：创建/替换/删除/批量导入 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Upload } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { Card, Button, Badge, ErrorBox, OkBox, Table, Td, Empty, Spinner, Modal, Field, Input, Textarea, Select, Confirm } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Secret } from '@/api/types';

export default function Secrets() {
  const { orgId, me } = useGlobal();
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
    try { await miscApi.deleteOrgSecret(orgId, del.name); setOk(`Secret「${del.name}」已删除（机器内环境副本要等重启/刷新才消失）`); load(); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">组织 Secrets</h1>
          <p className="text-xs text-dim">
            {orgId ? `组织 ${orgId}` : '无组织上下文'} · 值永不回显，仅存元数据。
            proxy 模式：出站 HTTPS 请求头自动替换占位符（值不进机器）；env 模式：注入环境变量/文件。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button onClick={() => setImportOpen(true)}><Upload size={14} /> 批量导入</Button>
          <Button variant="primary" onClick={() => setPutOpen(true)}><Plus size={14} /> 新建</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {!orgId ? <Card><ErrorBox>无法确定组织上下文，请先配置 API Key</ErrorBox></Card>
        : loading && !secrets.length ? <Spinner /> : secrets.length === 0 ? (
          <Card><Empty>暂无 Secret — 点击「新建」创建第一个</Empty></Card>
        ) : (
          <Table head={['名称', '投递', 'hosts', '版本', '大小', '更新', '']}>
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
                  {me?.admin !== false && (
                    <Button className="!px-1.5 !py-0.5" variant="danger" onClick={() => setDel(s)}><Trash2 size={12} /></Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}

      <PutDialog open={putOpen} onClose={() => setPutOpen(false)} orgId={orgId} onDone={() => { setPutOpen(false); load(); }} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} orgId={orgId} onDone={() => { setImportOpen(false); load(); }} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={doDel}
        title={`删除 Secret ${del?.name || ''}`} message="其显式授权也会一并删除。proxy 撤销在 60 秒内生效。" confirmText="删除" danger />
    </div>
  );
}

function PutDialog({ open, onClose, orgId, onDone }: { open: boolean; onClose: () => void; orgId: string | null; onDone: () => void }) {
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
    <Modal open={open} onClose={onClose} title="创建 / 替换 Secret">
      <div className="space-y-3">
        <Field label="名称" hint="字母/数字/下划线，64 字以内"><Input value={name} onChange={(e) => setName(e.target.value)} className="mono w-full" autoFocus /></Field>
        <Field label="值" hint="≤64KB，UTF-8；proxy 模式必须是合法 HTTP 头值">
          <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} className="w-full" />
        </Field>
        <Field label="投递方式">
          <Select value={delivery} onChange={(e) => setDelivery(e.target.value as 'proxy' | 'env')} className="w-full">
            <option value="proxy">proxy — 出站请求头替换占位符（推荐）</option>
            <option value="env">env — 注入环境变量/文件</option>
          </Select>
        </Field>
        {delivery === 'proxy' && (
          <Field label="限定目标主机（可选，逗号或换行分隔）" hint="留空 = 所有 HTTPS 目标（*）">
            <Textarea rows={2} value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder={'api.openai.com\n*.anthropic.com'} className="w-full" />
          </Field>
        )}
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} onClick={submit} disabled={!name.trim()}>保存</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportDialog({ open, onClose, orgId, onDone }: { open: boolean; onClose: () => void; orgId: string | null; onDone: () => void }) {
  const [text, setText] = useState('');
  const [delivery, setDelivery] = useState<'proxy' | 'env'>('proxy');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!orgId) return;
    const items: { name: string; value: string }[] = [];
    for (const line of text.split('\n')) {
      const t = line.trim(); const i = t.indexOf('=');
      if (i > 0) items.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim() });
    }
    if (!items.length) { setErr('请按 NAME=value 每行一条输入'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await miscApi.importOrgSecrets(orgId, { delivery, secrets: items });
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="批量导入 Secrets（原子操作）">
      <div className="space-y-3">
        <Field label="内容（每行 NAME=value）" hint="校验失败或超配额时全部不变">
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'OPENAI_API_KEY=sk-...\nDB_URL=postgres://...'} className="w-full" />
        </Field>
        <Field label="投递方式">
          <Select value={delivery} onChange={(e) => setDelivery(e.target.value as 'proxy' | 'env')} className="w-full">
            <option value="proxy">proxy</option>
            <option value="env">env</option>
          </Select>
        </Field>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" loading={busy} onClick={submit}>导入</Button>
        </div>
      </div>
    </Modal>
  );
}
