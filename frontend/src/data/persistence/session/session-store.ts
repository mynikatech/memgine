/**
 * Session-scoped working state. This is deliberately separate from
 * organization persistence: unsaved admin changes are drafts, not current
 * organization configuration.
 */
export interface SessionStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

const values = new Map<string, unknown>();

export const memorySessionStore: SessionStore = {
  get<T>(key: string): T | null {
    return (values.get(key) as T | undefined) ?? null;
  },

  set<T>(key: string, value: T): void {
    values.set(key, value);
  },

  remove(key: string): void {
    values.delete(key);
  },

  clear(): void {
    values.clear();
  },
};
