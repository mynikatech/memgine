import type { BrandingThemeV2, PlatformBrandingThemeV2 } from "@/src/core";
import type { PickedBrandingAsset } from "@/src/core/brandingAssetPicker";
import { API_BASE_URL, httpClient } from "./http-client";

type Write = { displayName: string; description?: string | null; theme: BrandingThemeV2; versionNo?: number | null };

class PlatformBrandingThemeApi {
  listPublished() { return httpClient.get<PlatformBrandingThemeV2[]>("/api/v1/branding-themes"); }
  getPublished(idOrCode: string) { return httpClient.get<PlatformBrandingThemeV2>(`/api/v1/branding-themes/${encodeURIComponent(idOrCode)}`); }
  listAll() { return httpClient.get<PlatformBrandingThemeV2[]>("/api/v1/platform/branding-themes"); }
  get(id: string) { return httpClient.get<PlatformBrandingThemeV2>(`/api/v1/platform/branding-themes/${encodeURIComponent(id)}`); }
  create(body: Write) { return httpClient.post<Write, PlatformBrandingThemeV2>("/api/v1/platform/branding-themes", body); }
  saveDraft(id: string, body: Write) { return httpClient.put<Write, PlatformBrandingThemeV2>(`/api/v1/platform/branding-themes/${encodeURIComponent(id)}/draft`, body); }
  publish(id: string, versionNo: number) { return httpClient.post<{ versionNo: number }, PlatformBrandingThemeV2>(`/api/v1/platform/branding-themes/${encodeURIComponent(id)}/publish`, { versionNo }); }
  setActive(id: string, versionNo: number, active: boolean) { return httpClient.put<{ versionNo: number; active: boolean }, PlatformBrandingThemeV2>(`/api/v1/platform/branding-themes/${encodeURIComponent(id)}/active`, { versionNo, active }); }
  async uploadBackgroundImage(themeCode: string, asset: PickedBrandingAsset): Promise<string> {
    const form = new FormData();
    if (typeof window !== "undefined") {
      const response = await fetch(asset.uri);
      form.append("file", await response.blob(), asset.fileName);
    } else {
      form.append("file", { uri: asset.uri, name: asset.fileName, type: asset.mimeType } as any);
    }
    const response = await fetch(`${API_BASE_URL}/api/v1/platform/branding-themes/${encodeURIComponent(themeCode)}/background-image`, { method: "POST", credentials: "include", body: form });
    const payload = await response.json() as { success?: boolean; data?: { path?: string }; error?: { message?: string } };
    if (!response.ok || !payload.success || !payload.data?.path) throw new Error(payload.error?.message || "Unable to upload theme image.");
    return payload.data.path;
  }
}
export const platformBrandingThemeApi = new PlatformBrandingThemeApi();
