import * as ImagePicker from "expo-image-picker";

export type BrandingAssetType =
  | "logo"
  | "darkThemeLogo"
  | "favicon"
  | "splashScreen";

export type PickBrandingAssetOptions = {
  assetType: BrandingAssetType;
};

function getPickerOptions(
  assetType: BrandingAssetType,
): ImagePicker.ImagePickerOptions {
  const isFavicon = assetType === "favicon";

  return {
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    allowsEditing: isFavicon,
    aspect: isFavicon ? [1, 1] : undefined,
    quality: 0.8,
    base64: true,
  };
}

/**
 * Temporary local asset implementation.
 *
 * The selected image is converted into a data URI so that the existing
 * OrganizationBranding URL fields can continue to hold the asset value
 * without changing the physical data model.
 *
 * This is intentionally temporary. Once the server/S3 upload service
 * exists, this function becomes the boundary where the selected image
 * is uploaded and the returned remote URL/object reference is stored.
 */
export async function pickBrandingAsset(
  options: PickBrandingAssetOptions,
): Promise<string | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync(
    getPickerOptions(options.assetType),
  );

  if (result.canceled || !result.assets.length) {
    return undefined;
  }

  const asset = result.assets[0];

  if (!asset.base64) {
    throw new Error("Unable to read the selected image.");
  }

  const mimeType = asset.mimeType || "image/jpeg";

  return `data:${mimeType};base64,${asset.base64}`;
}
