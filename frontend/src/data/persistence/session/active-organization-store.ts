import { asyncStorageStore } from "../local/async-storage-store";

const ACTIVE_ORGANIZATION_KEY = "memgine.session.active-organization-id";

export const activeOrganizationStore = {
  async get(): Promise<string | null> {
    return asyncStorageStore.get<string>(ACTIVE_ORGANIZATION_KEY);
  },

  async set(organizationId: string): Promise<void> {
    await asyncStorageStore.set(ACTIVE_ORGANIZATION_KEY, organizationId);
  },

  async clear(): Promise<void> {
    await asyncStorageStore.remove(ACTIVE_ORGANIZATION_KEY);
  },
};
