/** 端口发布：列表/发布/取消/轮换 token */
import { useCallback, useEffect, useState } from 'react';
import { Globe, Trash2, RefreshCw, Copy as CopyIcon, Lock, Unlock, RotateCw } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Badge, ErrorBox, OkBox, Modal, Field, Input, Select, Table, Td, CopyButton, Empty, Confirm } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, PublicPort } from '@/api/types';

export default function PortsTab({ m }: { m: Machine }) {
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
    try { await machinesApi.unpublishPort(m.id, unpub.port); setOk(`端口 ${unpub.port} 已取消发布`); load(); }
    catch (e) { setErr(errText(e)); }
  };

  const rotate = async (p: PublicPort) => {
    try {
      const r = await machinesApi.publishPort(m.id, { port: p.port, rotateToken: true });
      setOk(`端口 ${p.port} token 已轮换`);
      if (r?.url) setPorts((ps) => ps.map((x) => (x.port === p.port ? r : x)));
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-dim">把沙箱内的 HTTP 服务发布为 HTTPS URL（机器无公网 IP 也能被访问）。URL 在取消发布前一直有效，仅当沙箱运行时可访问。</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /></Button>
          <Button variant="primary" onClick={() => setPubOpen(true)}><Globe size={14} /> 发布端口</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}
      {loading && !ports.length ? <Empty /> : ports.length === 0 ? (
        <Card><Empty>暂无发布的端口</Empty></Card>
      ) : (
        <Table head={['端口', '名称', 'URL / 地址', '访问', '协议', '发布时间', '']}>
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
                ? <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300"><Lock size={10} /> 私有(token)</Badge>
                : <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><Unlock size={10} /> 公开</Badge>}</Td>
              <Td className="text-xs">{p.protocol || 'http'}</Td>
              <Td className="text-xs text-dim">{fmtTime(p.createdAt)}</Td>
              <Td>
                <div className="flex gap-1">
                  {p.access === 'private' && <Button className="!px-1.5 !py-0.5" title="轮换 token" onClick={() => rotate(p)}><RotateCw size={12} /></Button>}
                  <Button className="!px-1.5 !py-0.5" variant="danger" title="取消发布" onClick={() => setUnpub(p)}><Trash2 size={12} /></Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <PublishDialog open={pubOpen} onClose={() => setPubOpen(false)} onDone={() => { setPubOpen(false); load(); }} machineId={m.id} />
      <Confirm open={!!unpub} onClose={() => setUnpub(null)} onConfirm={doUnpub}
        title={`取消发布端口 ${unpub?.port ?? ''}`} message="URL 将失效，活跃连接会被关闭。" confirmText="取消发布" danger />
    </div>
  );
}

function PublishDialog({ open, onClose, onDone, machineId }: { open: boolean; onClose: () => void; onDone: () => void; machineId: string }) {
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
    <Modal open={open} onClose={onClose} title="发布端口">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="沙箱内端口"><Input type="number" value={port} onChange={(e) => setPort(e.target.value)} className="w-full" /></Field>
          <Field label="名称（可选）"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="web" className="w-full" /></Field>
          <Field label="访问控制" hint="私有 = 须带 token 才能访问">
            <Select value={access} onChange={(e) => setAccess(e.target.value as 'public' | 'private')} className="w-full">
              <option value="public">公开</option>
              <option value="private">私有（token）</option>
            </Select>
          </Field>
          <Field label="协议">
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value as 'http' | 'tcp')} className="w-full">
              <option value="http">HTTP(S)</option>
              <option value="tcp">原始 TCP(TLS)</option>
            </Select>
          </Field>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {created && (
          <OkBox>
            <div>发布成功：<a href={created.url} target="_blank" rel="noreferrer" className="mono break-all underline">{created.url}</a></div>
            {created.access === 'private' && <div className="mt-1">token：<span className="mono">{created.id}</span> <CopyButton text={created.url} label="复制链接" /></div>}
          </OkBox>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          <Button variant="primary" loading={busy} onClick={submit}>发布</Button>
        </div>
      </div>
    </Modal>
  );
}
