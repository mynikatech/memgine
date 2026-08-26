/**
 * Persistent local storage abstraction used while the server API is absent.
 *
 * AsyncStorage is intentionally hidden behind this interface so repositories
 * do not depend on a particular storage technology. The production adapter
 * can later be replaced by the HTTP API without changing the UI contract.
 */
export interface LocalStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
