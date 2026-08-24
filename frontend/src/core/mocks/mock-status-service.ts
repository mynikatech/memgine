import type { EntityStatus, EntityType, Status } from "../domain/entities";

import type { ID } from "../domain/common";

import type { StatusService } from "../services/status";

const ENTITY_TYPES: EntityType[] = [
  {
    id: "entity-type-organization",
    entityTypeCode: "ORGANIZATION",
    entityTypeName: "Organization",
    description: "Organization entity.",
    displayOrder: 1,
    isActive: true,
  },
  {
    id: "entity-type-user",
    entityTypeCode: "USER",
    entityTypeName: "User",
    description: "Global user entity.",
    displayOrder: 2,
    isActive: true,
  },
  {
    id: "entity-type-organization-user",
    entityTypeCode: "ORGANIZATION_USER",
    entityTypeName: "Organization User",
    description: "Organization user entity.",
    displayOrder: 3,
    isActive: true,
  },
  {
    id: "entity-type-role",
    entityTypeCode: "ROLE",
    entityTypeName: "Role",
    description: "Role entity.",
    displayOrder: 4,
    isActive: true,
  },
  {
    id: "entity-type-organization-user-role",
    entityTypeCode: "ORGANIZATION_USER_ROLE",
    entityTypeName: "Organization User Role",
    description: "Organization user role assignment.",
    displayOrder: 5,
    isActive: true,
  },
  {
    id: "entity-type-privilege",
    entityTypeCode: "PRIVILEGE",
    entityTypeName: "Privilege",
    description: "Privilege entity.",
    displayOrder: 6,
    isActive: true,
  },
  {
    id: "entity-type-membership-product",
    entityTypeCode: "MEMBERSHIP_PRODUCT",
    entityTypeName: "Membership Product",
    description: "Membership product entity.",
    displayOrder: 7,
    isActive: true,
  },
  {
    id: "entity-type-benefit",
    entityTypeCode: "BENEFIT",
    entityTypeName: "Benefit",
    description: "Benefit entity.",
    displayOrder: 8,
    isActive: true,
  },
  {
    id: "entity-type-subscription-plan",
    entityTypeCode: "SUBSCRIPTION_PLAN",
    entityTypeName: "Subscription Plan",
    description: "Subscription plan entity.",
    displayOrder: 9,
    isActive: true,
  },
  {
    id: "entity-type-subscription",
    entityTypeCode: "SUBSCRIPTION",
    entityTypeName: "Subscription",
    description: "Customer subscription entity.",
    displayOrder: 10,
    isActive: true,
  },
  {
    id: "entity-type-redemption",
    entityTypeCode: "REDEMPTION",
    entityTypeName: "Redemption",
    description: "Redemption transaction entity.",
    displayOrder: 11,
    isActive: true,
  },
  {
    id: "entity-type-store",
    entityTypeCode: "STORE",
    entityTypeName: "Store",
    description: "Store entity.",
    displayOrder: 12,
    isActive: true,
  },
  {
    id: "entity-type-staff",
    entityTypeCode: "STAFF",
    entityTypeName: "Staff",
    description: "Staff entity.",
    displayOrder: 13,
    isActive: true,
  },
  {
    id: "entity-type-organization-branding",
    entityTypeCode: "ORGANIZATION_BRANDING",
    entityTypeName: "Organization Branding",
    description: "Organization branding configuration.",
    displayOrder: 14,
    isActive: true,
  },
  {
    id: "entity-type-notification-configuration",
    entityTypeCode: "NOTIFICATION_CONFIGURATION",
    entityTypeName: "Notification Configuration",
    description: "Organization notification configuration.",
    displayOrder: 15,
    isActive: true,
  },
  {
    id: "entity-type-integration-configuration",
    entityTypeCode: "INTEGRATION_CONFIGURATION",
    entityTypeName: "Integration Configuration",
    description: "Organization integration configuration.",
    displayOrder: 16,
    isActive: true,
  },
  {
    id: "entity-type-integration-type",
    entityTypeCode: "INTEGRATION_TYPE",
    entityTypeName: "Integration Type",
    description: "Integration type.",
    displayOrder: 17,
    isActive: true,
  },
  {
    id: "entity-type-membership-product-benefit",
    entityTypeCode: "MEMBERSHIP_PRODUCT_BENEFIT",
    entityTypeName: "Membership Product Benefit",
    description: "Membership product benefit association.",
    displayOrder: 18,
    isActive: true,
  },
  {
    id: "entity-type-template",
    entityTypeCode: "TEMPLATE",
    entityTypeName: "Template",
    description: "Template entity.",
    displayOrder: 19,
    isActive: true,
  },
  {
    id: "entity-type-template-type",
    entityTypeCode: "TEMPLATE_TYPE",
    entityTypeName: "Template Type",
    description: "Template type entity.",
    displayOrder: 20,
    isActive: true,
  },
  {
    id: "entity-type-platform-user-role",
    entityTypeCode: "PLATFORM_USER_ROLE",
    entityTypeName: "Platform User Role",
    description: "Platform user role assignment.",
    displayOrder: 21,
    isActive: true,
  },
  {
    id: "entity-type-staff-store-assignment",
    entityTypeCode: "STAFF_STORE_ASSIGNMENT",
    entityTypeName: "Staff Store Assignment",
    description: "Staff store assignment.",
    displayOrder: 22,
    isActive: true,
  },
  {
    id: "entity-type-offer",
    entityTypeCode: "OFFER",
    entityTypeName: "Offer",
    description: "Offer entity.",
    displayOrder: 23,
    isActive: true,
  },
  {
    id: "entity-type-payment-confirmation",
    entityTypeCode: "PAYMENT_CONFIRMATION",
    entityTypeName: "Payment Confirmation",
    description: "Payment confirmation entity.",
    displayOrder: 24,
    isActive: true,
  },
];

const STATUSES: Status[] = [
  {
    id: "status-active",
    statusCode: "ACTIVE",
    statusName: "Active",
    description: "Entity is active and operational.",
    displayOrder: 1,
    isActive: true,
  },
  {
    id: "status-inactive",
    statusCode: "INACTIVE",
    statusName: "Inactive",
    description: "Entity is inactive.",
    displayOrder: 2,
    isActive: true,
  },
  {
    id: "status-pending",
    statusCode: "PENDING",
    statusName: "Pending",
    description: "Awaiting approval or activation.",
    displayOrder: 3,
    isActive: true,
  },
  {
    id: "status-suspended",
    statusCode: "SUSPENDED",
    statusName: "Suspended",
    description: "Temporarily suspended.",
    displayOrder: 4,
    isActive: true,
  },
  {
    id: "status-cancelled",
    statusCode: "CANCELLED",
    statusName: "Cancelled",
    description: "Cancelled by user or organization.",
    displayOrder: 5,
    isActive: true,
  },
  {
    id: "status-expired",
    statusCode: "EXPIRED",
    statusName: "Expired",
    description: "Validity period ended.",
    displayOrder: 6,
    isActive: true,
  },
  {
    id: "status-closed",
    statusCode: "CLOSED",
    statusName: "Closed",
    description: "Permanently closed.",
    displayOrder: 7,
    isActive: true,
  },
  {
    id: "status-relieved",
    statusCode: "RELIEVED",
    statusName: "Relieved",
    description: "Employment ended.",
    displayOrder: 8,
    isActive: true,
  },
  {
    id: "status-locked",
    statusCode: "LOCKED",
    statusName: "Locked",
    description: "Access temporarily locked.",
    displayOrder: 9,
    isActive: true,
  },
  {
    id: "status-retired",
    statusCode: "RETIRED",
    statusName: "Retired",
    description: "No longer available.",
    displayOrder: 10,
    isActive: true,
  },
  {
    id: "status-draft",
    statusCode: "DRAFT",
    statusName: "Draft",
    description: "Not yet published.",
    displayOrder: 11,
    isActive: true,
  },
  {
    id: "status-success",
    statusCode: "SUCCESS",
    statusName: "Successful",
    description: "Transaction completed successfully.",
    displayOrder: 12,
    isActive: true,
  },
  {
    id: "status-failed",
    statusCode: "FAILED",
    statusName: "Failed",
    description: "Transaction failed.",
    displayOrder: 13,
    isActive: true,
  },
  {
    id: "status-reversed",
    statusCode: "REVERSED",
    statusName: "Reversed",
    description: "Transaction reversed.",
    displayOrder: 14,
    isActive: true,
  },
];

const ENTITY_STATUS_DEFINITIONS: Record<string, string[]> = {
  ORGANIZATION: ["ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"],
  USER: ["ACTIVE", "INACTIVE", "LOCKED", "SUSPENDED"],
  ORGANIZATION_USER: ["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"],
  ROLE: ["ACTIVE", "INACTIVE"],
  ORGANIZATION_USER_ROLE: ["PENDING", "ACTIVE", "INACTIVE", "EXPIRED"],
  PRIVILEGE: ["ACTIVE", "INACTIVE"],
  MEMBERSHIP_PRODUCT: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED"],
  BENEFIT: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED"],
  SUBSCRIPTION_PLAN: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED"],
  SUBSCRIPTION: ["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  REDEMPTION: ["SUCCESS", "FAILED", "REVERSED"],
  STORE: ["ACTIVE", "INACTIVE", "CLOSED"],
  STAFF: ["ACTIVE", "INACTIVE", "RELIEVED", "RETIRED", "LOCKED"],
  ORGANIZATION_BRANDING: ["DRAFT", "ACTIVE", "INACTIVE"],
  NOTIFICATION_CONFIGURATION: ["DRAFT", "ACTIVE", "INACTIVE"],
  INTEGRATION_CONFIGURATION: ["DRAFT", "ACTIVE", "INACTIVE", "SUSPENDED"],
  INTEGRATION_TYPE: ["ACTIVE", "INACTIVE"],
  MEMBERSHIP_PRODUCT_BENEFIT: ["ACTIVE", "INACTIVE"],
  TEMPLATE: ["DRAFT", "ACTIVE", "INACTIVE", "RETIRED"],
  TEMPLATE_TYPE: ["ACTIVE", "INACTIVE"],
  PLATFORM_USER_ROLE: ["PENDING", "ACTIVE", "INACTIVE", "EXPIRED"],
  STAFF_STORE_ASSIGNMENT: ["ACTIVE", "INACTIVE", "EXPIRED"],
  OFFER: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED", "CANCELLED"],
  PAYMENT_CONFIRMATION: ["PENDING", "SUCCESS", "FAILED", "REVERSED"],
};

const ENTITY_STATUSES: EntityStatus[] = ENTITY_TYPES.flatMap((entityType) => {
  const statusCodes =
    ENTITY_STATUS_DEFINITIONS[entityType.entityTypeCode] ?? [];

  return statusCodes.flatMap((statusCode, index) => {
    const status = STATUSES.find((item) => item.statusCode === statusCode);

    if (!status) {
      return [];
    }

    return [
      {
        id: `entity-status-${entityType.entityTypeCode.toLowerCase()}-${statusCode.toLowerCase()}`,
        entityTypeId: entityType.id,
        statusId: status.id,
        displayOrder: index + 1,
        isActive: true,
        systemManaged: true,
      },
    ];
  });
});

export class InMemoryStatusService implements StatusService {
  async getStatus(id: ID): Promise<Status | null> {
    return STATUSES.find((item) => item.id === id) ?? null;
  }

  async getStatusByCode(code: string): Promise<Status | null> {
    const normalizedCode = code.trim().toUpperCase();

    return (
      STATUSES.find(
        (item) => item.statusCode.toUpperCase() === normalizedCode,
      ) ?? null
    );
  }

  async listStatuses(): Promise<Status[]> {
    return [...STATUSES];
  }

  async listActiveStatuses(): Promise<Status[]> {
    return STATUSES.filter((item) => item.isActive);
  }

  async getEntityType(id: ID): Promise<EntityType | null> {
    return ENTITY_TYPES.find((item) => item.id === id) ?? null;
  }

  async getEntityTypeByCode(code: string): Promise<EntityType | null> {
    const normalizedCode = code.trim().toUpperCase();

    return (
      ENTITY_TYPES.find(
        (item) => item.entityTypeCode.toUpperCase() === normalizedCode,
      ) ?? null
    );
  }

  async listEntityTypes(): Promise<EntityType[]> {
    return [...ENTITY_TYPES];
  }

  async listActiveEntityTypes(): Promise<EntityType[]> {
    return ENTITY_TYPES.filter((item) => item.isActive);
  }

  async getEntityStatus(id: ID): Promise<EntityStatus | null> {
    return ENTITY_STATUSES.find((item) => item.id === id) ?? null;
  }

  async listEntityStatuses(): Promise<EntityStatus[]> {
    return ENTITY_STATUSES.filter((item) => item.isActive);
  }

  async listEntityStatusesByEntityType(
    entityTypeId: ID,
  ): Promise<EntityStatus[]> {
    return ENTITY_STATUSES.filter(
      (item) => item.entityTypeId === entityTypeId && item.isActive,
    );
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

    const statusById = new Map(STATUSES.map((status) => [status.id, status]));

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
