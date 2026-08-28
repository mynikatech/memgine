import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type {
  ID,
  Organization,
  OrganizationAccount,
  OrganizationBranding,
  OrganizationDetails,
} from "@/src/core";

import type {
  CreateOrganizationRepositoryInput,
  OrganizationAggregate,
  OrganizationRepository,
} from "./organization-repository";

export class LocalOrganizationRepository implements OrganizationRepository {
  async get(organizationId: ID): Promise<Organization | null> {
    return asyncStorageStore.get<Organization>(
      LOCAL_DATA_KEYS.organization(organizationId),
    );
  }

  async getAggregate(
    organizationId: ID,
  ): Promise<OrganizationAggregate | null> {
    const organization = await this.get(organizationId);

    if (!organization) {
      return null;
    }

    const [account, details, branding] = await Promise.all([
      asyncStorageStore.get<OrganizationAccount>(
        LOCAL_DATA_KEYS.organizationAccount(organizationId),
      ),
      asyncStorageStore.get<OrganizationDetails>(
        LOCAL_DATA_KEYS.organizationDetails(organizationId),
      ),
      asyncStorageStore.get<OrganizationBranding>(
        LOCAL_DATA_KEYS.organizationBranding(organizationId),
      ),
    ]);

    if (!account || !details || !branding) {
      throw new Error(
        `Organization '${organizationId}' exists but its onboarding data is incomplete.`,
      );
    }

    return {
      organization,
      account,
      details,
      branding,
    };
  }

  async list(): Promise<Organization[]> {
    return (
      (await asyncStorageStore.get<Organization[]>(
        LOCAL_DATA_KEYS.organizationList(),
      )) ?? []
    );
  }

  async create(
    input: CreateOrganizationRepositoryInput,
  ): Promise<Organization> {
    const existing = await this.get(input.organization.id);

    if (existing) {
      throw new Error(
        `Organization '${input.organization.id}' already exists.`,
      );
    }

    const organizations =
      (await asyncStorageStore.get<Organization[]>(
        LOCAL_DATA_KEYS.organizationList(),
      )) ?? [];

    await Promise.all([
      asyncStorageStore.set(
        LOCAL_DATA_KEYS.organization(input.organization.id),
        input.organization,
      ),
      asyncStorageStore.set(
        LOCAL_DATA_KEYS.organizationAccount(input.organization.id),
        input.account,
      ),
      asyncStorageStore.set(
        LOCAL_DATA_KEYS.organizationDetails(input.organization.id),
        input.details,
      ),
      asyncStorageStore.set(
        LOCAL_DATA_KEYS.organizationBranding(input.organization.id),
        input.branding,
      ),
      asyncStorageStore.set(LOCAL_DATA_KEYS.organizationList(), [
        ...organizations,
        input.organization,
      ]),
    ]);

    return input.organization;
  }

  async update(
    organizationId: ID,
    organization: Organization,
  ): Promise<Organization> {
    const existing = await this.get(organizationId);

    if (!existing) {
      throw new Error(`Organization '${organizationId}' was not found.`);
    }

    if (organization.id !== organizationId) {
      throw new Error(
        `Organization ID mismatch. Expected '${organizationId}', received '${organization.id}'.`,
      );
    }

    const organizations =
      (await asyncStorageStore.get<Organization[]>(
        LOCAL_DATA_KEYS.organizationList(),
      )) ?? [];

    const updatedOrganizations = organizations.some(
      (item) => item.id === organizationId,
    )
      ? organizations.map((item) =>
          item.id === organizationId ? organization : item,
        )
      : [...organizations, organization];

    await Promise.all([
      asyncStorageStore.set(
        LOCAL_DATA_KEYS.organization(organizationId),
        organization,
      ),
      asyncStorageStore.set(
        LOCAL_DATA_KEYS.organizationList(),
        updatedOrganizations,
      ),
    ]);

    return organization;
  }

  async updateDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<OrganizationDetails> {
    const existing = await this.get(organizationId);

    if (!existing) {
      throw new Error(`Organization '${organizationId}' was not found.`);
    }

    if (details.organizationId !== organizationId) {
      throw new Error(
        `Organization Details ID mismatch. Expected organization '${organizationId}', received '${details.organizationId}'.`,
      );
    }

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationDetails(organizationId),
      details,
    );

    return details;
  }
}
