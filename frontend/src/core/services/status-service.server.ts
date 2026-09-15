import type { ID } from "../domain/common";
import type { EntityStatus, EntityType, Status } from "../domain/entities";
import type { StatusService } from "./status";

type EntityStatusSnapshot = {
  statuses: Status[];
  entityTypes: EntityType[];
  entityStatuses: EntityStatus[];
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export class ServerStatusService implements StatusService {
  private snapshot: EntityStatusSnapshot | null = null;

  constructor(private readonly baseUrl: string) {}

  async refresh(): Promise<void> {
    this.snapshot = await this.load();
  }

  private async load(): Promise<EntityStatusSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/v1/entity-status`);

    if (!response.ok) {
      throw new Error(`Entity status request failed: ${response.status}`);
    }

    const body = (await response.json()) as ApiResponse<EntityStatusSnapshot>;

    if (!body.success || !body.data) {
      throw new Error(
        body.error?.message ?? "Unable to load entity status data",
      );
    }

    return body.data;
  }

  private async getSnapshot(): Promise<EntityStatusSnapshot> {
    if (!this.snapshot) {
      this.snapshot = await this.load();
    }

    return this.snapshot;
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(id: ID): Promise<Status | null> {
    const statuses = await this.listStatuses();

    return statuses.find((item) => item.id === id) ?? null;
  }

  async getStatusByCode(code: string): Promise<Status | null> {
    const normalized = code.trim().toUpperCase();
    const statuses = await this.listStatuses();

    return (
      statuses.find((item) => item.statusCode.toUpperCase() === normalized) ??
      null
    );
  }

  async listStatuses(): Promise<Status[]> {
    return (await this.getSnapshot()).statuses;
  }

  async listActiveStatuses(): Promise<Status[]> {
    return (await this.listStatuses()).filter((item) => item.isActive);
  }

  // ---------------------------------------------------------------------------
  // Entity Type
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
    return (await this.getSnapshot()).entityTypes;
  }

  async listActiveEntityTypes(): Promise<EntityType[]> {
    return (await this.listEntityTypes()).filter((item) => item.isActive);
  }

  // ---------------------------------------------------------------------------
  // Entity Status
  // ---------------------------------------------------------------------------

  async getEntityStatus(id: ID): Promise<EntityStatus | null> {
    const entityStatuses = await this.listEntityStatuses();

    return entityStatuses.find((item) => item.id === id) ?? null;
  }

  async listEntityStatuses(): Promise<EntityStatus[]> {
    return (await this.getSnapshot()).entityStatuses;
  }

  async listEntityStatusesByEntityType(
    entityTypeId: ID,
  ): Promise<EntityStatus[]> {
    return (await this.listEntityStatuses())
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

  // ---------------------------------------------------------------------------
  // Resolved statuses
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

  async listMembershipProductBenefitStatuses() {
    return this.listStatusesByEntityTypeCode("MEMBERSHIP_PRODUCT_BENEFIT");
  }

  async listRedemptionStatuses() {
    return this.listStatusesByEntityTypeCode("REDEMPTION");
  }

  async listPaymentConfirmationStatuses() {
    return this.listStatusesByEntityTypeCode("PAYMENT_CONFIRMATION");
  }

  async listStoreStatuses() {
    return this.listStatusesByEntityTypeCode("STORE");
  }

  async listStaffStatuses() {
    return this.listStatusesByEntityTypeCode("STAFF");
  }

  async listStaffStoreAssignmentStatuses() {
    return this.listStatusesByEntityTypeCode("STAFF_STORE_ASSIGNMENT");
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

  async listTemplateStatuses() {
    return this.listStatusesByEntityTypeCode("TEMPLATE");
  }

  async listTemplateTypeStatuses() {
    return this.listStatusesByEntityTypeCode("TEMPLATE_TYPE");
  }

  async listPlatformUserRoleStatuses() {
    return this.listStatusesByEntityTypeCode("PLATFORM_USER_ROLE");
  }

  async listOfferStatuses() {
    return this.listStatusesByEntityTypeCode("OFFER");
  }
}
