import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Linking, Pressable, View } from "react-native";
import { Text } from "@/src/ui";
import type { AnnouncementStyle } from "./announcement-model";

/** Shared, configuration-driven announcement used by both Preview and Customer. */
export function AnnouncementItem({
  message,
  style,
  background,
  foreground,
  link,
  paddingHorizontal,
  paddingVertical,
}: {
  message: string;
  style: AnnouncementStyle;
  background: string;
  foreground: string;
  link: string | null;
  paddingHorizontal: number;
  paddingVertical: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === "active",
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [messageWidth, setMessageWidth] = useState(0);
  const [typedCharacters, setTypedCharacters] = useState(0);
  const fullMessage = message + (link ? "  ·  Learn more ↗" : "");
  const animated = !reducedMotion && appIsActive;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setAppIsActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (style !== "TYPEWRITER" || !animated) {
      setTypedCharacters(fullMessage.length);
      return;
    }
    setTypedCharacters(0);
    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setTypedCharacters(Math.min(index, fullMessage.length));
      if (index >= fullMessage.length) clearInterval(interval);
    }, 55);
    return () => clearInterval(interval);
  }, [fullMessage, style, animated]);

  useEffect(() => {
    if (style === "STATIC" || style === "TYPEWRITER" || !animated) {
      progress.stopAnimation();
      progress.setValue(1);
      return;
    }
    if (
      (style === "TICKER" && !(messageWidth > 0 && containerWidth > 0)) ||
      (style === "REVEAL" && messageWidth <= 0)
    ) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const animation =
      style === "TICKER"
        ? Animated.loop(
            Animated.sequence([
              Animated.timing(progress, {
                toValue: 1,
                duration: Math.max(6000, (containerWidth + messageWidth) * 18),
                easing: Easing.linear,
                useNativeDriver: true,
              }),
              Animated.timing(progress, {
                toValue: 0,
                duration: 0,
                useNativeDriver: true,
              }),
            ]),
          )
        : style === "PULSE"
          ? Animated.loop(
              Animated.sequence([
                Animated.timing(progress, {
                  toValue: 1,
                  duration: 1100,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
                Animated.timing(progress, {
                  toValue: 0,
                  duration: 1100,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: true,
                }),
              ]),
            )
          : Animated.timing(progress, {
              toValue: 1,
              duration: style === "FADE" ? 360 : style === "REVEAL" ? 850 : 420,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: style !== "REVEAL",
            });
    animation.start();
    return () => animation.stop();
  }, [animated, containerWidth, messageWidth, progress, style, fullMessage]);

  const animationStyle =
    style === "FADE"
      ? { opacity: progress }
      : style === "SLIDE"
        ? {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-24, 0],
                }),
              },
            ],
          }
        : style === "TICKER"
          ? {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [containerWidth, -messageWidth],
                  }),
                },
              ],
            }
          : style === "PULSE"
            ? {
                opacity: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.65],
                }),
              }
            : style === "REVEAL"
              ? {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, messageWidth],
                  }),
                  overflow: "hidden" as const,
                }
              : undefined;

  return (
    <Pressable
      disabled={!link}
      accessibilityRole={link ? "link" : "text"}
      accessibilityLabel={fullMessage}
      onPress={() => {
        if (link) void Linking.openURL(link);
      }}
      style={{
        backgroundColor: background,
        paddingHorizontal,
        paddingVertical: Math.max(paddingVertical, 14),
        overflow: "hidden",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: foreground,
      }}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      {style === "TICKER" || style === "REVEAL" ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: -10000, top: -10000 }}
        >
          <Text
            variant="bodySmall"
            numberOfLines={1}
            onLayout={(event) =>
              setMessageWidth(event.nativeEvent.layout.width)
            }
          >
            {fullMessage}
          </Text>
        </View>
      ) : null}
      <Animated.View
        style={[
          animationStyle,
          style === "TICKER" || style === "REVEAL"
            ? { alignSelf: "flex-start", flexShrink: 0 }
            : undefined,
        ]}
      >
        <Text
          variant="bodySmall"
          numberOfLines={
            style === "TICKER" || style === "REVEAL" ? 1 : undefined
          }
          style={{
            color: foreground,
            flexShrink: 0,
            ...(style === "REVEAL" ? { width: messageWidth } : {}),
          }}
        >
          {style === "TYPEWRITER"
            ? fullMessage.slice(0, typedCharacters)
            : fullMessage}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
