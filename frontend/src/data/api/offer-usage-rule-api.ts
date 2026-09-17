import type { ID, OfferUsageRule } from "@/src/core";
import { OfferApi, offerOrganizationById } from "./offer-api";

// Rule writes use the parent aggregate so Offer and rules commit together.
export class OfferUsageRuleApi {
  private readonly offerByRule = new Map<ID, ID>();

  constructor(private readonly offers: OfferApi) {}

  async listByOffer(offerId: ID): Promise<OfferUsageRule[]> {
    const organizationId = offerOrganizationById.get(offerId);
    if (!organizationId) throw new Error(`Organization for Offer ${offerId} has not been loaded.`);
    const rules = await this.offers.rules(organizationId, offerId);
    rules.forEach((rule) => this.offerByRule.set(rule.id, offerId));
    return rules;
  }

  async listByOffers(offerIds: ID[]): Promise<OfferUsageRule[]> {
    return (await Promise.all(offerIds.map((id) => this.listByOffer(id)))).flat();
  }

  private async save(offerId: ID, transform: (rules: OfferUsageRule[]) => OfferUsageRule[]): Promise<OfferUsageRule[]> {
    const organizationId = offerOrganizationById.get(offerId);
    if (!organizationId) throw new Error(`Organization for Offer ${offerId} has not been loaded.`);
    const offerResult = await this.offers.get(organizationId, offerId);
    if (!offerResult.success || !offerResult.data) {
      throw new Error(offerResult.success ? "Offer was not found." : offerResult.error.message);
    }
    const rules = transform(await this.listByOffer(offerId));
    const result = await this.offers.save(organizationId, offerResult.data, rules, false);
    if (!result.success) throw new Error(result.error.message);
    return this.listByOffer(offerId);
  }

  async create(rule: OfferUsageRule): Promise<OfferUsageRule> {
    const rules = await this.save(rule.offerId, (current) => [...current, rule]);
    const created = rules.find((item) => item.id === rule.id);
    if (!created) throw new Error("Offer Usage Rule was not returned after save.");
    return created;
  }

  async update(rule: OfferUsageRule): Promise<OfferUsageRule> {
    const rules = await this.save(rule.offerId, (current) =>
      current.map((item) => item.id === rule.id ? rule : item));
    const updated = rules.find((item) => item.id === rule.id);
    if (!updated) throw new Error("Offer Usage Rule was not returned after update.");
    return updated;
  }

  async delete(ruleId: ID): Promise<void> {
    const offerId = this.offerByRule.get(ruleId);
    if (!offerId) throw new Error(`Offer for Usage Rule ${ruleId} has not been loaded.`);
    await this.save(offerId, (current) => current.filter((item) => item.id !== ruleId));
    this.offerByRule.delete(ruleId);
  }
}
