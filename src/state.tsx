/** 全局状态：API Key（多账号切换）、账户信息（me）、组织上下文 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getApiKey, setApiKey, getAccounts, upsertAccount, renameAccount, api, errText } from '@/api/client';
import type { AccountEntry } from '@/api/client';
import type { Me } from '@/api/types';

interface GlobalCtx {
  hasKey: boolean;
  key: string;
  updateKey: (k: string) => void;
  accounts: AccountEntry[];
  setAccounts: (list: AccountEntry[]) => void;
  me: Me | null;
  meError: string | null;
  refreshMe: () => Promise<void>;
  orgId: string | null;          // 上下文 org（默认个人 org）
  setOrgId: (id: string) => void;
  personalOrgId: string | null;
}

const Ctx = createContext<GlobalCtx>(null as unknown as GlobalCtx);
export const useGlobal = () => useContext(Ctx);

export function GlobalProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState(getApiKey());
  const [accounts, setAccounts] = useState<AccountEntry[]>(getAccounts());
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    if (!getApiKey()) { setMe(null); setMeError(null); return; }
    try {
      const m = await api<Me>('GET', 'v1/me');
      setMe(m);
      setMeError(null);
      // 同步账号档案：当前 Key 没存过就建档（用登录名），存过就更新登录名
      const cur = getApiKey();
      const list = getAccounts();
      if (!list.some((a) => a.key === cur)) setAccounts(upsertAccount(m.login || '账号', cur));
      else setAccounts(renameAccount(cur, m.login || ''));
      // 默认 org：workspace key → 它的 org；否则第一个 org（个人）
      setOrgId((prev) => prev ?? m.org?.id ?? m.workspaces?.[0]?.id ?? null);
    } catch (e) {
      setMe(null);
      setMeError(errText(e));
    }
  }, []);

  useEffect(() => { refreshMe(); }, [key, refreshMe]);

  const updateKey = useCallback((k: string) => {
    setApiKey(k);
    setKey(getApiKey());
    setMe(null); setMeError(null); setOrgId(null);
  }, []);

  const personalOrgId = me?.org?.id ?? null;

  return (
    <Ctx.Provider value={{ hasKey: !!key, key, updateKey, accounts, setAccounts, me, meError, refreshMe, orgId, setOrgId, personalOrgId }}>
      {children}
    </Ctx.Provider>
  );
}
