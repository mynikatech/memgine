import type { BenefitUsageRule, ID } from "@/src/core";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";
import type { BenefitUsageRuleRepository } from "./benefit-usage-rule-repository";

export class LocalBenefitUsageRuleRepository implements BenefitUsageRuleRepository {
  private async listAll(): Promise<BenefitUsageRule[]> {
    return (
      (await asyncStorageStore.get<BenefitUsageRule[]>(
        LOCAL_DATA_KEYS.benefitUsageRules(),
      )) ?? []
    );
  }

  async listByBenefit(benefitId: ID): Promise<BenefitUsageRule[]> {
    const rules = await this.listAll();
    return rules.filter(
      (rule) => rule.benefitId === benefitId && !rule.isDeleted,
    );
  }

  async listByBenefits(benefitIds: ID[]): Promise<BenefitUsageRule[]> {
    const allowed = new Set(benefitIds);
    if (!allowed.size) return [];

    const rules = await this.listAll();
    return rules.filter(
      (rule) => allowed.has(rule.benefitId) && !rule.isDeleted,
    );
  }

  async create(rule: BenefitUsageRule): Promise<BenefitUsageRule> {
    const rules = await this.listAll();

    if (rules.some((item) => item.id === rule.id)) {
      throw new Error(`Benefit usage rule already exists: ${rule.id}`);
    }

    await asyncStorageStore.set(LOCAL_DATA_KEYS.benefitUsageRules(), [
      ...rules,
      rule,
    ]);

    return rule;
  }

  async update(rule: BenefitUsageRule): Promise<BenefitUsageRule> {
    const rules = await this.listAll();
    const index = rules.findIndex((item) => item.id === rule.id);

    if (index === -1) {
      throw new Error(`Benefit usage rule not found: ${rule.id}`);
    }

    rules[index] = rule;
    await asyncStorageStore.set(LOCAL_DATA_KEYS.benefitUsageRules(), rules);
    return rule;
  }

  async delete(ruleId: ID): Promise<void> {
    const rules = await this.listAll();
    const now = new Date().toISOString();

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.benefitUsageRules(),
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
