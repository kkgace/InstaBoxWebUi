/** Android 面板（实验性）：adb 设备、装 APK、截图、logcat —— 全部经 exec 调用模拟器 */
import { useCallback, useEffect, useState } from 'react';
import { Smartphone, RefreshCw, Download, Camera, Package, Terminal } from 'lucide-react';
import { apiDownload, errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import { Card, Button, Badge, ErrorBox, OkBox, Input, Spinner, CopyButton } from '@/components/ui';
import type { Machine } from '@/api/types';

export default function AndroidTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [devices, setDevices] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [logcatLines, setLogcatLines] = useState('100');
  const [logcat, setLogcat] = useState<string | null>(null);
  const [pkg, setPkg] = useState('com.android.settings');

  const isAndroid = /android/i.test(m.template.id);
  const running = m.state === 'running';
  if (!isAndroid) {
    return (
      <div className="rounded-md border border-line bg-panel px-3 py-4 text-sm text-dim">
        {t('android.notAndroid', { tpl: m.template.id })}
      </div>
    );
  }

  const run = useCallback(async (cmd: string, timeoutSeconds = 60) => {
    return machinesApi.exec(m.id, { cmd, timeoutSeconds });
  }, [m.id]);

  const loadDevices = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await run('adb devices -l 2>&1; echo ---; adb shell getprop ro.build.version.release 2>/dev/null; adb shell getprop ro.product.model 2>/dev/null', 60);
      setDevices(r.stdout);
    } catch (e) { setErr(errText(e)); }
    setLoading(false);
  }, [run]);
  useEffect(() => { loadDevices(); }, [loadDevices]);

  const screenshot = async () => {
    setBusy('shot'); setErr(null);
    try {
      await run('adb exec-out screencap -p > /tmp/_shot.png 2>/dev/null || adb shell screencap -p /sdcard/_shot.png && adb pull /sdcard/_shot.png /tmp/_shot.png >/dev/null 2>&1 || true', 60);
      const { blob, filename } = await apiDownload(`v1/machines/${m.id}/files/content`, { path: '/tmp/_shot.png' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || `${m.name}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      setOk(t('files.downloaded', { n: 'screenshot.png', s: fmtSize(blob.size) }));
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const installApk = async (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    setBusy('install'); setErr(null); setOk(null);
    try {
      await machinesApi.writeFile(m.id, `/tmp/${f.name}`, f, undefined, true);
      setOk(t('android.installing', { n: f.name }));
      const r = await run(`adb install -r /tmp/${JSON.stringify(f.name)} 2>&1 | tail -2`, 300);
      if (/Success/i.test(r.stdout)) setOk(t('android.installed', { n: f.name }));
      else setErr(`${f.name}: ${r.stdout || r.stderr || `exit ${r.exitCode}`}`);
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const tailLogcat = async () => {
    setBusy('logcat'); setErr(null);
    try {
      const r = await run(`adb logcat -d -t ${Number(logcatLines) || 100} 2>&1`, 60);
      setLogcat(r.stdout);
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  const launchApp = async () => {
    if (!pkg.trim()) return;
    setBusy('launch'); setErr(null);
    try {
      const r = await run(`adb shell monkey -p ${JSON.stringify(pkg.trim())} -c android.intent.category.LAUNCHER 1 2>&1 | tail -1`, 60);
      setOk(`${pkg}: ${r.stdout.trim().slice(0, 120)}`);
    } catch (e) { setErr(errText(e)); }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-line"><Smartphone size={11} /> adb</Badge>
        <Button variant="ghost" onClick={loadDevices} loading={loading}><RefreshCw size={14} /> {t('common.refresh')}</Button>
        <span className="flex-1" />
        <Button onClick={screenshot} loading={busy === 'shot'} disabled={!running}><Camera size={14} /> {t('android.screenshot')}</Button>
        <Button onClick={() => document.getElementById('apk-input')?.click()} loading={busy === 'install'} disabled={!running}><Package size={14} /> {t('android.installApk')}</Button>
        <input id="apk-input" type="file" accept=".apk" hidden onChange={(e) => { installApk(e.target.files); e.target.value = ''; }} />
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('android.devices')}>
          {loading && !devices ? <Spinner /> : (
            <pre className="mono max-h-64 overflow-auto rounded-md border border-line bg-bg p-3 text-xs text-slate-300">{devices || t('common.loading')}</pre>
          )}
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-dim">{t('android.launch')}</div>
            <div className="flex gap-2">
              <Input value={pkg} onChange={(e) => setPkg(e.target.value)} className="mono min-w-0 flex-1 !py-1 text-xs" />
              <Button className="!py-1" onClick={launchApp} loading={busy === 'launch'} disabled={!running}><Terminal size={12} /> {t('exec.run')}</Button>
            </div>
          </div>
        </Card>

        <Card title="logcat"
          right={
            <div className="flex items-center gap-2">
              <Input type="number" value={logcatLines} onChange={(e) => setLogcatLines(e.target.value)} className="w-20 !py-1 text-xs" />
              <Button className="!px-2 !py-1" onClick={tailLogcat} loading={busy === 'logcat'} disabled={!running}>{t('exec.run')}</Button>
            </div>
          }>
          {!logcat ? <div className="py-6 text-center text-sm text-dim">{t('android.logcatHint')}</div> : (
            <>
              <pre className="mono h-72 overflow-auto rounded-md border border-line bg-bg p-3 text-[10px] leading-relaxed text-slate-300">{logcat}</pre>
              <div className="mt-2"><CopyButton text={logcat} label={t('common.copy')} /></div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
