import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";

/** Artwork-only SVG. Never place it above functional controls without pointerEvents="none" on its parent. */
export function ChristmasGarland({ size = 170, opacity = 1 }: { size?: number; opacity?: number }) {
  const twigs = Array.from({ length: 19 }, (_, i) => {
    const t = i / 18;
    const x = 4 + 116 * t;
    const y = 6 + 54 * t * t;
    const angle = 12 + t * 45;
    return <G key={i}>
      <Path d={`M${x} ${y} l${-13 + t * 5} ${-13 - 8 * t} M${x} ${y} l${13 - t * 4} ${-12 + t * 3}`} stroke={i % 3 === 0 ? "#2B7A49" : "#15492F"} strokeWidth="3.8" strokeLinecap="round" />
      <Path d={`M${x} ${y} l${-19 + t * 4} ${-5 - t * 6} M${x} ${y} l${17 - t * 3} ${5 + t * 3}`} stroke={i % 3 === 0 ? "#3F8654" : "#1B5C35"} strokeWidth="2.4" strokeLinecap="round" />
    </G>;
  });
  return <Svg width={size} height={size} viewBox="0 0 160 160" opacity={opacity} accessible={false}>
    <Defs>
      <LinearGradient id="ornamentRed" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFB5A0"/><Stop offset="0.25" stopColor="#CE2530"/><Stop offset="0.85" stopColor="#790A20"/>
      </LinearGradient>
      <LinearGradient id="ornamentGold" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#FFF3BE"/><Stop offset="0.45" stopColor="#DFB14D"/><Stop offset="1" stopColor="#99631C"/>
      </LinearGradient>
    </Defs>
    <G>
      <Path d="M0 4 C36 4 76 20 122 82" fill="none" stroke="#17492C" strokeWidth="6" />
      <Path d="M0 14 C42 10 76 32 124 89" fill="none" stroke="#2C6435" strokeWidth="2" />
      {twigs}
      <Path d="M48 20 Q60 45 64 70" stroke="#E1B65D" strokeWidth="1.7" fill="none"/>
      <Path d="M104 55 Q115 84 116 110" stroke="#E1B65D" strokeWidth="1.7" fill="none"/>
      <Path d="M59 68 h10 v6 h-10z M111 107 h10 v6 h-10z" fill="#DAB14F" />
      <Circle cx="64" cy="92" r="20" fill="url(#ornamentRed)" stroke="#F6D17C" strokeWidth="2.5" />
      <Path d="M53 81 Q59 74 67 80" stroke="#FFF0D5" strokeWidth="3" opacity="0.65" fill="none"/>
      <Circle cx="116" cy="130" r="17" fill="url(#ornamentGold)" stroke="#FFF1BC" strokeWidth="2.2" />
      <Path d="M108 120 Q113 116 118 120" stroke="#FFF9DF" strokeWidth="2.5" opacity="0.8" fill="none" />
      <Circle cx="32" cy="39" r="5" fill="#A80B1D"/><Circle cx="40" cy="35" r="5" fill="#D42A2F"/><Circle cx="40" cy="45" r="5" fill="#9A1829" />
      <Circle cx="94" cy="57" r="4" fill="#D6A844" /><Circle cx="12" cy="18" r="3" fill="#E2C16A" />
      <Path d="M122 84 l5 10 l10 -1 l-7 8 l4 9 l-10 -5 l-8 8 l2 -11 l-8 -6 l11 -1Z" fill="#D8AD53" opacity="0.85" />
    </G>
  </Svg>;
}
