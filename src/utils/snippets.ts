/** 快捷命令库：命名保存的 exec 片段，跨沙箱复用（localStorage） */
export interface Snippet {
  id: string;
  name: string;
  cmd: string;
}

const KEY = 'instabox-ui.snippets';

export function getSnippets(): Snippet[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(list: Snippet[]) { localStorage.setItem(KEY, JSON.stringify(list)); }

export function upsertSnippet(name: string, cmd: string): Snippet[] {
  const list = getSnippets().filter((s) => s.name !== name.trim());
  list.unshift({ id: `sn-${Date.now()}`, name: name.trim(), cmd });
  save(list);
  return list;
}
export function deleteSnippet(id: string): Snippet[] {
  const list = getSnippets().filter((s) => s.id !== id);
  save(list);
  return list;
}
