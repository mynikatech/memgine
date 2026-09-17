import type { BenefitUsageRule, ID } from "@/src/core";
import { BenefitApi, benefitOrganizationById } from "./benefit-api";

// A rule is saved with its parent Benefit so both tables commit together.
export class BenefitUsageRuleApi {
  private readonly benefitByRule = new Map<ID, ID>();

  constructor(private readonly benefits: BenefitApi) {}

  async listByBenefit(benefitId: ID): Promise<BenefitUsageRule[]> {
    const organizationId = benefitOrganizationById.get(benefitId);
    if (!organizationId) throw new Error(`Organization for Benefit ${benefitId} has not been loaded.`);
    const rules = await this.benefits.rules(organizationId, benefitId);
    rules.forEach((rule) => this.benefitByRule.set(rule.id, benefitId));
    return rules;
  }

  async listByBenefits(benefitIds: ID[]): Promise<BenefitUsageRule[]> {
    return (await Promise.all(benefitIds.map((id) => this.listByBenefit(id)))).flat();
  }

  private async save(benefitId: ID, transform: (rules: BenefitUsageRule[]) => BenefitUsageRule[]): Promise<BenefitUsageRule[]> {
    const organizationId = benefitOrganizationById.get(benefitId);
    if (!organizationId) throw new Error(`Organization for Benefit ${benefitId} has not been loaded.`);
    const benefitResult = await this.benefits.get(organizationId, benefitId);
    if (!benefitResult.success) throw new Error(benefitResult.error.message);
    const current = await this.listByBenefit(benefitId);
    const proposed = transform(current);
    const result = await this.benefits.save(organizationId, benefitResult.data, proposed, false);
    if (!result.success) throw new Error(result.error.message);
    return this.listByBenefit(benefitId);
  }

  async create(rule: BenefitUsageRule): Promise<BenefitUsageRule> {
    const rules = await this.save(rule.benefitId, (current) => [...current, rule]);
    const created = rules.find((item) => item.id === rule.id);
    if (!created) throw new Error("Benefit Usage Rule was not returned after save.");
    return created;
  }

  async update(rule: BenefitUsageRule): Promise<BenefitUsageRule> {
    const rules = await this.save(rule.benefitId, (current) =>
      current.map((item) => item.id === rule.id ? rule : item));
    const updated = rules.find((item) => item.id === rule.id);
    if (!updated) throw new Error("Benefit Usage Rule was not returned after update.");
    return updated;
  }

  async delete(ruleId: ID): Promise<void> {
    const benefitId = this.benefitByRule.get(ruleId);
    if (!benefitId) throw new Error(`Benefit for Usage Rule ${ruleId} has not been loaded.`);
    await this.save(benefitId, (current) => current.filter((item) => item.id !== ruleId));
    this.benefitByRule.delete(ruleId);
  }
}
