/** Cron 定时任务管理：读/写沙箱 crontab（exec + stdin），结构化行编辑 + 高级模式 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2, Save, Clock, Table2, FileText } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { parseCrontab, rowsToCrontab, type CronRow } from '@/utils/cron';
import { Card, Button, Badge, ErrorBox, OkBox, Spinner, Field, Textarea, Input, Empty } from '@/components/ui';
import type { Machine } from '@/api/types';

export default function CronTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [rows, setRows] = useState<CronRow[] | null>(null);
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<'table' | 'raw'>('table');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [user, setUser] = useState('');
  const [hasCron, setHasCron] = useState<boolean | null>(null); // null = 检测中

  const running = m.state === 'running';

  const installCron = async () => {
    setBusy(true); setErr(null); setOk(null);
    try {
      setOk(t('cron.installing'));
      const r = await machinesApi.exec(m.id, {
        cmd: 'command -v apt-get >/dev/null && sudo apt-get update -qq && sudo apt-get install -y -qq cron >/dev/null 2>&1; sudo systemctl enable --now cron >/dev/null 2>&1 || sudo service cron start >/dev/null 2>&1 || true; command -v crontab && echo CRON_OK',
        timeoutSeconds: 300,
      });
      if (/CRON_OK/.test(r.stdout)) {
        setHasCron(true);
        setOk(t('cron.installed'));
        await load();
      } else {
        setErr(`${t('cron.installFail')}: ${r.stderr || r.stdout || ''}`.slice(0, 300));
      }
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setOk(null);
    try {
      const probe = await machinesApi.exec(m.id, { cmd: 'command -v crontab >/dev/null 2>&1 && echo HAS_CRON || echo NO_CRON', timeoutSeconds: 20 });
      const has = /HAS_CRON/.test(probe.stdout);
      setHasCron(has);
      if (!has) { setLoading(false); return; }
      const r = await machinesApi.exec(m.id, { cmd: 'whoami; crontab -l 2>&1 || true', timeoutSeconds: 30 });
      const lines = r.stdout.split('\n').filter(Boolean);
      const who = lines.find((l) => !l.includes('no crontab') && !l.includes('command not found') && l.trim() !== '');
      setUser(who?.trim() || 'user');
      const cronText = lines.slice(1).join('\n');
      const clean = /no crontab for/i.test(cronText) ? '' : cronText;
      setRows(parseCrontab(clean));
      setRaw(clean);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [m.id]);
  useEffect(() => { if (running) load(); }, [running, load]);

  const save = async () => {
    const content = mode === 'raw' ? raw : rowsToCrontab(rows || []);
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await machinesApi.exec(m.id, { cmd: 'crontab -', stdin: content, timeoutSeconds: 30 });
      if (r.exitCode !== 0) {
        setErr(`crontab: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`);
      } else {
        setOk(t('cron.saved'));
        await load();
      }
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const updateRow = (idx: number, patch: Partial<CronRow>) => {
    setRows((rs) => (rs || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setRows((rs) => [...(rs || []), { raw: '', disabled: false, comment: '', schedule: '*/5 * * * *', command: '', valid: false }]);
  };
  const delRow = (idx: number) => setRows((rs) => (rs || []).filter((_, i) => i !== idx));

  const schedPreview = (r: CronRow) => {
    // 简单人类可读：特殊表达式直译
    if (r.special === '@reboot') return t('cron.reboot');
    if (r.special === '@hourly') return t('cron.hourly');
    if (r.special === '@daily') return t('cron.daily');
    if (r.special === '@weekly') return t('cron.weekly');
    if (r.special === '@monthly') return t('cron.monthly');
    if (!r.schedule) return '';
    const parts = r.schedule.split(/\s+/);
    if (parts.length !== 5) return '';
    const [mi, h] = parts;
    if (mi.startsWith('*/')) return t('cron.everyNMin', { n: mi.slice(2) });
    if (mi === '*' && h === '*') return t('cron.everyMin');
    if (h === '*') return t('cron.everyHourAt', { m: mi });
    return t('cron.atTime', { h, m: mi });
  };

  if (!running) return <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{t('exec.notRunning')}</div>;

  if (hasCron === false) {
    return (
      <Card title={t('cron.title')}>
        <div className="space-y-3 text-sm text-dim">
          <p>{t('cron.missing')}</p>
          <Button variant="primary" onClick={installCron} loading={busy}><RefreshCw size={14} /> {t('cron.installBtn')}</Button>
          <ErrorBox>{err}</ErrorBox>
          {ok && <OkBox>{ok}</OkBox>}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
        <Badge className="border-line">user: {user}</Badge>
        <span className="flex-1" />
        <Button variant="ghost" className={mode === 'table' ? '!text-sky-400' : ''} onClick={() => setMode('table')}><Table2 size={14} /> {t('cron.tableMode')}</Button>
        <Button variant="ghost" className={mode === 'raw' ? '!text-sky-400' : ''} onClick={() => setMode('raw')}><FileText size={14} /> {t('cron.rawMode')}</Button>
        <Button variant="primary" onClick={save} loading={busy}><Save size={14} /> {t('common.save')}</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}

      {loading ? <Spinner /> : mode === 'table' ? (
        <Card title={<span className="inline-flex items-center gap-1.5"><Clock size={15} /> {t('cron.title')}</span>}
          right={<Button className="!px-2" onClick={addRow} title={t('cron.addRow')}><Plus size={14} /></Button>}>
          {rows && rows.length === 0 ? <Empty>{t('cron.empty')}</Empty> : (
            <div className="space-y-2">
              {(rows || []).map((r, i) => (
                <div key={i} className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${r.disabled ? 'border-line bg-panel2 opacity-60' : r.valid ? 'border-line bg-panel2' : 'border-red-500/40 bg-red-500/5'}`}>
                  <input type="checkbox" checked={r.disabled} onChange={(e) => updateRow(i, { disabled: e.target.checked })} title={t('cron.disable')} className="accent-sky-500" />
                  {r.special ? (
                    <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300">{r.special}</Badge>
                  ) : (
                    <Input value={r.schedule} onChange={(e) => updateRow(i, { schedule: e.target.value, valid: e.target.value.split(/\s+/).length === 5 })} className="mono w-40 !py-1 text-xs" />
                  )}
                  <Input value={r.command} onChange={(e) => updateRow(i, { command: e.target.value })} placeholder="command…" className="mono min-w-0 flex-1 !py-1 text-xs" />
                  <Input value={r.comment} onChange={(e) => updateRow(i, { comment: e.target.value })} placeholder={t('cron.commentPh')} className="w-36 !py-1 text-xs" />
                  {r.schedule && schedPreview(r) && <span className="text-[10px] text-dim">{schedPreview(r)}</span>}
                  <Button className="!px-1.5 !py-1" variant="danger" onClick={() => delRow(i)}><Trash2 size={12} /></Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-dim">{t('cron.hint')}</p>
        </Card>
      ) : (
        <Card title={t('cron.rawMode')}>
          <Field label="crontab -l" hint={t('cron.rawHint')}>
            <Textarea rows={14} value={raw} onChange={(e) => setRaw(e.target.value)} className="h-72 w-full" spellCheck={false} />
          </Field>
        </Card>
      )}
    </div>
  );
}
