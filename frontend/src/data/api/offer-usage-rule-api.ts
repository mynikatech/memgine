import type { ID, OfferUsageRule } from "@/src/core";
import type { OfferUsageRuleRepository } from "../repositories/offer-usage-rule/offer-usage-rule-repository";

export class OfferUsageRuleApi {
  constructor(private readonly repository: OfferUsageRuleRepository) {}

  listByOffer(id: ID) {
    return this.repository.listByOffer(id);
  }

  listByOffers(ids: ID[]) {
    return this.repository.listByOffers(ids);
  }

  create(rule: OfferUsageRule) {
    return this.repository.create(rule);
  }

  update(rule: OfferUsageRule) {
    return this.repository.update(rule);
  }

  delete(id: ID) {
    return this.repository.delete(id);
  }
}
