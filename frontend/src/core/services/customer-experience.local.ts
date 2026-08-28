import type { ID } from "../domain/common";

import type {
  CustomerExperience,
  CustomerExperienceDefinition,
  CustomerExperienceService,
} from "./customer-experience";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class LocalCustomerExperienceService implements CustomerExperienceService {
  constructor(private readonly fallback: CustomerExperienceService) {}

  async getCustomerExperience(
    organizationId: ID,
  ): Promise<CustomerExperience | null> {
    const local = await asyncStorageStore.get<CustomerExperience>(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
    );

    if (local) {
      return clone(local);
    }

    return this.fallback.getCustomerExperience(organizationId);
  }

  async getPublishedCustomerExperience(
    organizationId: ID,
  ): Promise<CustomerExperience | null> {
    const local = await asyncStorageStore.get<CustomerExperience>(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
    );

    if (local?.lifecycleStatus === "PUBLISHED") {
      return clone(local);
    }

    return this.fallback.getPublishedCustomerExperience(organizationId);
  }

  async initializeCustomerExperience(
    organizationId: ID,
    templateId: ID,
    experienceName: string,
    content: CustomerExperienceDefinition,
    createdBy: ID,
  ): Promise<CustomerExperience> {
    const existing = await asyncStorageStore.get<CustomerExperience>(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
    );

    if (existing) {
      return clone(existing);
    }

    const now = new Date().toISOString();

    const experience: CustomerExperience = {
      id: `customer-experience-${organizationId}`,

      organizationId,

      templateId,

      experienceName,

      experienceDefinition: clone(content),

      experienceStatusId: "status-draft",

      lifecycleStatus: "DRAFT",

      createdAt: now,
      createdBy,

      updatedAt: now,
      updatedBy: createdBy,

      isDeleted: false,

      versionNo: 1,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
      experience,
    );

    return clone(experience);
  }

  async updateCustomerExperience(
    organizationId: ID,
    experience: CustomerExperience,
  ): Promise<CustomerExperience> {
    const current = await asyncStorageStore.get<CustomerExperience>(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
    );

    const updated: CustomerExperience = {
      ...clone(experience),

      organizationId,

      experienceStatusId: "status-draft",

      lifecycleStatus: "DRAFT",

      publishedAt: undefined,

      publishedBy: undefined,

      updatedAt: new Date().toISOString(),

      versionNo: (current?.versionNo ?? experience.versionNo) + 1,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
      updated,
    );

    return clone(updated);
  }

  async publishCustomerExperience(
    organizationId: ID,
    publishedBy: ID,
  ): Promise<CustomerExperience> {
    const draft = await asyncStorageStore.get<CustomerExperience>(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
    );

    if (!draft) {
      throw new Error(
        `Customer Experience draft was not found for organization '${organizationId}'.`,
      );
    }

    if (!draft.experienceDefinition.businessIdentity.displayName.trim()) {
      throw new Error("Business display name is required before publishing.");
    }

    if (!draft.experienceDefinition.membership.enabled) {
      throw new Error(
        "Membership must be enabled before publishing the Customer Experience.",
      );
    }

    const now = new Date().toISOString();

    const published: CustomerExperience = {
      ...clone(draft),

      experienceStatusId: "status-published",

      lifecycleStatus: "PUBLISHED",

      publishedAt: now,

      publishedBy,

      updatedAt: now,

      updatedBy: publishedBy,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.organizationCustomerExperience(organizationId),
      published,
    );

    return clone(published);
  }
}
