import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

import type { ID, Offer } from "@/src/core";

import type { OfferRepository } from "./offer-repository";

export class LocalOfferRepository implements OfferRepository {
  async list(organizationId: ID): Promise<Offer[]> {
    const key = LOCAL_DATA_KEYS.offers(organizationId);
    const existing = await asyncStorageStore.get<Offer[]>(key);
    return existing ?? [];
  }

  async get(organizationId: ID, offerId: ID): Promise<Offer | null> {
    const offers = await this.list(organizationId);

    return (
      offers.find(
        (offer) =>
          offer.id === offerId &&
          offer.organizationId === organizationId &&
          !offer.isDeleted,
      ) ?? null
    );
  }

  async create(offer: Offer): Promise<Offer> {
    const offers = await this.list(offer.organizationId);

    const duplicateCode = offers.some(
      (item) =>
        !item.isDeleted &&
        item.offerCode.trim().toLowerCase() ===
          offer.offerCode.trim().toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Offer code '${offer.offerCode}' already exists.`);
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offers(offer.organizationId), [
      ...offers,
      offer,
    ]);

    return offer;
  }

  async update(organizationId: ID, offer: Offer): Promise<Offer> {
    const offers = await this.list(organizationId);

    const index = offers.findIndex(
      (item) =>
        item.id === offer.id &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Offer not found.");
    }

    const duplicateCode = offers.some(
      (item) =>
        item.id !== offer.id &&
        !item.isDeleted &&
        item.offerCode.trim().toLowerCase() ===
          offer.offerCode.trim().toLowerCase(),
    );

    if (duplicateCode) {
      throw new Error(`Offer code '${offer.offerCode}' already exists.`);
    }

    const current = offers[index];

    const updatedOffer: Offer = {
      ...offer,
      organizationId,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      updatedAt: new Date().toISOString(),
      updatedBy: offer.updatedBy ?? current.updatedBy,
      versionNo: current.versionNo + 1,
    };

    offers[index] = updatedOffer;

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offers(organizationId), offers);

    return updatedOffer;
  }

  async delete(organizationId: ID, offerId: ID): Promise<void> {
    const offers = await this.list(organizationId);

    const index = offers.findIndex(
      (item) =>
        item.id === offerId &&
        item.organizationId === organizationId &&
        !item.isDeleted,
    );

    if (index === -1) {
      throw new Error("Offer not found.");
    }

    const current = offers[index];

    offers[index] = {
      ...current,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      updatedBy: current.updatedBy ?? "user-system",
      versionNo: current.versionNo + 1,
    };

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offers(organizationId), offers);
  }
}
