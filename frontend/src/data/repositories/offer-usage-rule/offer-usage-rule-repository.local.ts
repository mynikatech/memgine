import type { ID, OfferUsageRule } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { OfferUsageRuleRepository } from "./offer-usage-rule-repository";

export class LocalOfferUsageRuleRepository implements OfferUsageRuleRepository {
  private async listAll(): Promise<OfferUsageRule[]> {
    return (
      (await asyncStorageStore.get<OfferUsageRule[]>(
        LOCAL_DATA_KEYS.offerUsageRules(),
      )) ?? []
    );
  }

  async listByOffer(offerId: ID): Promise<OfferUsageRule[]> {
    const rules = await this.listAll();

    return rules.filter((rule) => rule.offerId === offerId && !rule.isDeleted);
  }

  async listByOffers(offerIds: ID[]): Promise<OfferUsageRule[]> {
    const allowed = new Set(offerIds);

    if (!allowed.size) {
      return [];
    }

    const rules = await this.listAll();

    return rules.filter((rule) => allowed.has(rule.offerId) && !rule.isDeleted);
  }

  async create(rule: OfferUsageRule): Promise<OfferUsageRule> {
    const rules = await this.listAll();

    if (rules.some((item) => item.id === rule.id)) {
      throw new Error(`Offer usage rule already exists: ${rule.id}`);
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offerUsageRules(), [
      ...rules,
      rule,
    ]);

    return rule;
  }

  async update(rule: OfferUsageRule): Promise<OfferUsageRule> {
    const rules = await this.listAll();
    const index = rules.findIndex((item) => item.id === rule.id);

    if (index === -1) {
      throw new Error(`Offer usage rule not found: ${rule.id}`);
    }

    rules[index] = rule;

    await asyncStorageStore.set(LOCAL_DATA_KEYS.offerUsageRules(), rules);

    return rule;
  }

  async delete(ruleId: ID): Promise<void> {
    const rules = await this.listAll();
    const now = new Date().toISOString();

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.offerUsageRules(),
      rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              isDeleted: true,
              updatedAt: now,
              versionNo: rule.versionNo + 1,
            }
          : rule,
      ),
    );
  }
}
