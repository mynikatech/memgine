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
    const snapshot = await this.getSnapshot();

    const normalizedEntityTypeCode = entityTypeCode.trim().toUpperCase();

    const entityType = snapshot.entityTypes.find(
      (item) =>
        item.entityTypeCode.trim().toUpperCase() === normalizedEntityTypeCode &&
        item.isActive,
    );

    if (!entityType) {
      throw new Error(
        `Entity type ${entityTypeCode} was not found or is inactive.`,
      );
    }

    const entityStatus = snapshot.entityStatuses.find(
      (item) =>
        item.entityTypeId === entityType.id &&
        item.statusId === statusId &&
        item.isActive,
    );

    if (!entityStatus) {
      throw new Error(
        `Status ${statusId} is not valid for entity type ${entityTypeCode}.`,
      );
    }

    return entityStatus.id;
  }

  async resolveStatusId(entityStatusId: ID): Promise<ID> {
    const snapshot = await this.getSnapshot();

    const entityStatus = snapshot.entityStatuses.find(
      (item) => item.id === entityStatusId && item.isActive,
    );

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
