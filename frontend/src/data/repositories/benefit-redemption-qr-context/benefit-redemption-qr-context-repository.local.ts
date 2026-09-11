import type { BenefitRedemptionQRContext } from "@/src/core/qr/benefit-redemption-qr";
import type { ID } from "@/src/core/domain/common";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { BenefitRedemptionQRContextRepository } from "./benefit-redemption-qr-context-repository";

export class LocalBenefitRedemptionQRContextRepository implements BenefitRedemptionQRContextRepository {
  private async listStored(): Promise<BenefitRedemptionQRContext[]> {
    return (
      (await asyncStorageStore.get<BenefitRedemptionQRContext[]>(
        LOCAL_DATA_KEYS.benefitRedemptionQRContexts(),
      )) ?? []
    );
  }

  async listAll(): Promise<BenefitRedemptionQRContext[]> {
    return this.listStored();
  }

  async getById(id: ID): Promise<BenefitRedemptionQRContext | null> {
    const contexts = await this.listStored();

    return contexts.find((item) => item.id === id) ?? null;
  }

  async getByQRCodeId(
    qrCodeId: ID,
  ): Promise<BenefitRedemptionQRContext | null> {
    const contexts = await this.listStored();

    return contexts.find((item) => item.qrCodeId === qrCodeId) ?? null;
  }

  async create(
    context: BenefitRedemptionQRContext,
  ): Promise<BenefitRedemptionQRContext> {
    const contexts = await this.listStored();

    if (contexts.some((item) => item.id === context.id)) {
      throw new Error(
        `Benefit redemption QR context already exists: ${context.id}`,
      );
    }

    if (contexts.some((item) => item.qrCodeId === context.qrCodeId)) {
      throw new Error(
        `Benefit redemption QR context already exists for QR code: ${context.qrCodeId}`,
      );
    }

    if (contexts.some((item) => item.qrCodeToken === context.qrCodeToken)) {
      throw new Error(
        `Benefit redemption QR context already exists for token: ${context.qrCodeToken}`,
      );
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.benefitRedemptionQRContexts(), [
      ...contexts,
      context,
    ]);

    return context;
  }

  async delete(id: ID): Promise<void> {
    const contexts = await this.listStored();

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.benefitRedemptionQRContexts(),
      contexts.filter((item) => item.id !== id),
    );
  }
}
