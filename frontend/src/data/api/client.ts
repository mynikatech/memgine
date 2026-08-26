import type { ApiResult } from "./result";

/**
 * Transport boundary owned by the UI application layer.
 *
 * The current implementation is local. A future HTTP client can implement
 * this same contract without changing repositories or screens.
 */
export interface ApiClient {
  get<T>(path: string): Promise<ApiResult<T>>;
  put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>>;
}
