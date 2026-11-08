/** 文件管理：浏览/预览/Monaco 编辑/上传/下载/新建/删除/重命名（删除与重命名走 exec） */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FolderUp, Folder, File as FileIcon, Link2, Download, Upload, Trash2,
  PenLine, Save, RefreshCw, FolderPlus, FilePlus,
} from 'lucide-react';
import { apiDownload, errText } from '@/api/client';
import { machinesApi } from '@/api/machines';
import { useT } from '@/i18n';
import {
  Card, Button, Input, ErrorBox, OkBox, Spinner, Crumbs, Confirm, Modal, Field, Textarea, Empty,
} from '@/components/ui';
import { fmtBytes, fmtTime } from '@/utils/format';
import type { Machine, Files, FileEntry } from '@/api/types';

const HOME = '/data/home';

const extLang = (name: string): string | undefined => {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json',
    py: 'python', go: 'go', rs: 'rust', sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml',
    md: 'markdown', html: 'html', css: 'css', sql: 'sql', toml: 'ini', ini: 'ini',
    dockerfile: 'dockerfile', c: 'c', h: 'c', cpp: 'cpp', java: 'java', rb: 'ruby', php: 'php',
  };
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  return map[ext || ''];
};

export default function FilesTab({ m }: { m: Machine }) {
  const { t } = useT();
  const [path, setPath] = useState(HOME);
  const [data, setData] = useState<Files | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<FileEntry | null>(null);
  const [rename, setRename] = useState<FileEntry | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const running = m.state === 'running';

  const read = useCallback(async (p: string) => {
    setLoading(true); setErr(null); setOk(null);
    try { setData(await machinesApi.readFile(m.id, p)); }
    catch (e) { setErr(errText(e)); setData(null); }
    setLoading(false);
  }, [m.id]);

  useEffect(() => { if (running) read(path); }, [path, read, running]);

  const join = (base: string, name: string) => (base === '/' ? `/${name}` : `${base}/${name}`);
  const parts = path.split('/').filter(Boolean);
  const navTo = (depth: number) => setPath('/' + parts.slice(0, depth).join('/'));

  const openEntry = (e: FileEntry) => {
    const p = join(path, e.name);
    if (e.type === 'dir') setPath(p);
    else if (e.type === 'symlink' && e.target) setPath(e.target.startsWith('/') ? e.target : join(path, e.target));
    else read(p);
  };

  const download = async (e: FileEntry) => {
    try {
      setOk(t('files.downloading', { n: e.name }));
      const { blob, filename } = await apiDownload(`v1/machines/${m.id}/files/content`, { path: join(path, e.name) });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || e.name;
      a.click();
      URL.revokeObjectURL(a.href);
      setOk(t('files.downloaded', { n: e.name, s: fmtBytes(blob.size) }));
    } catch (er) { setErr(errText(er)); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    for (const f of Array.from(files)) {
      try {
        await machinesApi.writeFile(m.id, join(path, f.name), f, undefined, true);
        setOk(t('files.uploaded', { n: f.name, s: fmtBytes(f.size) }));
      } catch (e) { setErr(errText(e)); break; }
    }
    read(path);
  };

  const del = async (e: FileEntry) => {
    try {
      await machinesApi.exec(m.id, { cmd: `rm -rf -- ${(path === '/' ? '' : path)}/${JSON.stringify(e.name)}` });
      setOk(t('files.deleted', { n: e.name }));
      read(path);
    } catch (er) { setErr(errText(er)); }
  };

  const doRename = async () => {
    if (!rename || !renameTo.trim()) return;
    try {
      const base = path === '/' ? '' : path;
      await machinesApi.exec(m.id, { cmd: `mv -- ${base}/${JSON.stringify(rename.name)} ${base}/${JSON.stringify(renameTo.trim())}` });
      setOk(t('files.renamed', { a: rename.name, b: renameTo.trim() }));
      read(path);
    } catch (er) { setErr(errText(er)); }
  };

  const doMkdir = async () => {
    if (!mkdirName.trim()) return;
    try {
      await machinesApi.exec(m.id, { cmd: `mkdir -p -- ${(path === '/' ? '' : path)}/${JSON.stringify(mkdirName.trim())}` });
      setOk(t('files.created', { n: mkdirName.trim() }));
      read(path);
    } catch (er) { setErr(errText(er)); }
  };

  const saveContent = async (newContent: string) => {
    try {
      await machinesApi.writeFile(m.id, data!.path, new Blob([newContent]));
      setOk(t('files.saved', { p: data!.path }));
      setData({ ...data!, content: newContent, size: new Blob([newContent]).size });
    } catch (e) { setErr(errText(e)); }
  };

  const isTextFile = (f: Files) => f.type === 'file' && !f.binary;

  return (
    <div className="space-y-3">
      {!running && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{t('files.notRunning')}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="!px-2" title={t('files.parent')} onClick={() => navTo(Math.max(0, parts.length - 1))}><FolderUp size={15} /></Button>
        <Crumbs parts={parts} onNav={navTo} />
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button className="!px-2" title={t('common.refresh')} onClick={() => read(path)}><RefreshCw size={14} /></Button>
          <Button className="!px-2" title={t('files.mkdir')} onClick={() => setMkdirOpen(true)}><FolderPlus size={14} /></Button>
          <Button className="!px-2" title={t('files.newFile')} onClick={() => setNewFileOpen(true)}><FilePlus size={14} /></Button>
          <Button className="!px-2" title={t('common.upload')} onClick={() => fileInput.current?.click()}><Upload size={14} /> {t('common.upload')}</Button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <OkBox>{ok}</OkBox>}

      {loading ? <Spinner /> : !data ? null : data.type === 'dir' ? (
        <Card>
          {(data.entries?.length ?? 0) === 0 ? <Empty>{t('files.emptyDir')}</Empty> : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line/50">
                {data.entries!.map((e) => (
                  <tr key={e.name} className="group hover:bg-white/[0.03]">
                    <td className="w-8 py-1.5 pl-2 text-dim">
                      {e.type === 'dir' ? <Folder size={15} className="text-sky-400/80" />
                        : e.type === 'symlink' ? <Link2 size={15} className="text-amber-400/80" />
                        : <FileIcon size={15} className="text-slate-500" />}
                    </td>
                    <td className="cursor-pointer py-1.5">
                      <button className="text-left text-slate-200 hover:text-sky-400" onClick={() => openEntry(e)}>{e.name}</button>
                      {e.type === 'symlink' && e.target && <span className="ml-2 text-xs text-dim">→ {e.target}</span>}
                    </td>
                    <td className="mono w-24 py-1.5 text-xs text-dim">{e.type === 'dir' ? '—' : fmtBytes(e.size)}</td>
                    <td className="mono w-40 py-1.5 text-xs text-dim">{e.mode}</td>
                    <td className="w-36 py-1.5 text-xs text-dim">{fmtTime(e.modTime)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <div className="invisible flex justify-end gap-1 group-hover:visible">
                        {e.type !== 'dir' && <Button className="!px-1.5 !py-0.5" title={t('common.download')} onClick={() => download(e)}><Download size={13} /></Button>}
                        <Button className="!px-1.5 !py-0.5" title={t('files.rename')} onClick={() => { setRename(e); setRenameTo(e.name); }}><PenLine size={13} /></Button>
                        <Button className="!px-1.5 !py-0.5" variant="danger" title={t('common.delete')} onClick={() => setConfirmDel(e)}><Trash2 size={13} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : isTextFile(data) ? (
        <TextFileView file={data} onSave={saveContent} onBack={() => read(path.split('/').slice(0, -1).join('/') || '/')} />
      ) : (
        <Card>
          <div className="space-y-3 text-sm">
            <div className="text-dim">{data.path} ({fmtBytes(data.size)}) — {t('files.binary')}</div>
            <Button onClick={() => download({ name: data.path.split('/').pop() || 'file', type: 'file', size: data.size, mode: '', modTime: '' } as FileEntry)}>
              <Download size={14} /> {t('common.download')}
            </Button>
            <Button variant="ghost" onClick={() => read(path.split('/').slice(0, -1).join('/') || '/')}>{t('files.back')}</Button>
          </div>
        </Card>
      )}

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => confirmDel && del(confirmDel)}
        title={`${t('common.delete')} ${confirmDel?.name || ''}`} message={t('files.delConfirm')} confirmText={t('common.delete')} danger />

      <Modal open={!!rename} onClose={() => setRename(null)} title={t('files.rename')}>
        <div className="space-y-3">
          <Field label={t('files.newName')}><Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} className="mono w-full" autoFocus /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRename(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={doRename}>{t('common.confirm')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={mkdirOpen} onClose={() => setMkdirOpen(false)} title={t('files.mkdir')}>
        <div className="space-y-3">
          <Field label={t('files.dirName')}><Input value={mkdirName} onChange={(e) => setMkdirName(e.target.value)} className="mono w-full" autoFocus /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMkdirOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => { doMkdir(); setMkdirOpen(false); }}>{t('common.create')}</Button>
          </div>
        </div>
      </Modal>

      <NewFileDialog open={newFileOpen} onClose={() => setNewFileOpen(false)} defaultPath={path} machineId={m.id}
        onCreated={() => { setNewFileOpen(false); read(path); }} />
    </div>
  );
}

function TextFileView({ file, onSave, onBack }: { file: Files; onSave: (c: string) => void; onBack: () => void }) {
  const { t } = useT();
  const [content, setContent] = useState(file.content ?? '');
  const [dirty, setDirty] = useState(false);
  const [monaco, setMonaco] = useState<typeof import('@monaco-editor/react') | null>(null);

  useEffect(() => { setContent(file.content ?? ''); setDirty(false); }, [file.path, file.content]);
  useEffect(() => {
    import('@monaco-editor/react').then((mod) => setMonaco(mod)).catch(() => setMonaco(null));
  }, []);

  const name = file.path.split('/').pop() || '';
  const lang = extLang(name);
  const height = '420px';

  return (
    <Card title={<span className="mono text-xs">{file.path} · {fmtBytes(file.size)}{file.truncated ? t('files.truncated') : ''}</span>}
      right={
        <>
          <Button variant="ghost" onClick={onBack}>{t('files.back')}</Button>
          <Button variant="primary" disabled={!dirty} onClick={() => { onSave(content); setDirty(false); }}><Save size={14} /> {t('common.save')}</Button>
        </>
      }>
      <div className="overflow-hidden rounded-md border border-line" style={{ height }}>
        {monaco ? (
          <monaco.Editor
            height={height}
            language={lang}
            theme="vs-dark"
            value={content}
            onChange={(v) => { setContent(v ?? ''); setDirty(true); }}
            options={{
              fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false,
              wordWrap: 'on', lineNumbers: 'on', renderWhitespace: 'selection', tabSize: 2,
              automaticLayout: true, fontFamily: '"JetBrains Mono", Consolas, monospace',
            }}
          />
        ) : (
          <Textarea
            rows={18} value={content} spellCheck={false}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            className="mono h-full w-full resize-none leading-relaxed"
          />
        )}
      </div>
    </Card>
  );
}

function NewFileDialog({ open, onClose, defaultPath, machineId, onCreated }: {
  open: boolean; onClose: () => void; defaultPath: string; machineId: string; onCreated: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const p = `${defaultPath === '/' ? '' : defaultPath}/${name.trim()}`;
      await machinesApi.writeFile(machineId, p, new Blob([content]), undefined, true);
      onCreated();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={t('files.newFile')} width="max-w-xl">
      <div className="space-y-3">
        <Field label={t('files.fileName')}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('files.fileNamePh')} className="mono w-full" autoFocus /></Field>
        <Field label={t('files.initialContent')}><Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} className="h-40 w-full" /></Field>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={create}>{t('common.create')}</Button>
        </div>
      </div>
    </Modal>
  );
}
