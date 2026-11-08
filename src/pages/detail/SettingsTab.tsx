/** 设置：改名、调规格、扩容数据盘、自动暂停、元数据（PATCH /v1/machines/{id}） */
import { useState } from 'react';
import { Save } from 'lucide-react';
import { errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useGlobal } from '@/state';
import { Card, Button, Field, Input, Textarea, ErrorBox, OkBox, Badge } from '@/components/ui';
import type { Machine } from '@/api/types';

const parseKV = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of s.split('\n')) {
    const t = line.trim(); const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
};

export default function SettingsTab({ m, reload }: { m: Machine; reload: () => void }) {
  const { me } = useGlobal();
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
      setOk('已保存');
      reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <Card title="沙箱设置">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名称" hint="1-63 位小写字母/数字/连字符">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mono w-full" />
          </Field>
          <Field label="规格（仅停止中的付费沙箱）" hint={isFree ? '免费沙箱规格固定' : stopped ? '下次启动生效' : '需先停止'}>
            <select
              value={spec} onChange={(e) => setSpec(e.target.value)} disabled={isFree || !stopped}
              className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm disabled:opacity-50"
            >
              {specs.map((s) => <option key={`${s.vcpus}/${s.memMiB}`} value={`${s.vcpus}/${s.memMiB}`}>{s.vcpus} vCPU / {s.memMiB / 1024} GiB</option>)}
              {!specs.some((s) => `${s.vcpus}/${s.memMiB}` === spec) && <option value={spec}>{m.spec.vcpus} vCPU / {m.spec.memMiB / 1024} GiB（当前）</option>}
            </select>
          </Field>
          <Field label="数据盘扩容（GiB，1-1024）" hint="运行中实时扩容；缩小在下次启动生效">
            <Input type="number" value={disk} onChange={(e) => setDisk(e.target.value)} placeholder="不变" disabled={isFree} className="w-full" />
          </Field>
          <Field label="空闲自动暂停（秒）" hint="300-1800 或 0 = 关闭">
            <select value={autoSuspend} onChange={(e) => setAutoSuspend(e.target.value)} className="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm">
              <option value="">默认</option>
              {[300, 600, 900, 1200, 1800].map((s) => <option key={s} value={s}>{s / 60} 分钟</option>)}
              <option value="0">关闭</option>
            </select>
          </Field>
          <Field label="最长连续运行（分钟）" hint="0 = 用计划默认；留空不变">
            <Input type="number" value={maxRun} onChange={(e) => setMaxRun(e.target.value)} className="w-full" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="元数据（每行 key=value，留空清除全部）">
            <Textarea rows={3} value={metadata} onChange={(e) => setMetadata(e.target.value)} className="w-full" />
          </Field>
        </div>
        {['running', 'suspended'].includes(m.state) && (bodyNeedsRestart(spec, m, isFree) || disk) && (
          <label className="mt-3 flex items-center gap-2 text-sm text-amber-300">
            <input type="checkbox" checked={restartApply} onChange={(e) => setRestartApply(e.target.checked)} />
            规格修改需要重启：勾选后自动执行「停止 → 调整 → 启动」（否则拒绝）
          </label>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={save} loading={busy}><Save size={14} /> 保存</Button>
          <span className="text-xs text-dim">当前版本 {m.revision}</span>
          {ok && <OkBox>{ok}</OkBox>}
        </div>
        <div className="mt-3"><ErrorBox>{err}</ErrorBox></div>
      </Card>

      <Card title="其他信息">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Info k="沙箱 ID" v={m.id} mono />
          <Info k="Linux 用户" v={m.guestUser} mono />
          <Info k="组织" v={m.orgId} mono />
          <Info k="创建时间" v={new Date(m.createdAt).toLocaleString()} />
          <Info k="最近更新" v={new Date(m.updatedAt).toLocaleString()} />
          <Info k="环境变量名" v={m.envNames?.join(', ') || '无'} />
          <Info k="OOM 次数" v={String(m.oomKills ?? 0)} />
          <Info k="Vault 投递" v={m.vault ? '启用（旧版）' : '关闭'} />
          <Info k="归档期限" v={m.archiveAt ? new Date(m.archiveAt).toLocaleString() : '未设置'} />
          <Info k="删除期限" v={m.deleteAt ? new Date(m.deleteAt).toLocaleString() : '未设置'} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className="border-line">template {m.template.id}@{m.template.version}</Badge>
          {m.snapshot && <Badge className="border-line">from snapshot {m.snapshot.id}</Badge>}
        </div>
      </Card>
    </div>
  );
}

function bodyNeedsRestart(spec: string, m: Machine, isFree: boolean): boolean {
  if (isFree) return false;
  const [v, mem] = spec.split('/').map(Number);
  return v !== m.spec.vcpus || mem !== m.spec.memMiB;
}

function Info({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-xs text-dim">{k}</span>
      <span className={`min-w-0 break-all text-xs ${mono ? 'mono' : 'text-slate-300'}`}>{v}</span>
    </div>
  );
}
