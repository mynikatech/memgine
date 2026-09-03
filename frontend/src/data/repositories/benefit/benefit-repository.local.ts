import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";

import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { Benefit, ID } from "@/src/core";

import type { BenefitRepository } from "./benefit-repository";

export class LocalBenefitRepository implements BenefitRepository {
  async list(organizationId: ID): Promise<Benefit[]> {
    const key = LOCAL_DATA_KEYS.benefits(organizationId);

    const existing = await asyncStorageStore.get<Benefit[]>(key);

    return existing ?? [];
  }

  async get(organizationId: ID, benefitId: ID): Promise<Benefit | null> {
    const benefits = await this.list(organizationId);

    return (
      benefits.find(
        (benefit) =>
          benefit.id === benefitId &&
          benefit.organizationId === organizationId &&
          !benefit.isDeleted,
      ) ?? null
    );
  }

  async create(benefit: Benefit): Promise<Benefit> {
    const benefits = await this.list(benefit.organizationId);

    const duplicateCode = benefits.some(
      (item) =>
        !item.isDeleted &&
        item.benefitCode.trim().toLowerCase() ===
          benefit.benefitCode.trim().toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Benefit code '${benefit.benefitCode}' already exists.`);
    }

    const updated = [...benefits, benefit];

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.benefits(benefit.organizationId),
      updated,
    );

    return benefit;
  }

  async update(organizationId: ID, benefit: Benefit): Promise<Benefit> {
    const benefits = await this.list(organizationId);

    const index = benefits.findIndex(
      (item) =>
        item.id === benefit.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Benefit not found.");
    }

    const duplicateCode = benefits.some(
      (item) =>
        item.id !== benefit.id &&
        !item.isDeleted &&
        item.benefitCode.trim().toLowerCase() ===
          benefit.benefitCode.trim().toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Benefit code '${benefit.benefitCode}' already exists.`);
    }

    const current = benefits[index];

    const updatedBenefit: Benefit = {
      ...benefit,
      organizationId,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      updatedAt: new Date().toISOString(),
      versionNo: current.versionNo + 1,
    };

    benefits[index] = updatedBenefit;

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.benefits(organizationId),
      benefits,
    );

    return updatedBenefit;
  }

  async delete(organizationId: ID, benefitId: ID): Promise<void> {
    const benefits = await this.list(organizationId);

    const index = benefits.findIndex(
      (item) =>
        item.id === benefitId &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Benefit not found.");
    }

    const current = benefits[index];

    benefits[index] = {
      ...current,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      versionNo: current.versionNo + 1,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.benefits(organizationId),
      benefits,
    );
  }
}
