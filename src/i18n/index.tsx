/** i18n：轻量 t(key) + Provider，语言存 localStorage，默认跟随浏览器 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dict, type Lang } from './dict';
import { bindI18nT } from '@/api/client';

// 模块级全局语言（供非 React 环境 errText 使用）
let currentLang: Lang = 'zh';
export function getLang(): Lang { return currentLang; }

const LANG_KEY = 'instabox-ui.lang';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** 取文案：支持 {name} 占位符 —— t('mc.created', { id: 'm_x' }) */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx>(null as unknown as I18nCtx);
export const useT = () => useContext(Ctx);

function lookup(lang: Lang, key: string): string | undefined {
  const d = dict[lang] as Record<string, string | undefined>;
  return d[key];
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    if (saved === 'zh' || saved === 'en') return saved;
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  });

  useEffect(() => {
    currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    let s = lookup(lang, key) ?? lookup('zh', key) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return s;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  // 供非 React 模块（client.ts 的 errText）使用
  useEffect(() => { bindI18nT({ t }); }, [t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
