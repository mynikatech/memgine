import type { Benefit, ID } from "@/src/core";

export interface BenefitRepository {
  list(organizationId: ID): Promise<Benefit[]>;

  get(organizationId: ID, benefitId: ID): Promise<Benefit | null>;

  create(benefit: Benefit): Promise<Benefit>;

  update(organizationId: ID, benefit: Benefit): Promise<Benefit>;

  delete(organizationId: ID, benefitId: ID): Promise<void>;
}
