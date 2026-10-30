import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import type { FestiveThemeId } from "./FestiveThemeSurface";

type BuiltInTheme = Exclude<FestiveThemeId, "CLASSIC">;
export const festivePalette: Record<BuiltInTheme, { ink: string; gold: string; leaf: string; ribbon: string; ribbonText: string }> = {
  CHRISTMAS: { ink: "#145334", gold: "#D5A445", leaf: "#1B693F", ribbon: "#A91422", ribbonText: "#FFF9EA" },
  DIWALI: { ink: "#713441", gold: "#C49A4A", leaf: "#9A613E", ribbon: "#653343", ribbonText: "#FFF7E5" },
  NEW_YEAR: { ink: "#172840", gold: "#D1B46B", leaf: "#56677A", ribbon: "#152439", ribbonText: "#FFF8E8" },
  VALENTINES: { ink: "#8E3651", gold: "#D9A7A9", leaf: "#69836A", ribbon: "#8B2C49", ribbonText: "#FFF8F7" },
  THANKSGIVING: { ink: "#8C4A2E", gold: "#C99B50", leaf: "#737B3C", ribbon: "#8D4A2D", ribbonText: "#FFF9EA" },
};

/** Code-owned vector artwork. It stays decorative and cannot intercept touch or click events. */
export function FestiveMotif({ theme, size = 72, opacity = 1 }: {
  theme: BuiltInTheme; size?: number; opacity?: number;
}) {
  const p = festivePalette[theme];
  return <Svg width={size} height={size} viewBox="0 0 120 120" opacity={opacity} accessible={false}>
    {theme === "CHRISTMAS" ? <G>
      <Path d="M0 7 C30 13 57 36 91 91 M0 22 C36 27 59 49 87 97 M15 0 C33 24 58 51 87 98" stroke={p.leaf} strokeWidth="5" fill="none" />
      {Array.from({ length: 9 }, (_, i) => <G key={i}>
        <Path d={`M${8+i*7} ${15+i*7} l-12 -4 l10 12 M${8+i*7} ${15+i*7} l7 -11 l4 12`} stroke={i % 2 ? "#2D8050" : "#125232"} strokeWidth="3" strokeLinecap="round" fill="none" />
      </G>)}
      <Line x1="72" y1="63" x2="82" y2="88" stroke={p.gold} strokeWidth="1.5" />
      <Circle cx="84" cy="91" r="16" fill="#A51625" stroke={p.gold} strokeWidth="3" />
      <Path d="M76 84 Q83 78 91 84" stroke="#ED8B79" strokeWidth="2" fill="none" />
      <Circle cx="38" cy="34" r="5" fill="#B41C28" /><Circle cx="46" cy="40" r="5" fill="#C42C31" />
      <Circle cx="28" cy="47" r="3" fill={p.gold} />
    </G> : null}
    {theme === "DIWALI" ? <G>
      <Path d="M5 8 Q60 75 115 8 M18 8 Q60 61 102 8" stroke={p.gold} strokeWidth="2" fill="none" />
      {Array.from({ length: 5 }, (_, i) => <G key={i}>
        <Path d={`M${15+i*22} 20 l9 9 l-9 9 l-9 -9 z`} stroke={p.gold} strokeWidth="1.5" fill="none" />
        <Circle cx={15+i*22} cy="29" r="2" fill={p.ink} />
      </G>)}
      <Path d="M28 73 Q60 103 92 73 Q81 96 60 98 Q39 96 28 73Z" fill={p.gold} stroke={p.ink} strokeWidth="2" />
      <Path d="M36 75 Q60 83 84 75" stroke={p.ink} strokeWidth="2" fill="none" />
      <Path d="M60 73 C43 62 56 45 60 36 C68 52 78 61 60 73Z" fill="#E2933B" stroke={p.gold} strokeWidth="2" />
      <Path d="M60 68 C55 60 60 54 62 50 C66 59 66 65 60 68Z" fill="#FFF1B8" />
    </G> : null}
    {theme === "NEW_YEAR" ? <G>
      <Path d="M8 112 L8 46 L28 46 L28 27 L48 27 L48 12 M112 112 L112 46 L92 46 L92 27 L72 27 L72 12" stroke={p.gold} strokeWidth="3" fill="none" />
      <Path d="M17 112 L17 55 L38 55 L38 36 M103 112 L103 55 L82 55 L82 36" stroke={p.ink} strokeWidth="2" fill="none" />
      {Array.from({ length: 9 }, (_, i) => {
        const angle = i * Math.PI / 4;
        return <Line key={i} x1="60" y1="52" x2={60 + Math.cos(angle) * 42} y2={52 + Math.sin(angle) * 42} stroke={p.gold} strokeWidth={i % 2 ? 1.5 : 2.5} />;
      })}
      <Circle cx="60" cy="52" r="7" fill={p.gold} />
    </G> : null}
    {theme === "VALENTINES" ? <G>
      <Path d="M5 105 C30 88 56 62 84 20" stroke={p.leaf} strokeWidth="3" fill="none" />
      <Path d="M28 84 Q15 62 7 72 Q12 89 28 84 M44 70 Q31 48 22 56 Q28 73 44 70 M59 54 Q46 32 37 39 Q43 57 59 54" fill={p.leaf} />
      <Path d="M69 26 C45 19 48 50 71 52 C94 49 96 20 69 26Z" fill="#A74763" stroke="#DCA3AD" strokeWidth="2" />
      <Path d="M69 27 C56 27 54 43 68 45 C84 44 84 31 70 31 C63 31 61 39 68 40" stroke="#F2BBC4" strokeWidth="2.5" fill="none" />
      <Path d="M82 79 C75 70 65 78 82 94 C99 78 89 70 82 79Z" fill={p.gold} />
    </G> : null}
    {theme === "THANKSGIVING" ? <G>
      <Path d="M20 102 Q60 58 101 15" stroke={p.ink} strokeWidth="3" fill="none" />
      <Path d="M54 62 L32 55 L39 44 L25 39 L44 34 L47 18 L60 30 L73 18 L76 34 L96 39 L81 45 L89 55 L66 62 L60 80Z" fill="#B96334" stroke={p.gold} strokeWidth="2" />
      <Path d="M60 80 L60 31 M60 54 L43 39 M60 54 L78 39" stroke="#E8B96B" strokeWidth="1.7" fill="none" />
      {Array.from({ length: 5 }, (_, i) => <G key={i}>
        <Ellipse cx={13+i*5} cy={85-i*5} rx="3" ry="7" fill={p.gold} transform={`rotate(35 ${13+i*5} ${85-i*5})`} />
      </G>)}
    </G> : null}
  </Svg>;
}

export function ChristmasRibbonOrnament({ side }: { side: "gift" | "bow" }) {
  return <Svg width={48} height={48} viewBox="0 0 64 64" accessible={false}>
    {side === "gift" ? <G>
      <Rect x="13" y="26" width="38" height="31" rx="3" fill="#D6A23D" stroke="#FFF2BB" strokeWidth="1" />
      <Rect x="9" y="22" width="46" height="9" rx="2" fill="#E6BB68" />
      <Rect x="29" y="22" width="7" height="35" fill="#A91C26" />
      <Path d="M32 23 C11 18 13 5 23 9 C29 11 31 18 32 23 C34 14 40 6 47 10 C56 18 43 24 32 23Z" fill="none" stroke="#F3C569" strokeWidth="4" />
    </G> : <G>
      <Path d="M32 32 C15 6 3 17 13 33 C3 48 17 56 32 32 C47 56 61 48 51 33 C61 17 49 6 32 32Z" fill="#D6A23D" stroke="#FFF2BD" strokeWidth="1.5" />
      <Circle cx="32" cy="32" r="5" fill="#A91C26" />
      <Path d="M29 36 Q19 53 15 60 M35 36 Q46 52 49 60" stroke="#D6A23D" strokeWidth="5" fill="none" />
    </G>}
  </Svg>;
}

export function FestiveSparkle({ theme, size = 24 }: { theme: BuiltInTheme; size?: number }) {
  const color = festivePalette[theme].gold;
  return <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
    {theme === "CHRISTMAS" ? <G stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <Line x1="20" y1="2" x2="20" y2="38" /><Line x1="2" y1="20" x2="38" y2="20" />
      <Line x1="7" y1="7" x2="33" y2="33" /><Line x1="33" y1="7" x2="7" y2="33" />
      <Path d="M16 6 L20 10 L24 6 M16 34 L20 30 L24 34 M6 16 L10 20 L6 24 M34 16 L30 20 L34 24" fill="none" />
    </G> : <G>
      <Path d="M20 2 L23 17 L38 20 L23 23 L20 38 L17 23 L2 20 L17 17Z" fill={color} />
      <Circle cx="20" cy="20" r="3" fill="#FFF5D8" />
    </G>}
  </Svg>;
}
