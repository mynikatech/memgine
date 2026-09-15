import type { ApiResult } from "./result";

/**
 * Transport boundary owned by the UI application layer.
 */
export interface ApiClient {
  get<T>(path: string): Promise<ApiResult<T>>;

  post<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>>;

  put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>>;
}
