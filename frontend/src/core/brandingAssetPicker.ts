import * as ImagePicker from "expo-image-picker";

export type BrandingAssetType =
  | "logo"
  | "darkThemeLogo"
  | "favicon"
  | "splashScreen"
  | "heroImage"
  | "offerPromotion";

export type PickBrandingAssetOptions = {
  assetType: BrandingAssetType;
};

export type PickedBrandingAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
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
    base64: false,
  };
}

function getDefaultExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";

    case "image/webp":
      return "webp";

    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

export async function pickBrandingAsset(
  options: PickBrandingAssetOptions,
): Promise<PickedBrandingAsset | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync(
    getPickerOptions(options.assetType),
  );

  if (result.canceled || !result.assets.length) {
    return undefined;
  }

  const asset = result.assets[0];

  if (!asset.uri) {
    throw new Error("Unable to read the selected image.");
  }

  const mimeType = asset.mimeType || "image/jpeg";

  const fileName =
    asset.fileName ||
    `${options.assetType}-${Date.now()}.${getDefaultExtension(mimeType)}`;

  return {
    uri: asset.uri,
    fileName,
    mimeType,
  };
}
