/**
 * Persistent local storage abstraction used while the server API
 * is not yet available.
 *
 * Repositories must depend on this abstraction rather than directly
 * depending on AsyncStorage.
 */
export interface LocalStore {
  get<T>(key: string): Promise<T | null>;

  set<T>(key: string, value: T): Promise<void>;

  remove(key: string): Promise<void>;
}
