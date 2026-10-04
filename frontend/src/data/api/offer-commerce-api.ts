import type { ID } from "@/src/core";

import { httpClient } from "./http-client";

export type CommerceProductMapping = {
  mappingId: ID;
  productId?: ID | null;
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

export type OfferCommerceConfiguration = {
  productIds: ID[];
  productMappings?: CommerceProductMapping[];
  adjustmentType:
    | "PRODUCT_FREE"
    | "PRODUCT_PERCENT_OFF"
    | "PRODUCT_FIXED_OFF"
    | "PRODUCT_SPECIAL_PRICE";
  percentage?: number;
  amountMinor?: number;
  currencyCode?: string;
  active: boolean;
};
export type OfferCommerceApplicabilityWrite = {
  adjustmentType: string;
  percentage?: number;
  amountMinor?: number;
  currencyCode?: string;
  active: boolean;
  productMappingIds: ID[];
};

export type MembershipOfferApplicability = {
  applicabilityId: ID;
  offerId: ID;
  behavior: "PURCHASE_DISCOUNT" | "UPGRADE";
  targetMembershipProductId?: ID | null;
  targetSubscriptionPlanId?: ID | null;
  sourceMembershipProductId?: ID | null;
  sourceSubscriptionPlanId?: ID | null;
  adjustmentType:
    | "PRODUCT_PERCENT_OFF"
    | "PRODUCT_FIXED_OFF"
    | "PRODUCT_SPECIAL_PRICE";
  percentage?: number | null;
  amountMinor?: number | null;
  currencyCode?: string | null;
  active: boolean;
  versionNo: number;
  customerApplicability: "ALL" | "NEW_CUSTOMER" | "EXISTING_CUSTOMER";
  membershipTargetMode:
    | "ALL_MEMBERSHIP_PRODUCTS"
    | "SELECTED_MEMBERSHIP_PRODUCTS";
  selectedMembershipProductIds: ID[];
};

export type MembershipOfferApplicabilityWrite = Omit<
  MembershipOfferApplicability,
  "applicabilityId" | "offerId" | "versionNo"
>;
export const offerCommerceApi = {
  async mappings(organizationId: ID): Promise<CommerceProductMapping[]> {
    const result = await httpClient.get<CommerceProductMapping[]>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/product-mappings`,
    );
    if (!result.success) throw new Error(result.error.message);
    // A canonical Product mapping remains usable even while its optional
    // catalog snapshot is pending or stale. Filtering snapshots here hid
    // valid Offer mappings from the same Product picker used by Benefits.
    return result.data.filter((mapping) => mapping.active);
  },

  async applicability(
    organizationId: ID,
    offerId: ID,
  ): Promise<OfferCommerceApplicability | null> {
    const result = await httpClient.get<OfferCommerceApplicability | null>(
      `/api/v1/organizations/${encodeURIComponent(
        organizationId,
      )}/offers/${encodeURIComponent(offerId)}/commerce-applicability`,
    );

    if (!result.success) {
      if (result.error.code === "EMPTY_SERVER_RESPONSE") {
        return null;
      }

      throw new Error(result.error.message);
    }

    return result.data;
  },

  async membershipApplicability(
    organizationId: ID,
    offerId: ID,
  ): Promise<MembershipOfferApplicability | null> {
    const result = await httpClient.get<MembershipOfferApplicability | null>(
      `/api/v1/organizations/${encodeURIComponent(
        organizationId,
      )}/offers/${encodeURIComponent(offerId)}/membership-applicability`,
    );

    if (!result.success) {
      if (result.error.code === "EMPTY_SERVER_RESPONSE") {
        return null;
      }

      throw new Error(result.error.message);
    }

    return result.data;
  },

  async saveMembershipApplicability(
    organizationId: ID,
    offerId: ID,
    value: MembershipOfferApplicabilityWrite,
  ): Promise<void> {
    const result = await httpClient.put<
      MembershipOfferApplicabilityWrite,
      MembershipOfferApplicability
    >(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/membership-applicability`,
      value,
    );
    if (!result.success) throw new Error(result.error.message);
  },

  async deactivateMembershipApplicability(
    organizationId: ID,
    offerId: ID,
  ): Promise<void> {
    const result = await httpClient.post<Record<string, never>, boolean>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/membership-applicability/deactivate`,
      {},
    );
    if (!result.success) throw new Error(result.error.message);
  },

  async deactivateApplicability(
    organizationId: ID,
    offerId: ID,
  ): Promise<void> {
    const result = await httpClient.post<Record<string, never>, boolean>(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/commerce-applicability/deactivate`,
      {},
    );
    if (!result.success) throw new Error(result.error.message);
  },

  async save(
    organizationId: ID,
    offerId: ID,
    value: OfferCommerceApplicabilityWrite,
  ): Promise<void> {
    const result = await httpClient.put<
      OfferCommerceApplicabilityWrite,
      OfferCommerceApplicability
    >(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/commerce-applicability`,
      value,
    );
    if (!result.success) throw new Error(result.error.message);
  },
};
