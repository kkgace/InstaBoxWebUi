/** 终端：POST access{terminal} → WS（子协议 instabox-access-token.<token>）→ xterm.js */
import { useEffect, useRef, useState } from 'react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { wsProxyUrl } from '@/api/client';
import { Button, Select, ErrorBox } from '@/components/ui';
import type { Machine } from '@/api/types';

export default function TerminalTab({ m }: { m: Machine }) {
  const holder = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ dispose: () => void; writeln: (s: string) => void; focus: () => void } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cols, setCols] = useState('120');
  const [rows, setRows] = useState('32');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    return () => { // 卸载清理
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null; wsRef.current = null;
    };
  }, []);

  const connect = async () => {
    setErr(null); setConnecting(true);
    try {
      const t = await machinesApi.access(m.id, 'terminal');
      // 动态引入 xterm（避免首屏加载体积）
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      termRef.current?.dispose();
      const term = new Terminal({
        cursorBlink: true, fontSize: 13, fontFamily: '"JetBrains Mono", Consolas, monospace',
        theme: { background: '#0b0f17', foreground: '#dbe4f0', cursor: '#38bdf8', selectionBackground: '#274156' },
        scrollback: 5000,
      });
      termRef.current = term;
      const fit = new FitAddon();
      term.loadAddon(fit);
      holder.current!.innerHTML = '';
      term.open(holder.current!);
      fit.fit();

      // 上游要求两个子协议：响应的 protocol 字段值 + 访问令牌
      const protos: string[] = [];
      if (t.protocol) protos.push(t.protocol);
      if (t.token) protos.push(`instabox-access-token.${t.token}`);
      const ws = new WebSocket(wsProxyUrl(t.url, protos.join(',')), protos);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { setConnected(true); term.focus(); };
      ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer));
      ws.onclose = () => { setConnected(false); term.writeln('\r\n\x1b[33m[连接已关闭]\x1b[0m'); };
      ws.onerror = () => setErr('WebSocket 连接失败');
      term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(d)); });
      term.onResize(({ cols: c, rows: r }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(`\x1b[8;${r};${c}t`));
      });
    } catch (e) { setErr(errText(e)); }
    setConnecting(false);
  };

  const disconnect = () => { wsRef.current?.close(); setConnected(false); };

  const running = m.state === 'running';

  return (
    <div className="space-y-3">
      {!running && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">沙箱未运行，请先在「概览」启动。</div>}
      <div className="flex items-center gap-2">
        <Select value={cols} onChange={(e) => setCols(e.target.value)} className="w-24" disabled={connected}>
          {[80, 100, 120, 150, 200].map((c) => <option key={c} value={c}>{c} 列</option>)}
        </Select>
        <Select value={rows} onChange={(e) => setRows(e.target.value)} className="w-24" disabled={connected}>
          {[24, 32, 40, 50].map((c) => <option key={c} value={c}>{c} 行</option>)}
        </Select>
        {!connected
          ? <Button variant="primary" onClick={connect} loading={connecting} disabled={!running}>连接终端</Button>
          : <Button variant="danger" onClick={disconnect}>断开</Button>}
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-dim'}`}>{connected ? '● 已连接' : '○ 未连接'}</span>
      </div>
      <ErrorBox>{err}</ErrorBox>
      <div className="overflow-hidden rounded-lg border border-line bg-bg p-1">
        <div ref={holder} className="h-[480px] w-full" />
      </div>
    </div>
  );
}
