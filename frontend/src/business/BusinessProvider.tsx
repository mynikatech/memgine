import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { service } from "@/src/services";
import { getTemplate } from "@/src/templates";
import type { TemplateDefinition } from "@/src/templates";
import { baseTheme, createTheme, Theme } from "@/src/theme/theme";

import type { BusinessConfiguration } from "./types";

/**
 * BusinessProvider — loads a business configuration, derives the active theme
 * from its branding and resolves its template from the registry. Navigation
 * stays Memgine-controlled; only branding/presentation come from the business.
 */
type BusinessContextValue = {
  business: BusinessConfiguration | null;
  template: TemplateDefinition | null;
  theme: Theme;
  loading: boolean;
  selectBusiness: (id: string) => Promise<BusinessConfiguration>;
  clearBusiness: () => void;
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<BusinessConfiguration | null>(null);
  const [loading, setLoading] = useState(false);

  const selectBusiness = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const config = await service.getBusinessConfiguration(id);
      setBusiness(config);
      return config;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearBusiness = useCallback(() => setBusiness(null), []);

  const theme = useMemo<Theme>(
    () => (business ? createTheme(business.branding) : baseTheme),
    [business],
  );

  const template = useMemo<TemplateDefinition | null>(
    () => (business ? getTemplate(business.templateId) ?? null : null),
    [business],
  );

  const value = useMemo<BusinessContextValue>(
    () => ({ business, template, theme, loading, selectBusiness, clearBusiness }),
    [business, template, theme, loading, selectBusiness, clearBusiness],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within a BusinessProvider");
  return ctx;
}

/** Convenience hook: the active theme (business-branded or Memgine default). */
export function useTheme(): Theme {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useTheme must be used within a BusinessProvider");
  return ctx.theme;
}
