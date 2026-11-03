import { ImageBackground, Text, View, useWindowDimensions } from "react-native";
import { resolveAssetUrl } from "@/src/data/api/asset-url";
import type { ThemeExperienceConfig } from "@/src/core/theme-experience.types";
import { resolveThemeExperience } from "@/src/core/theme-experience.types";
import { getThemeArtworkAssets, resolveThemeArtwork, THEME_ARTWORK_PRESETS } from "@/src/core/theme-artwork.types";

type Props = {
  config?: Partial<ThemeExperienceConfig> | null;
  configuration?: Partial<ThemeExperienceConfig> | null;
  themeExperience?: Partial<ThemeExperienceConfig> | null;
  compact?: boolean;
  primaryColor: string;
  accentColor: string;
  textColor?: string;
  sessionKey?: string;
};

/** Full-width bounded feature: artwork NEVER becomes the background behind membership cards. */
export function ThemeFeatureSection({
  config, configuration, themeExperience, primaryColor, compact = false,
}: Props) {
  const settings = resolveThemeExperience(config ?? configuration ?? themeExperience);
  const art = resolveThemeArtwork(settings);
  const preset = THEME_ARTWORK_PRESETS[art.artPack ?? "NONE"];
  const { width } = useWindowDimensions();
  if (!settings.enabled || !settings.featureEnabled) return null;

  const assets = getThemeArtworkAssets(art.artPack);
  const customImage = resolveAssetUrl(settings.featureImageUrl);
  const source = customImage ? { uri: customImage } : assets?.featureBackground ?? null;
  const backgroundColor = art.featureBackgroundColor ?? "#FFFFFF";
  const titleColor = art.featureTextColor ?? primaryColor;
  const title = settings.featureTitle?.trim() || preset?.featureTitle || "Something special for you";
  const subtitle = settings.featureSubtitle?.trim() || preset?.featureSubtitle || "Explore what's new";
  const strip = art.featureLayout === "BANNER_STRIP";
  const height = compact ? 136 : strip ? (width < 450 ? 148 : 168) : (width < 450 ? 172 : 222);
  const textZone = (
    <View style={{ height, justifyContent: "center", alignItems: "center",
      paddingVertical: compact ? 8 : 15,
      paddingHorizontal: compact ? "31%" : "29%" }}>
      <Text numberOfLines={compact ? 2 : 3} adjustsFontSizeToFit
        style={{ textAlign: "center", color: titleColor, fontSize: compact ? 14 : width < 450 ? 20 : 30,
          lineHeight: compact ? 18 : width < 450 ? 25 : 36, fontWeight: "700" }}>
        {title}
      </Text>
      <Text numberOfLines={compact ? 2 : 3} adjustsFontSizeToFit
        style={{ textAlign: "center", color: titleColor, fontSize: compact ? 9 : width < 450 ? 11 : 14,
          lineHeight: compact ? 12 : width < 450 ? 15 : 19, marginTop: compact ? 4 : 8 }}>
        {subtitle}
      </Text>
    </View>
  );
  return (
    <View style={{ height, width: "100%", overflow: "hidden", backgroundColor }}>
      {source ? (
        <ImageBackground source={source} resizeMode="stretch"
          style={{ height, width: "100%" }}>{textZone}</ImageBackground>
      ) : textZone}
    </View>
  );
}
