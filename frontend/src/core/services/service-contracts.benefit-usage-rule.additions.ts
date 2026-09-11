import type { BenefitUsageRule, ID } from "@/src/core";

export interface BenefitUsageRuleService {
  listByBenefit(benefitId: ID): Promise<BenefitUsageRule[]>;
  listByBenefits(benefitIds: ID[]): Promise<BenefitUsageRule[]>;
  createRule(rule: BenefitUsageRule): Promise<BenefitUsageRule>;
  updateRule(rule: BenefitUsageRule): Promise<BenefitUsageRule>;
  deleteRule(ruleId: ID): Promise<void>;
}
