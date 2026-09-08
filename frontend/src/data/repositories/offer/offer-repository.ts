import type { ID, Offer } from "@/src/core";

export interface OfferRepository {
  list(organizationId: ID): Promise<Offer[]>;

  get(organizationId: ID, offerId: ID): Promise<Offer | null>;

  create(offer: Offer): Promise<Offer>;

  update(organizationId: ID, offer: Offer): Promise<Offer>;

  delete(organizationId: ID, offerId: ID): Promise<void>;
}
