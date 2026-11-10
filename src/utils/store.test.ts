/** 快捷命令库与审计存储（localStorage，jsdom 环境） */
import { describe, it, expect, beforeEach } from 'vitest';
import { upsertSnippet, deleteSnippet, getSnippets } from '@/utils/snippets';
import { recordAudit, getAudit, clearAudit } from '@/utils/audit';

describe('snippets', () => {
  beforeEach(() => localStorage.clear());

  it('upserts and dedupes by name', () => {
    upsertSnippet('deploy', 'echo 1');
    upsertSnippet('deploy', 'echo 2');
    const list = getSnippets();
    expect(list).toHaveLength(1);
    expect(list[0].cmd).toBe('echo 2');
  });

  it('deletes by id', () => {
    upsertSnippet('a', 'a');
    const [s] = getSnippets();
    deleteSnippet(s.id);
    expect(getSnippets()).toHaveLength(0);
  });
});

describe('audit', () => {
  beforeEach(() => localStorage.clear());

  it('records write ops only, newest first', () => {
    recordAudit({ method: 'GET', path: 'v1/machines', status: 200, ok: true });
    recordAudit({ method: 'POST', path: 'v1/machines', status: 200, ok: true });
    const list = getAudit();
    expect(list).toHaveLength(1);
    expect(list[0].method).toBe('POST');
    expect(list[0].ok).toBe(true);
  });

  it('caps at 300 entries and clears', () => {
    for (let i = 0; i < 310; i++) recordAudit({ method: 'DELETE', path: `v1/x/${i}`, status: 200, ok: true });
    expect(getAudit().length).toBe(300);
    clearAudit();
    expect(getAudit()).toHaveLength(0);
  });
});
