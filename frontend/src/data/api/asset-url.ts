import { API_BASE_URL } from "./http-client";

/**
 * Resolves a persisted Memgine API asset path immediately before rendering.
 * Persisted domain values remain environment-neutral API-relative paths.
 */
export function resolveAssetUrl(value?: string | null): string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue.startsWith("/api/")) {
    return `${API_BASE_URL}${normalizedValue}`;
  }

  return normalizedValue;
}
