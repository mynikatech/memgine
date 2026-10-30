import type { ReactNode } from "react";
import { View, Text, type ViewStyle } from "react-native";

/** Fixed, code-owned decoration identities. Colours remain provided by published branding. */
export type FestiveThemeId = "CLASSIC" | "CHRISTMAS" | "DIWALI" | "NEW_YEAR" | "VALENTINES" | "THANKSGIVING";
export function festiveThemeId(code?: string | null): FestiveThemeId {
  const normalized = (code ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (normalized.includes("CHRISTMAS")) return "CHRISTMAS";
  if (normalized.includes("DIWALI")) return "DIWALI";
  if (normalized.includes("NEW_YEAR") || normalized.includes("NEWYEAR")) return "NEW_YEAR";
  if (normalized.includes("VALENTINE")) return "VALENTINES";
  if (normalized.includes("THANKSGIVING") || normalized.includes("THANKS_GIVING")) return "THANKSGIVING";
  return "CLASSIC";
}
const MOTIFS: Record<Exclude<FestiveThemeId, "CLASSIC">, [string, string]> = {
  CHRISTMAS: ["❄", "✦"],
  DIWALI: ["✧", "◇"],
  NEW_YEAR: ["✦", "✧"],
  VALENTINES: ["♡", "♥"],
  THANKSGIVING: ["❧", "✦"],
};
/** Never captures pointer events and never changes content layout or control styles. */
export function FestiveSurface({ theme, children, accent, kind = "card", style }: {
  theme: FestiveThemeId;
  children: ReactNode;
  accent: string;
  kind?: "page" | "card" | "ribbon";
  style?: ViewStyle;
}) {
  if (theme === "CLASSIC") return <View style={style}>{children}</View>;
  const [left, right] = MOTIFS[theme];
  const large = kind === "page";
  const inset = kind === "ribbon" ? 6 : 9;
  return <View style={[{ position: "relative" }, style]}>
    <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, overflow: "hidden", borderRadius: large ? 0 : 12 }}>
      <View style={{ position: "absolute", top: inset, left: inset, opacity: large ? 0.16 : 0.26 }}>
        <Text style={{ color: accent, fontSize: large ? 32 : 17 }}>{left}</Text>
      </View>
      <View style={{ position: "absolute", bottom: inset, right: inset, opacity: large ? 0.16 : 0.26 }}>
        <Text style={{ color: accent, fontSize: large ? 32 : 17 }}>{right}</Text>
      </View>
      {!large ? <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderWidth: 1, borderColor: accent, opacity: 0.25, borderRadius: 12 }} /> : null}
    </View>
    {children}
  </View>;
}

/** Christmas gift-and-bow ornaments are code-owned; the text remains in AnnouncementItem. */
export function FestiveRibbonFrame({ theme, accent, children }: {
  theme: FestiveThemeId; accent: string; children: ReactNode;
}) {
  if (theme === "CLASSIC") return <>{children}</>;
  return <View style={{ position: "relative" }}>
    {children}
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 3, right: 3, flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: accent, fontSize: 14, opacity: 0.9 }}>{theme === "CHRISTMAS" ? "🎁" : MOTIFS[theme][0]}</Text>
      <Text style={{ color: accent, fontSize: 14, opacity: 0.9 }}>{theme === "CHRISTMAS" ? "🎀" : MOTIFS[theme][1]}</Text>
    </View>
  </View>;
}
