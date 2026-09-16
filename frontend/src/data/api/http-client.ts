import { apiFailure, apiSuccess, type ApiResult } from "./result";

type ServerApiResponse<T> = {
  success: boolean;
  data?: T | null;
  error?: {
    code: string;
    message: string;
  } | null;
  requestId?: string | null;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_MEMGINE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? "http://localhost:8082"
    : "http://10.0.2.2:8082");

export class HttpClient {
  async get<TResponse>(path: string): Promise<ApiResult<TResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json()) as ServerApiResponse<TResponse>;

      if (!response.ok || !payload.success || payload.data == null) {
        return apiFailure(
          payload.error?.code ?? `HTTP_${response.status}`,
          payload.error?.message ?? "Server request failed.",
        );
      }

      return apiSuccess(payload.data);
    } catch (error) {
      return apiFailure(
        "NETWORK_ERROR",
        error instanceof Error
          ? error.message
          : "Unable to reach Memgine server.",
      );
    }
  }
  async post<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>> {
    return this.send<TRequest, TResponse>("POST", path, body);
  }

  async put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>> {
    return this.send<TRequest, TResponse>("PUT", path, body);
  }

  async delete<TResponse>(path: string): Promise<ApiResult<TResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json()) as ServerApiResponse<TResponse>;

      if (!response.ok || !payload.success || payload.data == null) {
        return apiFailure(
          payload.error?.code ?? `HTTP_${response.status}`,
          payload.error?.message ?? "Server request failed.",
        );
      }

      return apiSuccess(payload.data);
    } catch (error) {
      return apiFailure(
        "NETWORK_ERROR",
        error instanceof Error
          ? error.message
          : "Unable to reach Memgine server.",
      );
    }
  }

  private async send<TRequest, TResponse>(
    method: "POST" | "PUT",
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>> {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as ServerApiResponse<TResponse>;

      if (!response.ok || !payload.success || payload.data == null) {
        return apiFailure(
          payload.error?.code ?? `HTTP_${response.status}`,
          payload.error?.message ?? "Server request failed.",
        );
      }

      return apiSuccess(payload.data);
    } catch (error) {
      return apiFailure(
        "NETWORK_ERROR",
        error instanceof Error
          ? error.message
          : "Unable to reach Memgine server.",
      );
    }
  }
}

export const httpClient = new HttpClient();
