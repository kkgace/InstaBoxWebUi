/** 终端：多标签会话 + 字体调节，每个会话独立 WS（access ticket → 子协议透传） */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { errText, wsProxyUrl } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Button, Select, ErrorBox } from '@/components/ui';
import type { Machine } from '@/api/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Session {
  id: number;
  label: string;
  term: { dispose: () => void; write: (d: Uint8Array) => void; writeln: (s: string) => void; focus: () => void; options: any; onData: (cb: (d: string) => void) => void; onResize: (cb: (d: { cols: number; rows: number }) => void) => void };
  fit: { fit: () => void };
  ws: WebSocket | null;
  host: HTMLDivElement | null;
  connected: boolean;
}

let nextSessionId = 1;

export default function TerminalTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cols, setCols] = useState('120');
  const [rows, setRows] = useState('32');
  const [fontSize, setFontSize] = useState('13');
  const holdersRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const running = m.state === 'running';
  const active = sessions.find((s) => s.id === activeId);

  // 卸载时关闭全部
  useEffect(() => {
    const map = holdersRef.current;
    return () => {
      for (const s of sessionsRef.current) {
        s.ws?.close();
        s.term.dispose();
      }
      map.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sessionsRef = useRef<Session[]>([]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const connect = async () => {
    if (!running) return;
    setErr(null); setConnecting(true);
    try {
      const ticket = await machinesApi.access(m.id, 'terminal');
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);

      const id = nextSessionId++;
      const host = holdersRef.current.get(id);
      if (!host) { setErr('internal: host missing'); setConnecting(false); return; }
      host.innerHTML = '';

      const term = new Terminal({
        cursorBlink: true,
        fontSize: Number(fontSize) || 13,
        fontFamily: '"JetBrains Mono", Consolas, monospace',
        theme: { background: '#0b0f17', foreground: '#dbe4f0', cursor: '#38bdf8', selectionBackground: '#274156' },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      host.addEventListener('resize', () => fit.fit());

      const protos: string[] = [];
      if (ticket.protocol) protos.push(ticket.protocol);
      if (ticket.token) protos.push(`instabox-access-token.${ticket.token}`);
      const ws = new WebSocket(wsProxyUrl(ticket.url, protos.join(',')), protos);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, connected: true } : s)));
      ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer));
      ws.onclose = () => {
        term.writeln('\r\n\x1b[33m[' + t('term.closed') + ']\x1b[0m');
        setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, connected: false } : s)));
      };
      ws.onerror = () => setErr(t('term.wsFail'));
      term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(d)); });
      term.onResize(({ cols: c, rows: r }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(`\x1b[8;${r};${c}t`));
      });

      const sess: Session = { id, label: `#${id}`, term, fit, ws, host, connected: false };
      setSessions((ss) => [...ss, sess]);
      setActiveId(id);
      setTimeout(() => { fit.fit(); term.focus(); }, 50);
    } catch (e) { setErr(errText(e)); }
    setConnecting(false);
  };

  const closeSession = (id: number) => {
    setSessions((ss) => {
      const s = ss.find((x) => x.id === id);
      if (s) { s.ws?.close(); s.term.dispose(); holdersRef.current.delete(id); }
      const rest = ss.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(rest.length ? rest[rest.length - 1].id : null);
      return rest;
    });
  };

  const applyFontSize = (fs: string) => {
    setFontSize(fs);
    for (const s of sessions) {
      s.term.options.fontSize = Number(fs) || 13;
      s.fit.fit();
    }
  };

  return (
    <div className="space-y-3">
      {!running && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{t('term.notRunning')}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cols} onChange={(e) => setCols(e.target.value)} className="w-24" disabled={!!active?.connected}>
          {[80, 100, 120, 150, 200].map((c) => <option key={c} value={c}>{c} {t('term.cols')}</option>)}
        </Select>
        <Select value={rows} onChange={(e) => setRows(e.target.value)} className="w-24" disabled={!!active?.connected}>
          {[24, 32, 40, 50].map((c) => <option key={c} value={c}>{c} {t('term.rows')}</option>)}
        </Select>
        <Select value={fontSize} onChange={(e) => applyFontSize(e.target.value)} className="w-24" title={t('term.fontSize')}>
          {[12, 13, 14, 16, 18].map((c) => <option key={c} value={c}>{c}px</option>)}
        </Select>
        <Button variant="primary" onClick={connect} loading={connecting} disabled={!running}><Plus size={14} /> {t('term.connect')}</Button>
        {sessions.length > 0 && (
          <span className={`text-xs ${sessions.some((s) => s.connected) ? 'text-emerald-400' : 'text-dim'}`}>
            {sessions.filter((s) => s.connected).length > 0 ? t('term.connected') : t('term.disconnected')}
          </span>
        )}
      </div>
      <ErrorBox>{err}</ErrorBox>

      {/* 多标签 */}
      {sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1">
          {sessions.map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-1 rounded-t border-b-2 px-2 py-1 text-xs ${s.id === activeId ? 'border-sky-500 text-sky-400' : 'border-transparent text-dim hover:text-slate-200'}`}>
              <button onClick={() => { setActiveId(s.id); setTimeout(() => { s.fit.fit(); s.term.focus(); }, 30); }}>{s.label}</button>
              <span className={`inline-block size-1.5 rounded-full ${s.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <button onClick={() => closeSession(s.id)} className="text-dim hover:text-red-400"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* 会话容器（隐藏非活动的） */}
      <div className="overflow-hidden rounded-lg border border-line bg-bg p-1">
        {sessions.length === 0 && <div className="flex h-[480px] items-center justify-center text-sm text-dim">{t('term.disconnected')}</div>}
        {sessions.map((s) => (
          <div
            key={s.id}
            data-session={s.id}
            ref={(el) => {
              if (el) holdersRef.current.set(s.id, el);
              else holdersRef.current.delete(s.id);
              s.host = el;
            }}
            className="h-[480px] w-full"
            style={{ display: s.id === activeId ? 'block' : 'none' }}
          />
        ))}
      </div>
    </div>
  );
}
