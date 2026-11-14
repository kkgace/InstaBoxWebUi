/** 终端：多标签会话 + 字体调节。
 *  会话容器由代码创建并挂到常驻外层容器（不依赖 React 渲染时序），
 *  避免"先查容器再渲染容器"的顺序问题。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { errText, wsProxyUrl } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Button, Select, ErrorBox } from '@/components/ui';
import type { Machine } from '@/api/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SessionMeta {
  id: number;
  label: string;
  term: { dispose: () => void; write: (d: Uint8Array) => void; writeln: (s: string) => void; focus: () => void; options: any; onData: (cb: (d: string) => void) => void; onResize: (cb: (d: { cols: number; rows: number }) => void) => void };
  fit: { fit: () => void };
  ws: WebSocket | null;
  div: HTMLDivElement;
  connected: boolean;
}

let nextSessionId = 1;

export default function TerminalTab({ m }: { m: Machine }) {
  const { t } = useT();
  const outerRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<{ id: number; label: string; connected: boolean }[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cols, setCols] = useState('120');
  const [rows, setRows] = useState('32');
  const [fontSize, setFontSize] = useState('13');
  const metaRef = useRef<Map<number, SessionMeta>>(new Map());

  const running = m.state === 'running';
  const active = sessions.find((s) => s.id === activeId);

  // 卸载：关全部会话
  useEffect(() => {
    const map = metaRef.current;
    return () => {
      for (const meta of map.values()) {
        try { meta.ws?.close(); } catch { /* ignore */ }
        try { meta.term.dispose(); } catch { /* ignore */ }
      }
      map.clear();
    };
  }, []);

  // 标签切换：显隐 + 自适应 + 聚焦
  useEffect(() => {
    for (const [id, meta] of metaRef.current) {
      meta.div.style.display = id === activeId ? 'block' : 'none';
      if (id === activeId) {
        requestAnimationFrame(() => { meta.fit.fit(); meta.term.focus(); });
      }
    }
  }, [activeId]);

  const closeSession = useCallback((id: number) => {
    const meta = metaRef.current.get(id);
    if (meta) {
      try { meta.ws?.close(); } catch { /* ignore */ }
      try { meta.term.dispose(); } catch { /* ignore */ }
      meta.div.remove();
      metaRef.current.delete(id);
    }
    setSessions((ss) => {
      const rest = ss.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(rest.length ? rest[rest.length - 1].id : null);
      return rest;
    });
  }, [activeId]);

  const connect = async () => {
    if (!running || !outerRef.current) return;
    setErr(null); setConnecting(true);
    try {
      const ticket = await machinesApi.access(m.id, 'terminal');
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);

      const id = nextSessionId++;
      const div = document.createElement('div');
      div.style.height = '100%';
      div.dataset.sid = String(id);
      outerRef.current.appendChild(div);

      const term = new Terminal({
        cursorBlink: true,
        fontSize: Number(fontSize) || 13,
        fontFamily: '"JetBrains Mono", Consolas, monospace',
        theme: { background: '#0b0f17', foreground: '#dbe4f0', cursor: '#38bdf8', selectionBackground: '#274156' },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(div);
      fit.fit();

      // 上游要求两个子协议：响应的 protocol 字段值 + 访问令牌
      const protos: string[] = [];
      if (ticket.protocol) protos.push(ticket.protocol);
      if (ticket.token) protos.push(`instabox-access-token.${ticket.token}`);
      const ws = new WebSocket(wsProxyUrl(ticket.url, protos.join(',')), protos);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        metaRef.current.get(id)!.connected = true;
        setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, connected: true } : s)));
        term.focus();
      };
      ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer));
      ws.onclose = () => {
        term.writeln('\r\n\x1b[33m[' + t('term.closed') + ']\x1b[0m');
        metaRef.current.get(id)!.connected = false;
        setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, connected: false } : s)));
      };
      ws.onerror = () => setErr(t('term.wsFail'));
      term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(d)); });
      term.onResize(({ cols: c, rows: r }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(`\x1b[8;${r};${c}t`));
      });

      metaRef.current.set(id, { id, label: `#${id}`, term, fit, ws, div, connected: false });
      setSessions((ss) => [...ss, { id, label: `#${id}`, connected: false }]);
      setActiveId(id);
    } catch (e) { setErr(errText(e)); }
    setConnecting(false);
  };

  const applyFontSize = (fs: string) => {
    setFontSize(fs);
    for (const meta of metaRef.current.values()) {
      meta.term.options.fontSize = Number(fs) || 13;
      if (meta.id === activeId) meta.fit.fit();
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
              <button onClick={() => setActiveId(s.id)}>{s.label}</button>
              <span className={`inline-block size-1.5 rounded-full ${s.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <button onClick={() => closeSession(s.id)} className="text-dim hover:text-red-400"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {/* 常驻外层容器：各会话 div 由 connect() 创建挂入 */}
      <div className="overflow-hidden rounded-lg border border-line bg-bg p-1">
        <div ref={outerRef} className="h-[480px] w-full relative">
          {sessions.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-dim">{t('term.disconnected')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
