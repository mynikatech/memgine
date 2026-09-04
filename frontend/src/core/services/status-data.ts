import type { EntityStatus, EntityType, Status } from "../domain/entities";

/**
 * Canonical Status catalogue.
 *
 * This data mirrors the Status reference-data sheet / database seed.
 * Keep IDs stable because they are referenced by EntityStatus mappings
 * and persisted records.
 */
export const STATUS_DATA: readonly Status[] = [
  {
    id: "status-active",
    statusCode: "ACTIVE",
    statusName: "Active",
    description: "Currently active and available for use.",
    displayOrder: 1,
    isActive: true,
  },
  {
    id: "status-inactive",
    statusCode: "INACTIVE",
    statusName: "Inactive",
    description: "Not currently active but not permanently closed or retired.",
    displayOrder: 2,
    isActive: true,
  },
  {
    id: "status-pending",
    statusCode: "PENDING",
    statusName: "Pending",
    description: "Awaiting approval, processing, activation, or completion.",
    displayOrder: 3,
    isActive: true,
  },
  {
    id: "status-suspended",
    statusCode: "SUSPENDED",
    statusName: "Suspended",
    description: "Temporarily suspended from normal operation.",
    displayOrder: 4,
    isActive: true,
  },
  {
    id: "status-cancelled",
    statusCode: "CANCELLED",
    statusName: "Cancelled",
    description: "Cancelled before normal completion or expiry.",
    displayOrder: 5,
    isActive: true,
  },
  {
    id: "status-expired",
    statusCode: "EXPIRED",
    statusName: "Expired",
    description: "No longer valid because its validity period has ended.",
    displayOrder: 6,
    isActive: true,
  },
  {
    id: "status-closed",
    statusCode: "CLOSED",
    statusName: "Closed",
    description: "Permanently closed or no longer operational.",
    displayOrder: 7,
    isActive: true,
  },
  {
    id: "status-relieved",
    statusCode: "RELIEVED",
    statusName: "Relieved",
    description:
      "Staff member has been relieved from an active assignment or duty.",
    displayOrder: 8,
    isActive: true,
  },
  {
    id: "status-locked",
    statusCode: "LOCKED",
    statusName: "Locked",
    description: "Access has been temporarily blocked.",
    displayOrder: 9,
    isActive: true,
  },
  {
    id: "status-retired",
    statusCode: "RETIRED",
    statusName: "Retired",
    description:
      "No longer available for new use but retained for historical records.",
    displayOrder: 10,
    isActive: true,
  },
  {
    id: "status-draft",
    statusCode: "DRAFT",
    statusName: "Draft",
    description: "Created but not yet activated or published.",
    displayOrder: 11,
    isActive: true,
  },
  {
    id: "status-success",
    statusCode: "SUCCESS",
    statusName: "Success",
    description: "Operation completed successfully.",
    displayOrder: 12,
    isActive: true,
  },
  {
    id: "status-failed",
    statusCode: "FAILED",
    statusName: "Failed",
    description: "Operation could not be completed successfully.",
    displayOrder: 13,
    isActive: true,
  },
  {
    id: "status-reversed",
    statusCode: "REVERSED",
    statusName: "Reversed",
    description: "A previously successful operation has been reversed.",
    displayOrder: 14,
    isActive: true,
  },
  {
    id: "status-revoked",
    statusCode: "REVOKED",
    statusName: "Revoked",
    description: "Access, role, or assignment has been revoked.",
    displayOrder: 15,
    isActive: true,
  },
];

/**
 * Canonical Entity Type catalogue.
 *
 * This mirrors the Entity Type Excel sheet / database seed.
 */
export const ENTITY_TYPE_DATA: readonly EntityType[] = [
  {
    id: "entity-type-organization",
    entityTypeCode: "ORGANIZATION",
    entityTypeName: "Organization",
    description: "Represents a tenant organization using the Memgine platform.",
    displayOrder: 1,
    isActive: true,
  },
  {
    id: "entity-type-user",
    entityTypeCode: "USER",
    entityTypeName: "User",
    description: "Represents a user account within the Memgine platform.",
    displayOrder: 2,
    isActive: true,
  },
  {
    id: "entity-type-organization-user",
    entityTypeCode: "ORGANIZATION_USER",
    entityTypeName: "Organization User",
    description:
      "Represents a user's membership or association with an organization.",
    displayOrder: 3,
    isActive: true,
  },
  {
    id: "entity-type-role",
    entityTypeCode: "ROLE",
    entityTypeName: "Role",
    description:
      "Represents a reusable authorization role defining a set of privileges.",
    displayOrder: 4,
    isActive: true,
  },
  {
    id: "entity-type-organization-user-role",
    entityTypeCode: "ORGANIZATION_USER_ROLE",
    entityTypeName: "Organization User Role",
    description: "Represents a role assigned to a user within an organization.",
    displayOrder: 5,
    isActive: true,
  },
  {
    id: "entity-type-privilege",
    entityTypeCode: "PRIVILEGE",
    entityTypeName: "Privilege",
    description:
      "Represents an individual permission or authorization capability.",
    displayOrder: 6,
    isActive: true,
  },
  {
    id: "entity-type-platform-user-role",
    entityTypeCode: "PLATFORM_USER_ROLE",
    entityTypeName: "Platform User Role",
    description: "Represents a role assigned to a user at the platform level.",
    displayOrder: 7,
    isActive: true,
  },
  {
    id: "entity-type-membership-product",
    entityTypeCode: "MEMBERSHIP_PRODUCT",
    entityTypeName: "Membership Product",
    description: "Represents a membership product offered by an organization.",
    displayOrder: 8,
    isActive: true,
  },
  {
    id: "entity-type-benefit",
    entityTypeCode: "BENEFIT",
    entityTypeName: "Benefit",
    description:
      "Represents a benefit that can be associated with a membership product.",
    displayOrder: 9,
    isActive: true,
  },
  {
    id: "entity-type-subscription-plan",
    entityTypeCode: "SUBSCRIPTION_PLAN",
    entityTypeName: "Subscription Plan",
    description:
      "Represents a plan defining pricing and terms for a membership product.",
    displayOrder: 10,
    isActive: true,
  },
  {
    id: "entity-type-subscription",
    entityTypeCode: "SUBSCRIPTION",
    entityTypeName: "Subscription",
    description:
      "Represents a customer's subscription to a membership product or plan.",
    displayOrder: 11,
    isActive: true,
  },
  {
    id: "entity-type-redemption",
    entityTypeCode: "REDEMPTION",
    entityTypeName: "Redemption",
    description: "Represents the use or redemption of a membership benefit.",
    displayOrder: 12,
    isActive: true,
  },
  {
    id: "entity-type-store",
    entityTypeCode: "STORE",
    entityTypeName: "Store",
    description:
      "Represents a physical or online business location belonging to an organization.",
    displayOrder: 13,
    isActive: true,
  },
  {
    id: "entity-type-staff",
    entityTypeCode: "STAFF",
    entityTypeName: "Staff",
    description: "Represents a staff member associated with an organization.",
    displayOrder: 14,
    isActive: true,
  },
  {
    id: "entity-type-staff-store-assignment",
    entityTypeCode: "STAFF_STORE_ASSIGNMENT",
    entityTypeName: "Staff Store Assignment",
    description: "Represents the assignment of a staff member to a store.",
    displayOrder: 15,
    isActive: true,
  },
  {
    id: "entity-type-organization-branding",
    entityTypeCode: "ORGANIZATION_BRANDING",
    entityTypeName: "Organization Branding",
    description: "Represents branding configuration for an organization.",
    displayOrder: 16,
    isActive: true,
  },
  {
    id: "entity-type-notification-configuration",
    entityTypeCode: "NOTIFICATION_CONFIGURATION",
    entityTypeName: "Notification Configuration",
    description:
      "Represents notification configuration used by the platform or organization.",
    displayOrder: 17,
    isActive: true,
  },
  {
    id: "entity-type-payment-confirmation",
    entityTypeCode: "PAYMENT_CONFIRMATION",
    entityTypeName: "Payment Confirmation",
    description:
      "Represents confirmation and processing outcome for a payment transaction.",
    displayOrder: 18,
    isActive: true,
  },
  {
    id: "entity-type-integration-configuration",
    entityTypeCode: "INTEGRATION_CONFIGURATION",
    entityTypeName: "Integration Configuration",
    description:
      "Represents configuration for an external integration used by the platform or organization.",
    displayOrder: 19,
    isActive: true,
  },
  {
    id: "entity-type-integration-type",
    entityTypeCode: "INTEGRATION_TYPE",
    entityTypeName: "Integration Type",
    description:
      "Represents a supported type or category of external integration.",
    displayOrder: 20,
    isActive: true,
  },
  {
    id: "entity-type-membership-product-benefit",
    entityTypeCode: "MEMBERSHIP_PRODUCT_BENEFIT",
    entityTypeName: "Membership Product Benefit",
    description:
      "Represents the relationship between a membership product and a benefit.",
    displayOrder: 21,
    isActive: true,
  },
  {
    id: "entity-type-template",
    entityTypeCode: "TEMPLATE",
    entityTypeName: "Template",
    description: "Represents a reusable content or communication template.",
    displayOrder: 22,
    isActive: true,
  },
  {
    id: "entity-type-template-type",
    entityTypeCode: "TEMPLATE_TYPE",
    entityTypeName: "Template Type",
    description:
      "Represents a category or type of template supported by the platform.",
    displayOrder: 23,
    isActive: true,
  },
  {
    id: "entity-type-offer",
    entityTypeCode: "OFFER",
    entityTypeName: "Offer",
    description:
      "Represents a promotional or commercial offer provided by an organization.",
    displayOrder: 24,
    isActive: true,
  },
];

/**
 * Canonical EntityStatus mapping.
 *
 * One record represents one EntityType + Status relationship.
 *
 * This is deliberately normalized to match the DB / Excel model.
 */
const ENTITY_STATUS_DEFINITIONS: ReadonlyArray<{
  entityTypeCode: string;
  statusCodes: readonly string[];
  systemManagedStatusCodes: readonly string[];
}> = [
  {
    entityTypeCode: "ORGANIZATION",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"],
    systemManagedStatusCodes: ["PENDING", "SUSPENDED", "CLOSED"],
  },
  {
    entityTypeCode: "USER",
    statusCodes: [
      "PENDING",
      "ACTIVE",
      "INACTIVE",
      "SUSPENDED",
      "LOCKED",
      "CLOSED",
    ],
    systemManagedStatusCodes: ["PENDING", "LOCKED", "CLOSED"],
  },
  {
    entityTypeCode: "ORGANIZATION_USER",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"],
    systemManagedStatusCodes: ["PENDING", "CLOSED"],
  },
  {
    entityTypeCode: "ROLE",
    statusCodes: ["ACTIVE", "INACTIVE", "RETIRED"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "ORGANIZATION_USER_ROLE",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "REVOKED"],
    systemManagedStatusCodes: ["PENDING", "REVOKED"],
  },
  {
    entityTypeCode: "PRIVILEGE",
    statusCodes: ["ACTIVE", "INACTIVE", "RETIRED"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "PLATFORM_USER_ROLE",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "REVOKED"],
    systemManagedStatusCodes: ["PENDING", "REVOKED"],
  },
  {
    entityTypeCode: "MEMBERSHIP_PRODUCT",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED", "RETIRED"],
    systemManagedStatusCodes: ["EXPIRED"],
  },
  {
    entityTypeCode: "BENEFIT",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED", "RETIRED"],
    systemManagedStatusCodes: ["EXPIRED"],
  },
  {
    entityTypeCode: "SUBSCRIPTION_PLAN",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED", "RETIRED"],
    systemManagedStatusCodes: ["EXPIRED"],
  },
  {
    entityTypeCode: "SUBSCRIPTION",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "EXPIRED", "CANCELLED"],
    systemManagedStatusCodes: ["PENDING", "EXPIRED", "CANCELLED"],
  },
  {
    entityTypeCode: "REDEMPTION",
    statusCodes: ["SUCCESS", "FAILED", "REVERSED"],
    systemManagedStatusCodes: ["SUCCESS", "FAILED", "REVERSED"],
  },
  {
    entityTypeCode: "STORE",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "CLOSED"],
    systemManagedStatusCodes: ["PENDING", "CLOSED"],
  },
  {
    entityTypeCode: "STAFF",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "RELIEVED", "RETIRED"],
    systemManagedStatusCodes: ["PENDING"],
  },
  {
    entityTypeCode: "STAFF_STORE_ASSIGNMENT",
    statusCodes: ["PENDING", "ACTIVE", "INACTIVE", "REVOKED"],
    systemManagedStatusCodes: ["PENDING", "REVOKED"],
  },
  {
    entityTypeCode: "ORGANIZATION_BRANDING",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "NOTIFICATION_CONFIGURATION",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "PAYMENT_CONFIRMATION",
    statusCodes: ["PENDING", "SUCCESS", "FAILED", "REVERSED"],
    systemManagedStatusCodes: ["PENDING", "SUCCESS", "FAILED", "REVERSED"],
  },
  {
    entityTypeCode: "INTEGRATION_CONFIGURATION",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE", "SUSPENDED"],
    systemManagedStatusCodes: ["SUSPENDED"],
  },
  {
    entityTypeCode: "INTEGRATION_TYPE",
    statusCodes: ["ACTIVE", "INACTIVE", "RETIRED"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "MEMBERSHIP_PRODUCT_BENEFIT",
    statusCodes: ["ACTIVE", "INACTIVE"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "TEMPLATE",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE", "RETIRED"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "TEMPLATE_TYPE",
    statusCodes: ["ACTIVE", "INACTIVE", "RETIRED"],
    systemManagedStatusCodes: [],
  },
  {
    entityTypeCode: "OFFER",
    statusCodes: ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED", "CANCELLED"],
    systemManagedStatusCodes: ["EXPIRED", "CANCELLED"],
  },
];

const entityTypeByCode = new Map(
  ENTITY_TYPE_DATA.map((entityType) => [entityType.entityTypeCode, entityType]),
);

const statusByCode = new Map(
  STATUS_DATA.map((status) => [status.statusCode, status]),
);

export const ENTITY_STATUS_DATA: readonly EntityStatus[] =
  ENTITY_STATUS_DEFINITIONS.flatMap((definition) => {
    const entityType = entityTypeByCode.get(definition.entityTypeCode);

    if (!entityType) {
      throw new Error(`Missing EntityType for ${definition.entityTypeCode}.`);
    }

    return definition.statusCodes.flatMap((statusCode, index) => {
      const status = statusByCode.get(statusCode);

      if (!status) {
        throw new Error(
          `Missing Status for ${definition.entityTypeCode}:${statusCode}.`,
        );
      }

      return [
        {
          id: `entity-status-${definition.entityTypeCode.toLowerCase()}-${statusCode.toLowerCase()}`,
          entityTypeId: entityType.id,
          statusId: status.id,
          displayOrder: index + 1,
          isActive: true,
          systemManaged:
            definition.systemManagedStatusCodes.includes(statusCode),
        },
      ];
    });
  });
