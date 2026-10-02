import type { ID } from "@/src/core";

import { httpClient } from "./http-client";

export type CommerceProductMapping = {
  mappingId: ID;
  /** Canonical durable Product identity from migration 124. */
  productId?: ID | null;
  active: boolean;
  externalProductId: string;
  externalSku?: string | null;
  snapshot?: { productName: string; description?: string | null } | null;
};

export type BenefitCommerceApplicability = {
  adjustmentType: string;
  percentage?: number | null;
  amountMinor?: number | null;
  currencyCode?: string | null;
  active: boolean;
  productMappings: CommerceProductMapping[];
};

export type BenefitCommerceApplicabilityWrite = {
  adjustmentType: string;
  percentage?: number;
  amountMinor?: number;
  currencyCode?: string;
  active: boolean;
  productMappingIds: ID[];
};

export const benefitCommerceApi = {
  async mappings(organizationId: ID): Promise<CommerceProductMapping[]> {
    const result = await httpClient.get<CommerceProductMapping[]>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/product-mappings`,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data.filter((mapping) => mapping.active);
  },

  async applicability(
    organizationId: ID,
    benefitId: ID,
  ): Promise<BenefitCommerceApplicability | null> {
    const result = await httpClient.get<BenefitCommerceApplicability | null>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/benefits/${encodeURIComponent(benefitId)}/commerce-applicability`,
    );

    // The existing route returns a successful empty envelope when no
    // applicability has been configured yet.
    if (!result.success && result.error.code === "EMPTY_SERVER_RESPONSE") {
      return null;
    }
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  },

  async save(
    organizationId: ID,
    benefitId: ID,
    value: BenefitCommerceApplicabilityWrite,
  ): Promise<void> {
    const result = await httpClient.put<
      BenefitCommerceApplicabilityWrite,
      BenefitCommerceApplicability
    >(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/benefits/${encodeURIComponent(benefitId)}/commerce-applicability`,
      value,
    );
    if (!result.success) throw new Error(result.error.message);
  },
};
