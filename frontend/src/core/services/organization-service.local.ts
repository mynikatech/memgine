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

import type {
  CreateUserInput,
  OrganizationService,
  UserLookupQuery,
} from "./service-contracts";

import { LocalBrandingRepository } from "@/src/data/repositories/branding/branding-repository.local";
import { LocalNotificationConfigurationRepository } from "@/src/data/repositories/notification-configuration/notification-configuration-repository.local";
import { LocalOrganizationMembersRepository } from "@/src/data/repositories/organization/organization-members.repository.local";

function getOrganizationUserTypeSegment(organizationUserTypeId: ID): string {
  const normalized = organizationUserTypeId.trim().toLowerCase();

  if (normalized.includes("customer")) {
    return "CUSTOMER";
  }

  if (normalized.includes("staff")) {
    return "STAFF";
  }

  const segment = normalized
    .replace(/^org-user-type-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return segment ? segment.toUpperCase() : "USER";
}

export class LocalOrganizationService implements OrganizationService {
  private readonly brandingRepository: LocalBrandingRepository;
  private readonly membersRepository: LocalOrganizationMembersRepository;
  private readonly notificationConfigurationRepository: LocalNotificationConfigurationRepository;

  constructor(private readonly fallback: OrganizationService) {
    this.brandingRepository = new LocalBrandingRepository();
    this.membersRepository = new LocalOrganizationMembersRepository();
    this.notificationConfigurationRepository =
      new LocalNotificationConfigurationRepository();
  }

  async getOrganization(organizationId: ID): Promise<Organization | null> {
    const result = await apis.organization.get(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data ?? this.fallback.getOrganization(organizationId);
  }

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

  async getOrganizationDetails(
    organizationId: ID,
  ): Promise<OrganizationDetails | null> {
    const result = await apis.organization.getAggregate(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return (
      result.data?.details ??
      this.fallback.getOrganizationDetails(organizationId)
    );
  }

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

  async listOrganizationUsersByUser(userId: ID): Promise<OrganizationUser[]> {
    const organizations = await this.listOrganizations();
    const localOrganizationUsers = (
      await Promise.all(
        organizations.map((organization) =>
          this.membersRepository.listOrganizationUsers(organization.id),
        ),
      )
    )
      .flat()
      .filter((item) => !item.isDeleted && item.userId === userId);

    const fallbackOrganizationUsers =
      await this.fallback.listOrganizationUsersByUser(userId);

    const byId = new Map<string, OrganizationUser>();

    for (const organizationUser of fallbackOrganizationUsers) {
      byId.set(organizationUser.id, organizationUser);
    }

    for (const organizationUser of localOrganizationUsers) {
      byId.set(organizationUser.id, organizationUser);
    }

    return Array.from(byId.values());
  }

  async getOrganizationUser(id: ID): Promise<OrganizationUser | null> {
    const organizations = await this.listOrganizations();

    for (const organization of organizations) {
      const organizationUsers =
        await this.membersRepository.listOrganizationUsers(organization.id);

      const organizationUser = organizationUsers.find(
        (item) => item.id === id && !item.isDeleted,
      );

      if (organizationUser) {
        return organizationUser;
      }
    }

    return this.fallback.getOrganizationUser(id);
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

    const existing = organizationUsers.find(
      (item) =>
        !item.isDeleted &&
        item.userId === organizationUser.userId &&
        item.organizationUserTypeId === organizationUser.organizationUserTypeId,
    );

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const organization = await this.getOrganization(organizationId);
    const organizationCode = organization?.code?.trim() || organizationId;
    const typeSegment = getOrganizationUserTypeSegment(
      organizationUser.organizationUserTypeId,
    );
    const idPrefix = `${organizationCode}-${typeSegment}`;

    const usedIds = new Set(
      organizationUsers
        .map((item) => item.id.trim().toUpperCase())
        .filter(Boolean),
    );

    let sequence = 1;
    let generatedId = `${idPrefix}-${String(sequence).padStart(3, "0")}`;

    while (usedIds.has(generatedId.toUpperCase())) {
      sequence += 1;
      generatedId = `${idPrefix}-${String(sequence).padStart(3, "0")}`;
    }

    const created: OrganizationUser = {
      ...organizationUser,
      id: generatedId,
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

  async getOrganizationBranding(organizationId: ID) {
    const local = await this.brandingRepository.getCurrent(organizationId);
    return local ?? this.fallback.getOrganizationBranding(organizationId);
  }

  async updateOrganizationBranding(
    organizationId: ID,
    branding: Parameters<OrganizationService["updateOrganizationBranding"]>[1],
  ) {
    return this.brandingRepository.save(organizationId, branding);
  }

  async getNotificationConfiguration(organizationId: ID) {
    const local =
      await this.notificationConfigurationRepository.getCurrent(organizationId);

    return local ?? this.fallback.getNotificationConfiguration(organizationId);
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
    return this.notificationConfigurationRepository.save(
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

  async listUsers(): Promise<User[]> {
    return this.membersRepository.listUsers();
  }

  async getUser(userId: ID): Promise<User | null> {
    const users = await this.membersRepository.listUsers();

    return users.find((user) => user.id === userId && !user.isDeleted) ?? null;
  }

  async findUsers(query: UserLookupQuery): Promise<User[]> {
    const users = await this.membersRepository.listUsers();

    const email = query.email?.trim().toLowerCase();
    const phone = query.phone?.replace(/\D/g, "");
    const firstName = query.firstName?.trim().toLowerCase();
    const lastName = query.lastName?.trim().toLowerCase();
    const userCode = query.userCode?.trim().toLowerCase();
    const nameContains = query.nameContains?.trim().toLowerCase();

    return users.filter((user) => {
      if (user.isDeleted) {
        return false;
      }

      if (
        email &&
        !(user.primaryEmail ?? "").trim().toLowerCase().includes(email)
      ) {
        return false;
      }

      if (phone) {
        const userPhone =
          `${user.primaryPhone.callingCode ?? ""}${user.primaryPhone.number ?? ""}`.replace(
            /\D/g,
            "",
          );

        if (!userPhone.includes(phone)) {
          return false;
        }
      }

      if (
        firstName &&
        !user.firstName.trim().toLowerCase().includes(firstName)
      ) {
        return false;
      }

      if (lastName && !user.lastName.trim().toLowerCase().includes(lastName)) {
        return false;
      }

      if (userCode && !user.userCode.trim().toLowerCase().includes(userCode)) {
        return false;
      }

      if (nameContains) {
        const displayName = (
          user.displayName ?? `${user.firstName} ${user.lastName}`
        )
          .trim()
          .toLowerCase();

        if (!displayName.includes(nameContains)) {
          return false;
        }
      }

      return true;
    });
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const users = await this.membersRepository.listUsers();

    const normalizedEmail = input.primaryEmail?.trim().toLowerCase();
    const normalizedPhone = input.primaryPhone.number.replace(/\D/g, "");

    const duplicate = users.find((user) => {
      if (user.isDeleted) {
        return false;
      }

      const existingEmail = user.primaryEmail?.trim().toLowerCase();

      const existingPhone = user.primaryPhone.number.replace(/\D/g, "");

      const sameEmail =
        !!normalizedEmail &&
        !!existingEmail &&
        normalizedEmail === existingEmail;

      const samePhone =
        normalizedPhone.length > 0 &&
        normalizedPhone === existingPhone &&
        user.primaryPhone.countryId === input.primaryPhone.countryId;

      return sameEmail || samePhone;
    });

    if (duplicate) {
      throw new Error("A user with this phone number or email already exists.");
    }

    const now = new Date().toISOString();

    const nextSequence =
      users.reduce((highest, user) => {
        const match = /^USR-(\d+)$/.exec(user.userCode);

        if (!match) {
          return highest;
        }

        return Math.max(highest, Number(match[1]));
      }, 0) + 1;

    const created: User = {
      id: `user-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      userCode: `USR-${String(nextSequence).padStart(6, "0")}`,
      firstName: input.firstName.trim(),
      middleName: input.middleName?.trim() || undefined,
      lastName: input.lastName.trim(),
      displayName:
        input.displayName?.trim() ||
        `${input.firstName.trim()} ${input.lastName.trim()}`,
      primaryEmail: normalizedEmail || undefined,
      primaryPhone: {
        ...input.primaryPhone,
        number: normalizedPhone,
      },
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

  async updateUser(user: User): Promise<User> {
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
      throw new Error("Staff store assignment not found.");
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
      throw new Error("Staff store assignment not found.");
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
