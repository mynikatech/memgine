import { storage } from "@/src/utils/storage";
import type { StorageItemValue } from "@/src/utils/storage/storage-base";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { EntityStatus, EntityType, Status } from "../domain/entities";

import type { ID } from "../domain/common";
import type { StatusService } from "./status";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  cachedAt: number;
  expiresAt: number;
  data: T;
};

export class CachedStatusService implements StatusService {
  constructor(
    private readonly source: StatusService,
    private readonly ttlMs = CACHE_TTL_MS,
  ) {}

  private async getCached<T>(key: string): Promise<T | null> {
    const cached = await storage.getItem<StorageItemValue>(key, null);

    if (!cached || typeof cached !== "object" || Array.isArray(cached)) {
      return null;
    }

    const envelope = cached as Partial<CacheEnvelope<T>>;

    if (typeof envelope.expiresAt !== "number" || !("data" in envelope)) {
      await storage.removeItem(key);
      return null;
    }

    if (envelope.expiresAt <= Date.now()) {
      await storage.removeItem(key);
      return null;
    }

    return envelope.data as T;
  }

  private async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getCached<T>(key);

    if (cached !== null) {
      return cached;
    }

    const data = await loader();

    const now = Date.now();

    const envelope: CacheEnvelope<T> = {
      cachedAt: now,
      expiresAt: now + this.ttlMs,
      data,
    };

    await storage.setItem(
      key,
      envelope as Parameters<typeof storage.setItem>[1],
    );

    return data;
  }

  // ---------------------------------------------------------------------------
  // Status catalogue
  // ---------------------------------------------------------------------------

  async getStatus(id: ID): Promise<Status | null> {
    const statuses = await this.listStatuses();

    return statuses.find((status) => status.id === id) ?? null;
  }

  async getStatusByCode(code: string): Promise<Status | null> {
    const normalized = code.trim().toUpperCase();

    const statuses = await this.listStatuses();

    return (
      statuses.find(
        (status) => status.statusCode.toUpperCase() === normalized,
      ) ?? null
    );
  }

  async listStatuses(): Promise<Status[]> {
    return this.getOrLoad(LOCAL_DATA_KEYS.statusStatuses(), () =>
      this.source.listStatuses(),
    );
  }

  async listActiveStatuses(): Promise<Status[]> {
    const statuses = await this.listStatuses();

    return statuses.filter((status) => status.isActive);
  }

  // ---------------------------------------------------------------------------
  // Entity Type catalogue
  // ---------------------------------------------------------------------------

  async getEntityType(id: ID): Promise<EntityType | null> {
    const entityTypes = await this.listEntityTypes();

    return entityTypes.find((item) => item.id === id) ?? null;
  }

  async getEntityTypeByCode(code: string): Promise<EntityType | null> {
    const normalized = code.trim().toUpperCase();

    const entityTypes = await this.listEntityTypes();

    return (
      entityTypes.find(
        (item) => item.entityTypeCode.toUpperCase() === normalized,
      ) ?? null
    );
  }

  async listEntityTypes(): Promise<EntityType[]> {
    return this.getOrLoad(LOCAL_DATA_KEYS.statusEntityTypes(), () =>
      this.source.listEntityTypes(),
    );
  }

  async listActiveEntityTypes(): Promise<EntityType[]> {
    const entityTypes = await this.listEntityTypes();

    return entityTypes.filter((item) => item.isActive);
  }

  // ---------------------------------------------------------------------------
  // Entity Status catalogue / mappings
  // ---------------------------------------------------------------------------

  async getEntityStatus(id: ID): Promise<EntityStatus | null> {
    const mappings = await this.listEntityStatuses();

    return mappings.find((item) => item.id === id) ?? null;
  }

  async listEntityStatuses(): Promise<EntityStatus[]> {
    return this.getOrLoad(LOCAL_DATA_KEYS.statusEntityStatuses(), () =>
      this.source.listEntityStatuses(),
    );
  }

  async listEntityStatusesByEntityType(
    entityTypeId: ID,
  ): Promise<EntityStatus[]> {
    const mappings = await this.listEntityStatuses();

    return mappings
      .filter((item) => item.entityTypeId === entityTypeId && item.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async listEntityStatusesByEntityTypeCode(
    entityTypeCode: string,
  ): Promise<EntityStatus[]> {
    const entityType = await this.getEntityTypeByCode(entityTypeCode);

    if (!entityType) {
      return [];
    }

    return this.listEntityStatusesByEntityType(entityType.id);
  }

  async getEntityStatusByEntityTypeAndStatus(
    entityTypeCode: string,
    statusId: ID,
  ): Promise<EntityStatus | null> {
    const mappings =
      await this.listEntityStatusesByEntityTypeCode(entityTypeCode);

    return mappings.find((mapping) => mapping.statusId === statusId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Resolved Status lists
  // ---------------------------------------------------------------------------

  async listStatusesByEntityType(entityTypeId: ID): Promise<Status[]> {
    const mappings = await this.listEntityStatusesByEntityType(entityTypeId);

    const statuses = await this.listStatuses();

    return mappings
      .map((mapping) =>
        statuses.find((status) => status.id === mapping.statusId),
      )
      .filter(
        (status): status is Status => status !== undefined && status.isActive,
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async listStatusesByEntityTypeCode(
    entityTypeCode: string,
  ): Promise<Status[]> {
    const entityType = await this.getEntityTypeByCode(entityTypeCode);

    if (!entityType) {
      return [];
    }

    return this.listStatusesByEntityType(entityType.id);
  }

  // ---------------------------------------------------------------------------
  // Convenience helpers
  // ---------------------------------------------------------------------------

  async listOrganizationStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("ORGANIZATION");
  }

  async listUserStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("USER");
  }

  async listOrganizationUserStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("ORGANIZATION_USER");
  }

  async listRoleStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("ROLE");
  }

  async listOrganizationUserRoleStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("ORGANIZATION_USER_ROLE");
  }

  async listPrivilegeStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("PRIVILEGE");
  }

  async listMembershipProductStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("MEMBERSHIP_PRODUCT");
  }

  async listBenefitStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("BENEFIT");
  }

  async listSubscriptionPlanStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("SUBSCRIPTION_PLAN");
  }

  async listSubscriptionStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("SUBSCRIPTION");
  }

  async listRedemptionStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("REDEMPTION");
  }

  async listStoreStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("STORE");
  }

  async listStaffStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("STAFF");
  }

  async listOrganizationBrandingStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("ORGANIZATION_BRANDING");
  }

  async listNotificationConfigurationStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("NOTIFICATION_CONFIGURATION");
  }

  async listIntegrationConfigurationStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("INTEGRATION_CONFIGURATION");
  }

  async listIntegrationTypeStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("INTEGRATION_TYPE");
  }

  async listMembershipProductBenefitStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("MEMBERSHIP_PRODUCT_BENEFIT");
  }

  async listTemplateStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("TEMPLATE");
  }

  async listTemplateTypeStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("TEMPLATE_TYPE");
  }

  async listPlatformUserRoleStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("PLATFORM_USER_ROLE");
  }

  async listStaffStoreAssignmentStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("STAFF_STORE_ASSIGNMENT");
  }

  async listOfferStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("OFFER");
  }

  async listPaymentConfirmationStatuses(): Promise<Status[]> {
    return this.listStatusesByEntityTypeCode("PAYMENT_CONFIRMATION");
  }
}
