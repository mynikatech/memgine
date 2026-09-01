import type {
  ID,
  Organization,
  OrganizationDetails,
  OrganizationUser,
  Staff,
  StaffStoreAssignment,
  Store,
  User,
} from "@/src/core";

import { apis } from "@/src/data";

import type { OrganizationService } from "./service-contracts";
import { LocalBrandingRepository } from "@/src/data/repositories/branding/branding-repository.local";
import { LocalOrganizationMembersRepository } from "@/src/data/repositories/organization/organization-members.repository.local";

export class LocalOrganizationService implements OrganizationService {
  private readonly brandingRepository: LocalBrandingRepository;
  private readonly membersRepository: LocalOrganizationMembersRepository;

  constructor(private readonly fallback: OrganizationService) {
    this.brandingRepository = new LocalBrandingRepository();
    this.membersRepository = new LocalOrganizationMembersRepository();
  }
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

  async listStores(organizationId: ID): Promise<Store[]> {
    return this.membersRepository.listStores(organizationId);
  }

  async createStore(organizationId: ID, store: Store): Promise<Store> {
    const stores = await this.membersRepository.listStores(organizationId);

    const now = new Date().toISOString();

    const created: Store = {
      ...store,
      organizationId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      versionNo: 1,
    };

    await this.membersRepository.saveStores(organizationId, [
      ...stores,
      created,
    ]);

    return created;
  }

  async updateStore(organizationId: ID, store: Store): Promise<Store> {
    const stores = await this.membersRepository.listStores(organizationId);

    const index = stores.findIndex(
      (item) =>
        item.id === store.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Store not found");
    }

    const updated: Store = {
      ...store,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: stores[index].versionNo + 1,
    };

    stores[index] = updated;

    await this.membersRepository.saveStores(organizationId, stores);

    return updated;
  }

  async deleteStore(organizationId: ID, storeId: ID): Promise<void> {
    const stores = await this.membersRepository.listStores(organizationId);

    const index = stores.findIndex(
      (item) =>
        item.id === storeId &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Store not found");
    }

    stores[index] = {
      ...stores[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: stores[index].versionNo + 1,
    };

    await this.membersRepository.saveStores(organizationId, stores);
  }

  async listOrganizationUsersByUser(userId: ID) {
    return this.fallback.listOrganizationUsersByUser(userId);
  }

  async listOrganizationUsers(organizationId: ID): Promise<OrganizationUser[]> {
    return this.membersRepository.listOrganizationUsers(organizationId);
  }

  async createOrganizationUser(
    organizationId: ID,
    organizationUser: OrganizationUser,
  ): Promise<OrganizationUser> {
    const organizationUsers =
      await this.membersRepository.listOrganizationUsers(organizationId);

    const now = new Date().toISOString();

    const created: OrganizationUser = {
      ...organizationUser,
      organizationId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      versionNo: 1,
    };

    await this.membersRepository.saveOrganizationUsers(organizationId, [
      ...organizationUsers,
      created,
    ]);

    return created;
  }

  async getOrganizationUser(id: ID): Promise<OrganizationUser | null> {
    /*
     * OrganizationUser is organization-scoped.
     * Existing callers that know the organization should use
     * listOrganizationUsers().
     */
    return this.fallback.getOrganizationUser(id);
  }
  async getOrganizationBranding(organizationId: ID) {
    const local = await this.brandingRepository.getCurrent(organizationId);

    if (local) {
      return local;
    }

    return this.fallback.getOrganizationBranding(organizationId);
  }

  async getNotificationConfiguration(organizationId: ID) {
    return this.fallback.getNotificationConfiguration(organizationId);
  }

  async updateOrganizationBranding(
    organizationId: ID,
    branding: Parameters<OrganizationService["updateOrganizationBranding"]>[1],
  ) {
    return this.brandingRepository.save(organizationId, branding);
  }

  async listIntegrationConfigurations(organizationId: ID) {
    return this.fallback.listIntegrationConfigurations(organizationId);
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

  // ---------------------------------------------------------------------------
  // User
  //
  // User is the canonical global identity.
  // ---------------------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    return this.membersRepository.listUsers();
  }

  async getUser(userId: ID): Promise<User | null> {
    const users = await this.membersRepository.listUsers();

    return users.find((user) => user.id === userId && !user.isDeleted) ?? null;
  }

  async findUsers(
    query: Parameters<OrganizationService["findUsers"]>[0],
  ): Promise<User[]> {
    const users = await this.membersRepository.listUsers();

    const email = query.email?.trim().toLowerCase();
    const phone = query.phone?.trim().toLowerCase();
    const firstName = query.firstName?.trim().toLowerCase();
    const lastName = query.lastName?.trim().toLowerCase();
    const userCode = query.userCode?.trim().toLowerCase();
    const nameContains = query.nameContains?.trim().toLowerCase();

    return users.filter((user) => {
      if (user.isDeleted) {
        return false;
      }

      if (email && !(user.primaryEmail ?? "").toLowerCase().includes(email)) {
        return false;
      }

      if (
        phone &&
        `${user.primaryPhone.callingCode}${user.primaryPhone.number}`
          .toLowerCase()
          .includes(phone)
      ) {
        return false;
      }

      if (firstName && !user.firstName.toLowerCase().includes(firstName)) {
        return false;
      }

      if (lastName && !user.lastName.toLowerCase().includes(lastName)) {
        return false;
      }

      if (userCode && !user.userCode.toLowerCase().includes(userCode)) {
        return false;
      }

      if (nameContains) {
        const displayName =
          user.displayName ?? `${user.firstName} ${user.lastName}`;

        if (!displayName.toLowerCase().includes(nameContains)) {
          return false;
        }
      }

      return true;
    });
  }

  async createUser(
    input: Parameters<OrganizationService["createUser"]>[0],
  ): Promise<User> {
    const users = await this.membersRepository.listUsers();

    const now = new Date().toISOString();

    const duplicate = users.find(
      (user) =>
        !user.isDeleted &&
        (user.primaryPhone.number === input.primaryPhone.number ||
          (input.primaryEmail &&
            user.primaryEmail?.toLowerCase() ===
              input.primaryEmail.toLowerCase())),
    );

    if (duplicate) {
      throw new Error("A user with this phone number or email already exists.");
    }

    const created: User = {
      id: `user-${Date.now()}`,
      userCode: `USR-${String(users.length + 1).padStart(6, "0")}`,
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      displayName:
        input.displayName ?? `${input.firstName} ${input.lastName}`.trim(),
      primaryEmail: input.primaryEmail,
      primaryPhone: input.primaryPhone,
      preferredLanguageId: input.preferredLanguageId,
      userStatusId: input.userStatusId,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
      updatedBy: input.createdBy,
      isDeleted: false,
      versionNo: 1,
    };

    await this.membersRepository.saveUsers([...users, created]);

    return created;
  }

  async updateUser(
    user: Parameters<OrganizationService["updateUser"]>[0],
  ): Promise<User> {
    const users = await this.membersRepository.listUsers();

    const index = users.findIndex((item) => item.id === user.id);

    if (index === -1) {
      throw new Error("User not found.");
    }

    const updated: User = {
      ...user,
      updatedAt: new Date().toISOString(),
      versionNo: users[index].versionNo + 1,
    };

    users[index] = updated;

    await this.membersRepository.saveUsers(users);

    return updated;
  }

  async listStaff(organizationId: ID): Promise<Staff[]> {
    return this.membersRepository.listStaff(organizationId);
  }

  async createStaff(organizationId: ID, staff: Staff): Promise<Staff> {
    const staffList = await this.membersRepository.listStaff(organizationId);

    const now = new Date().toISOString();

    const created: Staff = {
      ...staff,
      organizationId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      versionNo: 1,
    };

    await this.membersRepository.saveStaff(organizationId, [
      ...staffList,
      created,
    ]);

    return created;
  }

  async updateStaff(organizationId: ID, staff: Staff): Promise<Staff> {
    const staffList = await this.membersRepository.listStaff(organizationId);

    const index = staffList.findIndex(
      (item) => item.id === staff.id && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Staff member not found.");
    }

    const updated: Staff = {
      ...staff,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: staffList[index].versionNo + 1,
    };

    staffList[index] = updated;

    await this.membersRepository.saveStaff(organizationId, staffList);

    return updated;
  }

  async deleteStaff(organizationId: ID, staffId: ID): Promise<void> {
    const staffList = await this.membersRepository.listStaff(organizationId);

    const index = staffList.findIndex(
      (item) => item.id === staffId && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error("Staff member not found.");
    }

    staffList[index] = {
      ...staffList[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: staffList[index].versionNo + 1,
    };

    await this.membersRepository.saveStaff(organizationId, staffList);
  }

  // ---------------------------------------------------------------------------
  // Staff ↔ Store assignments
  //
  // Staff.storeId is the primary store.
  // StaffStoreAssignment persists the complete store association.
  // ---------------------------------------------------------------------------

  async listStaffStoreAssignments(
    organizationId: ID,
  ): Promise<StaffStoreAssignment[]> {
    return this.membersRepository.listStaffStoreAssignments(organizationId);
  }

  async createStaffStoreAssignment(
    organizationId: ID,
    assignment: StaffStoreAssignment,
  ): Promise<StaffStoreAssignment> {
    const assignments =
      await this.membersRepository.listStaffStoreAssignments(organizationId);

    const now = new Date().toISOString();

    const created: StaffStoreAssignment = {
      ...assignment,
      organizationId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      versionNo: 1,
    };

    await this.membersRepository.saveStaffStoreAssignments(organizationId, [
      ...assignments,
      created,
    ]);

    return created;
  }

  async updateStaffStoreAssignment(
    organizationId: ID,
    assignment: StaffStoreAssignment,
  ): Promise<StaffStoreAssignment> {
    const assignments =
      await this.membersRepository.listStaffStoreAssignments(organizationId);

    const index = assignments.findIndex(
      (item) =>
        item.id === assignment.id && item.organizationId === organizationId,
    );

    if (index === -1) {
      throw new Error(`Staff store assignment not found: ${assignment.id}`);
    }

    const updated: StaffStoreAssignment = {
      ...assignment,
      organizationId,
      updatedAt: new Date().toISOString(),
      versionNo: assignments[index].versionNo + 1,
    };

    assignments[index] = updated;

    await this.membersRepository.saveStaffStoreAssignments(
      organizationId,
      assignments,
    );

    return updated;
  }

  async deleteStaffStoreAssignment(
    organizationId: ID,
    assignmentId: ID,
  ): Promise<void> {
    const assignments =
      await this.membersRepository.listStaffStoreAssignments(organizationId);

    const index = assignments.findIndex(
      (item) =>
        item.id === assignmentId && item.organizationId === organizationId,
    );

    if (index === -1) {
      return;
    }

    assignments[index] = {
      ...assignments[index],
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: assignments[index].versionNo + 1,
    };

    await this.membersRepository.saveStaffStoreAssignments(
      organizationId,
      assignments,
    );
  }
}
