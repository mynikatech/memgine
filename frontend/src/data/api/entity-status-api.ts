import type { EntityStatus, EntityType, ID, Status } from "@/src/core";

import { httpClient } from "./http-client";

type EntityStatusSnapshot = {
  statuses: Status[];
  entityTypes: EntityType[];
  entityStatuses: EntityStatus[];
};

class EntityStatusApi {
  private snapshot: EntityStatusSnapshot | null = null;

  private async getSnapshot(): Promise<EntityStatusSnapshot> {
    if (this.snapshot) {
      return this.snapshot;
    }

    const result = await httpClient.get<EntityStatusSnapshot>(
      "/api/v1/entity-status",
    );

    if (!result.success) {
      throw new Error(result.error.message);
    }

    this.snapshot = result.data;
    return this.snapshot;
  }

  async resolveEntityStatusId(
    entityTypeCode: string,
    statusId: ID,
  ): Promise<ID> {
    const normalizedEntityTypeCode = entityTypeCode.trim().toUpperCase();

    const resolve = (snapshot: EntityStatusSnapshot): ID | undefined => {
      const entityType = snapshot.entityTypes.find(
        (item) =>
          item.entityTypeCode.trim().toUpperCase() ===
            normalizedEntityTypeCode && item.isActive,
      );

      if (!entityType) {
        return undefined;
      }

      return snapshot.entityStatuses.find(
        (item) =>
          item.entityTypeId === entityType.id &&
          item.statusId === statusId &&
          item.isActive,
      )?.id;
    };

    let snapshot = await this.getSnapshot();
    let entityStatusId = resolve(snapshot);

    if (!entityStatusId) {
      this.clearCache();
      snapshot = await this.getSnapshot();
      entityStatusId = resolve(snapshot);
    }

    if (!entityStatusId) {
      throw new Error(
        `Status ${statusId} is not valid for entity type ${entityTypeCode}.`,
      );
    }

    return entityStatusId;
  }

  async resolveStatusId(entityStatusId: ID): Promise<ID> {
    let snapshot = await this.getSnapshot();

    let entityStatus = snapshot.entityStatuses.find(
      (item) => item.id === entityStatusId && item.isActive,
    );

    if (!entityStatus) {
      this.clearCache();
      snapshot = await this.getSnapshot();

      entityStatus = snapshot.entityStatuses.find(
        (item) => item.id === entityStatusId && item.isActive,
      );
    }

    if (!entityStatus) {
      throw new Error(
        `Entity status ${entityStatusId} was not found or is inactive.`,
      );
    }

    return entityStatus.statusId;
  }

  clearCache(): void {
    this.snapshot = null;
  }
}

export const entityStatusApi = new EntityStatusApi();
