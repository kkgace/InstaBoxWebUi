/** 模板列表 */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { errText } from '@/api/client';
import { miscApi } from '@/api/misc';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, Table, Td, Empty, Spinner } from '@/components/ui';
import { fmtBytes } from '@/utils/format';
import type { Template } from '@/api/types';

export default function Templates() {
  const { t } = useT();
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">{t('tpl.title')}</h1>
          <p className="text-xs text-dim">{t('tpl.desc')}</p>
        </div>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {loading && !list.length ? <Spinner /> : list.length === 0 ? <Empty /> : (
        <Table head={[t('common.name'), t('tpl.colVersion'), t('tpl.colArch'), t('tpl.colSpec'), t('tpl.colRuntime'), t('tpl.colTags'), '']}>
          {list.map((tpl) => (
            <tr key={`${tpl.id}@${tpl.version}`} className="hover:bg-white/[0.03]">
              <Td>
                <div className="font-medium">{tpl.id}</div>
                {tpl.description && <div className="text-xs text-dim">{tpl.description}</div>}
                <div className="mono text-[10px] text-dim" title={tpl.digest}>{tpl.digest.slice(0, 18)}…</div>
              </Td>
              <Td className="mono text-xs">{tpl.version}</Td>
              <Td className="text-xs">{tpl.arch}</Td>
              <Td className="mono text-xs">{tpl.defaultSpec.vcpus}C / {tpl.defaultSpec.memMiB / 1024}G{tpl.defaultSpec.rootDiskGiB ? ` / ${tpl.defaultSpec.rootDiskGiB}G` : ''}</Td>
              <Td className="mono text-xs text-dim">{tpl.runtime ? Object.entries(tpl.runtime).map(([k, v]) => `${k}:${v}`).join(' · ') : '—'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {tpl.default && <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">{t('tpl.default')}</Badge>}
                  {tpl.latest && <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{t('tpl.latest')}</Badge>}
                  {tpl.preboot && <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-300">{t('tpl.fastBoot')}</Badge>}
                  {tpl.staged && <Badge value="pending">{t('tpl.staged')}</Badge>}
                  {tpl.hidden && <Badge value="failed">{t('tpl.hidden')}</Badge>}
                  {tpl.creatable === false && <Badge value="stopped">{t('tpl.notCreatable')}</Badge>}
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
