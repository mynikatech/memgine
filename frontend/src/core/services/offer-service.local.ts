import type { ID, Offer, OfferUsageRule } from "@/src/core";
import { apis } from "@/src/data";

import type { OfferService } from "./service-contracts";

export class LocalOfferService implements OfferService {
  async listByOrganization(organizationId: ID): Promise<Offer[]> {
    const result = await apis.offer.list(organizationId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data.filter((offer) => !offer.isDeleted);
  }

  async saveOfferWithRules(organizationId: ID, offer: Offer, rules: OfferUsageRule[], create: boolean): Promise<Offer> {
    const result = await apis.offer.save(organizationId, offer, rules, create);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
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
