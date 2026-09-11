import type { ID, OfferUsageRule } from "@/src/core";

export interface OfferUsageRuleRepository {
  listByOffer(offerId: ID): Promise<OfferUsageRule[]>;
  listByOffers(offerIds: ID[]): Promise<OfferUsageRule[]>;
  create(rule: OfferUsageRule): Promise<OfferUsageRule>;
  update(rule: OfferUsageRule): Promise<OfferUsageRule>;
  delete(ruleId: ID): Promise<void>;
}
