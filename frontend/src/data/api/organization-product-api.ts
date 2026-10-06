import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type OrganizationProductCatalog = { productCatalogId:string; organizationId:string; integrationConfigurationId?:string|null; integrationName?:string|null; provider?:string|null; catalogName:string; description?:string|null; externalCatalogId?:string|null; active:boolean; sourceUpdatedAt?:string|null; lastSyncedAt?:string|null; versionNo:number };
export type OrganizationProduct = { productId:string; organizationId:string; productCatalogId?:string|null; catalogName?:string|null; integrationConfigurationId?:string|null; integrationName?:string|null; productCatalogCategoryId?:string|null; categoryName?:string|null; productCode:string; productName:string; description?:string|null; shortCode?:string|null; sku?:string|null; upc?:string|null; basePriceMinor?:number|null; currencyCode?:string|null; active:boolean; externalProductIds?:string|null; versionNo:number };
export type OrganizationCommerceProductMapping = { mappingId:string; productId?:string|null; integrationConfigurationId:string; storeId?:string|null; externalProductId:string; externalSku?:string|null; active:boolean };
export type ProductImportRow = { rowNumber:number; productId?:string; externalProductId?:string; productCode:string; productName:string; sku?:string; upc?:string; description?:string; categoryExternalId?:string; categoryName?:string; basePriceMinor:number; currencyCode:string; active:boolean };
export type ProductImportRequest = { productCatalogId:string; fileName:string; rows:ProductImportRow[] };
export type ProductImportPreview = { rowNumber:number; classification:"NEW"|"UPDATE"|"UNCHANGED"|"ERROR"; productId?:string|null; reason?:string|null };
export const organizationProductApi={
 catalogs:(organizationId:string):Promise<ApiResult<OrganizationProductCatalog[]>>=>httpClient.get(`/api/v1/organizations/${organizationId}/products/catalogs`),
 products:(organizationId:string,search?:string):Promise<ApiResult<OrganizationProduct[]>>=>httpClient.get(`/api/v1/organizations/${organizationId}/products${search?`?search=${encodeURIComponent(search)}`:""}`),
 mappings:(organizationId:string):Promise<ApiResult<OrganizationCommerceProductMapping[]>>=>httpClient.get(`/api/v1/organizations/${organizationId}/commerce/product-mappings`),
 deactivateMapping:(organizationId:string,mappingId:string):Promise<ApiResult<boolean>>=>httpClient.delete(`/api/v1/organizations/${organizationId}/commerce/product-mappings/${encodeURIComponent(mappingId)}`),
 saveCatalog:(organizationId:string,body:Partial<OrganizationProductCatalog>):Promise<ApiResult<OrganizationProductCatalog>>=>body.productCatalogId?httpClient.put(`/api/v1/organizations/${organizationId}/products/catalogs/${body.productCatalogId}`,body):httpClient.post(`/api/v1/organizations/${organizationId}/products/catalogs`,body),
 saveProduct:(organizationId:string,body:Partial<OrganizationProduct>&{externalProductId?:string}):Promise<ApiResult<OrganizationProduct>>=>body.productId?httpClient.put(`/api/v1/organizations/${organizationId}/products/${body.productId}`,body):httpClient.post(`/api/v1/organizations/${organizationId}/products`,body),
 preview:(organizationId:string,body:ProductImportRequest):Promise<ApiResult<ProductImportPreview[]>>=>httpClient.post(`/api/v1/organizations/${organizationId}/products/imports/preview`,body),
 commit:(organizationId:string,body:ProductImportRequest)=>httpClient.post(`/api/v1/organizations/${organizationId}/products/imports/commit`,body),
};
