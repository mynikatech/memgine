import type { ID, Offer } from "@/src/core";
import { apis } from "@/src/data";

import type { OfferService } from "./service-contracts";

export class LocalOfferService implements OfferService {
  constructor(private readonly fallback: OfferService) {}

  async listByOrganization(organizationId: ID): Promise<Offer[]> {
    const result = await apis.offer.list(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const fallbackOffers =
      await this.fallback.listByOrganization(organizationId);

    const byId = new Map<string, Offer>();

    for (const offer of fallbackOffers) {
      byId.set(offer.id, offer);
    }

    for (const offer of result.data) {
      byId.set(offer.id, offer);
    }

    return Array.from(byId.values()).filter((offer) => !offer.isDeleted);
  }

  async createOffer(organizationId: ID, offer: Offer): Promise<Offer> {
    const result = await apis.offer.create(organizationId, offer);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async updateOffer(organizationId: ID, offer: Offer): Promise<Offer> {
    const result = await apis.offer.update(organizationId, offer);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  async deleteOffer(organizationId: ID, offerId: ID): Promise<void> {
    const result = await apis.offer.delete(organizationId, offerId);

    if (!result.success) {
      throw new Error(result.error.message);
    }
  }
}
