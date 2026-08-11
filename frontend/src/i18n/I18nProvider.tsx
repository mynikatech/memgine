import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import {
  DEFAULT_REGION,
  formatCurrency,
  formatDate,
  formatNumber,
  RegionConfig,
} from "./format";
import { Locale, translations } from "./translations";

type Vars = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  region: RegionConfig;
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Vars) => string;
  formatCurrency: (amount: number) => string;
  formatNumber: (value: number) => string;
  formatDate: (date: Date | string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function resolvePath(source: unknown, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), source);
  return typeof value === "string" ? value : path;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{{${key}}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  const region = DEFAULT_REGION;

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      region,
      isRTL: false,
      setLocale,
      t: (path, vars) => interpolate(resolvePath(translations[locale], path), vars),
      formatCurrency: (amount) => formatCurrency(amount, region),
      formatNumber: (v) => formatNumber(v, region),
      formatDate: (date) => formatDate(date, region),
    }),
    [locale, region],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within an I18nProvider");
  return ctx;
}
