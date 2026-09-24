import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
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

function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    (Platform.OS === "web"
      ? process.env.EXPO_PUBLIC_MEMGINE_API_BASE_URL_WEB?.trim()
      : process.env.EXPO_PUBLIC_MEMGINE_API_BASE_URL_NATIVE?.trim());

  if (!configuredUrl) {
    throw new Error(
      `Memgine API base URL is not configured for platform: ${Platform.OS}`,
    );
  }

  return configuredUrl.replace(/\/+$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

const NATIVE_SESSION_KEY = "memgine.native.session";
let nativeSessionToken: string | null | undefined;

async function currentNativeSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (nativeSessionToken === undefined) {
    nativeSessionToken = await SecureStore.getItemAsync(NATIVE_SESSION_KEY);
  }
  return nativeSessionToken;
}

export async function saveNativeSessionToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") return;
  nativeSessionToken = token;
  if (token) await SecureStore.setItemAsync(NATIVE_SESSION_KEY, token);
  else await SecureStore.deleteItemAsync(NATIVE_SESSION_KEY);
}

export class HttpClient {
  async get<TResponse>(path: string): Promise<ApiResult<TResponse>> {
    return this.request<never, TResponse>("GET", path);
  }

  async post<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>> {
    return this.request<TRequest, TResponse>("POST", path, body);
  }

  async put<TRequest, TResponse>(
    path: string,
    body: TRequest,
  ): Promise<ApiResult<TResponse>> {
    return this.request<TRequest, TResponse>("PUT", path, body);
  }

  async delete<TResponse>(path: string): Promise<ApiResult<TResponse>> {
    return this.request<never, TResponse>("DELETE", path);
  }

  private async request<TRequest, TResponse>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: TRequest,
  ): Promise<ApiResult<TResponse>> {
    let response: Response;
    const nativeToken = await currentNativeSessionToken();

    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(Platform.OS !== "web" ? { "X-Memgine-Client": "native" } : {}),
          ...(nativeToken ? { "X-Memgine-Session": nativeToken } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      return apiFailure(
        "NETWORK_ERROR",
        error instanceof Error
          ? error.message
          : "Unable to reach Memgine server.",
      );
    }

    let payload: ServerApiResponse<TResponse> | null = null;

    try {
      payload = (await response.json()) as ServerApiResponse<TResponse>;
    } catch {
      // The server responded, but its response was not a valid API envelope.
    }

    if (!response.ok) {
      return apiFailure(
        payload?.error?.code ?? `HTTP_${response.status}`,
        payload?.error?.message ??
          (response.status >= 500
            ? "The server could not complete the request. Please try again."
            : "The request could not be completed."),
      );
    }

    if (!payload?.success) {
      return apiFailure(
        payload?.error?.code ?? "INVALID_SERVER_RESPONSE",
        payload?.error?.message ?? "Server request failed.",
      );
    }

    if (payload.data == null) {
      return apiFailure(
        "EMPTY_SERVER_RESPONSE",
        "The server returned an empty response.",
      );
    }

    return apiSuccess(payload.data);
  }
}

export const httpClient = new HttpClient();
