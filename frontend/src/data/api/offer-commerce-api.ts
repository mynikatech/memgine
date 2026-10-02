import type { ID } from "@/src/core";

import { httpClient } from "./http-client";

export type CommerceProductMapping = {
  mappingId: ID;
  active: boolean;
  externalProductId: string;
  externalSku?: string | null;
  snapshot?: { productName: string; description?: string | null } | null;
};

export type OfferCommerceApplicability = {
  adjustmentType: string;
  percentage?: number | null;
  amountMinor?: number | null;
  currencyCode?: string | null;
  active: boolean;
  productMappings: CommerceProductMapping[];
};

export type OfferCommerceApplicabilityWrite = {
  adjustmentType: string;
  percentage?: number;
  amountMinor?: number;
  currencyCode?: string;
  active: boolean;
  productMappingIds: ID[];
};

export const offerCommerceApi = {
  async mappings(organizationId: ID): Promise<CommerceProductMapping[]> {
    const result = await httpClient.get<CommerceProductMapping[]>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/product-mappings`,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data.filter((mapping) => mapping.active && mapping.snapshot);
  },

  async applicability(organizationId: ID, offerId: ID): Promise<OfferCommerceApplicability | null> {
    const result = await httpClient.get<OfferCommerceApplicability | null>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/commerce-applicability`,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  },

  async save(organizationId: ID, offerId: ID, value: OfferCommerceApplicabilityWrite): Promise<void> {
    const result = await httpClient.put<OfferCommerceApplicabilityWrite, OfferCommerceApplicability>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/commerce-applicability`,
      value,
    );
    if (!result.success) throw new Error(result.error.message);
  },
};
