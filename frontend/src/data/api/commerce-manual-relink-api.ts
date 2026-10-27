import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type CommerceManualRelinkPreview = {
  mappingId: string;
  organizationId: string;
  storeId: string;
  integrationConfigurationId: string;
  externalCatalogId: string;
  externalProductId: string;
  externalVariantId?: string | null;
  externalSku?: string | null;
  expectedMappingVersionNo: number;
  currentProductId: string;
  currentProductName: string;
  targetProductId: string;
  targetProductName: string;
  targetProductVersionNo: number;
  alreadyLinked: boolean;
  pendingCatalogPreviewCount: number;
  warning: string;
};
export type CommerceManualRelinkResult = {
  changed: boolean;
  mappingId: string;
  previousProductId?: string;
  productId: string;
  versionNo: number;
  auditId?: string;
};
export type CommerceManualRelinkCandidate = {
  productId: string;
  organizationId: string;
  productName: string;
  productCode: string;
  sku?: string | null;
  catalogId: string;
  catalogName: string;
  categoryId?: string | null;
  categoryName?: string | null;
  basePriceMinor?: number | null;
  currencyCode?: string | null;
  versionNo: number;
};
export const commerceManualRelinkApi = {
  candidates: (
    org: string,
    mappingId: string,
    search: string,
  ): Promise<ApiResult<CommerceManualRelinkCandidate[]>> =>
    httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(org)}/commerce/product-mappings/${encodeURIComponent(mappingId)}/relink-candidates?search=${encodeURIComponent(search)}`,
    ),
  preview: (
    org: string,
    mappingId: string,
    targetProductId: string,
  ): Promise<ApiResult<CommerceManualRelinkPreview>> =>
    httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(org)}/commerce/product-mappings/${encodeURIComponent(mappingId)}/relink-preview`,
      { targetProductId },
    ),
  confirm: (
    org: string,
    mappingId: string,
    payload: {
      targetProductId: string;
      expectedMappingVersionNo: number;
      expectedTargetProductVersionNo: number;
      reason: string;
    },
  ): Promise<ApiResult<CommerceManualRelinkResult>> =>
    httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(org)}/commerce/product-mappings/${encodeURIComponent(mappingId)}/relink-confirm`,
      payload,
    ),
};
