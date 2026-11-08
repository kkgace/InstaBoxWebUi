/** 应用布局：侧边导航（移动端抽屉化）+ 顶栏（多账号、org 切换、语言切换、通知） */
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Camera, Globe, KeyRound, Webhook,
  PackageOpen, Gauge, Shapes, TerminalSquare, Settings, Box, ChevronDown,
  UserCircle, Trash2, Plus, Menu, X, Bell, Languages, Users,
} from 'lucide-react';
import { useGlobal } from '@/state';
import { getApiKey, upsertAccount, removeAccount, errText, api } from '@/api/client';
import { useT } from '@/i18n';
import { Badge, Modal, Field, Input, Button, ErrorBox, OkBox } from '@/components/ui';
import { NotificationBell } from '@/components/NotificationBell';

const NAV = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/matrix', label: 'nav.matrix', icon: Users },
  { to: '/machines', label: 'nav.machines', icon: Boxes },
  { to: '/snapshots', label: 'nav.snapshots', icon: Camera },
  { to: '/ports', label: 'nav.ports', icon: Globe },
  { to: '/secrets', label: 'nav.secrets', icon: KeyRound },
  { to: '/webhooks', label: 'nav.webhooks', icon: Webhook },
  { to: '/exports', label: 'nav.exports', icon: PackageOpen },
  { to: '/usage', label: 'nav.usage', icon: Gauge },
  { to: '/templates', label: 'nav.templates', icon: Shapes },
  { to: '/playground', label: 'nav.playground', icon: TerminalSquare },
  { to: '/settings', label: 'nav.settings', icon: Settings },
];

export default function Layout() {
  const { hasKey, me, updateKey, accounts, setAccounts, orgId, setOrgId, meError, refreshMe } = useGlobal();
  const { t, lang, setLang } = useT();
  const [accOpen, setAccOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [keyOk, setKeyOk] = useState(false);
  const [adding, setAdding] = useState(false);
  // 移动端抽屉
  const [drawer, setDrawer] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  const allOrgs = [
    ...(me?.org ? [me.org] : []),
    ...(me?.workspaces || []),
  ];

  const addAccount = () => {
    const k = keyInput.trim();
    setKeyErr(null); setKeyOk(false);
    if (!k) { setKeyErr(t('login.placeholder')); return; }
    if (!k.startsWith('ibk_')) setKeyErr('InstaBox API Key: ibk_…');
    setAdding(true);
    updateKey(k);
    setKeyOk(true);
    api('GET', 'v1/me')
      .then(() => { refreshMe(); setKeyOk(false); setKeyInput(''); setKeyLabel(''); setAdding(false); setAccOpen(false); nav('/machines'); })
      .catch((e) => { setKeyErr(`${t('layout.verifyFail')}${errText(e)}`); setAdding(false); });
  };

  const switchTo = (k: string) => {
    updateKey(k);
    refreshMe();
    setAccOpen(false);
    nav('/machines');
  };

  const delAccount = (k: string) => {
    setAccounts(removeAccount(k));
    if (getApiKey() === k) updateKey('');
  };

  const navLinks = (onClick?: () => void) => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
        >
          <Icon size={16} />
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 px-4 py-4">
      <Box size={22} className="text-sky-400" />
      <div>
        <div className="text-sm font-bold text-slate-100">{t('layout.brand')}</div>
        <div className="text-[10px] text-dim">{t('layout.brandSub')}</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* 桌面侧边栏 */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-panel md:flex">
        {brand}
        {navLinks()}
        <div className="border-t border-line px-3 py-3 text-xs text-dim">
          <div className="flex items-center justify-between">
            <span className="truncate">{me?.login || me?.email || '—'}</span>
            <Badge value={hasKey ? 'ready' : 'failed'}>{hasKey ? t('layout.hasKey') : t('layout.noKey')}</Badge>
          </div>
          {me?.admin && <div className="mt-1 text-amber-400">{t('layout.admin')}</div>}
        </div>
      </aside>

      {/* 移动端抽屉 */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute left-0 top-0 flex h-full w-56 flex-col border-r border-line bg-panel">
            <div className="flex items-center justify-between pr-2">
              {brand}
              <Button variant="ghost" className="!px-2" onClick={() => setDrawer(false)}><X size={16} /></Button>
            </div>
            {navLinks(() => setDrawer(false))}
          </aside>
        </div>
      )}

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-line bg-panel/60 px-3 backdrop-blur sm:px-4">
          <Button variant="ghost" className="!px-2 md:hidden" onClick={() => setDrawer(true)} title={t('nav.menu')}><Menu size={18} /></Button>
          <div className="hidden truncate text-xs text-dim lg:block">
            {t('layout.proxyHint')} <span className="mono text-slate-400">api.instabox.sh</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* 语言切换 */}
            <Button variant="ghost" className="!px-2" title={t('lang.switch')}
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              <Languages size={15} />
              <span className="hidden text-xs sm:inline">{t('lang.name')}</span>
            </Button>
            {/* 通知 */}
            <NotificationBell />
            {/* org 切换 */}
            {allOrgs.length > 1 && (
              <div className="relative">
                <select
                  value={orgId || ''}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="max-w-36 appearance-none rounded-md border border-line bg-panel py-1.5 pl-2.5 pr-7 text-xs text-slate-300 outline-none"
                >
                  {allOrgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}{o.tier && o.tier !== 'free' ? ` (${o.tier})` : ''}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-dim" />
              </div>
            )}
            {hasKey ? (
              <Button variant="ghost" onClick={() => setAccOpen(true)} title={t('layout.accounts')}>
                <UserCircle size={14} />
                <span className="hidden max-w-32 truncate sm:inline">{me?.login || '—'}</span>
                <ChevronDown size={12} className="hidden sm:inline" />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setAccOpen(true)}>{t('layout.configKey')}</Button>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:p-5">
          {!hasKey ? <SetupGuide onOpen={() => setAccOpen(true)} /> : <Outlet />}
        </main>
      </div>

      {/* 账号管理弹窗（多 Key） */}
      <Modal open={accOpen} onClose={() => setAccOpen(false)} title={t('layout.accounts')} width="max-w-xl">
        <div className="space-y-4 text-sm">
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-dim">{t('layout.savedAccs')}</div>
              {accounts.map((a) => (
                <div key={a.key} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${a.key === getApiKey() ? 'border-sky-500/50 bg-sky-500/10' : 'border-line bg-panel2'}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => switchTo(a.key)}>
                    <div className="truncate text-slate-200">{a.label || '—'}</div>
                    <div className="mono text-[10px] text-dim">{a.key.slice(0, 8)}…{a.key.slice(-4)}</div>
                  </button>
                  {a.key === getApiKey() ? <Badge value="ready">{t('layout.current')}</Badge> : <Button className="!px-2 !py-1" onClick={() => switchTo(a.key)}>{t('layout.switch')}</Button>}
                  <Button className="!px-1.5 !py-1" variant="danger" title={t('layout.removeAcc')} onClick={() => delAccount(a.key)}><Trash2 size={12} /></Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 rounded-md border border-line bg-panel2 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300"><Plus size={13} /> {t('layout.addAcc')}</div>
            <div className="rounded-md border border-line bg-bg p-2.5 text-xs leading-relaxed text-dim">
              <p>{t('layout.addAccStep1')} <a href="https://dashboard.instabox.sh" target="_blank" rel="noreferrer" className="text-sky-400 underline">dashboard.instabox.sh</a> → <b className="text-slate-300">API keys</b> → Scopes {lang === 'zh' ? '全选' : 'all'}</p>
              <p>{t('layout.addAccStep2')} <span className="mono">instabox keys create</span></p>
              <p>{t('layout.addAccStep3')}</p>
            </div>
            <Field label={t('layout.labelHint')}>
              <Input value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} className="w-full" />
            </Field>
            <Field label="API Key">
              <Input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="ibk_..."
                className="mono w-full"
                onKeyDown={(e) => { if (e.key === 'Enter') addAccount(); }}
              />
            </Field>
            <ErrorBox>{keyErr}</ErrorBox>
            {keyOk && <OkBox>…</OkBox>}
            <div className="flex justify-end gap-2">
              {hasKey && <Button variant="ghost" onClick={() => { updateKey(''); setKeyInput(''); }}>{t('layout.logout')}</Button>}
              <Button variant="primary" onClick={addAccount} loading={adding}>{t('layout.addSwitch')}</Button>
            </div>
            {meError && <ErrorBox>{t('layout.curFail')}{meError}</ErrorBox>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** 未配置 Key 时的引导页 */
function SetupGuide({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto mt-10 max-w-2xl space-y-5">
      <div className="rounded-xl border border-line bg-panel p-6">
        <h1 className="text-lg font-bold text-slate-100">{t('setup.welcome')}</h1>
        <p className="mt-2 text-sm text-dim">{t('setup.sub')}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ['setup.f1t', 'setup.f1d'], ['setup.f2t', 'setup.f2d'], ['setup.f3t', 'setup.f3d'], ['setup.f4t', 'setup.f4d'],
            ['setup.f5t', 'setup.f5d'], ['setup.f6t', 'setup.f6d'], ['setup.f7t', 'setup.f7d'], ['setup.f8t', 'setup.f8d'],
          ].map(([tt, dd]) => (
            <div key={tt} className="rounded-lg border border-line bg-panel2 p-3">
              <div className="text-sm font-semibold text-slate-200">{t(tt)}</div>
              <div className="mt-1 text-xs text-dim">{t(dd)}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button variant="primary" onClick={onOpen}>{t('setup.cta')}</Button>
          <a href="https://instabox.sh/docs" target="_blank" rel="noreferrer" className="text-xs text-dim underline hover:text-slate-300">{t('setup.docs')}</a>
        </div>
      </div>
    </div>
  );
}
