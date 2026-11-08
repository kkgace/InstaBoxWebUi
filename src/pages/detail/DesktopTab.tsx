/** 桌面：安装/启动/接管，noVNC 内嵌查看 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MonitorPlay, UserCheck, LogOut, RefreshCw, Link2, Trash2 } from 'lucide-react';
import { errText, wsProxyUrl } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Input, CopyButton, Field } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, DesktopState, DesktopStreamLink } from '@/api/types';

export default function DesktopTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [st, setSt] = useState<DesktopState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [w, setW] = useState('1280');
  const [h, setH] = useState('800');
  const [stream, setStream] = useState<DesktopStreamLink | null>(null);
  const vncHost = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<{ disconnect: () => void } | null>(null);
  const [vncOn, setVncOn] = useState(false);

  const refresh = useCallback(async () => {
    try { setSt(await machinesApi.desktop(m.id, 'status')); }
    catch (e) { setErr(errText(e)); }
  }, [m.id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { try { rfbRef.current?.disconnect(); } catch { /* ignore */ } }, []);

  const act = async (action: 'install' | 'start' | 'takeover' | 'handback') => {
    setBusy(action); setErr(null); setOk(null);
    try {
      const width = Number(w) || undefined;
      const height = Number(h) || undefined;
      const r = await machinesApi.desktop(m.id, action, action === 'start' ? width : undefined, action === 'start' ? height : undefined);
      setSt(r);
      setOk(`${action} · ${t('common.done')}`);
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const connectVnc = async () => {
    setErr(null); setOk(null);
    try {
      let s = await machinesApi.desktop(m.id, 'status');
      setSt(s);
      if (!s.installed && !s.installing) {
        setOk(t('desk.installing'));
        s = await machinesApi.desktop(m.id, 'install');
        setSt(s);
      }
      if (!s.running) {
        setOk(t('desk.starting'));
        s = await machinesApi.desktop(m.id, 'start', Number(w) || undefined, Number(h) || undefined);
        setSt(s);
      }
      setOk(t('desk.connecting'));
      const ticket = await machinesApi.access(m.id, 'vnc');
      // @ts-expect-error noVNC 无 TS 类型
      const { default: RFB } = await import('@novnc/novnc/lib/rfb.js');
      try { rfbRef.current?.disconnect(); } catch { /* ignore */ }
      vncHost.current!.innerHTML = '';
      // 上游要求两个子协议：响应的 protocol 字段值 + 访问令牌
      const proto: string[] = [];
      if (ticket.protocol) proto.push(ticket.protocol);
      if (ticket.token) proto.push(`instabox-access-token.${ticket.token}`);
      const vncUrl = wsProxyUrl(ticket.url, proto.join(','));
      const rfb = new RFB(vncHost.current!, vncUrl, { protocols: proto });
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.background = '#0b0f17';
      rfb.addEventListener('disconnect', () => setVncOn(false));
      rfbRef.current = rfb as unknown as { disconnect: () => void };
      setVncOn(true);
      setOk(null);
    } catch (e) { setErr(errText(e)); }
  };

  const makeStream = async () => {
    setErr(null);
    try {
      const r = await machinesApi.desktopStream(m.id);
      setStream(r);
      setOk(t('desk.linkMade'));
    } catch (e) { setErr(errText(e)); }
  };
  const revokeStream = async () => {
    try { await machinesApi.desktopStreamRevoke(m.id); setStream(null); setOk(t('desk.linkRevoked')); }
    catch (e) { setErr(errText(e)); }
  };

  const running = m.state === 'running';

  return (
    <div className="space-y-4">
      {!running && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{t('desk.notRunning')}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('desk.state')} right={<Button variant="ghost" className="!px-2" onClick={refresh}><RefreshCw size={14} /></Button>} className="lg:col-span-1">
          {!st ? <div className="text-sm text-dim">{t('common.loading')}</div> : (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge value={st.running ? 'succeeded' : 'stopped'}>{st.running ? t('desk.vncRunning') : t('desk.notRunningShort')}</Badge>
                {st.installed && <Badge value="ready">{t('desk.installed')}</Badge>}
                {st.installing && <Badge value="pending">{t('desk.installing')}</Badge>}
                {st.failed && <Badge value="failed">{t('desk.lastFail')}</Badge>}
                {st.kind && <Badge className="border-line">{st.kind}</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {!st.installed && !st.installing && <Button variant="primary" loading={busy === 'install'} onClick={() => act('install')} disabled={!running}>{t('desk.install')}</Button>}
                <Button variant="primary" loading={busy === 'start'} onClick={() => act('start')} disabled={!running}><MonitorPlay size={14} /> {t('desk.start')}</Button>
                {st.controller === 'agent' && <Button loading={busy === 'takeover'} onClick={() => act('takeover')} disabled={!running}><UserCheck size={14} /> {t('desk.takeover')}</Button>}
                {st.controller === 'human' && <Button loading={busy === 'handback'} onClick={() => act('handback')} disabled={!running}><LogOut size={14} /> {t('desk.handback')}</Button>}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Field label={t('desk.width')}><Input type="number" value={w} onChange={(e) => setW(e.target.value)} /></Field>
                <Field label={t('desk.height')}><Input type="number" value={h} onChange={(e) => setH(e.target.value)} /></Field>
              </div>
              {st.log && <details><summary className="cursor-pointer text-xs text-dim">{t('desk.installLog')}</summary><pre className="mono mt-1 max-h-40 overflow-auto rounded border border-line bg-bg p-2 text-[10px]">{st.log}</pre></details>}
              <div className="text-xs text-dim">{t('desk.controller')}{st.controller === 'human' ? t('desk.byHuman') : t('desk.byAgent')}</div>
            </div>
          )}
        </Card>

        <Card title={t('desk.share')} className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-dim">{t('desk.shareDesc')}</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={makeStream} disabled={!running}><Link2 size={14} /> {t('desk.makeLink')}</Button>
              <Button variant="danger" onClick={revokeStream} disabled={!stream && !running}><Trash2 size={14} /> {t('desk.revokeAll')}</Button>
            </div>
            {stream && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Input readOnly value={stream.url} className="mono w-full text-xs" />
                  <CopyButton text={stream.url} />
                </div>
                <div className="text-xs text-dim">{t('desk.expires', { t: fmtTime(stream.expiresAt) })}</div>
                <a href={stream.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">{t('desk.openNew')}</a>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title={t('desk.viewer')} right={<Button variant="primary" onClick={connectVnc} disabled={!running}>{t('desk.connect')}</Button>}>
        <ErrorBox>{err}</ErrorBox>
        {ok && <OkBox>{ok}</OkBox>}
        <div className="mt-2 rounded-lg border border-line bg-black" style={{ height: 480 }}>
          <div ref={vncHost} className="h-full w-full" />
          {!vncOn && <div className="flex h-full items-center justify-center text-sm text-dim">{t('desk.viewerHint')}</div>}
        </div>
      </Card>
    </div>
  );
}
