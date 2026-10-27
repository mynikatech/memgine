import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type OrganizationProductCatalog = {
  productCatalogId: string;
  organizationId: string;
  integrationConfigurationId?: string | null;
  integrationName?: string | null;
  provider?: string | null;
  catalogName: string;
  description?: string | null;
  externalCatalogId?: string | null;
  active: boolean;
  sourceUpdatedAt?: string | null;
  lastSyncedAt?: string | null;
  versionNo: number;
};
export type OrganizationProduct = {
  productId: string;
  organizationId: string;
  productCatalogId?: string | null;
  catalogName?: string | null;
  integrationConfigurationId?: string | null;
  integrationName?: string | null;
  productCatalogCategoryId?: string | null;
  categoryName?: string | null;
  productCode: string;
  productName: string;
  description?: string | null;
  shortCode?: string | null;
  sku?: string | null;
  upc?: string | null;
  basePriceMinor?: number | null;
  currencyCode?: string | null;
  active: boolean;
  externalProductIds?: string | null;
  versionNo: number;
};
export type OrganizationCommerceProductSnapshot = {
  snapshotId: string;
  externalProductId: string;
  externalVariantId?: string | null;
  externalSku?: string | null;
  productName: string;
  description?: string | null;
  currencyCode: string;
  unitPriceMinorSnapshot: number;
  active: boolean;
  externalCategories?: CommerceCatalogSyncExternalCategory[];
  categoryMetadataAvailable?: boolean;
};
export type OrganizationCommerceProductMapping = {
  mappingId: string;
  productId?: string | null;
  integrationConfigurationId: string;
  storeId?: string | null;
  externalCatalogId?: string | null;
  externalProductId: string;
  externalVariantId?: string | null;
  externalSku?: string | null;
  active: boolean;
  snapshot?: OrganizationCommerceProductSnapshot | null;
};
export type ProductImportRow = {
  rowNumber: number;
  productId?: string;
  externalProductId?: string;
  productCode: string;
  productName: string;
  sku?: string;
  upc?: string;
  description?: string;
  categoryExternalId?: string;
  categoryName?: string;
  basePriceMinor: number;
  currencyCode: string;
  active: boolean;
};
export type ProductImportRequest = {
  productCatalogId: string;
  fileName: string;
  rows: ProductImportRow[];
};
export type ProductImportPreview = {
  rowNumber: number;
  classification: "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
  productId?: string | null;
  reason?: string | null;
};
export type CommerceCatalogSyncAttributes = {
  externalSku?: string | null;
  productName: string;
  description?: string | null;
  currencyCode: string;
  unitPriceMinor: number;
  active: boolean;
  sourceUpdatedAt?: string | null;
};
export type CommerceCatalogSyncExternalCategory = {
  externalCategoryId: string;
  categoryName?: string | null;
  parentExternalCategoryId?: string | null;
};
export type CommerceCatalogSyncPreviewRow = {
  rowId: string;
  externalProductId: string;
  externalVariantId?: string | null;
  externalSku?: string | null;
  productName: string;
  currencyCode: string;
  unitPriceMinor: number;
  active: boolean;
  canonicalProductId?: string | null;
  mappingId?: string | null;
  action:
    | "NEW"
    | "MATCHED"
    | "UPDATE"
    | "UNCHANGED"
    | "INACTIVE"
    | "MISSING"
    | "CONFLICT"
    | "INVALID";
  reason?: string | null;
  hasDependentBusinessRules: boolean;
  eligibleForApply: boolean;
  previousAttributes?: CommerceCatalogSyncAttributes | null;
  proposedAttributes?: CommerceCatalogSyncAttributes | null;
  externalCategories?: CommerceCatalogSyncExternalCategory[];
  categoryMetadataAvailable?: boolean;
};
export type CommerceCatalogSyncPreview = {
  previewId: string;
  organizationId: string;
  integrationConfigurationId: string;
  productCatalogId: string;
  storeId?: string | null;
  status: string;
  fullCatalogComplete: boolean;
  rows: CommerceCatalogSyncPreviewRow[];
  summary: Record<string, number>;
};
export type CommerceCatalogSyncApplyResult = {
  previewId: string;
  status: string;
  createdCount: number;
  appliedCount: number;
  mappedCount: number;
};
export type CommerceCatalogCategoryCorrespondence = {
  correspondenceId: string;
  externalCategoryId: string;
  productCatalogCategoryId: string;
  versionNo: number;
};
export type CommerceCatalogCategoryCorrespondenceWrite = {
  externalCategoryId: string;
  externalCategoryName?: string | null;
  externalParentCategoryId?: string | null;
  productCatalogCategoryId: string;
  versionNo?: number | null;
};
export const organizationProductApi = {
  catalogs: (
    organizationId: string,
  ): Promise<ApiResult<OrganizationProductCatalog[]>> =>
    httpClient.get(`/api/v1/organizations/${organizationId}/products/catalogs`),
  products: (
    organizationId: string,
    search?: string,
  ): Promise<ApiResult<OrganizationProduct[]>> =>
    httpClient.get(
      `/api/v1/organizations/${organizationId}/products${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),
  mappings: (
    organizationId: string,
  ): Promise<ApiResult<OrganizationCommerceProductMapping[]>> =>
    httpClient.get(
      `/api/v1/organizations/${organizationId}/commerce/product-mappings`,
    ),
  deactivateMapping: (
    organizationId: string,
    mappingId: string,
  ): Promise<ApiResult<boolean>> =>
    httpClient.delete(
      `/api/v1/organizations/${organizationId}/commerce/product-mappings/${encodeURIComponent(mappingId)}`,
    ),
  resolveMapping: (
    organizationId: string,
    productId: string,
    selectedMappingId: string,
  ): Promise<ApiResult<boolean>> =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/commerce/products/${encodeURIComponent(productId)}/resolve-mapping`,
      { selectedMappingId },
    ),
  saveCatalog: (
    organizationId: string,
    body: Partial<OrganizationProductCatalog>,
  ): Promise<ApiResult<OrganizationProductCatalog>> =>
    body.productCatalogId
      ? httpClient.put(
          `/api/v1/organizations/${organizationId}/products/catalogs/${body.productCatalogId}`,
          body,
        )
      : httpClient.post(
          `/api/v1/organizations/${organizationId}/products/catalogs`,
          body,
        ),
  saveProduct: (
    organizationId: string,
    body: Partial<OrganizationProduct> & { externalProductId?: string },
  ): Promise<ApiResult<OrganizationProduct>> =>
    body.productId
      ? httpClient.put(
          `/api/v1/organizations/${organizationId}/products/${body.productId}`,
          body,
        )
      : httpClient.post(
          `/api/v1/organizations/${organizationId}/products`,
          body,
        ),
  preview: (
    organizationId: string,
    body: ProductImportRequest,
  ): Promise<ApiResult<ProductImportPreview[]>> =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/products/imports/preview`,
      body,
    ),
  commit: (organizationId: string, body: ProductImportRequest) =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/products/imports/commit`,
      body,
    ),
  previewPosCatalog: (
    organizationId: string,
    integrationConfigurationId: string,
    body: { productCatalogId: string; storeId?: string | null },
  ): Promise<ApiResult<CommerceCatalogSyncPreview>> =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/commerce/integrations/${encodeURIComponent(integrationConfigurationId)}/catalog-sync/preview`,
      body,
    ),
  applyPosCatalogSync: (
    organizationId: string,
    previewId: string,
    body: { approved: boolean; idempotencyKey: string },
  ): Promise<ApiResult<CommerceCatalogSyncApplyResult>> =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/commerce/catalog-sync/${encodeURIComponent(previewId)}/apply`,
      body,
    ),
  partialApplyPosCatalogSync: (
    organizationId: string,
    previewId: string,
    body: { approved: boolean; idempotencyKey: string; rowIds: string[] },
  ): Promise<ApiResult<CommerceCatalogSyncApplyResult>> =>
    httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/catalog-sync/${encodeURIComponent(previewId)}/partial-apply`,
      body,
    ),

  resolvePosCatalogBulk: (
    organizationId: string,
    previewId: string,
    body: {
      selections: Array<{
        rowId: string;
        canonicalProductId: string;
        expectedCanonicalProductVersionNo: number;
      }>;
    },
  ): Promise<ApiResult<{ resolvedCount: number }>> =>
    httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/catalog-sync/${encodeURIComponent(previewId)}/bulk-resolve`,
      body,
    ),
  resolvePosCatalogConflict: (
    organizationId: string,
    previewId: string,
    rowId: string,
    body: {
      canonicalProductId: string;
      expectedCanonicalProductVersionNo: number;
    },
  ): Promise<ApiResult<boolean>> =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/commerce/catalog-sync/${encodeURIComponent(previewId)}/rows/${encodeURIComponent(rowId)}/resolve`,
      body,
    ),
  categoryCorrespondences: (
    organizationId: string,
    integrationId: string,
    catalogId: string,
  ): Promise<ApiResult<CommerceCatalogCategoryCorrespondence[]>> =>
    httpClient.get(
      `/api/v1/organizations/${organizationId}/commerce/integrations/${encodeURIComponent(integrationId)}/catalogs/${encodeURIComponent(catalogId)}/category-correspondences`,
    ),
  saveCategoryCorrespondence: (
    organizationId: string,
    integrationId: string,
    catalogId: string,
    body: CommerceCatalogCategoryCorrespondenceWrite,
  ): Promise<ApiResult<string>> =>
    httpClient.post(
      `/api/v1/organizations/${organizationId}/commerce/integrations/${encodeURIComponent(integrationId)}/catalogs/${encodeURIComponent(catalogId)}/category-correspondences`,
      body,
    ),
  deactivateCategoryCorrespondence: (
    organizationId: string,
    correspondenceId: string,
    versionNo: number,
  ): Promise<ApiResult<boolean>> =>
    httpClient.delete(
      `/api/v1/organizations/${organizationId}/commerce/category-correspondences/${encodeURIComponent(correspondenceId)}?versionNo=${encodeURIComponent(String(versionNo))}`,
    ),
};
