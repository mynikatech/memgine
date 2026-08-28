import type { ID, Organization, OrganizationDetails } from "@/src/core";

import { apis } from "@/src/data";

import type { OrganizationService } from "./service-contracts";

export class LocalOrganizationService implements OrganizationService {
  constructor(private readonly fallback: OrganizationService) {}

  /**
   * Organization
   *
   * Local AsyncStorage data takes precedence.
   * Existing/demo organizations continue to come from
   * the existing mock service when no local record exists.
   */
  async getOrganization(organizationId: ID): Promise<Organization | null> {
    const result = await apis.organization.get(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    if (result.data) {
      return result.data;
    }

    return this.fallback.getOrganization(organizationId);
  }

  /**
   * Organization list
   *
   * The API returns locally persisted organizations.
   * The existing mock organizations are then merged in so
   * the demo/test organizations remain available.
   *
   * A local organization with the same ID overrides the
   * fallback/mock organization.
   */
  async listOrganizations(): Promise<Organization[]> {
    const localResult = await apis.organization.list();

    if (!localResult.success) {
      throw new Error(localResult.error.message);
    }

    const fallbackOrganizations = await this.fallback.listOrganizations();

    const byId = new Map<string, Organization>();

    for (const organization of fallbackOrganizations) {
      byId.set(organization.id, organization);
    }

    for (const organization of localResult.data) {
      byId.set(organization.id, organization);
    }

    return Array.from(byId.values());
  }

  /**
   * Organization details
   *
   * Local details are authoritative when present.
   * Existing mock organizations continue to use their
   * existing mock details until migrated.
   */
  async getOrganizationDetails(
    organizationId: ID,
  ): Promise<OrganizationDetails | null> {
    const result = await apis.organization.getAggregate(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    if (result.data?.details) {
      return result.data.details;
    }

    return this.fallback.getOrganizationDetails(organizationId);
  }

  /**
   * Update organization.
   *
   * Once an organization has been updated, the new value is
   * persisted locally and therefore becomes authoritative.
   */
  async updateOrganization(
    organizationId: ID,
    organization: Organization,
  ): Promise<Organization> {
    const result = await apis.organization.update(organizationId, organization);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  /**
   * Update organization details.
   */
  async updateOrganizationDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<OrganizationDetails> {
    const result = await apis.organization.updateDetails(
      organizationId,
      details,
    );

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  // ---------------------------------------------------------------------------
  // Everything below remains mock-backed for now.
  //
  // As each feature is migrated, its implementation can move from the
  // fallback service to its own repository/API/local-storage path.
  // ---------------------------------------------------------------------------

  async getAccount(organizationId: ID) {
    return this.fallback.getAccount(organizationId);
  }

  async getBusinessContext(organizationId: ID) {
    return this.fallback.getBusinessContext(organizationId);
  }

  async onboardOrganization(
    input: Parameters<OrganizationService["onboardOrganization"]>[0],
  ) {
    return this.fallback.onboardOrganization(input);
  }

  async listStores(organizationId: ID) {
    return this.fallback.listStores(organizationId);
  }

  async createStore(
    organizationId: ID,
    store: Parameters<OrganizationService["createStore"]>[1],
  ) {
    return this.fallback.createStore(organizationId, store);
  }

  async updateStore(
    organizationId: ID,
    store: Parameters<OrganizationService["updateStore"]>[1],
  ) {
    return this.fallback.updateStore(organizationId, store);
  }

  async deleteStore(organizationId: ID, storeId: ID) {
    return this.fallback.deleteStore(organizationId, storeId);
  }

  async listOrganizationUsersByUser(userId: ID) {
    return this.fallback.listOrganizationUsersByUser(userId);
  }

  async getOrganizationUser(id: ID) {
    return this.fallback.getOrganizationUser(id);
  }

  async listOrganizationUsers(organizationId: ID) {
    return this.fallback.listOrganizationUsers(organizationId);
  }

  async createOrganizationUser(
    organizationId: ID,
    organizationUser: Parameters<
      OrganizationService["createOrganizationUser"]
    >[1],
  ) {
    return this.fallback.createOrganizationUser(
      organizationId,
      organizationUser,
    );
  }

  async getOrganizationBranding(organizationId: ID) {
    return this.fallback.getOrganizationBranding(organizationId);
  }

  async getNotificationConfiguration(organizationId: ID) {
    return this.fallback.getNotificationConfiguration(organizationId);
  }

  async listIntegrationConfigurations(organizationId: ID) {
    return this.fallback.listIntegrationConfigurations(organizationId);
  }

  async updateOrganizationBranding(
    organizationId: ID,
    branding: Parameters<OrganizationService["updateOrganizationBranding"]>[1],
  ) {
    return this.fallback.updateOrganizationBranding(organizationId, branding);
  }

  async updateNotificationConfiguration(
    organizationId: ID,
    configuration: Parameters<
      OrganizationService["updateNotificationConfiguration"]
    >[1],
  ) {
    return this.fallback.updateNotificationConfiguration(
      organizationId,
      configuration,
    );
  }

  async updateIntegrationConfiguration(
    organizationId: ID,
    configuration: Parameters<
      OrganizationService["updateIntegrationConfiguration"]
    >[1],
  ) {
    return this.fallback.updateIntegrationConfiguration(
      organizationId,
      configuration,
    );
  }

  async createIntegrationConfiguration(
    organizationId: string,
    configuration: Parameters<
      OrganizationService["createIntegrationConfiguration"]
    >[1],
  ) {
    return this.fallback.createIntegrationConfiguration(
      organizationId,
      configuration,
    );
  }

  async deleteIntegrationConfiguration(
    organizationId: string,
    configurationId: string,
  ) {
    return this.fallback.deleteIntegrationConfiguration(
      organizationId,
      configurationId,
    );
  }

  async listStaff(organizationId: ID) {
    return this.fallback.listStaff(organizationId);
  }

  async createStaff(
    organizationId: ID,
    staff: Parameters<OrganizationService["createStaff"]>[1],
  ) {
    return this.fallback.createStaff(organizationId, staff);
  }

  async updateStaff(
    organizationId: ID,
    staff: Parameters<OrganizationService["updateStaff"]>[1],
  ) {
    return this.fallback.updateStaff(organizationId, staff);
  }

  async deleteStaff(organizationId: ID, staffId: ID) {
    return this.fallback.deleteStaff(organizationId, staffId);
  }
}
