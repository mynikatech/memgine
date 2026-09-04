import type { EntityStatus, EntityType, Status } from "../domain/entities";

import type { ID } from "../domain/common";
import type { StatusService } from "./status";

import {
  ENTITY_STATUS_DATA,
  ENTITY_TYPE_DATA,
  STATUS_DATA,
} from "./status-data";

export class LocalStatusService implements StatusService {
  async getStatus(id: ID): Promise<Status | null> {
    return STATUS_DATA.find((item) => item.id === id) ?? null;
  }

  async getStatusByCode(code: string): Promise<Status | null> {
    const normalizedCode = code.trim().toUpperCase();

    return (
      STATUS_DATA.find(
        (item) => item.statusCode.toUpperCase() === normalizedCode,
      ) ?? null
    );
  }

  async listStatuses(): Promise<Status[]> {
    return [...STATUS_DATA];
  }

  async listActiveStatuses(): Promise<Status[]> {
    return STATUS_DATA.filter((item) => item.isActive);
  }

  async getEntityType(id: ID): Promise<EntityType | null> {
    return ENTITY_TYPE_DATA.find((item) => item.id === id) ?? null;
  }

  async getEntityTypeByCode(code: string): Promise<EntityType | null> {
    const normalizedCode = code.trim().toUpperCase();

    return (
      ENTITY_TYPE_DATA.find(
        (item) => item.entityTypeCode.toUpperCase() === normalizedCode,
      ) ?? null
    );
  }

  async listEntityTypes(): Promise<EntityType[]> {
    return [...ENTITY_TYPE_DATA];
  }

  async listActiveEntityTypes(): Promise<EntityType[]> {
    return ENTITY_TYPE_DATA.filter((item) => item.isActive);
  }

  async getEntityStatus(id: ID): Promise<EntityStatus | null> {
    return ENTITY_STATUS_DATA.find((item) => item.id === id) ?? null;
  }

  async listEntityStatuses(): Promise<EntityStatus[]> {
    return ENTITY_STATUS_DATA.filter((item) => item.isActive);
  }

  async listEntityStatusesByEntityType(
    entityTypeId: ID,
  ): Promise<EntityStatus[]> {
    return ENTITY_STATUS_DATA.filter(
      (item) => item.entityTypeId === entityTypeId && item.isActive,
    ).sort((a, b) => a.displayOrder - b.displayOrder);
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

    const statusById = new Map(
      STATUS_DATA.map((status) => [status.id, status]),
    );

    return mappings
      .map((mapping) => statusById.get(mapping.statusId))
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
