import type { ID } from "@/src/core";
import {
  getEntityStatusSnapshot,
  initializeEntityStatusSnapshot,
  refreshEntityStatusSnapshot,
  resolveEntityStatusIdFromSnapshot,
  resolveStatusIdFromSnapshot,
} from "@/src/core/services/entity-status-snapshot";

class EntityStatusApi {
  async initialize(): Promise<void> {
    return initializeEntityStatusSnapshot();
  }

  async refresh(): Promise<void> {
    return refreshEntityStatusSnapshot();
  }

  getSnapshot() {
    return getEntityStatusSnapshot();
  }

  async resolveEntityStatusId(
    entityTypeCode: string,
    statusId: ID,
  ): Promise<ID> {
    return resolveEntityStatusIdFromSnapshot(entityTypeCode, statusId);
  }

  async resolveStatusId(entityStatusId: ID): Promise<ID> {
    return resolveStatusIdFromSnapshot(entityStatusId);
  }
}

export const entityStatusApi = new EntityStatusApi();
