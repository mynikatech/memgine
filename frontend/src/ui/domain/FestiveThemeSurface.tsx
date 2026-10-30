import type { ReactNode } from "react";
import { Dimensions, View, type ViewStyle } from "react-native";
import { ChristmasRibbonOrnament, FestiveMotif, FestiveSparkle, festivePalette } from "./FestiveArtwork";

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
  if (theme === "CLASSIC") return <View style={style}>{children}</View>;
  const p = festivePalette[theme];
  const large = kind === "page";
  const quiet = kind === "header" || kind === "nav" || kind === "benefit" || kind === "offer";
  const size = large ? Math.min(170, Math.max(96, Dimensions.get("window").width * 0.17)) : kind === "hero" || kind === "membership" ? 64 : quiet ? 35 : 46;
  const opacity = large ? 0.5 : quiet ? 0.4 : 0.56;
  const artwork = <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, overflow: "hidden", borderRadius: large ? 0 : 14 }}>
      {large ? <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: theme === "NEW_YEAR" ? "rgba(17,34,55,0.035)" : "rgba(201,160,91,0.055)" }} /> : null}
      {kind !== "header" && kind !== "nav" && kind !== "benefit" && kind !== "offer" ? <View style={{ position: "absolute", top: 0, left: 0, transform: [{ rotate: "-8deg" }] }}><FestiveMotif theme={theme} size={size} opacity={opacity} /></View> : null}
      {kind !== "nav" && kind !== "benefit" && kind !== "offer" ? <View style={{ position: "absolute", top: 0, right: 0, transform: [{ scaleX: -1 }, { rotate: "-8deg" }] }}><FestiveMotif theme={theme} size={size} opacity={opacity} /></View> : null}
      {large ? <>
        <View style={{ position: "absolute", top: "18%", right: "12%", opacity: 0.55 }}><FestiveSparkle theme={theme} size={26} /></View>
        <View style={{ position: "absolute", top: "46%", left: "5%", opacity: 0.45 }}><FestiveSparkle theme={theme} size={18} /></View>
        <View style={{ position: "absolute", bottom: "20%", right: "5%", opacity: 0.45 }}><FestiveSparkle theme={theme} size={20} /></View>
        <View style={{ position: "absolute", top: "33%", left: 0, opacity: 0.35 }}><FestiveMotif theme={theme} size={size * 0.7} /></View>
        <View style={{ position: "absolute", top: "63%", right: 0, opacity: 0.35, transform: [{ scaleX: -1 }] }}><FestiveMotif theme={theme} size={size * 0.7} /></View>
        <View style={{ position: "absolute", bottom: 0, left: 0, transform: [{ scaleY: -1 }] }}><FestiveMotif theme={theme} size={size} opacity={opacity * 0.8} /></View>
        <View style={{ position: "absolute", bottom: 0, right: 0, transform: [{ scaleX: -1 }, { scaleY: -1 }] }}><FestiveMotif theme={theme} size={size} opacity={opacity * 0.8} /></View>
      </> : <>
        {kind !== "header" && kind !== "nav" && kind !== "benefit" && kind !== "offer" ? <View style={{ position: "absolute", bottom: 0, right: 0, transform: [{ scaleX: -1 }, { scaleY: -1 }] }}><FestiveMotif theme={theme} size={size * 0.75} opacity={opacity * 0.7} /></View> : null}
        <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderWidth: kind === "membership" ? 2 : 1, borderColor: p.gold, opacity: quiet ? 0.65 : 0.9, borderRadius: 14 }} />
      </>}
    </View>;
  return <View pointerEvents={large ? "none" : "auto"} style={[{ position: "relative" }, style]}>
    {large ? artwork : null}
    {children}
    {large ? null : artwork}
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
