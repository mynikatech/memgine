import { Image, View, Text } from "react-native";
import type { ThemeExperienceConfig } from "@/src/core/theme-experience.types";
import { resolveThemeExperience } from "@/src/core/theme-experience.types";
import { getThemeArtworkAssets, resolveThemeArtwork } from "@/src/core/theme-artwork.types";
import { AnnouncementDisplay } from "@/src/experience/announcements/AnnouncementDisplay";
import type { AnnouncementConfiguration } from "@/src/experience/announcements/announcement-model";

type Props = { config?: Partial<ThemeExperienceConfig> | null; compact?: boolean };

/** Sample messages only. Production announcements remain owned by Org Admin. */
export function ThemeAnnouncementPreview({ config, compact = false }: Props) {
  const settings = resolveThemeExperience(config);
  const art = resolveThemeArtwork(settings);
  const assets = getThemeArtworkAssets(art.artPack);
  const decorated = Boolean(settings.enabled && settings.announcementEnabled && assets);
  const bg = decorated && /^#[0-9a-f]{6}$/i.test(art.announcementBackgroundColor ?? "")
    ? art.announcementBackgroundColor! : "#F3F4F6";
  const fg = decorated && /^#[0-9a-f]{6}$/i.test(art.announcementTextColor ?? "")
    ? art.announcementTextColor! : "#1F2937";
  const configuration: AnnouncementConfiguration = {
    displayMode: "CAROUSEL", rotationIntervalSeconds: 5,
    items: [
      { id: "theme-sample-a", enabled: true, displayOrder: 0, style: "FADE",
        message: "Discover exclusive seasonal offers and member rewards.", backgroundColor: bg, textColor: fg },
      { id: "theme-sample-b", enabled: true, displayOrder: 1, style: "SLIDE",
        message: "Special moments and member-only surprises await you.", backgroundColor: bg, textColor: fg },
    ],
  };
  return (
    <View style={{ position: "relative" }}>
      <AnnouncementDisplay configuration={configuration} fallbackBackground={bg}
        paddingHorizontal={decorated ? compact ? 48 : 76 : 16} paddingVertical={compact ? 10 : 18} />
      {decorated && assets ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0,
          height: compact ? 52 : 76, flexDirection: "row", justifyContent: "space-between" }}>
          <Image source={assets.announcementLeft} resizeMode="contain"
            style={{ width: compact ? 48 : 80, height: "100%" }} />
          <Image source={assets.announcementRight} resizeMode="contain"
            style={{ width: compact ? 48 : 80, height: "100%" }} />
        </View>
      ) : null}
      {!compact ? <Text style={{ fontSize: 10, color: "#64748B", marginTop: 3 }}>
        Sample announcements only — actual messages are configured by Org Admin.
      </Text> : null}
    </View>
  );
}
