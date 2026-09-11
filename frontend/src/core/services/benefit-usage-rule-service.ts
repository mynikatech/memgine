import type { BenefitUsageRule, ID } from "@/src/core";
import type { BenefitUsageRuleApi } from "@/src/data/api/benefit-usage-rule-api";

export interface BenefitUsageRuleService {
  listByBenefit(benefitId: ID): Promise<BenefitUsageRule[]>;
  listByBenefits(benefitIds: ID[]): Promise<BenefitUsageRule[]>;
  createRule(rule: BenefitUsageRule): Promise<BenefitUsageRule>;
  updateRule(rule: BenefitUsageRule): Promise<BenefitUsageRule>;
  deleteRule(ruleId: ID): Promise<void>;
}

export class LocalBenefitUsageRuleService implements BenefitUsageRuleService {
  constructor(private readonly api: BenefitUsageRuleApi) {}

  listByBenefit(id: ID) {
    return this.api.listByBenefit(id);
  }
  listByBenefits(ids: ID[]) {
    return this.api.listByBenefits(ids);
  }
  createRule(rule: BenefitUsageRule) {
    return this.api.create(rule);
  }
  updateRule(rule: BenefitUsageRule) {
    return this.api.update(rule);
  }
  deleteRule(id: ID) {
    return this.api.delete(id);
  }
}
