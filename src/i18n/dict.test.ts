/** i18n 字典完整性：zh/en 的 key 集合必须一致（防漏翻译） */
import { describe, it, expect } from 'vitest';
import { dict } from '@/i18n/dict';

describe('dict completeness', () => {
  const zhKeys = Object.keys(dict.zh).sort();
  const enKeys = Object.keys(dict.en).sort();

  it('en has every zh key', () => {
    const missing = zhKeys.filter((k) => !(k in dict.en));
    expect(missing).toEqual([]);
  });

  it('zh has every en key', () => {
    const missing = enKeys.filter((k) => !(k in dict.zh));
    expect(missing).toEqual([]);
  });

  it('no empty values', () => {
    for (const [k, v] of Object.entries(dict.zh)) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(dict.en)) expect(v.length, k).toBeGreaterThan(0);
  });
});
