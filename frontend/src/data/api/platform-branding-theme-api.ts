import type { BrandingThemeV2, PlatformBrandingThemeV2 } from "@/src/core";
import type { PickedBrandingAsset } from "@/src/core/brandingAssetPicker";
import { API_BASE_URL, httpClient } from "./http-client";

const MAX_THEME_IMAGE_BYTES = 10 * 1024 * 1024;
type Write = {
  displayName: string;
  description?: string | null;
  theme: BrandingThemeV2;
  versionNo?: number | null;
};

class PlatformBrandingThemeApi {
  listPublished() {
    return httpClient.get<PlatformBrandingThemeV2[]>("/api/v1/branding-themes");
  }
  getPublished(idOrCode: string) {
    return httpClient.get<PlatformBrandingThemeV2>(
      `/api/v1/branding-themes/${encodeURIComponent(idOrCode)}`,
    );
  }
  listAll() {
    return httpClient.get<PlatformBrandingThemeV2[]>(
      "/api/v1/platform/branding-themes",
    );
  }
  get(id: string) {
    return httpClient.get<PlatformBrandingThemeV2>(
      `/api/v1/platform/branding-themes/${encodeURIComponent(id)}`,
    );
  }
  create(body: Write) {
    return httpClient.post<Write, PlatformBrandingThemeV2>(
      "/api/v1/platform/branding-themes",
      body,
    );
  }
  saveDraft(id: string, body: Write) {
    return httpClient.put<Write, PlatformBrandingThemeV2>(
      `/api/v1/platform/branding-themes/${encodeURIComponent(id)}/draft`,
      body,
    );
  }
  publish(id: string, versionNo: number) {
    return httpClient.post<{ versionNo: number }, PlatformBrandingThemeV2>(
      `/api/v1/platform/branding-themes/${encodeURIComponent(id)}/publish`,
      { versionNo },
    );
  }
  setActive(id: string, versionNo: number, active: boolean) {
    return httpClient.put<
      { versionNo: number; active: boolean },
      PlatformBrandingThemeV2
    >(`/api/v1/platform/branding-themes/${encodeURIComponent(id)}/active`, {
      versionNo,
      active,
    });
  }

  async uploadBackgroundImage(
    themeCode: string,
    asset: PickedBrandingAsset,
  ): Promise<string> {
    const form = new FormData();
    let imageBytes: number | undefined;
    if (typeof window !== "undefined") {
      const localResponse = await fetch(asset.uri);
      if (!localResponse.ok)
        throw new Error("Unable to read the selected image.");
      const blob = await localResponse.blob();
      imageBytes = blob.size;
      if (blob.size > MAX_THEME_IMAGE_BYTES)
        throw new Error("Image must be smaller than 10 MB.");
      form.append("file", blob, asset.fileName);
    } else {
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName,
        type: asset.mimeType,
      } as any);
    }

    let response: Response;
    try {
      response = await fetch(
        `${API_BASE_URL}/api/v1/platform/branding-themes/${encodeURIComponent(themeCode)}/background-image`,
        {
          method: "POST",
          credentials: "include",
          body: form,
        },
      );
    } catch {
      // An Nginx 413 without CORS headers can surface as a fetch network error.
      // We cannot confirm the HTTP status here; give a size-specific hint only for larger files.
      if (imageBytes !== undefined && imageBytes > 1024 * 1024) {
        throw new Error(
          "Image upload failed. The server may be rejecting this image because of its upload-size limit. Please try a smaller image or contact support.",
        );
      }
      throw new Error(
        "Unable to upload the image. Please check your connection or contact support if the problem continues.",
      );
    }

    if (response.status === 413) {
      throw new Error(
        "Image upload failed — server size limit exceeded. Please try a smaller image or contact support.",
      );
    }

    // Nginx and other proxies may respond with HTML, not JSON.
    const contentType = response.headers.get("content-type") ?? "";
    let payload: {
      success?: boolean;
      data?: { path?: string };
      error?: { message?: string };
    } | null = null;
    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch {
        /* Preserve the HTTP status below. */
      }
    }
    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
          `Image upload failed (HTTP ${response.status}). Please try again.`,
      );
    }
    if (!payload?.success || !payload.data?.path) {
      throw new Error(
        payload?.error?.message ||
          "Image upload did not return an image path. Please retry.",
      );
    }
    return payload.data.path;
  }
}
export const platformBrandingThemeApi = new PlatformBrandingThemeApi();
