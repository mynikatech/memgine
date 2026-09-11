import type { BenefitUsageRule, ID } from "@/src/core";
import type { BenefitUsageRuleRepository } from "../repositories/benefit-usage-rule/benefit-usage-rule-repository";

export class BenefitUsageRuleApi {
  constructor(private readonly repository: BenefitUsageRuleRepository) {}

  listByBenefit(id: ID) {
    return this.repository.listByBenefit(id);
  }

  listByBenefits(ids: ID[]) {
    return this.repository.listByBenefits(ids);
  }

  create(rule: BenefitUsageRule) {
    return this.repository.create(rule);
  }

  update(rule: BenefitUsageRule) {
    return this.repository.update(rule);
  }

  delete(id: ID) {
    return this.repository.delete(id);
  }
}
