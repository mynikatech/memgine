import type { ID } from "@/src/core/domain/common";

import type { OfferRedemptionQRContext } from "@/src/core/qr/offer-redemption-qr";

import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { OfferRedemptionQRContextRepository } from "./offer-redemption-qr-context-repository";

export class LocalOfferRedemptionQRContextRepository implements OfferRedemptionQRContextRepository {
  private async listStored(): Promise<OfferRedemptionQRContext[]> {
    return (
      (await asyncStorageStore.get<OfferRedemptionQRContext[]>(
        LOCAL_DATA_KEYS.offerRedemptionQRContexts(),
      )) ?? []
    );
  }

  async listAll(): Promise<OfferRedemptionQRContext[]> {
    return this.listStored();
  }

  async getById(id: ID): Promise<OfferRedemptionQRContext | null> {
    const contexts = await this.listStored();

    return contexts.find((item) => item.id === id) ?? null;
  }

  async getByQRCodeId(qrCodeId: ID): Promise<OfferRedemptionQRContext | null> {
    const contexts = await this.listStored();

    return contexts.find((item) => item.qrCodeId === qrCodeId) ?? null;
  }

  async create(
    context: OfferRedemptionQRContext,
  ): Promise<OfferRedemptionQRContext> {
    const contexts = await this.listStored();

    if (contexts.some((item) => item.id === context.id)) {
      throw new Error(
        `Offer redemption QR context already exists: ${context.id}`,
      );
    }

    if (contexts.some((item) => item.qrCodeId === context.qrCodeId)) {
      throw new Error(
        `Offer redemption QR context already exists for QR code: ${context.qrCodeId}`,
      );
    }

    if (contexts.some((item) => item.qrCodeToken === context.qrCodeToken)) {
      throw new Error(
        `Offer redemption QR context already exists for token: ${context.qrCodeToken}`,
      );
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offerRedemptionQRContexts(), [
      ...contexts,
      context,
    ]);

    return context;
  }

  async delete(id: ID): Promise<void> {
    const contexts = await this.listStored();

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.offerRedemptionQRContexts(),
      contexts.filter((item) => item.id !== id),
    );
  }
}
