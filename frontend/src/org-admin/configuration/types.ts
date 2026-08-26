import type { ID } from "@/src/core";

/**
 * Generic lifecycle state for organization configuration that an OrgAdmin can
 * edit. Current is persisted organization state; proposed is an independent
 * working copy used by the form and customer preview.
 */
export type ConfigurationDraft<T> = {
  organizationId: ID;
  current: T | null;
  proposed: T | null;
  originalVersionNo?: number;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
};

export function createConfigurationDraft<T>(
  organizationId: ID,
  current: T | null,
): ConfigurationDraft<T> {
  return {
    organizationId,
    current,
    proposed: current === null ? null : structuredClone(current),
    originalVersionNo:
      current && typeof current === "object" && "versionNo" in current
        ? Number((current as { versionNo?: number }).versionNo)
        : undefined,
    isDirty: false,
    isLoading: false,
    isSaving: false,
    error: null,
  };
}
