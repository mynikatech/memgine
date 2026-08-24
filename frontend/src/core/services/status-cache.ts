import { storage } from "@/src/utils/storage";
import type { StorageItemValue } from "@/src/utils/storage/storage-base";

import type { EntityStatus, EntityType, Status } from "../domain/entities";

import type { ID } from "../domain/common";
import type { StatusService } from "./status";

const CACHE_PREFIX = "memgine.status";
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

    const envelope: CacheEnvelope<T> = {
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
      data,
    };

    await storage.setItem(
      key,
      envelope as Parameters<typeof storage.setItem>[1],
    );

    return data;
  }

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
    return this.getOrLoad(`${CACHE_PREFIX}.statuses`, () =>
      this.source.listStatuses(),
    );
  }

  async listActiveStatuses(): Promise<Status[]> {
    const statuses = await this.listStatuses();

    return statuses.filter((status) => status.isActive);
  }

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
    return this.getOrLoad(`${CACHE_PREFIX}.entity-types`, () =>
      this.source.listEntityTypes(),
    );
  }

  async listActiveEntityTypes(): Promise<EntityType[]> {
    const entityTypes = await this.listEntityTypes();

    return entityTypes.filter((item) => item.isActive);
  }

  async getEntityStatus(id: ID): Promise<EntityStatus | null> {
    const mappings = await this.listEntityStatuses();

    return mappings.find((item) => item.id === id) ?? null;
  }

  async listEntityStatuses(): Promise<EntityStatus[]> {
    return this.getOrLoad(`${CACHE_PREFIX}.entity-statuses`, () =>
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

  async listOrganizationStatuses() {
    return this.listStatusesByEntityTypeCode("ORGANIZATION");
  }

  async listUserStatuses() {
    return this.listStatusesByEntityTypeCode("USER");
  }

  async listOrganizationUserStatuses() {
    return this.listStatusesByEntityTypeCode("ORGANIZATION_USER");
  }

  async listRoleStatuses() {
    return this.listStatusesByEntityTypeCode("ROLE");
  }

  async listOrganizationUserRoleStatuses() {
    return this.listStatusesByEntityTypeCode("ORGANIZATION_USER_ROLE");
  }

  async listPrivilegeStatuses() {
    return this.listStatusesByEntityTypeCode("PRIVILEGE");
  }

  async listMembershipProductStatuses() {
    return this.listStatusesByEntityTypeCode("MEMBERSHIP_PRODUCT");
  }

  async listBenefitStatuses() {
    return this.listStatusesByEntityTypeCode("BENEFIT");
  }

  async listSubscriptionPlanStatuses() {
    return this.listStatusesByEntityTypeCode("SUBSCRIPTION_PLAN");
  }

  async listSubscriptionStatuses() {
    return this.listStatusesByEntityTypeCode("SUBSCRIPTION");
  }

  async listRedemptionStatuses() {
    return this.listStatusesByEntityTypeCode("REDEMPTION");
  }

  async listStoreStatuses() {
    return this.listStatusesByEntityTypeCode("STORE");
  }

  async listStaffStatuses() {
    return this.listStatusesByEntityTypeCode("STAFF");
  }

  async listOrganizationBrandingStatuses() {
    return this.listStatusesByEntityTypeCode("ORGANIZATION_BRANDING");
  }

  async listNotificationConfigurationStatuses() {
    return this.listStatusesByEntityTypeCode("NOTIFICATION_CONFIGURATION");
  }

  async listIntegrationConfigurationStatuses() {
    return this.listStatusesByEntityTypeCode("INTEGRATION_CONFIGURATION");
  }

  async listIntegrationTypeStatuses() {
    return this.listStatusesByEntityTypeCode("INTEGRATION_TYPE");
  }

  async listMembershipProductBenefitStatuses() {
    return this.listStatusesByEntityTypeCode("MEMBERSHIP_PRODUCT_BENEFIT");
  }

  async listTemplateStatuses() {
    return this.listStatusesByEntityTypeCode("TEMPLATE");
  }

  async listTemplateTypeStatuses() {
    return this.listStatusesByEntityTypeCode("TEMPLATE_TYPE");
  }

  async listPlatformUserRoleStatuses() {
    return this.listStatusesByEntityTypeCode("PLATFORM_USER_ROLE");
  }

  async listStaffStoreAssignmentStatuses() {
    return this.listStatusesByEntityTypeCode("STAFF_STORE_ASSIGNMENT");
  }

  async listOfferStatuses() {
    return this.listStatusesByEntityTypeCode("OFFER");
  }

  async listPaymentConfirmationStatuses() {
    return this.listStatusesByEntityTypeCode("PAYMENT_CONFIRMATION");
  }
}
