import { httpClient } from "./http-client";
import type { ApiResult } from "./result";
import type { OrganizationProduct } from "./organization-product-api";

/** W229: Fetch only Products belonging to the selected catalog. */
export const catalogScopedProductsApi = {
  list: (
    organizationId: string,
    catalogId: string,
  ): Promise<ApiResult<OrganizationProduct[]>> =>
    httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/products?catalogId=${encodeURIComponent(catalogId)}`,
    ),
};
