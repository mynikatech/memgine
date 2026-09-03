import type { Benefit, ID } from "@/src/core";

type BenefitDraftState = {
  organizationId: ID;
  benefits: Benefit[];
};

let draftState: BenefitDraftState | null = null;

function cloneBenefit(benefit: Benefit): Benefit {
  return {
    ...benefit,

    retailPrice: benefit.retailPrice
      ? {
          ...benefit.retailPrice,
        }
      : undefined,

    cost: benefit.cost
      ? {
          ...benefit.cost,
        }
      : undefined,
  };
}

function cloneBenefits(benefits: Benefit[]): Benefit[] {
  return benefits.map(cloneBenefit);
}

export const benefitDraftStore = {
  get(organizationId: ID): Benefit[] | null {
    if (!draftState || draftState.organizationId !== organizationId) {
      return null;
    }

    return cloneBenefits(draftState.benefits);
  },

  set(organizationId: ID, benefits: Benefit[]): void {
    draftState = {
      organizationId,
      benefits: cloneBenefits(benefits),
    };
  },

  clear(organizationId: ID): void {
    if (draftState && draftState.organizationId === organizationId) {
      draftState = null;
    }
  },

  has(organizationId: ID): boolean {
    return draftState !== null && draftState.organizationId === organizationId;
  },
} as const;
