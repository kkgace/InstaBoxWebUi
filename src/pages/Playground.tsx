/** API 控制台：浏览全部端点（由 openapi.yaml 生成），构造并发起请求 */
import { useMemo, useState } from 'react';
import { Send, Search } from 'lucide-react';
import catalog from '@/api/openapi-paths.json';
import { api, errText } from '@/api/client';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, JsonView, Field, Input, Textarea, Tabs } from '@/components/ui';

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
  const { t } = useT();
  const [group, setGroup] = useState('__all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Op | null>(null);

  const ops = useMemo(() => C.ops.filter((o) =>
    (group === '__all' || o.g === group) &&
    (!q || o.p.toLowerCase().includes(q.toLowerCase()) || o.s.toLowerCase().includes(q.toLowerCase()))
  ), [group, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">{t('pg.title')}</h1>
        <p className="text-xs text-dim">{t('pg.desc', { n: C.ops.length })}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pg.searchPh')} className="w-full pl-7" />
            </div>
          </div>
          <Tabs
            active={group}
            onChange={setGroup}
            className="!border-b-0"
            tabs={[{ key: '__all', label: t('common.all') }, ...GROUPS.map((g) => ({ key: g, label: g }))]}
          />
          <div className="max-h-[520px] space-y-1 overflow-y-auto pt-2">
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
            {ops.length === 0 && <div className="py-6 text-center text-sm text-dim">{t('common.none')}</div>}
          </div>
        </Card>

        <Card className="lg:col-span-3" title={sel ? `${sel.m} ${sel.p}` : t('pg.pick')}>
          {sel ? <RequestBuilder key={`${sel.m}${sel.p}`} op={sel} /> : <div className="py-10 text-center text-sm text-dim">{t('pg.pickHint')}</div>}
        </Card>
      </div>
    </div>
  );
}

function RequestBuilder({ op }: { op: Op }) {
  const { t } = useT();
  const [path, setPath] = useState(op.p);
  const [query, setQuery] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState(() => {
    if (!op.body?.ref) return op.body ? '{\n  \n}' : '';
    const schema = C.bodySchemas[op.body.ref];
    if (!schema) return '{\n  \n}';
    return `{\n${Object.entries(schema).map(([k, ty]) => `  "${k}": null,  // ${ty}`).join('\n')}\n}`;
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
      const cleaned = raw.replace(/^[ \t]*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch {
      return raw;
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
      setRespStatus(200);
    } catch (e) {
      const anyE = e as { status?: number };
      setRespStatus(anyE.status ?? 0);
      setResp({ error: e instanceof Error ? errText(e) : String(e) });
      if (!(e instanceof Error)) setErr(String(e));
    }
    setBusy(false);
  };

  const p = fillPathParams();

  return (
    <div className="space-y-3">
      <div className="text-xs text-dim">{op.s}{op.d ? ` — ${op.d}` : ''}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={METHOD_COLOR[op.m]}>{op.m}</Badge>
        <Input readOnly value={p} className="mono min-w-0 flex-1 text-xs" />
        <Badge className="border-line">{op.auth === 'apikey' ? t('pg.apiKey') : t('pg.needSession')}</Badge>
      </div>

      {pathParams.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {pathParams.map((pp) => (
            <Field key={pp.name} label={t('pg.pathParams', { n: pp.name, req: pp.required ? ' *' : '' })}>
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
            <Field key={qp.name} label={t('pg.queryParams', { n: qp.name, req: qp.required ? ' *' : '' })}>
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
        <Field label={t('pg.body', { ref: op.body.ref ? `（${op.body.ref}）` : '' })} hint={t('pg.bodyHint')}>
          <Textarea rows={8} value={bodyText} onChange={(e) => setBodyText(e.target.value)} className="h-44 w-full" spellCheck={false} />
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={send} loading={busy}><Send size={14} /> {t('pg.send')}</Button>
        <span className="text-[10px] text-dim">{t('pg.sessionNote')}</span>
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
