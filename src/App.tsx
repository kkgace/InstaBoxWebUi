import { useCallback, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Layout from '@/components/Layout';
import { api, errText, onConsoleAuthNeeded } from '@/api/client';
import { useT } from '@/i18n';
import { Button, Field, Input, ErrorBox, Card } from '@/components/ui';
import Dashboard from '@/pages/Dashboard';
import Matrix from '@/pages/Matrix';
import Machines from '@/pages/Machines';
import MachineDetail from '@/pages/MachineDetail';
import Snapshots from '@/pages/Snapshots';
import Ports from '@/pages/Ports';
import Secrets from '@/pages/Secrets';
import Webhooks from '@/pages/Webhooks';
import WebhookInbox from '@/pages/WebhookInbox';
import Exports from '@/pages/Exports';
import Usage from '@/pages/Usage';
import Templates from '@/pages/Templates';
import Playground from '@/pages/Playground';
import Settings from '@/pages/Settings';

export default function App() {
  // 代理开启 CONSOLE_PASSWORD 时：任何 /p 请求返回 401 console_auth → 弹登录框
  const [needLogin, setNeedLogin] = useState(false);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { t } = useT();

  useEffect(() => onConsoleAuthNeeded(() => setNeedLogin(true)), []);
  useEffect(() => { // 启动时探测一次
    fetch('/auth').then((r) => { if (r.status === 401) setNeedLogin(true); }).catch(() => { /* ignore */ });
  }, []);

  const login = useCallback(async () => {
    if (!pass.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass.trim() }),
      });
      if (r.ok) {
        setNeedLogin(false); setPass('');
      } else {
        setErr(t('login.wrong'));
      }
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }, [pass, t]);

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="matrix" element={<Matrix />} />
          <Route path="machines" element={<Machines />} />
          <Route path="machines/:id" element={<MachineDetail />} />
          <Route path="snapshots" element={<Snapshots />} />
          <Route path="ports" element={<Ports />} />
          <Route path="secrets" element={<Secrets />} />
          <Route path="webhooks" element={<Webhooks />} />
          <Route path="inbox" element={<WebhookInbox />} />
          <Route path="exports" element={<Exports />} />
          <Route path="usage" element={<Usage />} />
          <Route path="templates" element={<Templates />} />
          <Route path="playground" element={<Playground />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<div className="text-dim">{t('nav.notFound')}</div>} />
        </Route>
      </Routes>

      {needLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <Card title={<span className="inline-flex items-center gap-2"><Lock size={15} /> {t('login.title')}</span>} className="w-full max-w-md">
            <div className="space-y-3 text-sm">
              <div className="text-dim">{t('login.desc')}</div>
              <Field label={t('login.placeholder')}>
                <Input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={t('login.placeholder')}
                  className="w-full"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') login(); }}
                />
              </Field>
              <ErrorBox>{err}</ErrorBox>
              <Button variant="primary" onClick={login} loading={busy} className="w-full justify-center">{t('login.submit')}</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
