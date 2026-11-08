/** 沙箱列表 + 创建沙箱（支持保存/加载创建预设 Profiles） */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, RefreshCw, Play, Square, Pause, RotateCcw, Trash2, Zap, Clock, Hourglass, Bookmark, BookmarkPlus,
} from 'lucide-react';
import { errText, waitForOperation } from '@/api/client';
import { machinesApi, type CreateMachineBody } from '@/api/machines';
import { miscApi } from '@/api/misc';
import { useGlobal } from '@/state';
import { useT } from '@/i18n';
import {
  Button, Badge, Card, Table, Td, Modal, Field, Input, Textarea, Select, Spinner, ErrorBox, OkBox, Confirm, CopyButton,
} from '@/components/ui';
import { fmtBytes, fmtDuration, fmtTime, fmtDeadline } from '@/utils/format';
import type { Machine, MachineSpec, Template } from '@/api/types';

const parseKV = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of s.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
};

// ---------- 创建预设（localStorage） ----------
interface Profile {
  name: string;
  form: {
    name: string; templateId: string; specKey: string; desiredState: string;
    env: string; metadata: string; autoSuspend: string; maxRun: string; deleteAfter: string;
  };
}
const PROFILE_KEY = 'instabox-ui.profiles';
export function getProfiles(): Profile[] {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]'); } catch { return []; }
}
function saveProfiles(list: Profile[]) { localStorage.setItem(PROFILE_KEY, JSON.stringify(list)); }

export default function Machines() {
  const { t } = useT();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Machine | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setMachines((await machinesApi.list({ limit: 200 })).machines || []); }
    catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (m: Machine, action: 'start' | 'stop' | 'suspend' | 'resume' | 'wake') => {
    setBusy(m.id + action); setErr(null);
    try {
      const r = action === 'start' ? await machinesApi.start(m.id)
        : action === 'stop' ? await machinesApi.stop(m.id)
        : action === 'suspend' ? await machinesApi.suspend(m.id)
        : action === 'resume' ? await machinesApi.resume(m.id)
        : await machinesApi.wake(m.id);
      if (r && typeof r === 'object' && 'operationId' in r && r.operationId) {
        await waitForOperation(r.operationId as string);
      }
      await load();
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const del = async (m: Machine) => {
    setBusy(m.id + 'del'); setErr(null);
    try {
      const r = await machinesApi.delete(m.id);
      if (r && typeof r === 'object' && 'operationId' in r && r.operationId) {
        await waitForOperation(r.operationId as string);
      }
      await load();
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('ml.title')}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> {t('common.create')}</Button>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {loading && machines.length === 0 ? <Spinner /> : machines.length === 0 ? (
        <Card><div className="py-8 text-center text-sm text-dim">{t('ml.empty1')}</div></Card>
      ) : (
        <Table head={[t('ml.colName'), t('common.status'), t('ml.colSpec'), t('ml.colDisk'), t('ml.colTemplate'), t('ml.colAutoPause'), t('ml.colTimers'), t('common.actions')]}>
          {machines.map((m) => {
            const del2 = fmtDeadline(m.deleteAt);
            const arch = fmtDeadline(m.archiveAt);
            const runSec = m.runStartedAt ? (Date.now() - new Date(m.runStartedAt).getTime()) / 1000 : null;
            const canStart = m.state === 'stopped' || m.state === 'suspended';
            const canStop = m.state === 'running';
            const canSuspend = m.state === 'running';
            const canResume = m.state === 'suspended';
            return (
              <tr key={m.id} className="hover:bg-white/[0.03]">
                <Td>
                  <Link to={`/machines/${m.id}`} className="font-medium text-sky-400 hover:underline">{m.name}</Link>
                  <div className="mono text-[10px] text-dim">{m.id}</div>
                </Td>
                <Td>
                  <Badge value={m.state} />
                  {m.lastError && <div className="mt-1 max-w-40 truncate text-[10px] text-red-400" title={m.lastError.message}>{m.lastError.message}</div>}
                </Td>
                <Td className="mono text-xs">{m.spec.vcpus}C/{(m.spec.memMiB / 1024).toFixed(0)}G</Td>
                <Td className="mono text-xs">{fmtBytes((m as unknown as { storage?: { sizeBytes?: number } }).storage?.sizeBytes)}</Td>
                <Td className="mono text-xs text-dim">{m.template.id}<br />{m.template.version}</Td>
                <Td className="text-xs text-dim">{m.autoSuspendAfterSeconds ? fmtDuration(m.autoSuspendAfterSeconds) : t('ml.off')}</Td>
                <Td className="text-xs text-dim">
                  {runSec != null && m.state === 'running' && <div className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDuration(runSec)}</div>}
                  {del2 && <div className={`inline-flex items-center gap-1 ${del2.urgent ? 'text-red-400' : ''}`}><Trash2 size={11} /> {del2.text}</div>}
                  {arch && !del2 && <div className="inline-flex items-center gap-1"><Hourglass size={11} /> {t('ml.archIn', { t: arch.text })}</div>}
                  {!runSec && !del2 && !arch && '—'}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {canStart && <Button className="!px-2 !py-1" onClick={() => act(m, 'start')} loading={busy === m.id + 'start'} title={t('ov.start')}><Play size={13} /></Button>}
                    {canStop && <Button className="!px-2 !py-1" onClick={() => act(m, 'stop')} loading={busy === m.id + 'stop'} title={t('ov.stop')}><Square size={13} /></Button>}
                    {canSuspend && <Button className="!px-2 !py-1" onClick={() => act(m, 'suspend')} loading={busy === m.id + 'suspend'} title={t('ov.suspend')}><Pause size={13} /></Button>}
                    {canResume && <Button className="!px-2 !py-1" onClick={() => act(m, 'resume')} loading={busy === m.id + 'resume'} title={t('ov.resume')}><RotateCcw size={13} /></Button>}
                    {m.state === 'running' && m.autoSuspendedAt && <Button className="!px-2 !py-1" onClick={() => act(m, 'wake')} title={t('ov.wake')}><Zap size={13} /></Button>}
                    <Button className="!px-2 !py-1" variant="danger" onClick={() => setDelTarget(m)} title={t('common.delete')}><Trash2 size={13} /></Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      <Confirm
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && del(delTarget)}
        title={`${t('common.delete')} ${delTarget?.name || ''}`}
        message={t('ov.delHint')}
        confirmText={t('common.confirmDelete')}
        danger
        requireText={delTarget?.name}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 创建
function CreateDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { t } = useT();
  const { me } = useGlobal();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [specKey, setSpecKey] = useState('');
  const [desiredState, setDesiredState] = useState<'running' | 'stopped'>('running');
  const [env, setEnv] = useState('');
  const [metadata, setMetadata] = useState('');
  const [autoSuspend, setAutoSuspend] = useState('');
  const [maxRun, setMaxRun] = useState('');
  const [deleteAfter, setDeleteAfter] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>(getProfiles);
  const [profileName, setProfileName] = useState('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null); setPhase(null); setBusy(false); setDoneId(null);
    setProfiles(getProfiles());
    miscApi.templates().then((r) => {
      const creatable = (r.templates || []).filter((tpl) => tpl.creatable !== false && !tpl.hidden);
      setTemplates(creatable);
      const def = creatable.find((tpl) => tpl.default) || creatable[0];
      if (def) setTemplateId(`${def.id}@${def.version}`);
    }).catch((e) => setErr(errText(e)));
  }, [open]);

  const creatable = templates.filter((tpl) => !tpl.staged);
  const specs: MachineSpec[] = me?.allowedSpecs || [];
  const selSpec = specs.find((s) => `${s.vcpus}/${s.memMiB}` === specKey);

  const applyProfile = (p: Profile) => {
    setName(p.form.name); setTemplateId(p.form.templateId); setSpecKey(p.form.specKey);
    setDesiredState(p.form.desiredState as 'running' | 'stopped');
    setEnv(p.form.env); setMetadata(p.form.metadata);
    setAutoSuspend(p.form.autoSuspend); setMaxRun(p.form.maxRun); setDeleteAfter(p.form.deleteAfter);
  };

  const saveProfile = () => {
    const n = profileName.trim() || `${t('ml.title')}-${getProfiles().length + 1}`;
    const list = getProfiles().filter((p) => p.name !== n);
    list.unshift({
      name: n,
      form: { name, templateId, specKey, desiredState, env, metadata, autoSuspend, maxRun, deleteAfter },
    });
    saveProfiles(list);
    setProfiles(list);
    setProfileName(''); setShowSaveProfile(false);
  };
  const delProfile = (n: string) => {
    saveProfiles(getProfiles().filter((p) => p.name !== n));
    setProfiles(getProfiles());
  };

  const submit = async () => {
    setBusy(true); setErr(null); setPhase(t('mc.submitting')); setDoneId(null);
    const body: CreateMachineBody = { desiredState };
    if (name.trim()) body.name = name.trim();
    if (templateId) {
      const [tid, ver] = templateId.split('@');
      body.templateId = tid;
      if (ver && ver !== 'latest') body.templateVersion = ver;
    }
    if (selSpec) { body.vcpus = selSpec.vcpus; body.memMiB = selSpec.memMiB; }
    const envObj = parseKV(env);
    if (Object.keys(envObj).length) body.env = envObj;
    const mdObj = parseKV(metadata);
    if (Object.keys(mdObj).length) body.metadata = mdObj;
    if (autoSuspend) body.autoSuspendAfterSeconds = Number(autoSuspend);
    if (maxRun) body.maxRunMinutes = Number(maxRun);
    if (deleteAfter) body.deleteAfterSeconds = Number(deleteAfter);
    try {
      const r = await machinesApi.create(body);
      if (r.operationId) {
        await waitForOperation(r.operationId, (op) => setPhase(`${op.state}${op.phase ? ` · ${op.phase}` : ''}`));
      }
      setDoneId(r.machineId || '');
      setTimeout(() => onCreated(), 800);
    } catch (e) { setErr(errText(e)); setBusy(false); setPhase(null); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('mc.title')} width="max-w-2xl">
      <div className="space-y-3">
        {/* 预设 */}
        <div className="rounded-md border border-line bg-panel2 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Bookmark size={13} className="text-dim" />
            {profiles.length === 0 ? <span className="text-xs text-dim">—</span> : profiles.map((p) => (
              <span key={p.name} className="inline-flex items-center gap-1 rounded border border-line bg-bg px-2 py-1 text-xs">
                <button className="text-sky-400 hover:underline" onClick={() => applyProfile(p)}>{p.name}</button>
                <button className="text-dim hover:text-red-400" onClick={() => delProfile(p.name)}><Trash2 size={11} /></button>
              </span>
            ))}
            <span className="flex-1" />
            <Button className="!px-2 !py-1 !text-xs" onClick={() => setShowSaveProfile((v) => !v)}><BookmarkPlus size={12} /> {t('common.save')}</Button>
          </div>
          {showSaveProfile && (
            <div className="mt-2 flex items-center gap-2">
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder={t('common.name')} className="w-44" />
              <Button variant="primary" className="!py-1" onClick={saveProfile}>{t('common.save')}</Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('mc.name')} hint={t('mc.nameHint')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('mc.namePh')} className="w-full" />
          </Field>
          <Field label={t('mc.template')}>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full">
              {creatable.map((tpl) => (
                <option key={`${tpl.id}@${tpl.version}`} value={`${tpl.id}@${tpl.version}`}>
                  {tpl.id}@{tpl.version}{tpl.default ? t('mc.defaultTpl') : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('mc.size')}>
            <Select value={specKey} onChange={(e) => setSpecKey(e.target.value)} className="w-full">
              <option value="">{t('mc.sizeDefault', { s: specs[0] ? `${specs[0].vcpus} vCPU / ${specs[0].memMiB / 1024} GiB` : '4C/8G' })}</option>
              {specs.map((s) => (
                <option key={`${s.vcpus}/${s.memMiB}`} value={`${s.vcpus}/${s.memMiB}`}>{s.vcpus} vCPU / {s.memMiB / 1024} GiB</option>
              ))}
            </Select>
          </Field>
          <Field label={t('mc.postState')}>
            <Select value={desiredState} onChange={(e) => setDesiredState(e.target.value as 'running' | 'stopped')} className="w-full">
              <option value="running">{t('mc.postRunning')}</option>
              <option value="stopped">{t('mc.postStopped')}</option>
            </Select>
          </Field>
          <Field label={t('mc.autoPause')} hint={t('mc.autoPauseHint')}>
            <Select value={autoSuspend} onChange={(e) => setAutoSuspend(e.target.value)} className="w-full">
              <option value="">—</option>
              {[300, 600, 900, 1800].map((s) => <option key={s} value={s}>{t('mc.minutes', { n: s / 60 })}</option>)}
              <option value="0">0</option>
            </Select>
          </Field>
          <Field label={t('mc.maxRun')} hint={t('mc.maxRunHint')}>
            <Input type="number" value={maxRun} onChange={(e) => setMaxRun(e.target.value)} placeholder={t('mc.maxRunPh')} className="w-full" />
          </Field>
          <Field label={t('mc.deleteAfter')} hint={t('mc.deleteAfterHint')}>
            <Input type="number" value={deleteAfter} onChange={(e) => setDeleteAfter(e.target.value)} placeholder={t('mc.noSet')} className="w-full" />
          </Field>
          <Field label={t('mc.env')} hint={t('mc.envHint')}>
            <Textarea rows={2} value={env} onChange={(e) => setEnv(e.target.value)} placeholder={'FOO=bar\nBAZ=qux'} className="w-full" />
          </Field>
          <Field label={t('mc.metadata')} hint={t('mc.metadataHint')}>
            <Textarea rows={2} value={metadata} onChange={(e) => setMetadata(e.target.value)} placeholder={'team=infra'} className="w-full" />
          </Field>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {phase && <div className="flex items-center gap-2 text-sm text-sky-400"><Spinner className="!size-4" /> {phase}</div>}
        {doneId && (
          <OkBox>
            <span className="inline-flex items-center gap-2">
              {t('mc.created', { id: doneId })}
              <span className="mono">{doneId}</span>
              <CopyButton text={doneId} />
            </span>
          </OkBox>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy && !doneId}>{t('common.close')}</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{t('common.create')}</Button>
        </div>
      </div>
    </Modal>
  );
}
