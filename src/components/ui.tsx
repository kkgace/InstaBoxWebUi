/** 基础 UI 组件（Tailwind，深色主题） */
import React, { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import { STATE_META } from '@/utils/format';

// ---------- Button ----------
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'soft';
export function Button({ variant = 'soft', className = '', loading, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500/50',
    ghost: 'bg-transparent hover:bg-white/5 text-slate-300 border-transparent',
    danger: 'bg-red-600/90 hover:bg-red-500 text-white border-red-500/50',
    soft: 'bg-white/5 hover:bg-white/10 text-slate-200 border-line',
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---------- Badge ----------
export function Badge({ value, className = '', children }: { value?: string; className?: string; children?: React.ReactNode }) {
  const meta = value ? STATE_META[value] : undefined;
  const color = meta?.color ?? 'bg-white/5 text-slate-300 border-line';
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${className || color}`}>
      {children ?? (meta?.zh ?? value)}
    </span>
  );
}

// ---------- Card ----------
export function Card({ title, right, className = '', children }: { title?: React.ReactNode; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border border-line bg-panel ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------- Inputs ----------
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-slate-200 placeholder:text-dim outline-none focus:border-sky-600/60 ${props.className || ''}`}
    />
  );
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`mono rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-slate-200 placeholder:text-dim outline-none focus:border-sky-600/60 ${props.className || ''}`}
    />
  );
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-600/60 ${props.className || ''}`}
    />
  );
}
export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...props}
      className={`size-4 rounded border-line bg-bg accent-sky-500 ${props.className || ''}`}
    />
  );
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="text-xs font-medium text-dim">{label}</div>
      {children}
      {hint && <div className="text-xs text-dim/80">{hint}</div>}
    </label>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, width = 'max-w-lg', children }: {
  open: boolean; onClose: () => void; title: React.ReactNode; width?: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${width} rounded-xl border border-line bg-panel shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-dim hover:bg-white/5 hover:text-slate-200"><X size={16} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ---------- Confirm ----------
export function Confirm({ open, onClose, onConfirm, title, message, confirmText = '确认', danger, requireText }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: React.ReactNode; confirmText?: string; danger?: boolean; requireText?: string;
}) {
  const [txt, setTxt] = useState('');
  useEffect(() => { if (open) setTxt(''); }, [open]);
  const ok = !requireText || txt === requireText;
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="space-y-3 text-sm text-slate-300">
        <div className="flex gap-2">
          {danger && <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />}
          <div>{message}</div>
        </div>
        {requireText && (
          <Field label={`输入 ${requireText} 以确认`}>
            <Input value={txt} onChange={(e) => setTxt(e.target.value)} className="mono w-full" placeholder={requireText} autoFocus />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!ok} onClick={() => { onConfirm(); onClose(); }}>{confirmText}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- CopyButton ----------
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); ta.remove();
        }
        setDone(true); setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded p-1 text-dim hover:bg-white/5 hover:text-slate-200"
      title={label || '复制'}
    >
      {done ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
      {label && <span className="text-xs">{done ? '已复制' : label}</span>}
    </button>
  );
}

// ---------- Spinner / Empty / ErrorBox ----------
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 size={18} className={`animate-spin text-dim ${className}`} />;
}
export function Empty({ children = '暂无数据' }: { children?: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-dim">{children}</div>;
}
export function ErrorBox({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <div className="break-all">{children}</div>
    </div>
  );
}
export function OkBox({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{children}</div>;
}

// ---------- JsonView ----------
export function JsonView({ data, max = 480 }: { data: unknown; max?: number }) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <pre ref={ref} className="mono overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-slate-300" style={{ maxHeight: max }}>
      {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ---------- Tabs ----------
export function Tabs({ tabs, active, onChange, className = '' }: {
  tabs: { key: string; label: React.ReactNode }[]; active: string; onChange: (k: string) => void; className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1 border-b border-line ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
            active === t.key
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-dim hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Breadcrumb ----------
export function Crumbs({ parts, onNav }: { parts: string[]; onNav: (idx: number) => void }) {
  return (
    <div className="mono flex flex-wrap items-center gap-0.5 text-xs text-dim">
      <button className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-slate-200" onClick={() => onNav(0)}>/</button>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={11} className="text-dim/60" />}
          <button className={`rounded px-1 py-0.5 hover:bg-white/5 ${i === parts.length - 1 ? 'text-slate-200' : 'hover:text-slate-200'}`} onClick={() => onNav(i + 1)}>
            {p}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------- Stat ----------
export function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-xs text-dim">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ? 'text-sky-400' : 'text-slate-100'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-dim">{sub}</div>}
    </div>
  );
}

// ---------- Table ----------
export function Table({ head, children, className = '' }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-line ${className}`}>
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-panel2 text-xs text-dim">
            {head.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">{children}</tbody>
      </table>
    </div>
  );
}
export function Td({ children, className = '', title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`px-3 py-2 align-middle text-slate-300 ${className}`}>{children}</td>;
}
