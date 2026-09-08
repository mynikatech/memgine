import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { ID, UserAcquisition } from "@/src/core";
import type { UserAcquisitionService } from "./service-contracts";

export class LocalUserAcquisitionService implements UserAcquisitionService {
  constructor(private readonly fallback: UserAcquisitionService) {}

  private async listLocal(organizationId: ID): Promise<UserAcquisition[]> {
    return (
      (await asyncStorageStore.get<UserAcquisition[]>(
        LOCAL_DATA_KEYS.userAcquisitions(organizationId),
      )) ?? []
    );
  }

  async getByUser(userId: ID): Promise<UserAcquisition[]> {
    const localOrganizations = await this.listOrganizationIds();
    const local = (
      await Promise.all(localOrganizations.map((id) => this.listLocal(id)))
    )
      .flat()
      .filter((item) => !item.isDeleted && item.userId === userId);

    const fallback = await this.fallback.getByUser(userId);
    const byId = new Map<string, UserAcquisition>();

    for (const item of fallback) {
      byId.set(item.id, item);
    }
    for (const item of local) {
      byId.set(item.id, item);
    }

    return Array.from(byId.values()).filter((item) => !item.isDeleted);
  }

  async listByOrganization(organizationId: ID): Promise<UserAcquisition[]> {
    const local = await this.listLocal(organizationId);
    const fallback = await this.fallback.listByOrganization(organizationId);
    const byId = new Map<string, UserAcquisition>();

    for (const item of fallback) {
      byId.set(item.id, item);
    }
    for (const item of local) {
      byId.set(item.id, item);
    }

    return Array.from(byId.values()).filter(
      (item) => !item.isDeleted && item.organizationId === organizationId,
    );
  }

  async listBySourceStore(storeId: ID): Promise<UserAcquisition[]> {
    const localOrganizations = await this.listOrganizationIds();
    const local = (
      await Promise.all(localOrganizations.map((id) => this.listLocal(id)))
    )
      .flat()
      .filter((item) => !item.isDeleted && item.sourceStoreId === storeId);

    const fallback = await this.fallback.listBySourceStore(storeId);
    const byId = new Map<string, UserAcquisition>();

    for (const item of fallback) {
      byId.set(item.id, item);
    }
    for (const item of local) {
      byId.set(item.id, item);
    }

    return Array.from(byId.values()).filter((item) => !item.isDeleted);
  }

  async createAcquisition(
    acquisition: UserAcquisition,
  ): Promise<UserAcquisition> {
    const organizationId = acquisition.organizationId;

    if (!organizationId) {
      throw new Error(
        "Organization ID is required to create an organization acquisition.",
      );
    }

    const acquisitions = await this.listLocal(organizationId);

    const duplicate = acquisitions.find(
      (item) =>
        !item.isDeleted &&
        item.userId === acquisition.userId &&
        item.organizationId === organizationId,
    );

    if (duplicate) {
      return duplicate;
    }

    const created: UserAcquisition = {
      ...acquisition,
      organizationId,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.userAcquisitions(organizationId),
      [...acquisitions, created],
    );

    return created;
  }

  private async listOrganizationIds(): Promise<ID[]> {
    const organizations = await asyncStorageStore.get<Array<{ id: ID } | ID>>(
      LOCAL_DATA_KEYS.organizationList(),
    );

    if (!organizations) {
      return [];
    }

    return organizations.map((item) =>
      typeof item === "string" ? item : item.id,
    );
  }
}
