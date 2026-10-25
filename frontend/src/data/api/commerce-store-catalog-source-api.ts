import type {
  CommerceStoreCatalogSourceConfiguration,
  CommerceStoreCatalogSourceWrite,
  ID,
} from "@/src/core";

import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export class CommerceStoreCatalogSourceApi {
  private path(organizationId: ID, storeId: ID) {
    return `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/stores/${encodeURIComponent(storeId)}/catalog-source`;
  }

  get(
    organizationId: ID,
    storeId: ID,
  ): Promise<ApiResult<CommerceStoreCatalogSourceConfiguration>> {
    return httpClient.get(this.path(organizationId, storeId));
  }

  save(
    organizationId: ID,
    storeId: ID,
    body: CommerceStoreCatalogSourceWrite,
  ): Promise<ApiResult<CommerceStoreCatalogSourceConfiguration>> {
    return httpClient.put(this.path(organizationId, storeId), body);
  }
}
