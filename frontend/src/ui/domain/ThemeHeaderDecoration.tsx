import { Image, View } from "react-native";
import type { ThemeExperienceConfig } from "@/src/core/theme-experience.types";
import { resolveThemeExperience } from "@/src/core/theme-experience.types";
import { getThemeArtworkAssets, resolveThemeArtwork } from "@/src/core/theme-artwork.types";

type Props = {
  config?: Partial<ThemeExperienceConfig> | null;
  configuration?: Partial<ThemeExperienceConfig> | null;
  themeExperience?: Partial<ThemeExperienceConfig> | null;
  compact?: boolean;
  accentColor?: string;
};

/** Premium artwork on the right; never changes business name, logo, tagline or colours. */
export function ThemeHeaderDecoration({ config, configuration, themeExperience, compact = false }: Props) {
  const settings = resolveThemeExperience(config ?? configuration ?? themeExperience);
  const art = resolveThemeArtwork(settings);
  const assets = getThemeArtworkAssets(art.artPack);
  if (!settings.enabled || !settings.headerEnabled || !assets) return null;

  const width = compact ? 94 : 178;
  const height = compact ? 42 : 76;
  return (
    <View pointerEvents="none" accessible={false}
      style={{ width, height, flexShrink: 1, alignSelf: "center", justifyContent: "center" }}>
      <Image source={assets.header} resizeMode="contain"
        style={{ width: "100%", height: "100%" }} />
    </View>
  );
}
