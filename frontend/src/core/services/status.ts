import { ID } from "../domain/common";

import { EntityStatus, EntityType, Status } from "../domain/entities";

/**
 * Canonical status service.
 *
 * Status is intentionally kept separate from ordinary reference data because
 * status has a three-part model:
 *
 *   EntityType
 *        ↓
 *   EntityStatus
 *        ↓
 *      Status
 *
 * The service exposes:
 *
 * 1. The generic Status catalogue.
 * 2. The EntityType catalogue.
 * 3. The raw EntityStatus mappings.
 * 4. A generic resolver which returns the applicable Status list for an entity.
 * 5. Convenience helpers for individual business entities.
 *
 * Convenience helpers must always delegate to the generic resolver.
 * They must never maintain their own independent status lists.
 */
export interface StatusService {
  /**
   * --------------------------------------------------------------------------
   * Status catalogue
   * --------------------------------------------------------------------------
   */

  getStatus(id: ID): Promise<Status | null>;

  getStatusByCode(code: string): Promise<Status | null>;

  listStatuses(): Promise<Status[]>;

  listActiveStatuses(): Promise<Status[]>;

  /**
   * --------------------------------------------------------------------------
   * Entity Type catalogue
   * --------------------------------------------------------------------------
   *
   * EntityType identifies the business entity whose lifecycle is being
   * described by the EntityStatus mapping.
   */

  getEntityType(id: ID): Promise<EntityType | null>;

  getEntityTypeByCode(code: string): Promise<EntityType | null>;

  listEntityTypes(): Promise<EntityType[]>;

  listActiveEntityTypes(): Promise<EntityType[]>;

  /**
   * --------------------------------------------------------------------------
   * Raw EntityStatus mappings
   * --------------------------------------------------------------------------
   *
   * These methods expose the mapping itself.
   *
   * Platform Admin/reference-data administration may need these methods to
   * inspect or maintain which statuses are applicable to which entity.
   */

  getEntityStatus(id: ID): Promise<EntityStatus | null>;

  listEntityStatuses(): Promise<EntityStatus[]>;

  listEntityStatusesByEntityType(entityTypeId: ID): Promise<EntityStatus[]>;

  listEntityStatusesByEntityTypeCode(
    entityTypeCode: string,
  ): Promise<EntityStatus[]>;

  /**
   * --------------------------------------------------------------------------
   * Generic resolved status lists
   * --------------------------------------------------------------------------
   *
   * These methods resolve:
   *
   * EntityType
   *     ↓
   * EntityStatus
   *     ↓
   * Status
   *
   * Normal business forms should generally consume these methods rather than
   * dealing with EntityStatus mappings directly.
   */

  listStatusesByEntityType(entityTypeId: ID): Promise<Status[]>;

  listStatusesByEntityTypeCode(entityTypeCode: string): Promise<Status[]>;

  /**
   * --------------------------------------------------------------------------
   * Convenience helpers
   * --------------------------------------------------------------------------
   *
   * Each helper represents one entity from the canonical EntityStatus matrix.
   *
   * These helpers must delegate to the generic resolver and must NOT maintain
   * their own status lists.
   */

  /**
   * Core identity / organization entities
   */
  listOrganizationStatuses(): Promise<Status[]>;

  listUserStatuses(): Promise<Status[]>;

  listOrganizationUserStatuses(): Promise<Status[]>;

  /**
   * Security / authorization entities
   */
  listRoleStatuses(): Promise<Status[]>;

  listOrganizationUserRoleStatuses(): Promise<Status[]>;

  listPrivilegeStatuses(): Promise<Status[]>;

  /**
   * Membership / product entities
   */
  listMembershipProductStatuses(): Promise<Status[]>;

  listBenefitStatuses(): Promise<Status[]>;

  listSubscriptionPlanStatuses(): Promise<Status[]>;

  listSubscriptionStatuses(): Promise<Status[]>;

  listMembershipProductBenefitStatuses(): Promise<Status[]>;

  /**
   * Customer transaction entities
   */
  listRedemptionStatuses(): Promise<Status[]>;

  listPaymentConfirmationStatuses(): Promise<Status[]>;

  /**
   * Organization operational entities
   */
  listStoreStatuses(): Promise<Status[]>;

  listStaffStatuses(): Promise<Status[]>;

  listStaffStoreAssignmentStatuses(): Promise<Status[]>;

  /**
   * Organization configuration entities
   */
  listOrganizationBrandingStatuses(): Promise<Status[]>;

  listNotificationConfigurationStatuses(): Promise<Status[]>;

  listIntegrationConfigurationStatuses(): Promise<Status[]>;

  /**
   * Integration reference/configuration entities
   */
  listIntegrationTypeStatuses(): Promise<Status[]>;

  /**
   * Template entities
   */
  listTemplateStatuses(): Promise<Status[]>;

  listTemplateTypeStatuses(): Promise<Status[]>;

  /**
   * Platform authorization entities
   */
  listPlatformUserRoleStatuses(): Promise<Status[]>;

  /**
   * Commercial entities
   */
  listOfferStatuses(): Promise<Status[]>;
}
