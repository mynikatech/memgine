import type { ID } from "@/src/core/domain/common";
import type { OfferRedemption } from "@/src/core/domain/offer-redemption";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { OfferRedemptionRepository } from "./offer-redemption-repository";

export class LocalOfferRedemptionRepository implements OfferRedemptionRepository {
  private async listStored(): Promise<OfferRedemption[]> {
    return (
      (await asyncStorageStore.get<OfferRedemption[]>(
        LOCAL_DATA_KEYS.offerRedemptions(),
      )) ?? []
    );
  }

  async listAll(): Promise<OfferRedemption[]> {
    return this.listStored();
  }

  async listByOffer(offerId: ID): Promise<OfferRedemption[]> {
    const redemptions = await this.listStored();

    return redemptions.filter(
      (redemption) => redemption.offerId === offerId && !redemption.isDeleted,
    );
  }

  async listByUser(userId: ID): Promise<OfferRedemption[]> {
    const redemptions = await this.listStored();

    return redemptions.filter(
      (redemption) => redemption.userId === userId && !redemption.isDeleted,
    );
  }

  async listByStore(storeId: ID): Promise<OfferRedemption[]> {
    const redemptions = await this.listStored();

    return redemptions.filter(
      (redemption) => redemption.storeId === storeId && !redemption.isDeleted,
    );
  }

  async getById(id: ID): Promise<OfferRedemption | null> {
    const redemptions = await this.listStored();

    return redemptions.find((redemption) => redemption.id === id) ?? null;
  }

  async getByRedemptionNumber(
    redemptionNumber: string,
  ): Promise<OfferRedemption | null> {
    const redemptions = await this.listStored();

    return (
      redemptions.find(
        (redemption) =>
          redemption.redemptionNumber === redemptionNumber &&
          !redemption.isDeleted,
      ) ?? null
    );
  }

  async create(redemption: OfferRedemption): Promise<OfferRedemption> {
    const redemptions = await this.listStored();

    if (redemptions.some((item) => item.id === redemption.id)) {
      throw new Error(`Offer redemption already exists: ${redemption.id}`);
    }

    if (
      redemptions.some(
        (item) =>
          !item.isDeleted &&
          item.redemptionNumber === redemption.redemptionNumber,
      )
    ) {
      throw new Error(
        `Offer redemption number already exists: ${redemption.redemptionNumber}`,
      );
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offerRedemptions(), [
      ...redemptions,
      redemption,
    ]);

    return redemption;
  }
}
