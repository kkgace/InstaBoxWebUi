/** API 控制台：浏览全部端点（由 openapi.yaml 生成），构造并发起请求 */
import { useMemo, useState } from 'react';
import { Send, Search } from 'lucide-react';
import catalog from '@/api/openapi-paths.json';
import { api, errText } from '@/api/client';
import { Card, Button, Badge, ErrorBox, JsonView, Field, Input, Textarea, Select, Tabs } from '@/components/ui';

interface Op { m: string; p: string; s: string; d: string; g: string; auth: string; params: { name: string; in: string; required: boolean }[]; body: { ref?: string | null; props?: string[] } | null }
interface Catalog { ops: Op[]; bodySchemas: Record<string, Record<string, string>> }

const C = catalog as unknown as Catalog;
const GROUPS = [...new Set(C.ops.map((o) => o.g))];

const METHOD_COLOR: Record<string, string> = {
  GET: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  POST: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  PUT: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PATCH: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  DELETE: 'border-red-500/30 bg-red-500/10 text-red-400',
};

export default function Playground() {
  const [group, setGroup] = useState('全部');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Op | null>(null);

  const ops = useMemo(() => C.ops.filter((o) =>
    (group === '全部' || o.g === group) &&
    (!q || o.p.toLowerCase().includes(q.toLowerCase()) || o.s.toLowerCase().includes(q.toLowerCase()))
  ), [group, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">API 控制台</h1>
        <p className="text-xs text-dim">InstaBox 全部 {C.ops.length} 个 API 操作。选中端点直接在浏览器里发起请求（经本地代理，带你的 API Key）。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 端点列表 */}
        <Card className="lg:col-span-2">
          <div className="mb-2 flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索路径/摘要…" className="w-full pl-7" />
            </div>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {['全部', ...GROUPS].map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`rounded px-2 py-0.5 text-xs ${group === g ? 'bg-sky-500/15 text-sky-400' : 'text-dim hover:bg-white/5'}`}
              >{g}</button>
            ))}
          </div>
          <div className="max-h-[520px] space-y-1 overflow-y-auto">
            {ops.map((o, i) => (
              <button
                key={`${o.m}${o.p}${i}`}
                onClick={() => setSel(o)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${sel === o ? 'border-sky-500/50 bg-sky-500/10' : 'border-transparent hover:bg-white/5'}`}
              >
                <span className={`mono w-14 shrink-0 rounded border px-1 text-center text-[10px] ${METHOD_COLOR[o.m]}`}>{o.m}</span>
                <span className="mono min-w-0 flex-1 truncate text-xs text-slate-300" title={o.p}>{o.p}</span>
                <span className="max-w-36 truncate text-[10px] text-dim" title={o.s}>{o.s}</span>
              </button>
            ))}
            {ops.length === 0 && <div className="py-6 text-center text-sm text-dim">无匹配</div>}
          </div>
        </Card>

        {/* 请求构造器 */}
        <Card className="lg:col-span-3" title={sel ? `${sel.m} ${sel.p}` : '选择左侧端点'}>
          {sel ? <RequestBuilder key={`${sel.m}${sel.p}`} op={sel} /> : <div className="py-10 text-center text-sm text-dim">从左侧选择一个端点开始</div>}
        </Card>
      </div>
    </div>
  );
}

function RequestBuilder({ op }: { op: Op }) {
  const [path, setPath] = useState(op.p);
  const [query, setQuery] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState(() => {
    if (!op.body?.ref) return op.body ? '{\n  \n}' : '';
    const schema = C.bodySchemas[op.body.ref];
    if (!schema) return '{\n  \n}';
    const lines = Object.entries(schema).map(([k, t]) => `  "${k}": null${'' /* eslint-disable-line */},  // ${t}`);
    return `{\n${lines.join('\n').replace(/,  \//g, ',  //').replace(/,\n/g, '\n').replace(/null,  \//g, 'null,  //')}\n}`;
  });
  const [resp, setResp] = useState<unknown>(null);
  const [respStatus, setRespStatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pathParams = op.params.filter((p) => p.in === 'path');
  const queryParams = op.params.filter((p) => p.in === 'query');

  const fillPathParams = () => {
    let p = op.p;
    for (const pp of pathParams) {
      if (!query[`__path_${pp.name}`]) continue;
      p = p.replace(`{${pp.name}}`, query[`__path_${pp.name}`]);
    }
    return p;
  };

  const buildBody = () => {
    if (!op.body) return undefined;
    const raw = bodyText.trim();
    if (!raw) return {};
    try {
      // 去掉 // 注释行再解析
      const cleaned = raw.replace(/^[ \t]*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch {
      return raw; // 原样发送（上游会报错并回显）
    }
  };

  const send = async () => {
    setBusy(true); setErr(null); setResp(null); setRespStatus(null);
    try {
      const qp: Record<string, string> = {};
      for (const [k, v] of Object.entries(query)) {
        if (k.startsWith('__path_')) continue;
        if (v !== '') qp[k] = v;
      }
      const hasBody = op.body != null && op.m !== 'GET';
      const r = await api<unknown>(op.m, path.startsWith('/') ? path.slice(1) : path, {
        query: qp,
        body: hasBody ? buildBody() : undefined,
      });
      setResp(r);
      // api() 不返回状态码；200-299 视为成功
      setRespStatus(200);
    } catch (e) {
      const anyE = e as { status?: number; message?: string };
      setRespStatus(anyE.status ?? 0);
      setResp({ error: e instanceof Error ? errText(e) : String(e), detail: e instanceof Object ? e : undefined });
      if (!(e instanceof Error)) setErr(String(e));
    }
    setBusy(false);
  };

  const p = fillPathParams();

  return (
    <div className="space-y-3">
      <div className="text-xs text-dim">{op.s}{op.d ? ` — ${op.d}` : ''}</div>
      <div className="flex items-center gap-2">
        <Badge className={METHOD_COLOR[op.m]}>{op.m}</Badge>
        <Input readOnly value={p} className="mono flex-1 text-xs" />
        <Badge className="border-line">{op.auth === 'apikey' ? 'API Key' : '需登录会话'}</Badge>
      </div>

      {pathParams.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {pathParams.map((pp) => (
            <Field key={pp.name} label={`路径参数 ${pp.name}${pp.required ? ' *' : ''}`}>
              <Input
                value={query[`__path_${pp.name}`] || ''}
                onChange={(e) => setQuery((q0) => ({ ...q0, [`__path_${pp.name}`]: e.target.value }))}
                placeholder={pp.name}
                className="mono w-full"
              />
            </Field>
          ))}
        </div>
      )}

      {queryParams.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {queryParams.map((qp) => (
            <Field key={qp.name} label={`query ${qp.name}${qp.required ? ' *' : ''}`}>
              <Input
                value={query[qp.name] || ''}
                onChange={(e) => setQuery((q0) => ({ ...q0, [qp.name]: e.target.value }))}
                placeholder={qp.name}
                className="w-full"
              />
            </Field>
          ))}
        </div>
      )}

      {op.body && (
        <Field label={`请求体${op.body.ref ? `（${op.body.ref}）` : ''}`} hint="null 处填值；// 注释会被剔除后解析">
          <Textarea rows={8} value={bodyText} onChange={(e) => setBodyText(e.target.value)} className="h-44 w-full" spellCheck={false} />
        </Field>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={send} loading={busy}><Send size={14} /> 发送</Button>
        <span className="text-[10px] text-dim">部分端点需要登录会话（标「需登录会话」），API Key 调用会返回 403</span>
      </div>

      <ErrorBox>{err}</ErrorBox>
      {resp != null && (
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <Badge value={respStatus === 200 ? 'succeeded' : 'failed'}>HTTP {respStatus}</Badge>
          </div>
          <JsonView data={resp} max={400} />
        </div>
      )}
    </div>
  );
}
