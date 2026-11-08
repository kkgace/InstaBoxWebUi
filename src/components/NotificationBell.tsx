/** 通知铃铛：未读徽标 + 下拉事件流 + 清空 + 开启浏览器通知 */
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Trash2, X } from 'lucide-react';
import { clearEvents, getEvents, notifyPermission, requestNotifyPermission, type NotifyEvent } from '@/utils/notify';
import { useT } from '@/i18n';
import { Button, Badge } from '@/components/ui';
import { fmtTime } from '@/utils/format';

export function NotificationBell() {
  const { t } = useT();
  const [events, setEvents] = useState<NotifyEvent[]>(getEvents);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(notifyPermission());
  const [seenCount, setSeenCount] = useState(() => getEvents().length);
  const panel = useRef<HTMLDivElement>(null);

  // 轮询器把新事件写进 localStorage；这里每 5s 读一次（简单可靠）
  useEffect(() => {
    const i = setInterval(() => {
      const list = getEvents();
      setEvents(list);
    }, 5000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const unread = Math.max(0, events.length - seenCount);
  const openPanel = () => { setOpen((v) => !v); setSeenCount(getEvents().length); };
  const enableNotify = async () => {
    const ok = await requestNotifyPermission();
    setPerm(notifyPermission());
    if (ok) setEvents(getEvents());
  };

  const stateText = (ev: NotifyEvent) =>
    ev.kind === 'error'
      ? `${ev.machineName}: ${ev.message || ''}`
      : `${ev.machineName}: ${ev.from} → ${ev.to}`;

  return (
    <div className="relative" ref={panel}>
      <button
        onClick={openPanel}
        className="relative rounded-md p-2 text-dim hover:bg-white/5 hover:text-slate-200"
        title={t('notify.title')}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-line bg-panel shadow-2xl sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <div className="text-sm font-semibold">{t('notify.title')}</div>
            <div className="flex items-center gap-1">
              {perm !== 'granted' && perm !== 'unsupported' && (
                <Button className="!px-2 !py-1 !text-xs" onClick={enableNotify}>{t('notify.enable')}</Button>
              )}
              {events.length > 0 && (
                <Button variant="ghost" className="!px-2 !py-1" title={t('notify.clear')}
                  onClick={() => { clearEvents(); setEvents([]); setSeenCount(0); }}>
                  <Trash2 size={13} />
                </Button>
              )}
              <Button variant="ghost" className="!px-2 !py-1" onClick={() => setOpen(false)}><X size={13} /></Button>
            </div>
          </div>
          {events.length === 0 ? (
            <div className="py-8 text-center text-sm text-dim">{t('notify.empty')}</div>
          ) : (
            <div className="max-h-80 divide-y divide-line/60 overflow-y-auto">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 px-3 py-2">
                  <Badge value={ev.kind === 'error' ? 'error' : ev.to} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="break-all text-xs text-slate-300">{stateText(ev)}</div>
                    <div className="text-[10px] text-dim">{fmtTime(ev.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
