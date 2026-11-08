/** 桌面：安装/启动/接管，noVNC 内嵌查看 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MonitorPlay, UserCheck, LogOut, RefreshCw, Link2, Trash2 } from 'lucide-react';
import { errText, wsProxyUrl } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { Card, Button, Badge, ErrorBox, OkBox, Input, CopyButton, Field } from '@/components/ui';
import { fmtTime } from '@/utils/format';
import type { Machine, DesktopState, DesktopStreamLink } from '@/api/types';

export default function DesktopTab({ m }: { m: Machine }) {
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
      setOk(`${action} 完成`);
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const connectVnc = async () => {
    setErr(null); setOk(null);
    try {
      // 确保 VNC 在跑：未安装先安装（耗时数分钟），再启动
      let s = await machinesApi.desktop(m.id, 'status');
      setSt(s);
      if (!s.installed && !s.installing) {
        setOk('首次使用：正在安装桌面组件（下载 Xfce/Chromium，可能需要几分钟，请勿关闭页面）…');
        s = await machinesApi.desktop(m.id, 'install');
        setSt(s);
      }
      if (!s.running) {
        setOk('正在启动桌面…');
        s = await machinesApi.desktop(m.id, 'start', Number(w) || undefined, Number(h) || undefined);
        setSt(s);
      }
      setOk('桌面已启动，正在建立 VNC 连接…');
      const t = await machinesApi.access(m.id, 'vnc');
      // @ts-expect-error noVNC 无 TS 类型
      const { default: RFB } = await import('@novnc/novnc/lib/rfb.js');
      try { rfbRef.current?.disconnect(); } catch { /* ignore */ }
      vncHost.current!.innerHTML = '';
      // 上游要求两个子协议：响应的 protocol 字段值 + 访问令牌
      const proto: string[] = [];
      if (t.protocol) proto.push(t.protocol);
      if (t.token) proto.push(`instabox-access-token.${t.token}`);
      const vncUrl = wsProxyUrl(t.url, proto.join(','));
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
      setOk('分享链接已生成（无需登录即可打开）');
    } catch (e) { setErr(errText(e)); }
  };
  const revokeStream = async () => {
    try { await machinesApi.desktopStreamRevoke(m.id); setStream(null); setOk('已撤销全部分享链接'); }
    catch (e) { setErr(errText(e)); }
  };

  const running = m.state === 'running';

  return (
    <div className="space-y-4">
      {!running && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">沙箱未运行。</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="桌面状态" right={<Button variant="ghost" className="!px-2" onClick={refresh}><RefreshCw size={14} /></Button>} className="lg:col-span-1">
          {!st ? <div className="text-sm text-dim">加载中…</div> : (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Badge value={st.running ? 'succeeded' : 'stopped'}>{st.running ? 'VNC 运行中' : '未运行'}</Badge>
                {st.installed && <Badge value="ready">已安装</Badge>}
                {st.installing && <Badge value="pending">安装中</Badge>}
                {st.failed && <Badge value="failed">上次失败</Badge>}
                {st.kind && <Badge className="border-line">{st.kind}</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {!st.installed && !st.installing && <Button variant="primary" loading={busy === 'install'} onClick={() => act('install')} disabled={!running}>安装桌面组件</Button>}
                <Button variant="primary" loading={busy === 'start'} onClick={() => act('start')} disabled={!running}><MonitorPlay size={14} /> 启动桌面</Button>
                {st.controller === 'agent' && <Button loading={busy === 'takeover'} onClick={() => act('takeover')} disabled={!running}><UserCheck size={14} /> 接管（人操作）</Button>}
                {st.controller === 'human' && <Button loading={busy === 'handback'} onClick={() => act('handback')} disabled={!running}><LogOut size={14} /> 交还代理</Button>}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Field label="宽"><Input type="number" value={w} onChange={(e) => setW(e.target.value)} /></Field>
                <Field label="高"><Input type="number" value={h} onChange={(e) => setH(e.target.value)} /></Field>
              </div>
              {st.log && <details><summary className="cursor-pointer text-xs text-dim">安装日志</summary><pre className="mono mt-1 max-h-40 overflow-auto rounded border border-line bg-bg p-2 text-[10px]">{st.log}</pre></details>}
              <div className="text-xs text-dim">当前控制者：{st.controller === 'human' ? '人（你）' : '代理'}</div>
            </div>
          )}
        </Card>

        <Card title="分享链接（免登录观看）" className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-dim">生成一个无需登录的浏览器观看链接（可嵌入 iframe），到期自动失效。</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={makeStream} disabled={!running}><Link2 size={14} /> 生成链接</Button>
              <Button variant="danger" onClick={revokeStream} disabled={!stream && !running}><Trash2 size={14} /> 撤销全部</Button>
            </div>
            {stream && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Input readOnly value={stream.url} className="mono w-full text-xs" />
                  <CopyButton text={stream.url} />
                </div>
                <div className="text-xs text-dim">到期：{fmtTime(stream.expiresAt)}</div>
                <a href={stream.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">在新标签页打开 →</a>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title="VNC 查看器" right={<Button variant="primary" onClick={connectVnc} disabled={!running}>连接桌面</Button>}>
        <ErrorBox>{err}</ErrorBox>
        {ok && <OkBox>{ok}</OkBox>}
        <div className="mt-2 rounded-lg border border-line bg-black" style={{ height: 480 }}>
          <div ref={vncHost} className="h-full w-full" />
          {!vncOn && <div className="flex h-full items-center justify-center text-sm text-dim">点击「连接桌面」后在此显示远程桌面</div>}
        </div>
      </Card>
    </div>
  );
}
