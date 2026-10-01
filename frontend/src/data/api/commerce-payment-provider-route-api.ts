import type {
  CommercePaymentProviderRoute,
  CommercePaymentProviderRouteWrite,
  ID,
} from "@/src/core";

import { httpClient } from "./http-client";
import { apiFailure, type ApiResult } from "./result";

export class CommercePaymentProviderRouteApi {
  private path(organizationId: ID) {
    return `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/payment-provider-routes`;
  }

  list(
    organizationId: ID,
    storeId?: ID | null,
  ): Promise<ApiResult<CommercePaymentProviderRoute[]>> {
    const suffix = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return httpClient.get(`${this.path(organizationId)}${suffix}`);
  }

  create(
    organizationId: ID,
    route: CommercePaymentProviderRouteWrite,
  ): Promise<ApiResult<CommercePaymentProviderRoute>> {
    return httpClient.post(this.path(organizationId), route);
  }

  update(
    organizationId: ID,
    routeId: ID,
    route: CommercePaymentProviderRouteWrite,
  ): Promise<ApiResult<CommercePaymentProviderRoute>> {
    return httpClient.put(`${this.path(organizationId)}/${encodeURIComponent(routeId)}`, route);
  }

  async remove(
    organizationId: ID,
    routeId: ID,
    versionNo: number,
  ): Promise<ApiResult<void>> {
    const result = await httpClient.delete<boolean>(
      `${this.path(organizationId)}/${encodeURIComponent(routeId)}?versionNo=${versionNo}`,
    );
    if (!result.success) return result;
    return result.data ? { success: true, data: undefined } : apiFailure(
      "PAYMENT_PROVIDER_ROUTE_DELETE_FAILED",
      "Payment provider route was not deleted.",
    );
  }
}
