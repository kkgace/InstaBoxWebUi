/** 模板列表 */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { Card, Button, Badge, ErrorBox, Table, Td, Empty, Spinner } from '@/components/ui';
import { fmtBytes } from '@/utils/format';
import type { Template } from '@/api/types';

export default function Templates() {
  const [list, setList] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try { setList((await miscApi.templates()).templates || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">模板</h1>
          <p className="text-xs text-dim">创建沙箱的起始系统镜像。默认模板（default 标记）在不指定时使用。</p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> 刷新</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {loading && !list.length ? <Spinner /> : list.length === 0 ? <Empty /> : (
        <Table head={['模板', '版本', '架构', '默认规格', '内置软件', '标记', '']}>
          {list.map((t) => (
            <tr key={`${t.id}@${t.version}`} className="hover:bg-white/[0.03]">
              <Td>
                <div className="font-medium">{t.id}</div>
                {t.description && <div className="text-xs text-dim">{t.description}</div>}
                <div className="mono text-[10px] text-dim" title={t.digest}>{t.digest.slice(0, 18)}…</div>
              </Td>
              <Td className="mono text-xs">{t.version}</Td>
              <Td className="text-xs">{t.arch}</Td>
              <Td className="mono text-xs">{t.defaultSpec.vcpus}C / {t.defaultSpec.memMiB / 1024}G{t.defaultSpec.rootDiskGiB ? ` / ${t.defaultSpec.rootDiskGiB}G root` : ''}</Td>
              <Td className="mono text-xs text-dim">{t.runtime ? Object.entries(t.runtime).map(([k, v]) => `${k}:${v}`).join(' · ') : '—'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {t.default && <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">默认</Badge>}
                  {t.latest && <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">最新</Badge>}
                  {t.preboot && <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300">快速启动</Badge>}
                  {t.staged && <Badge value="pending">灰度中</Badge>}
                  {t.hidden && <Badge value="failed">已停用</Badge>}
                  {t.creatable === false && <Badge value="stopped">不可创建</Badge>}
                </div>
              </Td>
              <Td />
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
