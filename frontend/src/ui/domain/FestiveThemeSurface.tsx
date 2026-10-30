import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { ChristmasRibbonOrnament, FestiveMotif, festivePalette } from "./FestiveArtwork";

/** Fixed artwork identities keyed by the six seeded published theme codes. */
export type FestiveThemeId = "CLASSIC" | "CHRISTMAS" | "DIWALI" | "NEW_YEAR" | "VALENTINES" | "THANKSGIVING";
export function festiveThemeId(code?: string | null): FestiveThemeId {
  const normalized = (code ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (normalized === "CHRISTMAS") return "CHRISTMAS";
  if (normalized === "DIWALI") return "DIWALI";
  if (normalized === "NEW_YEAR") return "NEW_YEAR";
  if (normalized === "VALENTINES_DAY") return "VALENTINES";
  if (normalized === "THANKSGIVING") return "THANKSGIVING";
  return "CLASSIC";
}
export function festiveRibbonPalette(theme: FestiveThemeId) {
  return theme === "CLASSIC" ? null : { background: festivePalette[theme].ribbon, foreground: festivePalette[theme].ribbonText };
}
/** Never captures pointer events and never changes content layout or control styles. */
export function FestiveSurface({ theme, children, accent, kind = "card", style }: {
  theme: FestiveThemeId;
  children: ReactNode;
  accent: string;
  kind?: "page" | "header" | "hero" | "membership" | "benefit" | "offer" | "card" | "nav" | "ribbon";
  style?: ViewStyle;
}) {
  // Festive decoration is intentionally limited to the hero image.
  // All other surfaces, including page, header, benefit, navigation and
  // membership wrappers, preserve their original layouts and backgrounds.
  if (theme === "CLASSIC" || kind !== "hero") {
    return <View style={style}>{children}</View>;
  }
  return <View style={[{ position: "relative" }, style]}>
    {children}
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 42, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: -10, left: -8 }}>
        <FestiveMotif theme={theme} size={52} opacity={0.78} />
      </View>
      <View style={{ position: "absolute", top: -10, right: -8, transform: [{ scaleX: -1 }] }}>
        <FestiveMotif theme={theme} size={52} opacity={0.78} />
      </View>
    </View>
  </View>;
}

/** Christmas gift-and-bow ornaments are code-owned; the text remains in AnnouncementItem. */
export function FestiveRibbonFrame({ theme, accent, children }: {
  theme: FestiveThemeId; accent: string; children: ReactNode;
}) {
  if (theme === "CLASSIC") return <>{children}</>;
  const p = festivePalette[theme];
  return <View style={{ position: "relative", overflow: "hidden", borderRadius: 18, borderWidth: 1.5, borderColor: p.gold, shadowColor: p.ink, shadowOpacity: 0.18, shadowRadius: 7, elevation: 3 }}>
    {children}
    <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, backgroundColor: p.gold }} />
      <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 4, backgroundColor: p.gold }} />
      <View style={{ position: "absolute", left: 8, top: 0, bottom: 0, justifyContent: "center" }}>
        {theme === "CHRISTMAS" ? <ChristmasRibbonOrnament side="gift" /> : <FestiveMotif theme={theme} size={48} />}
      </View>
      <View style={{ position: "absolute", right: 8, top: 0, bottom: 0, justifyContent: "center" }}>
        {theme === "CHRISTMAS" ? <ChristmasRibbonOrnament side="bow" /> : <FestiveMotif theme={theme} size={48} />}
      </View>
      <View style={{ position: "absolute", top: 3, bottom: 3, left: 62, right: 62, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.gold, opacity: 0.55 }} />
    </View>
  </View>;
}
