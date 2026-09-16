import type {
  BrandingAssetType,
  PickedBrandingAsset,
} from "@/src/core/brandingAssetPicker";
import { Platform } from "react-native";

import { API_BASE_URL } from "./http-client";

type ServerApiResponse<T> = {
  success: boolean;

  data?: T | null;

  error?: {
    code: string;
    message: string;
  } | null;

  requestId?: string | null;
};

export type BrandingAssetUploadResponse = {
  path: string;
};

export class BrandingAssetApi {
  async upload(
    organizationId: string,
    assetType: BrandingAssetType,
    asset: PickedBrandingAsset,
  ): Promise<BrandingAssetUploadResponse> {
    const formData = new FormData();

    formData.append("assetType", assetType);

    /*
     * Expo Web requires an actual Blob/File in FormData.
     *
     * React Native requires the standard
     * { uri, name, type } representation.
     */
    if (Platform.OS === "web") {
      const assetResponse = await fetch(asset.uri);

      if (!assetResponse.ok) {
        throw new Error("Unable to read the selected image.");
      }

      const blob = await assetResponse.blob();

      formData.append("file", blob, asset.fileName);
    } else {
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName,
        type: asset.mimeType,
      } as any);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/branding-assets/${encodeURIComponent(
          organizationId,
        )}`,
        {
          method: "POST",
          body: formData,
        },
      );

      const payload =
        (await response.json()) as ServerApiResponse<BrandingAssetUploadResponse>;

      if (!response.ok || !payload.success || !payload.data?.path) {
        throw new Error(
          payload.error?.message ??
            `Unable to upload branding asset (${response.status}).`,
        );
      }

      return payload.data;
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Unable to upload branding asset.",
      );
    }
  }
}

export const brandingAssetApi = new BrandingAssetApi();
