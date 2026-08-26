/**
 * Session-scoped working state.
 *
 * This is for unsaved OrgAdmin configuration changes.
 *
 * It is NOT the persisted organization state.
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
