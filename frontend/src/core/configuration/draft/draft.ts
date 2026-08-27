export type DraftState = "clean" | "dirty" | "saving" | "saved" | "error";

export type ConfigurationDraft<T> = {
  current: T;
  proposed: T;
  state: DraftState;
  error?: string;
};

export function createConfigurationDraft<T>(current: T): ConfigurationDraft<T> {
  return {
    current,
    proposed: structuredClone(current),
    state: "clean",
  };
}

export function updateConfigurationDraft<T>(
  draft: ConfigurationDraft<T>,
  proposed: T,
): ConfigurationDraft<T> {
  return {
    ...draft,
    proposed,
    state: "dirty",
    error: undefined,
  };
}

export function markDraftSaving<T>(
  draft: ConfigurationDraft<T>,
): ConfigurationDraft<T> {
  return {
    ...draft,
    state: "saving",
    error: undefined,
  };
}

export function markDraftSaved<T>(
  draft: ConfigurationDraft<T>,
  current: T,
): ConfigurationDraft<T> {
  return {
    current,
    proposed: structuredClone(current),
    state: "saved",
    error: undefined,
  };
}

export function markDraftError<T>(
  draft: ConfigurationDraft<T>,
  error: string,
): ConfigurationDraft<T> {
  return {
    ...draft,
    state: "error",
    error,
  };
}

export function discardConfigurationDraft<T>(
  draft: ConfigurationDraft<T>,
): ConfigurationDraft<T> {
  return {
    current: draft.current,
    proposed: structuredClone(draft.current),
    state: "clean",
    error: undefined,
  };
}
