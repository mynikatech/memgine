import type { ID, OfferUsageRule } from "@/src/core";
import type { OfferUsageRuleApi } from "@/src/data/api/offer-usage-rule-api";

export interface OfferUsageRuleService {
  listByOffer(offerId: ID): Promise<OfferUsageRule[]>;
  listByOffers(offerIds: ID[]): Promise<OfferUsageRule[]>;
  createRule(rule: OfferUsageRule): Promise<OfferUsageRule>;
  updateRule(rule: OfferUsageRule): Promise<OfferUsageRule>;
  deleteRule(ruleId: ID): Promise<void>;
}

export class LocalOfferUsageRuleService implements OfferUsageRuleService {
  constructor(private readonly api: OfferUsageRuleApi) {}

  listByOffer(id: ID) {
    return this.api.listByOffer(id);
  }

  listByOffers(ids: ID[]) {
    return this.api.listByOffers(ids);
  }

  createRule(rule: OfferUsageRule) {
    return this.api.create(rule);
  }

  updateRule(rule: OfferUsageRule) {
    return this.api.update(rule);
  }

  deleteRule(id: ID) {
    return this.api.delete(id);
  }
}
