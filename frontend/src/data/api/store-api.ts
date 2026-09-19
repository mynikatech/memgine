import type { ID, Store } from "@/src/core";
import { apiFailure, apiSuccess, type ApiResult } from "./result";
import { httpClient } from "./http-client";
import { entityStatusApi } from "./entity-status-api";
import {
  StoreApiMapper,
  type CreateStoreApiRequest,
  type DeleteStoreServerResponse,
  type StoreServerDto,
  type UpdateStoreApiRequest,
} from "./mappers/store-api-mapper";

export class StoreApi {
  private async fromServer(dto: StoreServerDto): Promise<Store> {
    const storeStatusId = await entityStatusApi.resolveStatusId(
      dto.storeStatusId,
    );

    return StoreApiMapper.fromServer({
      ...dto,
      storeStatusId,
    });
  }
  async list(organizationId: ID): Promise<ApiResult<Store[]>> {
    const result = await httpClient.get<StoreServerDto[]>(
      `/api/v1/organizations/${organizationId}/stores`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    const stores = await Promise.all(
      result.data.map((dto) => this.fromServer(dto)),
    );

    return apiSuccess(stores);
  }

  async listForCustomer(organizationId: ID, userId: ID): Promise<ApiResult<Store[]>> {
    const result = await httpClient.get<StoreServerDto[]>(
      `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}/stores`,
    );
    if (!result.success) return apiFailure(result.error.code, result.error.message);
    return apiSuccess(await Promise.all(result.data.map((dto) => this.fromServer(dto))));
  }

  async get(organizationId: ID, storeId: ID): Promise<ApiResult<Store>> {
    const result = await httpClient.get<StoreServerDto>(
      `/api/v1/organizations/${organizationId}/stores/${storeId}`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(await this.fromServer(result.data));
  }

  async create(organizationId: ID, store: Store): Promise<ApiResult<Store>> {
    const storeStatusId = await entityStatusApi.resolveEntityStatusId(
      "STORE",
      store.storeStatusId,
    );

    const request = StoreApiMapper.toCreateRequest({
      ...store,
      storeStatusId,
    });

    const result = await httpClient.post<CreateStoreApiRequest, StoreServerDto>(
      `/api/v1/organizations/${organizationId}/stores`,
      request,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(await this.fromServer(result.data));
  }

  async update(organizationId: ID, store: Store): Promise<ApiResult<Store>> {
    const storeStatusId = await entityStatusApi.resolveEntityStatusId(
      "STORE",
      store.storeStatusId,
    );

    const request = StoreApiMapper.toUpdateRequest({
      ...store,
      storeStatusId,
    });

    const result = await httpClient.put<UpdateStoreApiRequest, StoreServerDto>(
      `/api/v1/organizations/${organizationId}/stores/${store.id}`,
      request,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(await this.fromServer(result.data));
  }

  async delete(organizationId: ID, storeId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<DeleteStoreServerResponse>(
      `/api/v1/organizations/${organizationId}/stores/${storeId}`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    if (!result.data.deleted) {
      return apiFailure("STORE_NOT_DELETED", "Store could not be deleted.");
    }

    return apiSuccess(undefined);
  }
}
