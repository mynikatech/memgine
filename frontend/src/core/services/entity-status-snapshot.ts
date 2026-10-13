import type { ID } from "../domain/common";
import type { EntityStatus, EntityType, Status } from "../domain/entities";
import { httpClient } from "@/src/data/api/http-client";

export type EntityStatusSnapshot = {
  statuses: Status[];
  entityTypes: EntityType[];
  entityStatuses: EntityStatus[];
};

let snapshot: EntityStatusSnapshot | null = null;
let initialization: Promise<void> | null = null;
let refreshQueue: Promise<void> = Promise.resolve();
let requestVersion = 0;

async function loadSnapshot(): Promise<EntityStatusSnapshot> {
  const result = await httpClient.get<EntityStatusSnapshot>(
    "/api/v1/entity-status",
  );
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

async function loadAndReplaceSnapshot(): Promise<void> {
  const version = ++requestVersion;
  const next = await loadSnapshot();

  if (version === requestVersion) {
    snapshot = next;
  }
}

export async function initializeEntityStatusSnapshot(): Promise<void> {
  if (snapshot) return;
  if (initialization) return initialization;

  initialization = loadAndReplaceSnapshot().finally(() => {
    initialization = null;
  });

  return initialization;
}

export async function refreshEntityStatusSnapshot(): Promise<void> {
  const initializationToWaitFor = initialization;
  const refresh = refreshQueue
    .catch(() => undefined)
    .then(async () => {
      await initializationToWaitFor?.catch(() => undefined);
      await loadAndReplaceSnapshot();
    });

  refreshQueue = refresh;
  return refresh;
}

export function getEntityStatusSnapshot(): EntityStatusSnapshot {
  if (!snapshot) {
    throw new Error("Entity status data has not been initialized.");
  }
  return snapshot;
}

export function resolveStatusIdFromSnapshot(entityStatusId: ID): ID {
  const entityStatus = getEntityStatusSnapshot().entityStatuses.find(
    (item) => item.id === entityStatusId && item.isActive,
  );
  if (!entityStatus) {
    throw new Error(
      `Entity status ${entityStatusId} was not found or is inactive.`,
    );
  }
  return entityStatus.statusId;
}

export function resolveEntityStatusIdFromSnapshot(
  entityTypeCode: string,
  statusId: ID,
): ID {
  const current = getEntityStatusSnapshot();
  const normalizedEntityTypeCode = entityTypeCode.trim().toUpperCase();
  const entityType = current.entityTypes.find(
    (item) =>
      item.entityTypeCode.trim().toUpperCase() === normalizedEntityTypeCode &&
      item.isActive,
  );
  const entityStatus = entityType
    ? current.entityStatuses.find(
        (item) =>
          item.entityTypeId === entityType.id &&
          item.statusId === statusId &&
          item.isActive,
      )
    : undefined;
  if (!entityStatus) {
    throw new Error(
      `Status ${statusId} is not valid for entity type ${entityTypeCode}.`,
    );
  }
  return entityStatus.id;
}
