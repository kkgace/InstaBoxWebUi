/** 设置：改名、调规格、扩容数据盘、自动暂停、元数据（PATCH /v1/machines/{id}） */
import { useState } from 'react';
import { Save } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import { Card, Button, Field, Input, Textarea, ErrorBox, OkBox, Badge } from '@/components/ui';
import type { Machine } from '@/api/types';

const parseKV = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of s.split('\n')) {
    const l = line.trim(); const i = l.indexOf('=');
    if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
};

export default function SettingsTab({ m, reload }: { m: Machine; reload: () => void }) {
  const { me } = useGlobal();
  const { t } = useT();
  const [name, setName] = useState(m.name);
  const [spec, setSpec] = useState(`${m.spec.vcpus}/${m.spec.memMiB}`);
  const [disk, setDisk] = useState('');
  const [autoSuspend, setAutoSuspend] = useState(m.autoSuspendAfterSeconds != null ? String(m.autoSuspendAfterSeconds) : '');
  const [maxRun, setMaxRun] = useState(m.maxRunMinutes != null ? String(m.maxRunMinutes) : '');
  const [metadata, setMetadata] = useState(Object.entries(m.metadata || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [restartApply, setRestartApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const specs = me?.allowedSpecs || [];
  const stopped = m.state === 'stopped';
  const isFree = !!m.free;

  const save = async () => {
    setBusy(true); setErr(null); setOk(null);
    const body: Parameters<typeof machinesApi.update>[1] = {};
    if (name.trim() && name.trim() !== m.name) body.name = name.trim();
    if (!isFree && stopped && spec) {
      const [v, mem] = spec.split('/').map(Number);
      if (v !== m.spec.vcpus || mem !== m.spec.memMiB) { body.vcpus = v; body.memMiB = mem; }
    }
    if (disk) body.persistentDiskGiB = Number(disk);
    if (autoSuspend !== '') body.autoSuspendAfterSeconds = Number(autoSuspend);
    if (maxRun !== '') body.maxRunMinutes = Number(maxRun) || undefined;
    body.metadata = parseKV(metadata);
    if (restartApply) body.apply = 'restart';
    try {
      await machinesApi.update(m.id, body);
      setOk(t('common.done'));
      reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const specChanged = !isFree && (() => {
    const [v, mem] = spec.split('/').map(Number);
    return v !== m.spec.vcpus || mem !== m.spec.memMiB;
  })();
  const needsRestart = ['running', 'suspended'].includes(m.state) && (specChanged || !!disk);

  return (
    <div className="grid max-w-3xl gap-4">
      <Card title={t('mset.title')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('mset.name')} hint={t('mc.nameHint')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mono w-full" />
          </Field>
          <Field label={t('mset.spec')} hint={isFree ? t('mset.specFixed') : stopped ? t('mset.nextBoot') : t('mset.needStop')}>
            <select
              value={spec} onChange={(e) => setSpec(e.target.value)} disabled={isFree || !stopped}
              className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm disabled:opacity-50"
            >
              {specs.map((s) => <option key={`${s.vcpus}/${s.memMiB}`} value={`${s.vcpus}/${s.memMiB}`}>{s.vcpus} vCPU / {s.memMiB / 1024} GiB</option>)}
              {!specs.some((s) => `${s.vcpus}/${s.memMiB}` === spec) && <option value={spec}>{m.spec.vcpus} vCPU / {m.spec.memMiB / 1024} GiB{t('mset.cur')}</option>}
            </select>
          </Field>
          <Field label={t('mset.disk')} hint={t('mset.diskHint')}>
            <Input type="number" value={disk} onChange={(e) => setDisk(e.target.value)} placeholder={t('mset.unchanged')} disabled={isFree} className="w-full" />
          </Field>
          <Field label={t('mset.autoPause')} hint={t('mset.autoPauseHint')}>
            <select value={autoSuspend} onChange={(e) => setAutoSuspend(e.target.value)} className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm">
              <option value="">—</option>
              {[300, 600, 900, 1200, 1800].map((s) => <option key={s} value={s}>{s / 60} min</option>)}
              <option value="0">0</option>
            </select>
          </Field>
          <Field label={t('mset.maxRun')} hint={t('mset.maxRunHint')}>
            <Input type="number" value={maxRun} onChange={(e) => setMaxRun(e.target.value)} className="w-full" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label={t('mset.metadata')}>
            <Textarea rows={3} value={metadata} onChange={(e) => setMetadata(e.target.value)} className="w-full" />
          </Field>
        </div>
        {needsRestart && (
          <label className="mt-3 flex items-start gap-2 text-sm text-amber-300">
            <input type="checkbox" checked={restartApply} onChange={(e) => setRestartApply(e.target.checked)} className="mt-1" />
            {t('mset.restartApply')}
          </label>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} loading={busy}><Save size={14} /> {t('common.save')}</Button>
          <span className="text-xs text-dim">{t('mset.curRevision', { r: m.revision })}</span>
          {ok && <OkBox>{ok}</OkBox>}
        </div>
        <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>
      </Card>

      <Card title={t('mset.other')}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Info k={t('mset.machineId')} v={m.id} mono />
          <Info k={t('mset.linuxUser')} v={m.guestUser} mono />
          <Info k={t('mset.org')} v={m.orgId} mono />
          <Info k={t('mset.createdAt')} v={new Date(m.createdAt).toLocaleString()} />
          <Info k={t('mset.updatedAt')} v={new Date(m.updatedAt).toLocaleString()} />
          <Info k={t('mset.envNames')} v={m.envNames?.join(', ') || '—'} />
          <Info k={t('mset.oom')} v={String(m.oomKills ?? 0)} />
          <Info k={t('mset.vault')} v={m.vault ? t('mset.vaultOn') : t('mset.vaultOff')} />
          <Info k={t('mset.archiveAt')} v={m.archiveAt ? new Date(m.archiveAt).toLocaleString() : t('mset.notSet')} />
          <Info k={t('mset.deleteAt')} v={m.deleteAt ? new Date(m.deleteAt).toLocaleString() : t('mset.notSet')} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className="border-line">template {m.template.id}@{m.template.version}</Badge>
          {m.snapshot && <Badge className="border-line">snapshot {m.snapshot.id}</Badge>}
        </div>
      </Card>
    </div>
  );
}

function Info({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-xs text-dim">{k}</span>
      <span className={`min-w-0 break-all text-xs ${mono ? 'mono' : 'text-slate-300'}`}>{v}</span>
    </div>
  );
}
