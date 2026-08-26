import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LocalStore } from "./local-store";

export const asyncStorageStore: LocalStore = {
  async get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(key);
    return value === null ? null : (JSON.parse(value) as T);
  },

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
