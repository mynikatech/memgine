import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type {
  ID,
  OrganizationUser,
  Staff,
  StaffStoreAssignment,
  Store,
  User,
} from "@/src/core";

/**
 * Local persistence for organization operational entities.
 *
 * This repository is intentionally provider-neutral.
 *
 * Today:
 *   AsyncStorage
 *
 * Later:
 *   Server/API implementation
 *
 * The service contract consumed by the UI does not need to change.
 */
export class LocalOrganizationMembersRepository {
  async listStores(organizationId: ID): Promise<Store[]> {
    return (
      (await asyncStorageStore.get<Store[]>(
        LOCAL_DATA_KEYS.organizationStores(organizationId),
      )) ?? []
    );
  }

  async saveStores(organizationId: ID, stores: Store[]): Promise<void> {
    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationStores(organizationId),
      stores,
    );
  }

  async listUsers(): Promise<User[]> {
    return (await asyncStorageStore.get<User[]>(LOCAL_DATA_KEYS.users())) ?? [];
  }

  async saveUsers(users: User[]): Promise<void> {
    await asyncStorageStore.set(LOCAL_DATA_KEYS.users(), users);
  }

  async listOrganizationUsers(organizationId: ID): Promise<OrganizationUser[]> {
    return (
      (await asyncStorageStore.get<OrganizationUser[]>(
        LOCAL_DATA_KEYS.organizationUsers(organizationId),
      )) ?? []
    );
  }

  async saveOrganizationUsers(
    organizationId: ID,
    organizationUsers: OrganizationUser[],
  ): Promise<void> {
    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationUsers(organizationId),
      organizationUsers,
    );
  }

  async listStaff(organizationId: ID): Promise<Staff[]> {
    return (
      (await asyncStorageStore.get<Staff[]>(
        LOCAL_DATA_KEYS.staff(organizationId),
      )) ?? []
    );
  }

  async saveStaff(organizationId: ID, staff: Staff[]): Promise<void> {
    await asyncStorageStore.set(LOCAL_DATA_KEYS.staff(organizationId), staff);
  }

  async listStaffStoreAssignments(
    organizationId: ID,
  ): Promise<StaffStoreAssignment[]> {
    return (
      (await asyncStorageStore.get<StaffStoreAssignment[]>(
        LOCAL_DATA_KEYS.staffStoreAssignments(organizationId),
      )) ?? []
    );
  }

  async saveStaffStoreAssignments(
    organizationId: ID,
    assignments: StaffStoreAssignment[],
  ): Promise<void> {
    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.staffStoreAssignments(organizationId),
      assignments,
    );
  }
}
