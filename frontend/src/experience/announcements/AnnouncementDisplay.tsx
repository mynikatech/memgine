import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, AppState, Platform, Pressable, View } from "react-native";
import type { AnnouncementConfiguration } from "./announcement-model";
import { announcementDwellMs, getActiveAnnouncements } from "./announcement-model";
import { AnnouncementItem } from "./AnnouncementItem";
import { FestiveRibbonFrame, festiveRibbonPalette, type FestiveThemeId } from "@/src/ui/domain/FestiveThemeSurface";
import { readableForeground } from "@/src/theme/color-utils";

interface Props {
  configuration: AnnouncementConfiguration;
  festiveTheme?: FestiveThemeId;
  fallbackBackground: string;
  paddingHorizontal: number;
  paddingVertical: number;
  /** In previews this can be supplied from preview clock; defaults to actual time. */
  now?: number;
}

/** A controller: SINGLE renders the first eligible item, CAROUSEL rotates eligible items. */
export function AnnouncementDisplay({ configuration, fallbackBackground, paddingHorizontal, paddingVertical, now, festiveTheme = "CLASSIC" }: Props) {
  const [clock, setClock] = useState(() => Date.now());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(() => Platform.OS === "web" || AppState.currentState === "active");
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReducedMotion);
    return () => subscription?.remove();
  }, []);
  const boundaries = configuration.items.flatMap(item => [item.startsAt, item.endsAt])
    .filter((value): value is string => !!value)
    .map(value => Date.parse(value))
    .filter(value => Number.isFinite(value) && value > (now ?? clock))
    .sort((a, b) => a - b);
  const nextBoundary = boundaries[0];
  useEffect(() => {
    if (now !== undefined || nextBoundary === undefined) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2147483647, Math.max(100, nextBoundary - Date.now() + 50)));
    return () => clearTimeout(timer);
  }, [now, nextBoundary]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", state => {
      setAppActive(state === "active");
      if (state === "active") setClock(Date.now());
    });
    return () => subscription.remove();
  }, []);
  const active = useMemo(
    () => getActiveAnnouncements(configuration, now ?? clock),
    [configuration, now, clock],
  );
  const carousel = configuration.displayMode === "CAROUSEL" && active.length > 1;
  const activeIdsKey = active.map(item => item.id).join("|");
  const index = Math.max(0, active.findIndex(item => item.id === activeId));
  const selected = active[index] ?? null;
  useEffect(() => {
    if (!carousel || !appActive || reducedMotion || !selected) return;
    const timer = setTimeout(() => {
      setActiveId(active[(index + 1) % active.length].id);
    }, announcementDwellMs(selected, configuration.rotationIntervalSeconds));
    return () => clearTimeout(timer);
  }, [carousel, appActive, reducedMotion, configuration.rotationIntervalSeconds, activeIdsKey, selected?.id, selected?.style, selected?.message, index]);
  if (!selected) return null;
  const ribbonPalette = festiveRibbonPalette(festiveTheme);
  const background = ribbonPalette?.background ?? (/^#[0-9a-f]{6}$/i.test(selected.backgroundColor ?? "")
    ? selected.backgroundColor! : fallbackBackground);
  const foreground = ribbonPalette?.foreground ?? (/^#[0-9a-f]{6}$/i.test(selected.textColor ?? "")
    ? selected.textColor! : readableForeground(background));
  const link = selected.linkUrl?.trim();
  return (
    <View>
      <FestiveRibbonFrame theme={festiveTheme} accent={foreground}><View key={selected.id}><AnnouncementItem
        message={selected.message.trim()}
        style={selected.style}
        background={background}
        foreground={foreground}
        link={link && /^https:\/\//i.test(link) ? link : null}
        paddingHorizontal={ribbonPalette ? Math.max(paddingHorizontal, 62) : paddingHorizontal}
        paddingVertical={paddingVertical}
      /></View></FestiveRibbonFrame>
      {carousel ? (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "center", gap: 9, paddingTop: 8 }}>
          {active.map((item, i) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={`Show announcement ${i + 1} of ${active.length}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => setActiveId(item.id)}
              style={{ width: i === index ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? "#64748B" : "#CBD5E1" }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
