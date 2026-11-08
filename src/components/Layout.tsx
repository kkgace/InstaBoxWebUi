/** 应用布局：侧边导航 + 顶栏（多账号切换、org 切换） */
import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Camera, Globe, KeyRound, Webhook,
  PackageOpen, Gauge, Shapes, TerminalSquare, Settings, Box, LogOut, ChevronDown, UserCircle, Trash2, Plus,
} from 'lucide-react';
import { useGlobal } from '@/state';
import { getApiKey, upsertAccount, removeAccount, errText, api } from '@/api/client';
import { Badge, Modal, Field, Input, Button, ErrorBox, OkBox } from '@/components/ui';

const NAV = [
  { to: '/', label: '总览', icon: LayoutDashboard },
  { to: '/machines', label: '沙箱', icon: Boxes },
  { to: '/snapshots', label: '快照', icon: Camera },
  { to: '/ports', label: '端口发布', icon: Globe },
  { to: '/secrets', label: 'Secrets', icon: KeyRound },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/exports', label: '数据导出', icon: PackageOpen },
  { to: '/usage', label: '用量与限额', icon: Gauge },
  { to: '/templates', label: '模板', icon: Shapes },
  { to: '/playground', label: 'API 控制台', icon: TerminalSquare },
  { to: '/settings', label: '设置', icon: Settings },
];

export default function Layout() {
  const { hasKey, me, updateKey, accounts, setAccounts, orgId, setOrgId, meError, refreshMe } = useGlobal();
  const [accOpen, setAccOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [keyErr, setKeyErr] = useState<string | null>(null);
  const [keyOk, setKeyOk] = useState(false);
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();

  const allOrgs = [
    ...(me?.org ? [me.org] : []),
    ...(me?.workspaces || []),
  ];

  /** 添加账号：保存 Key → 立即切换 → 验证 */
  const addAccount = () => {
    const k = keyInput.trim();
    setKeyErr(null); setKeyOk(false);
    if (!k) { setKeyErr('请输入 API Key'); return; }
    if (!k.startsWith('ibk_')) setKeyErr('InstaBox API Key 以 ibk_ 开头，请确认');
    setAdding(true);
    updateKey(k);
    setKeyOk(true);
    // 验证并把登录名写进账号备注
    api('GET', 'v1/me')
      .then(() => { refreshMe(); setKeyOk(false); setKeyInput(''); setKeyLabel(''); setAdding(false); setAccOpen(false); nav('/machines'); })
      .catch((e) => { setKeyErr(`验证失败：${errText(e)}`); setAdding(false); });
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

  return (
    <div className="flex h-full">
      {/* 侧边栏 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-4 py-4">
          <Box size={22} className="text-sky-400" />
          <div>
            <div className="text-sm font-bold text-slate-100">InstaBox 控制台</div>
            <div className="text-[10px] text-dim">api.instabox.sh 全功能 UI</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-3 py-3 text-xs text-dim">
          <div className="flex items-center justify-between">
            <span className="truncate">{me?.login || me?.email || '未登录'}</span>
            <Badge value={hasKey ? 'ready' : 'failed'}>{hasKey ? 'Key 已配置' : '无 Key'}</Badge>
          </div>
          {me?.admin && <div className="mt-1 text-amber-400">管理员账号</div>}
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-line bg-panel/60 px-4 backdrop-blur">
          <div className="text-xs text-dim">
            通过本地代理转发至 <span className="mono text-slate-400">api.instabox.sh</span>
          </div>
          <div className="flex items-center gap-2">
            {allOrgs.length > 1 && (
              <div className="relative">
                <select
                  value={orgId || ''}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="appearance-none rounded-md border border-line bg-panel py-1.5 pl-2.5 pr-7 text-xs text-slate-300 outline-none"
                >
                  {allOrgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}{o.tier && o.tier !== 'free' ? `（${o.tier}）` : ''}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-dim" />
              </div>
            )}
            {hasKey ? (
              <Button variant="ghost" onClick={() => setAccOpen(true)} title="账号管理">
                <UserCircle size={14} />
                <span className="max-w-32 truncate">{me?.login || '账号'}</span>
                <ChevronDown size={12} />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setAccOpen(true)}>配置 API Key</Button>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          {!hasKey ? <SetupGuide onOpen={() => setAccOpen(true)} /> : <Outlet />}
        </main>
      </div>

      {/* 账号管理弹窗（多 Key） */}
      <Modal open={accOpen} onClose={() => setAccOpen(false)} title="账号管理" width="max-w-xl">
        <div className="space-y-4 text-sm">
          {/* 已保存账号 */}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-dim">已保存账号（点击切换）</div>
              {accounts.map((a) => (
                <div key={a.key} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${a.key === getApiKey() ? 'border-sky-500/50 bg-sky-500/10' : 'border-line bg-panel2'}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => switchTo(a.key)}>
                    <div className="truncate text-slate-200">{a.label || '账号'}</div>
                    <div className="mono text-[10px] text-dim">{a.key.slice(0, 8)}…{a.key.slice(-4)}</div>
                  </button>
                  {a.key === getApiKey() ? <Badge value="ready">当前</Badge> : <Button className="!px-2 !py-1" onClick={() => switchTo(a.key)}>切换</Button>}
                  <Button className="!px-1.5 !py-1" variant="danger" title="移除此账号" onClick={() => delAccount(a.key)}><Trash2 size={12} /></Button>
                </div>
              ))}
            </div>
          )}

          {/* 添加账号 */}
          <div className="space-y-3 rounded-md border border-line bg-panel2 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300"><Plus size={13} /> 添加账号（另一个 InstaBox 账号的 API Key）</div>
            <div className="rounded-md border border-line bg-bg p-2.5 text-xs leading-relaxed text-dim">
              <p>1. 用那个账号登录 <a href="https://dashboard.instabox.sh" target="_blank" rel="noreferrer" className="text-sky-400 underline">dashboard.instabox.sh</a> → <b className="text-slate-300">API keys</b> → 创建（<b className="text-slate-300">Scopes 全选</b>）</p>
              <p>2. 或在其机器/CLI 上 <span className="mono">instabox keys create</span></p>
              <p>3. 粘贴到下面。每个免费账号可挂 1 台机器；切换账号即可管理各自的机器。</p>
            </div>
            <Field label="备注名（可选，验证后自动更新为登录名）">
              <Input value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} placeholder="如：工作账号" className="w-full" />
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
            {keyOk && <OkBox>已保存，正在验证…</OkBox>}
            <div className="flex justify-end gap-2">
              {hasKey && <Button variant="ghost" onClick={() => { updateKey(''); setKeyInput(''); }}>登出当前账号</Button>}
              <Button variant="primary" onClick={addAccount} loading={adding}>添加并切换</Button>
            </div>
            {meError && <ErrorBox>当前账号验证失败：{meError}</ErrorBox>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** 未配置 Key 时的引导页 */
function SetupGuide({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-2xl space-y-5">
      <div className="rounded-xl border border-line bg-panel p-6">
        <h1 className="text-lg font-bold text-slate-100">欢迎使用 InstaBox 控制台</h1>
        <p className="mt-2 text-sm text-dim">把 <span className="mono">api.instabox.sh</span> 的全部 API 功能搬进浏览器：沙箱全生命周期管理、文件、终端、桌面、端口发布、SSH、快照、Secrets、Webhook、监控与用量。</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ['沙箱管理', '创建/启停/暂停/恢复/还原/克隆，规格调整与元数据'],
            ['终端与命令', '浏览器内 xterm 终端 + exec 命令执行与历史'],
            ['文件管理', '浏览/上传/下载/编辑，最大 5 GiB 直传'],
            ['桌面 VNC', '安装/启动桌面，浏览器内远程操作'],
            ['端口发布', '一键把沙箱内 HTTP 服务发布为 HTTPS URL'],
            ['快照 / 导出', '快照创建还原、/data 打包下载'],
            ['Secrets', '组织凭据托管与沙箱注入选择'],
            ['监控用量', 'CPU/内存图表、控制台日志、费用与限额'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-line bg-panel2 p-3">
              <div className="text-sm font-semibold text-slate-200">{t}</div>
              <div className="mt-1 text-xs text-dim">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button variant="primary" onClick={onOpen}>配置 API Key 开始使用</Button>
          <a href="https://instabox.sh/docs" target="_blank" rel="noreferrer" className="text-xs text-dim underline hover:text-slate-300">查看官方文档</a>
        </div>
      </div>
    </div>
  );
}
