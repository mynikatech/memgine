import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import type {
  ThemeArtStyle,
  ThemeExperienceConfig,
} from "@/src/core/theme-experience.types";

const ICONS: Record<ThemeArtStyle, keyof typeof Ionicons.glyphMap> = {
  NONE: "ellipse-outline",
  LIGHTS: "bulb-outline",
  GIFT: "gift-outline",
  STARS: "star-outline",
  HEARTS: "heart-outline",
  FLORAL: "flower-outline",
  CONFETTI: "sparkles-outline",
  ABSTRACT: "shapes-outline",
};

export function ThemeMark({
  style,
  color,
  size = 25,
}: {
  style: ThemeArtStyle;
  color: string;
  size?: number;
}) {
  if (style === "NONE") return null;

  return <Ionicons name={ICONS[style]} size={size} color={color} />;
}

// One playback per customer experience/session key.
// No React state updates in the main BusinessExperience renderer.
const playedExperiences = new Set<string>();

export function ThemeAnimationLayer({
  config,
  color,
  sessionKey,
}: {
  config: ThemeExperienceConfig;
  color: string;
  sessionKey: string;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReducedMotion(value);
    });

    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReducedMotion,
    );

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (
      reducedMotion ||
      !config.enabled ||
      config.animationPreset === "NONE" ||
      playedExperiences.has(sessionKey)
    ) {
      progress.setValue(1);
      return;
    }

    playedExperiences.add(sessionKey);
    progress.setValue(0);

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: config.animationDurationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [
    config.enabled,
    config.animationPreset,
    config.animationDurationMs,
    progress,
    reducedMotion,
    sessionKey,
  ]);

  if (!config.enabled || config.animationPreset === "NONE" || reducedMotion) {
    return null;
  }

  const preset = config.animationPreset;

  const opacity = progress.interpolate({
    inputRange: [0, 0.25, 0.7, 1],
    outputRange: [0, 1, 0.8, 0],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      preset === "PETAL_DRIFT" ? -28 : 20,
      preset === "PETAL_DRIFT" ? 35 : -12,
    ],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      preset === "SHIMMER_SWEEP" || preset === "STAR_TRAIL" ? -55 : 0,
      preset === "SHIMMER_SWEEP" || preset === "STAR_TRAIL" ? 55 : 0,
    ],
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [
      preset === "GLOW_BURST" || preset === "CONFETTI_POP" ? 0.25 : 0.85,
      preset === "GENTLE_PULSE" ? 1.2 : 1,
      1,
    ],
  });

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", preset === "RIBBON_REVEAL" ? "12deg" : "0deg"],
  });

  const artStyle =
    preset === "PETAL_DRIFT"
      ? "FLORAL"
      : preset === "CONFETTI_POP"
        ? "CONFETTI"
        : config.artStyle;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 110,
        height: 95,
        overflow: "hidden",
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            top: 10 + (index % 3) * 22,
            right: 8 + Math.floor(index / 3) * 32,
            opacity,
            transform: [{ translateX }, { translateY }, { scale }, { rotate }],
          }}
        >
          <ThemeMark
            style={artStyle}
            color={color}
            size={index % 2 === 0 ? 16 : 11}
          />
        </Animated.View>
      ))}
    </View>
  );
}
