/** 设置：API Key、代理状态、功能说明 */
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api, getApiKey, setApiKey, errText } from '@/api/client';
import { useGlobal } from '@/state';
import { Card, Button, Badge, ErrorBox, OkBox, Field, Input, JsonView } from '@/components/ui';

export default function Settings() {
  const { updateKey, refreshMe } = useGlobal();
  const [key, setKey] = useState(getApiKey());
  const [server, setServer] = useState<{ ok: boolean; upstream?: string; serverKeyInjected?: boolean } | null>(null);
  const [me, setMe] = useState<object | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

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
    setOk(key ? 'API Key 已保存到本浏览器' : 'API Key 已清除');
    setTimeout(refreshMe, 100);
  };

  const testKey = async () => {
    setTesting(true); setErr(null); setMe(null);
    try {
      setMe(await api('GET', 'v1/me'));
      setOk('API Key 验证通过');
    } catch (e) { setErr(errText(e)); }
    setTesting(false);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-bold">设置</h1>

      <Card title="API Key">
        <div className="space-y-3">
          <Field label="InstaBox API Key（ibk_ 开头）" hint="保存于浏览器 localStorage；经本地代理转发，代理不落盘">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ibk_..." className="mono w-full" />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" onClick={saveKey}>保存</Button>
            <Button onClick={testKey} loading={testing} disabled={!key}>验证（GET /v1/me）</Button>
            <Button variant="ghost" onClick={() => { setKey(''); updateKey(''); }}>清除</Button>
          </div>
          <div className="rounded-md border border-line bg-panel2 p-3 text-xs leading-relaxed text-dim">
            <p className="mb-1 font-medium text-slate-300">Key 创建方式：</p>
            <p>1. <a href="https://dashboard.instabox.sh" target="_blank" rel="noreferrer" className="text-sky-400 underline">官方 Dashboard</a> → API keys → Scopes 全选 → 创建（只显示一次）</p>
            <p>2. CLI：<span className="mono">instabox keys create</span></p>
            <p className="mt-1">建议设 1-30 天有效期，用完撤销。scopes 不足时 API 返回 <span className="mono">missing_scope</span>。</p>
          </div>
          <ErrorBox>{err}</ErrorBox>
          {ok && <OkBox>{ok}</OkBox>}
          {me && (
            <details>
              <summary className="cursor-pointer text-xs text-dim">GET /v1/me 响应</summary>
              <JsonView data={me} />
            </details>
          )}
        </div>
      </Card>

      <Card title="本地代理状态" right={<Button variant="ghost" onClick={testProxy} loading={testing}>检测</Button>}>
        {!server ? <div className="text-sm text-dim">点击「检测」查看代理服务状态</div> : (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              {server.ok ? <CheckCircle2 size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-red-400" />}
              <span>代理服务 {server.ok ? '正常' : '异常'}</span>
            </div>
            <div className="text-xs text-dim">上游：<span className="mono">{server.upstream}</span></div>
            <div className="text-xs text-dim">服务端注入 Key：{server.serverKeyInjected ? '是（客户端未带 Key 时使用）' : '否（使用浏览器保存的 Key）'}</div>
          </div>
        )}
      </Card>

      <Card title="仅限官方 Dashboard 的功能（API Key 无法操作）">
        <div className="space-y-1.5 text-sm text-dim">
          <div>· Stripe 账单操作：订阅/升级/降级/支付方式（<span className="mono">/v1/orgs/{'{id}'}/billing/*</span> 需登录会话）</div>
          <div>· 组织成员与邀请管理、API Key 的创建与撤销（需登录会话）</div>
          <div>· GitHub App 安装关联、支持工单（Discord 反馈）</div>
          <div>· Vault（旧版个人凭据库）</div>
          <div className="pt-1 text-slate-400">以上请使用 <a href="https://dashboard.instabox.sh" target="_blank" rel="noreferrer" className="text-sky-400 underline">dashboard.instabox.sh</a>。</div>
        </div>
      </Card>

      <Card title="部署到 InstaBox 机器（可选）">
        <div className="space-y-1.5 text-sm text-dim">
          <p>本控制台可部署进沙箱，用 <span className="mono">instabox-port publish &lt;port&gt;</span> 获得固定 HTTPS URL：</p>
          <pre className="mono mt-1 rounded border border-line bg-bg p-2 text-[11px] text-slate-300">{`# 本机构建并上传（或 git clone）
npm run build
scp -P 2222 -r dist server package.json <token>@ssh.instabox.sh:~/console/
# 机器上启动
ssh -p 2222 <token>@ssh.instabox.sh
cd ~/console && PORT=3000 node server/index.mjs &
instabox-port publish 3000   # 输出 https://...-3000.instabox.app`}</pre>
          <p>仓库也提供 <span className="mono">Dockerfile</span> 与 <span className="mono">deploy.sh</span>。</p>
        </div>
      </Card>
    </div>
  );
}
