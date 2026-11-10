/** Webhook 收件箱：接收 URL + 事件流（自动刷新） */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { api, errText } from '@/api/client';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Empty, JsonView } from '@/components/ui';
import { fmtTime } from '@/utils/format';

interface HookEvent { id: string; at: string; event: string; headers: Record<string, string | null>; body: string }

export default function WebhookInbox() {
  const { t } = useT();
  const [events, setEvents] = useState<HookEvent[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ events: HookEvent[]; token: string | null }>('GET', 'hook-events', { timeoutMs: 15000 });
      setEvents(r.events || []);
      setToken(r.token);
      setErr(null);
    } catch (e) { setErr(errText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(load, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, load]);

  const clear = async () => {
    try { await api('DELETE', 'hook-events', { timeoutMs: 15000 }); setEvents([]); setOk(t('wk.cleared')); }
    catch (e) { setErr(errText(e)); }
  };

  const base = location.origin + '/hook';
  const url = token ? `${base}?token=${token}` : base;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{t('wk.title')}</h1>
          <p className="text-xs text-dim">{t('wk.desc')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-dim">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('wk.autoRefresh')}
          </label>
          <Button variant="ghost" onClick={load}><RefreshCw size={14} /></Button>
          <Button variant="danger" onClick={clear}><Trash2 size={14} /> {t('wk.clear')}</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}

      <Card title={t('wk.yourUrl')}>
        <div className="flex items-center gap-1">
          <Input2 value={url} />
          <CopyButtonEx text={url} />
        </div>
        {token && <div className="mt-1 text-[10px] text-amber-400">{t('wk.tokenNote')}</div>}
      </Card>

      {!events?.length ? (
        <Card><Empty>{t('wk.empty')}</Empty></Card>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} title={
              <span className="flex flex-wrap items-center gap-2">
                <Badge value="succeeded">{ev.event}</Badge>
                <span className="text-xs text-dim">{fmtTime(ev.at)}</span>
                {ev.headers?.signature && <span className="mono max-w-40 truncate text-[10px] text-dim" title={ev.headers.signature}>{t('wk.sig')}: {ev.headers.signature.slice(0, 24)}…</span>}
              </span>
            }>
              <JsonView data={(() => { try { return JSON.parse(ev.body); } catch { return ev.body; } })()} max={220} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Input2({ value }: { value: string }) {
  return <input readOnly value={value} className="mono min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-xs text-slate-300 outline-none" />;
}
function CopyButtonEx({ text }: { text: string }) {
  const { t } = useT();
  return <Button variant="soft" onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }}>{t('common.copy')}</Button>;
}
