/** 命令面板 Ctrl+K：全局搜索页面/沙箱/账号，回车跳转或切换 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { machinesApi } from '@/api/machines';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import type { Machine } from '@/api/types';

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  action: () => void;
}

export function CommandPalette() {
  const { t } = useT();
  const { accounts, switchTo } = useGlobal();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    if (!open) { setQ(''); setActive(0); return; }
    setTimeout(() => inputRef.current?.focus(), 30);
    machinesApi.list({ limit: 200 }).then((r) => setMachines(r.machines || [])).catch(() => { /* ignore */ });
  }, [open]);

  const pages = useMemo(() => [
    ['/', 'nav.dashboard'], ['/matrix', 'nav.matrix'], ['/machines', 'nav.machines'], ['/snapshots', 'nav.snapshots'],
    ['/ports', 'nav.ports'], ['/secrets', 'nav.secrets'], ['/webhooks', 'nav.webhooks'], ['/inbox', 'nav.inbox'],
    ['/exports', 'nav.exports'], ['/usage', 'nav.usage'], ['/templates', 'nav.templates'],
    ['/playground', 'nav.playground'], ['/settings', 'nav.settings'],
  ], []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const q0 = q.trim().toLowerCase();
    for (const [to, label] of pages) {
      const l = t(label);
      if (!q0 || l.toLowerCase().includes(q0) || to.includes(q0)) {
        out.push({ id: `p${to}`, group: t('kbd.pages'), label: l, sub: to, action: () => { nav(to); setOpen(false); } });
      }
    }
    for (const m of machines) {
      if (q0 && !m.name.toLowerCase().includes(q0) && !m.id.includes(q0)) continue;
      out.push({ id: `m${m.id}`, group: t('kbd.sandboxes'), label: m.name, sub: m.state, action: () => { nav(`/machines/${m.id}`); setOpen(false); } });
    }
    for (const a of accounts) {
      if (q0 && !a.label.toLowerCase().includes(q0)) continue;
      out.push({ id: `a${a.key}`, group: t('kbd.accounts'), label: a.label, sub: t('layout.switch'), action: () => { switchTo(a.key); setOpen(false); } });
    }
    return out;
  }, [q, machines, accounts, pages, nav, switchTo, t]);

  useEffect(() => { setActive(0); }, [q]);

  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const it of items) {
      if (!g.has(it.group)) g.set(it.group, []);
      g.get(it.group)!.push(it);
    }
    return [...g.entries()];
  }, [items]);

  const runItem = useCallback((it: Item) => { it.action(); }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && items[active]) { e.preventDefault(); runItem(items[active]); }
  };

  if (!open) return null;
  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={15} className="text-dim" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t('kbd.ph')}
            className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-dim"
          />
          <span className="mono rounded border border-line px-1.5 py-0.5 text-[10px] text-dim">Ctrl K</span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 && <div className="py-6 text-center text-sm text-dim">{t('kbd.none')}</div>}
          {groups.map(([group, list]) => (
            <div key={group}>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-dim">{group}</div>
              {list.map((it) => {
                flatIdx++;
                const isActive = flatIdx === active;
                return (
                  <button
                    key={it.id}
                    onClick={() => runItem(it)}
                    onMouseEnter={() => setActive(items.indexOf(it))}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${isActive ? 'bg-sky-500/15 text-sky-300' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    <span className="min-w-0 truncate">{it.label}</span>
                    {it.sub && <span className="ml-2 shrink-0 text-xs text-dim">{it.sub}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
