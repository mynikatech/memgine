import type { ID } from "@/src/core";

export type ConfigurationDraft<T> = {
  organizationId: ID;

  /**
   * Persisted organization configuration.
   * Never mutated by the form.
   */
  current: T | null;

  /**
   * Editable working copy.
   */
  proposed: T | null;

  /**
   * Version from Current when the draft was created.
   * This becomes important when we introduce server-side
   * optimistic concurrency.
   */
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
        ? Number(
            (
              current as {
                versionNo?: number;
              }
            ).versionNo,
          )
        : undefined,

    isDirty: false,
    isLoading: false,
    isSaving: false,
    error: null,
  };
}
