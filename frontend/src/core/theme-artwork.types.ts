import type { ImageSourcePropType } from "react-native";
import type { ThemeExperienceConfig } from "./theme-experience.types";

/** W275 compatible configuration; no new database fields or migrations. */
export type ThemeArtworkPack =
  | "NONE" | "CHRISTMAS_CLASSIC" | "DIWALI_GOLD"
  | "NEW_YEAR_CELEBRATION" | "VALENTINE_ROMANCE"
  | "THANKSGIVING_HARVEST" | "CUSTOM";
export type ThemeFeatureLayout = "SEAMLESS_BACKGROUND" | "BANNER_STRIP";
export type ThemeArtworkExtensions = {
  artPack?: ThemeArtworkPack | null;
  featureLayout?: ThemeFeatureLayout | null;
  announcementBackgroundColor?: string | null;
  announcementTextColor?: string | null;
  featureBackgroundColor?: string | null;
  featureTextColor?: string | null;
};
export type ThemeArtworkExperience = ThemeExperienceConfig & ThemeArtworkExtensions;

export type ThemeArtworkAssets = {
  header: ImageSourcePropType;
  announcementLeft: ImageSourcePropType;
  announcementRight: ImageSourcePropType;
  featureBackground: ImageSourcePropType;
};

export const THEME_ARTWORK_PACKS: Partial<Record<ThemeArtworkPack, ThemeArtworkAssets>> = {
  CHRISTMAS_CLASSIC: {
    header: require("../assets/theme-packs/christmas-classic/header-right.png"),
    announcementLeft: require("../assets/theme-packs/christmas-classic/announcement-left.png"),
    announcementRight: require("../assets/theme-packs/christmas-classic/announcement-right.png"),
    featureBackground: require("../assets/theme-packs/christmas-classic/feature-seamless.png"),
  },
  DIWALI_GOLD: {
    header: require("../assets/theme-packs/diwali-gold/header-right.png"),
    announcementLeft: require("../assets/theme-packs/diwali-gold/announcement-left.png"),
    announcementRight: require("../assets/theme-packs/diwali-gold/announcement-right.png"),
    featureBackground: require("../assets/theme-packs/diwali-gold/feature-seamless.png"),
  },
  NEW_YEAR_CELEBRATION: {
    header: require("../assets/theme-packs/new-year-celebration/header-right.png"),
    announcementLeft: require("../assets/theme-packs/new-year-celebration/announcement-left.png"),
    announcementRight: require("../assets/theme-packs/new-year-celebration/announcement-right.png"),
    featureBackground: require("../assets/theme-packs/new-year-celebration/feature-seamless.png"),
  },
  VALENTINE_ROMANCE: {
    header: require("../assets/theme-packs/valentine-romance/header-right.png"),
    announcementLeft: require("../assets/theme-packs/valentine-romance/announcement-left.png"),
    announcementRight: require("../assets/theme-packs/valentine-romance/announcement-right.png"),
    featureBackground: require("../assets/theme-packs/valentine-romance/feature-seamless.png"),
  },
  THANKSGIVING_HARVEST: {
    header: require("../assets/theme-packs/thanksgiving-harvest/header-right.png"),
    announcementLeft: require("../assets/theme-packs/thanksgiving-harvest/announcement-left.png"),
    announcementRight: require("../assets/theme-packs/thanksgiving-harvest/announcement-right.png"),
    featureBackground: require("../assets/theme-packs/thanksgiving-harvest/feature-seamless.png"),
  },
};

/** Legacy export remains available to all existing Christmas components. */
export const CHRISTMAS_ART = THEME_ARTWORK_PACKS.CHRISTMAS_CLASSIC!;

export type ThemeArtworkPreset = {
  featureTitle: string;
  featureSubtitle: string;
  announcementBackgroundColor: string;
  announcementTextColor: string;
  featureBackgroundColor: string;
  featureTextColor: string;
  artStyle: ThemeExperienceConfig["artStyle"];
  animationPreset: ThemeExperienceConfig["animationPreset"];
};

export const THEME_ARTWORK_PRESETS: Partial<Record<ThemeArtworkPack, ThemeArtworkPreset>> = {
  CHRISTMAS_CLASSIC: {
    featureTitle: "Merry Christmas",
    featureSubtitle: "Celebrating joy, warmth and wonderful rewards",
    announcementBackgroundColor: "#8B0000",
    announcementTextColor: "#FFF4DE",
    featureBackgroundColor: "#FCF4E6",
    featureTextColor: "#7F1D1D",
    artStyle: "GIFT", animationPreset: "TWINKLING_LIGHTS",
  },
  DIWALI_GOLD: {
    featureTitle: "Celebrate Diwali",
    featureSubtitle: "A season of light, joy and wonderful rewards",
    announcementBackgroundColor: "#8A3412",
    announcementTextColor: "#FFF4D6",
    featureBackgroundColor: "#FFF3D7",
    featureTextColor: "#7C2D12",
    artStyle: "LIGHTS", animationPreset: "GLOW_BURST",
  },
  NEW_YEAR_CELEBRATION: {
    featureTitle: "Happy New Year",
    featureSubtitle: "New beginnings and brighter moments together",
    announcementBackgroundColor: "#14214C",
    announcementTextColor: "#FFF3CE",
    featureBackgroundColor: "#101B3C",
    featureTextColor: "#FFF0C8",
    artStyle: "STARS", animationPreset: "CONFETTI_POP",
  },
  VALENTINE_ROMANCE: {
    featureTitle: "Celebrate Together",
    featureSubtitle: "Little moments, heartfelt surprises and sweet rewards",
    announcementBackgroundColor: "#881337",
    announcementTextColor: "#FFF1F2",
    featureBackgroundColor: "#FFF0F2",
    featureTextColor: "#6B1735",
    artStyle: "HEARTS", animationPreset: "PETAL_DRIFT",
  },
  THANKSGIVING_HARVEST: {
    featureTitle: "Happy Thanksgiving",
    featureSubtitle: "Grateful for our community and the moments we share",
    announcementBackgroundColor: "#853A12",
    announcementTextColor: "#FFF5D7",
    featureBackgroundColor: "#FFEBC6",
    featureTextColor: "#743316",
    artStyle: "FLORAL", animationPreset: "PETAL_DRIFT",
  },
};

export function resolveThemeArtwork(value?: Partial<ThemeExperienceConfig> | null): ThemeArtworkExtensions {
  const v = (value ?? {}) as ThemeArtworkExtensions;
  const preset = THEME_ARTWORK_PRESETS[v.artPack ?? "NONE"];
  return {
    artPack: v.artPack ?? "NONE",
    featureLayout: v.featureLayout ?? "SEAMLESS_BACKGROUND",
    announcementBackgroundColor: v.announcementBackgroundColor ?? preset?.announcementBackgroundColor ?? null,
    announcementTextColor: v.announcementTextColor ?? preset?.announcementTextColor ?? null,
    featureBackgroundColor: v.featureBackgroundColor ?? preset?.featureBackgroundColor ?? null,
    featureTextColor: v.featureTextColor ?? preset?.featureTextColor ?? null,
  };
}

export function getThemeArtworkAssets(pack: ThemeArtworkPack | null | undefined): ThemeArtworkAssets | null {
  return pack ? THEME_ARTWORK_PACKS[pack] ?? null : null;
}
