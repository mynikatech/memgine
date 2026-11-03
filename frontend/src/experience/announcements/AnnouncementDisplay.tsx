import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Image,
  Platform,
  Pressable,
  View,
} from "react-native";

import type { AnnouncementConfiguration } from "./announcement-model";
import {
  announcementDwellMs,
  getActiveAnnouncements,
} from "./announcement-model";
import { AnnouncementItem } from "./AnnouncementItem";
import { readableForeground } from "@/src/theme/color-utils";
import {
  resolveThemeExperience,
  type ThemeExperienceConfig,
} from "@/src/core/theme-experience.types";
import {
  getThemeArtworkAssets,
  resolveThemeArtwork,
} from "@/src/core/theme-artwork.types";

interface Props {
  configuration: AnnouncementConfiguration;
  fallbackBackground: string;
  paddingHorizontal: number;
  paddingVertical: number;
  themeExperience?: ThemeExperienceConfig | null;
  /** Optional preview clock; defaults to actual time. */
  now?: number;
}

const validHex = (value?: string | null): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/**
 * SINGLE displays the first eligible announcement.
 * CAROUSEL rotates eligible announcements.
 * Seasonal styling does not change announcement content or scheduling.
 */
export function AnnouncementDisplay({
  configuration,
  fallbackBackground,
  paddingHorizontal,
  paddingVertical,
  now,
  themeExperience,
}: Props) {
  const [clock, setClock] = useState(() => Date.now());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(
    () => Platform.OS === "web" || AppState.currentState === "active",
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);

    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReducedMotion,
    );

    return () => subscription?.remove();
  }, []);

  const boundaries = configuration.items
    .flatMap((item) => [item.startsAt, item.endsAt])
    .filter((value): value is string => !!value)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > (now ?? clock))
    .sort((a, b) => a - b);

  const nextBoundary = boundaries[0];

  useEffect(() => {
    if (now !== undefined || nextBoundary === undefined) return;

    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(2147483647, Math.max(100, nextBoundary - Date.now() + 50)),
    );

    return () => clearTimeout(timer);
  }, [now, nextBoundary]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");

      if (state === "active") {
        setClock(Date.now());
      }
    });

    return () => subscription.remove();
  }, []);

  const active = useMemo(
    () => getActiveAnnouncements(configuration, now ?? clock),
    [configuration, now, clock],
  );

  const carousel =
    configuration.displayMode === "CAROUSEL" && active.length > 1;

  const activeIdsKey = active.map((item) => item.id).join("|");

  const index = Math.max(
    0,
    active.findIndex((item) => item.id === activeId),
  );

  const selected = active[index] ?? null;

  useEffect(() => {
    if (!carousel || !appActive || reducedMotion || !selected) return;

    const timer = setTimeout(
      () => {
        setActiveId(active[(index + 1) % active.length].id);
      },
      announcementDwellMs(selected, configuration.rotationIntervalSeconds),
    );

    return () => clearTimeout(timer);
  }, [
    carousel,
    appActive,
    reducedMotion,
    configuration.rotationIntervalSeconds,
    activeIdsKey,
    selected?.id,
    selected?.style,
    selected?.message,
    index,
  ]);

  const experience = resolveThemeExperience(themeExperience);
  const artwork = resolveThemeArtwork(experience);

  const assets = getThemeArtworkAssets(artwork.artPack);

  const decorated = Boolean(
    experience.enabled && experience.announcementEnabled && assets,
  );

  const sideWidth = decorated ? 64 : 0;

  if (!selected) return null;

  // Organization-specific override -> Platform theme -> fallback.
  const themeBackground =
    experience.enabled && experience.announcementEnabled
      ? artwork.announcementBackgroundColor
      : null;

  const themeForeground =
    experience.enabled && experience.announcementEnabled
      ? artwork.announcementTextColor
      : null;

  const background = validHex(selected.backgroundColor)
    ? selected.backgroundColor
    : validHex(themeBackground)
      ? themeBackground
      : fallbackBackground;

  const foreground = validHex(selected.textColor)
    ? selected.textColor
    : validHex(themeForeground)
      ? themeForeground
      : readableForeground(background);

  const link = selected.linkUrl?.trim();

  return (
    <View>
      <View
        key={selected.id}
        style={{
          position: "relative",
          overflow: "hidden",
        }}
      >
        <AnnouncementItem
          message={selected.message.trim()}
          style={selected.style}
          background={background}
          foreground={foreground}
          link={link && /^https:\/\//i.test(link) ? link : null}
          paddingHorizontal={
            decorated
              ? Math.max(paddingHorizontal, sideWidth + 8)
              : paddingHorizontal
          }
          paddingVertical={paddingVertical}
        />

        {/* Seasonal artwork: decorative only, no touch interception */}
        {decorated && assets ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Image
              source={assets.announcementLeft}
              resizeMode="contain"
              style={{
                width: sideWidth,
                height: "100%",
              }}
            />

            <Image
              source={assets.announcementRight}
              resizeMode="contain"
              style={{
                width: sideWidth,
                height: "100%",
              }}
            />
          </View>
        ) : null}
      </View>

      {/* Existing carousel navigation remains unchanged */}
      {carousel ? (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 9,
            paddingTop: 8,
          }}
        >
          {active.map((item, i) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={`Show announcement ${i + 1} of ${active.length}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => setActiveId(item.id)}
              style={{
                width: i === index ? 18 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? "#64748B" : "#CBD5E1",
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
