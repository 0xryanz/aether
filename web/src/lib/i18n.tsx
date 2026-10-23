"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "zh" | "en";

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  pick: <T>(zh: T, en: T) => T;
};

const I18nContext = createContext<I18nValue>({
  lang: "en",
  setLang: () => {},
  pick: (zh) => zh,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem("aether:lang");
    if (stored === "zh" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem("aether:lang", next);
  }, []);

  const pick = useCallback(<T,>(zh: T, en: T): T => (lang === "zh" ? zh : en), [lang]);

  const value = useMemo(() => ({ lang, setLang, pick }), [lang, setLang, pick]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** False during SSR and the first client render, true after hydration. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Re-renders once per second, for boost countdowns and live accrual. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
