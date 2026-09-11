import type { BenefitUsageRule, ID } from "@/src/core";

export interface BenefitUsageRuleRepository {
  listByBenefit(benefitId: ID): Promise<BenefitUsageRule[]>;
  listByBenefits(benefitIds: ID[]): Promise<BenefitUsageRule[]>;
  create(rule: BenefitUsageRule): Promise<BenefitUsageRule>;
  update(rule: BenefitUsageRule): Promise<BenefitUsageRule>;
  delete(ruleId: ID): Promise<void>;
}
