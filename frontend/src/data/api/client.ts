import type { ApiResult } from "./result";

/**
 * Transport boundary owned by the UI application layer.
 *
 * Today this boundary is local.
 * Later it can be implemented using HTTP without changing
 * repositories or screens.
 */
export interface ApiClient {
  get<T>(path: string): Promise<ApiResult<T>>;

  put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>>;
}
