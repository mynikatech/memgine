import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import type { ThemeAnimationPreset } from "@/src/core/theme-experience.types";

type Props = { preset: ThemeAnimationPreset; durationMs: number; replayKey: number; };
/** Independent noninteractive preview overlay: never alters customer one-shot session state. */
export function ThemeAnimationReplay({ preset, durationMs, replayKey }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; sub?.remove(); };
  }, []);
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (replayKey <= 0 || reduceMotion || preset === "NONE") return;
    const anim = Animated.timing(progress, { toValue: 1, duration: Math.max(1500, Math.min(3000, durationMs)), easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [durationMs, preset, progress, reduceMotion, replayKey]);
  if (reduceMotion || preset === "NONE" || replayKey === 0) return null;
  const shade = preset === "PETAL_DRIFT" ? "#EFA8B8" : "#FFF1B0";
  const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 0.88, 0.78, 0] });
  const trail = preset === "SHIMMER_SWEEP" || preset === "RIBBON_REVEAL";
  const drift = preset === "PETAL_DRIFT" ? 55 : preset === "CONFETTI_POP" ? -65 : -35;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
      {Array.from({ length: trail ? 2 : 16 }, (_, i) => {
        const x = trail ? progress.interpolate({ inputRange: [0, 1], outputRange: [-170, 700] }) : progress.interpolate({ inputRange: [0, 1], outputRange: [0, (i % 2 ? 24 : -24)] });
        const y = progress.interpolate({ inputRange: [0, 1], outputRange: [i % 3 ? 30 : -10, drift + (i % 3) * 18] });
        const s = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, preset === "GLOW_BURST" ? 2 : 1.15, 0.8] });
        return <Animated.View key={`${replayKey}-${i}`} style={{ position: "absolute", left: `${7 + ((i * 41) % 85)}%`, top: `${11 + ((i * 29) % 75)}%`, width: trail ? 8 : 3 + (i % 4) * 3,
          height: trail ? 160 : 3 + (i % 4) * 3, borderRadius: trail ? 4 : 16, backgroundColor: shade, opacity,
          transform: [{ translateX: x }, { translateY: y }, { scale: s }] }} />;
      })}
    </View>
  );
}
