/** 跨账号聚合看板：用本地保存的每个账号 Key 并行拉取各自沙箱，一屏总览 + 行内启停 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Play, Square, Pause, RotateCcw, Users, Trash2 } from 'lucide-react';
import { api, errText } from '@/api/client';
import { getAccounts } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, Table, Td, Empty, Spinner, Stat, Confirm } from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Machine, Me } from '@/api/types';

interface AccountBlock {
  key: string;
  label: string;
  me: Me | null;
  machines: Machine[];
  err: string | null;
}

export default function Matrix() {
  const { t } = useT();
  const [blocks, setBlocks] = useState<AccountBlock[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<{ m: Machine; key: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const accounts = getAccounts();
    if (accounts.length === 0) { setBlocks([]); setLoading(false); return; }
    const results = await Promise.all(accounts.map(async (a) => {
      const opts = { overrideKey: a.key };
      try {
        const [me, ml] = await Promise.all([
          api<Me>('GET', 'v1/me', opts),
          machinesApi.list({ limit: 200 }, opts),
        ]);
        return { key: a.key, label: a.label || me.login || '—', me, machines: ml.machines || [], err: null } as AccountBlock;
      } catch (e) {
        return { key: a.key, label: a.label, me: null, machines: [], err: errText(e) } as AccountBlock;
      }
    }));
    setBlocks(results);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (m: Machine, key: string, label: string, action: 'start' | 'stop' | 'suspend' | 'resume') => {
    setBusy(m.id + action); setErr(null);
    try {
      const opts = { overrideKey: key };
      const r = action === 'start' ? await machinesApi.start(m.id, {}, opts)
        : action === 'stop' ? await machinesApi.stop(m.id, undefined, opts)
        : action === 'suspend' ? await machinesApi.suspend(m.id, opts)
        : await machinesApi.resume(m.id, opts);
      if (r && typeof r === 'object' && 'operationId' in r && (r as { operationId?: string }).operationId) {
        // 短轮询一次确认进入目标状态即可，聚合页不做完整等待
        await new Promise((res) => setTimeout(res, 1500));
      }
      await load();
    } catch (e) { setErr(`${label} / ${m.name}: ${errText(e)}`); }
    setBusy(null);
  };

  const del = async () => {
    if (!delTarget) return;
    const { m, key, label } = delTarget;
    setBusy(m.id + 'del'); setErr(null);
    try {
      await machinesApi.delete(m.id, { overrideKey: key });
      await load();
    } catch (e) { setErr(`${label} / ${m.name}: ${errText(e)}`); }
    setBusy(null);
  };

  const total = blocks?.reduce((n, b) => n + b.machines.length, 0) ?? 0;
  const running = blocks?.reduce((n, b) => n + b.machines.filter((m) => m.state === 'running').length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="inline-flex items-center gap-2 text-lg font-bold"><Users size={18} /> {t('mx.title')}</h1>
          <p className="text-xs text-dim">{t('mx.desc')}</p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('mx.accounts')} value={blocks?.length ?? '—'} accent />
        <Stat label={t('nav.machines')} value={total} />
        <Stat label={t('dash.running')} value={running} />
        <Stat label={t('mx.updatedAt')} value={fmtTime(new Date().toISOString())} />
      </div>

      <ErrorBox>{err}</ErrorBox>
      {blocks && blocks.length === 0 && (
        <Card>
          <Empty>
            {t('mx.noAccounts1')} <button className="text-sky-400 underline" onClick={() => window.location.hash = ''}>{t('layout.accounts')}</button>{t('mx.noAccounts2')}
          </Empty>
        </Card>
      )}
      {loading && !blocks ? <Spinner /> : null}

      {(blocks || []).map((b) => (
        <Card key={b.key}
          title={<span className="inline-flex items-center gap-2">{b.label}{b.me?.email && <span className="text-xs text-dim">{b.me.email}</span>}</span>}
          right={
            <span className="flex items-center gap-2 text-xs text-dim">
              <Badge value="running">{b.machines.filter((m) => m.state === 'running').length}/{b.machines.length}</Badge>
              {b.me?.org?.name && <Badge className="border-line">{b.me.org.name}{b.me.org.tier && b.me.org.tier !== 'free' ? ` (${b.me.org.tier})` : ''}</Badge>}
            </span>
          }>
          {b.err ? <ErrorBox>{b.err}</ErrorBox>
            : b.machines.length === 0 ? <Empty>{t('mx.noMachines')}</Empty> : (
              <Table head={[t('ml.colName'), t('common.status'), t('ml.colSpec'), t('ml.colAutoPause'), t('common.createdAt'), t('common.actions')]}>
                {b.machines.map((m) => {
                  const canStart = m.state === 'stopped' || m.state === 'suspended';
                  const canStop = m.state === 'running';
                  const canResume = m.state === 'suspended';
                  return (
                    <tr key={m.id} className="hover:bg-white/[0.03]">
                      <Td>
                        <Link to={`/machines/${m.id}`} className="font-medium text-sky-400 hover:underline">{m.name}</Link>
                        <div className="mono text-[10px] text-dim">{m.id}</div>
                      </Td>
                      <Td><Badge value={m.state} />{m.lastError && <div className="mt-1 max-w-40 truncate text-[10px] text-red-400" title={m.lastError.message}>{m.lastError.message}</div>}</Td>
                      <Td className="mono text-xs">{m.spec.vcpus}C/{(m.spec.memMiB / 1024).toFixed(0)}G · {fmtBytes((m as unknown as { storage?: { sizeBytes?: number } }).storage?.sizeBytes)}</Td>
                      <Td className="text-xs text-dim">{m.autoSuspendAfterSeconds ? `${Math.round(m.autoSuspendAfterSeconds / 60)} min` : t('ml.off')}</Td>
                      <Td className="text-xs text-dim">{fmtTime(m.createdAt)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {canStart && <Button className="!px-2 !py-1" title={t('ov.start')} loading={busy === m.id + 'start'} onClick={() => act(m, b.key, b.label, 'start')}><Play size={13} /></Button>}
                          {canStop && <Button className="!px-2 !py-1" title={t('ov.stop')} loading={busy === m.id + 'stop'} onClick={() => act(m, b.key, b.label, 'stop')}><Square size={13} /></Button>}
                          {canStop && <Button className="!px-2 !py-1" title={t('ov.suspend')} loading={busy === m.id + 'suspend'} onClick={() => act(m, b.key, b.label, 'suspend')}><Pause size={13} /></Button>}
                          {canResume && <Button className="!px-2 !py-1" title={t('ov.resume')} loading={busy === m.id + 'resume'} onClick={() => act(m, b.key, b.label, 'resume')}><RotateCcw size={13} /></Button>}
                          <Button className="!px-2 !py-1" variant="danger" title={t('common.delete')} onClick={() => setDelTarget({ m, key: b.key, label: b.label })}><Trash2 size={13} /></Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
        </Card>
      ))}

      <Confirm
        open={!!delTarget} onClose={() => setDelTarget(null)}
        onConfirm={del}
        title={`${t('common.delete')} ${delTarget?.m.name || ''}`}
        message={`${t('ov.delHint')}（${t('mx.account')}: ${delTarget?.label || ''}）`}
        confirmText={t('common.confirmDelete')} danger requireText={delTarget?.m.name}
      />
    </div>
  );
}
