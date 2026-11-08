/** 设置：API Key、通知、MCP 配置生成器、代理状态、功能说明 */
import { useState } from 'react';
import { CheckCircle2, XCircle, Bell, Plug } from 'lucide-react';
import { api, getApiKey, setApiKey, errText } from '@/api/client';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { notifyPermission, requestNotifyPermission } from '@/utils/notify';
import { Card, Button, Badge, ErrorBox, OkBox, Field, Input, JsonView, CopyButton, Select } from '@/components/ui';

const MCP_CLIENTS = ['claude', 'cursor', 'codex', 'opencode'] as const;
type McpClient = (typeof MCP_CLIENTS)[number];

export default function Settings() {
  const { updateKey, refreshMe } = useGlobal();
  const { t, lang, setLang } = useT();
  const [key, setKey] = useState(getApiKey());
  const [server, setServer] = useState<{ ok: boolean; upstream?: string; serverKeyInjected?: boolean } | null>(null);
  const [me, setMe] = useState<object | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [perm, setPerm] = useState(notifyPermission());

  const testProxy = async () => {
    setTesting(true); setErr(null);
    try {
      const r = await fetch('/healthz').then((x) => x.json());
      setServer(r);
    } catch (e) { setErr(errText(e)); }
    setTesting(false);
  };

  const saveKey = () => {
    updateKey(key);
    setOk(key ? t('set.saved') : t('set.cleared'));
    setTimeout(refreshMe, 100);
  };

  const testKey = async () => {
    setTesting(true); setErr(null); setMe(null);
    try {
      setMe(await api('GET', 'v1/me'));
      setOk(t('set.verifyOk'));
    } catch (e) { setErr(errText(e)); }
    setTesting(false);
  };

  const enableNotify = async () => {
    const granted = await requestNotifyPermission();
    setPerm(notifyPermission());
    setOk(granted ? t('set.notifyOn') : null);
    if (!granted) setErr(t('set.notifyDenied'));
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('set.title')}</h1>
        {/* 语言切换 */}
        <Button variant="ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {lang === 'zh' ? 'English' : '简体中文'}
        </Button>
      </div>

      <Card title={t('set.key')}>
        <div className="space-y-3">
          <Field label={t('set.key')} hint={t('set.keyHint')}>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ibk_..." className="mono w-full" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={saveKey}>{t('set.save')}</Button>
            <Button onClick={testKey} loading={testing} disabled={!key}>{t('set.verify')}</Button>
            <Button variant="ghost" onClick={() => { setKey(''); updateKey(''); }}>{t('set.clear')}</Button>
          </div>
          <div className="rounded-md border border-line bg-panel2 p-3 text-xs leading-relaxed text-dim">
            <p className="mb-1 font-medium text-slate-300">{t('set.howTo')}</p>
            <p>{t('set.howTo1')}<a href="https://dashboard.instabox.sh" target="_blank" rel="noreferrer" className="text-sky-400 underline">dashboard.instabox.sh</a>{t('set.howTo1b')}</p>
            <p>{t('set.howTo2')}<span className="mono">instabox keys create</span></p>
            <p className="mt-1">{t('set.howTo3')}<span className="mono">missing_scope</span>。</p>
          </div>
          <ErrorBox>{err}</ErrorBox>
          {ok && <OkBox>{ok}</OkBox>}
          {me && (
            <details>
              <summary className="cursor-pointer text-xs text-dim">{t('set.respMe')}</summary>
              <JsonView data={me} />
            </details>
          )}
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-1.5"><Bell size={15} /> {t('set.notify')}</span>}>
        <div className="space-y-2 text-sm">
          <p className="text-xs text-dim">{t('set.notifyHint')}</p>
          {perm === 'granted' ? <Badge value="ready">{t('set.notifyOn')}</Badge>
            : perm === 'denied' ? <div className="text-xs text-amber-400">{t('set.notifyDenied')}</div>
            : <Button variant="primary" onClick={enableNotify}><Bell size={14} /> {t('set.notifyEnable')}</Button>}
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-1.5"><Plug size={15} /> {t('mcp.title')}</span>}>
        <McpGenerator />
      </Card>

      <Card title={t('set.proxyState')} right={<Button variant="ghost" onClick={testProxy} loading={testing}>{t('set.proxyTest')}</Button>}>
        {!server ? <div className="text-sm text-dim">{t('set.proxyHint')}</div> : (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              {server.ok ? <CheckCircle2 size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-red-400" />}
              <span>{t('set.proxyOk')} {server.ok ? t('set.proxyNormal') : t('set.proxyBad')}</span>
            </div>
            <div className="text-xs text-dim">{t('set.upstream')}<span className="mono">{server.upstream}</span></div>
            <div className="text-xs text-dim">{t('set.serverKey')}{server.serverKeyInjected ? t('set.serverKeyYes') : t('set.serverKeyNo')}</div>
          </div>
        )}
      </Card>

      <Card title={t('set.dashOnly')}>
        <div className="space-y-1.5 text-sm text-dim">
          <div>{t('set.dashList1')}<span className="mono">/v1/orgs/{'{id}'}/billing/*</span>{t('set.dashList1b')}</div>
          <div>{t('set.dashList2')}</div>
          <div>{t('set.dashList3')}</div>
          <div>{t('set.dashList4')}</div>
          <div className="pt-1 text-slate-400">{t('set.dashUse')}<a href="https://dashboard.instabox.sh" target="_blank" rel="noreferrer" className="text-sky-400 underline">dashboard.instabox.sh</a>。</div>
        </div>
      </Card>

      <Card title={t('set.deployTitle')}>
        <div className="space-y-1.5 text-sm text-dim">
          <p>{t('set.deployDesc')}<span className="mono">instabox-port publish &lt;port&gt;</span>{t('set.deployDesc2')}</p>
          <pre className="mono mt-1 rounded border border-line bg-bg p-2 text-[11px] text-slate-300">{`npm run build
scp -P 2222 -r dist server package.json <token>@ssh.instabox.sh:~/console/
ssh -p 2222 <token>@ssh.instabox.sh
cd ~/console && PORT=3000 node server/index.mjs &
instabox-port publish 3000`}</pre>
          <p>{t('set.deployTail')}<span className="mono">Dockerfile</span>{t('set.deployTail2')}<span className="mono">deploy.sh</span>。</p>
        </div>
      </Card>
    </div>
  );
}

/** MCP 配置生成器：为各客户端生成托管服务器（api.instabox.sh/mcp）接入配置 */
function McpGenerator() {
  const { t } = useT();
  const { key } = useGlobal();
  const [client, setClient] = useState<McpClient>('claude');
  const [includeDocs, setIncludeDocs] = useState(true);
  const [inlineKey, setInlineKey] = useState(false);

  const HOST = 'https://api.instabox.sh/mcp';
  const DOCS_HOST = 'https://instabox.sh/mcp';

  const keyRef = inlineKey && key ? key : (
    client === 'cursor' ? '${env:INSTABOX_API_KEY}'
      : client === 'opencode' ? '{env:INSTABOX_API_KEY}'
      : '${INSTABOX_API_KEY}'
  );

  let lang = 'json';
  let text = '';
  let path = '';
  if (client === 'claude') {
    text = JSON.stringify({
      mcpServers: {
        instabox: { type: 'http', url: HOST, headers: { 'X-API-Key': keyRef } },
        ...(includeDocs ? { 'instabox-docs': { url: DOCS_HOST } } : {}),
      },
    }, null, 2);
    path = '~/.claude.json';
  } else if (client === 'cursor') {
    text = JSON.stringify({
      mcpServers: {
        instabox: { url: HOST, headers: { 'X-API-Key': keyRef } },
        ...(includeDocs ? { 'instabox-docs': { url: DOCS_HOST } } : {}),
      },
    }, null, 2);
    path = '~/.cursor/mcp.json';
  } else if (client === 'opencode') {
    text = JSON.stringify({
      mcp: {
        instabox: { type: 'remote', url: HOST, headers: { 'X-API-Key': keyRef } },
        ...(includeDocs ? { 'instabox-docs': { type: 'remote', url: DOCS_HOST } } : {}),
      },
    }, null, 2);
    path = '~/.config/opencode/opencode.json';
  } else {
    lang = 'toml';
    text = [
      '[mcp_servers.instabox]',
      `url = "${HOST}"`,
      '[mcp_servers.instabox.env_http_headers]',
      `X-API-Key = "${keyRef}"`,
      ...(includeDocs ? ['', '[mcp_servers.instabox-docs]', `url = "${DOCS_HOST}"`] : []),
    ].join('\n');
    path = '~/.codex/config.toml';
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-dim">{t('mcp.desc')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={client} onChange={(e) => setClient(e.target.value as McpClient)} className="w-44">
          {MCP_CLIENTS.map((c) => <option key={c} value={c}>{t(`mcp.${c}`)}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={includeDocs} onChange={(e) => setIncludeDocs(e.target.checked)} className="accent-sky-500" /> {t('mcp.includeDocs')}
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300" title={t('mcp.inlineHint')}>
          <input type="checkbox" checked={inlineKey} onChange={(e) => setInlineKey(e.target.checked)} className="accent-sky-500" /> {t('mcp.inline')}
        </label>
      </div>
      <div className="rounded-md border border-line bg-bg p-2 text-xs text-dim">
        {t('mcp.configPath')}: <span className="mono text-slate-300">{path}</span>
        {' · '}<span className="mono">INSTABOX_API_KEY</span>{t('mcp.envNote')}
      </div>
      <div className="relative">
        <pre data-lang={lang} className="mono max-h-64 overflow-auto rounded-md border border-line bg-bg p-3 text-xs leading-relaxed text-slate-300">{text}</pre>
        <div className="absolute right-2 top-2"><CopyButton text={text} /></div>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-dim">{t('mcp.cliTitle')}</summary>
        <pre className="mono mt-2 rounded-md border border-line bg-bg p-3 text-[11px] text-slate-300">{`npx instabox@latest          # sign in + install CLI
instabox keys create --name mcp
instabox mcp init ${client} --hosted`}</pre>
      </details>
      <p className="text-[10px] text-dim">{t('mcp.scopeNote')}</p>
    </div>
  );
}
