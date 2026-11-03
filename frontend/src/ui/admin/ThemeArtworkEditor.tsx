import { Pressable, Text, TextInput, View } from "react-native";
import type { ThemeExperienceConfig } from "@/src/core/theme-experience.types";
import { resolveThemeExperience } from "@/src/core/theme-experience.types";
import { resolveThemeArtwork, THEME_ARTWORK_PRESETS, type ThemeArtworkPack, type ThemeArtworkExperience, type ThemeFeatureLayout } from "@/src/core/theme-artwork.types";

type Props = { value?: Partial<ThemeExperienceConfig> | null; disabled?: boolean; onChange: (v: ThemeExperienceConfig) => void };
const packs: { code: ThemeArtworkPack; title: string }[] = [
  { code: "NONE", title: "No artwork" }, { code: "CHRISTMAS_CLASSIC", title: "Christmas Classic" },
  { code: "DIWALI_GOLD", title: "Diwali Gold" }, { code: "NEW_YEAR_CELEBRATION", title: "New Year" },
  { code: "VALENTINE_ROMANCE", title: "Valentine" }, { code: "THANKSGIVING_HARVEST", title: "Thanksgiving" },
  { code: "CUSTOM", title: "Custom" },
];
const isHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
export function ThemeArtworkEditor({ value, onChange, disabled = false }: Props) {
  const current = { ...resolveThemeExperience(value), ...resolveThemeArtwork(value) } as ThemeArtworkExperience;
  const patch = (delta: Partial<ThemeArtworkExperience>) => onChange({ ...current, ...delta });
  const button = (key: string, active: boolean, handler: () => void, caption: string) => (
    <Pressable key={key} disabled={disabled} onPress={handler} accessibilityRole="button" accessibilityState={{ selected: active, disabled }}
      style={{ paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9, backgroundColor: active ? "#0F766E" : "#DCEAE8", opacity: disabled ? 0.55 : 1 }}>
      <Text style={{ color: active ? "#FFFFFF" : "#0F766E", fontSize: 13, fontWeight: active ? "700" : "500" }}>{caption}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 12, paddingVertical: 8 }}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: "#18212F" }}>Premium seasonal artwork</Text>
      <Text style={{ fontSize: 12, color: "#64748B" }}>Use one coordinated art pack across header, announcement and feature scene. Five curated packs include bundled illustrations. Classic has no seasonal artwork; custom themes may upload their own artwork.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {packs.map(({ code, title }) => button(code, current.artPack === code, () => {
          const preset = THEME_ARTWORK_PRESETS[code];
          const previousPreset = THEME_ARTWORK_PRESETS[current.artPack ?? "NONE"];
          const shouldReplaceTitle = !current.featureTitle || current.featureTitle === "Something special for you"
            || (previousPreset && current.featureTitle === previousPreset.featureTitle);
          const shouldReplaceSubtitle = !current.featureSubtitle || current.featureSubtitle === "Explore what's new"
            || (previousPreset && current.featureSubtitle === previousPreset.featureSubtitle);
          // Apply the selected pack's coherent artwork colours, never carry old Christmas colours into Diwali etc.
          // Preserve deliberately customized feature copy unless it still matches the old preset.
          patch({
            artPack: code,
            featureLayout: "SEAMLESS_BACKGROUND",
            ...(code !== current.artPack && code !== "CUSTOM" ? { featureImageUrl: null } : {}),
            announcementBackgroundColor: preset?.announcementBackgroundColor ?? null,
            announcementTextColor: preset?.announcementTextColor ?? null,
            featureBackgroundColor: preset?.featureBackgroundColor ?? null,
            featureTextColor: preset?.featureTextColor ?? null,
            ...(preset ? {
              enabled: true, headerEnabled: true, announcementEnabled: true, featureEnabled: true,
              artStyle: preset.artStyle,
              animationPreset: preset.animationPreset,
              ...(shouldReplaceTitle ? { featureTitle: preset.featureTitle } : {}),
              ...(shouldReplaceSubtitle ? { featureSubtitle: preset.featureSubtitle } : {}),
            } : code === "NONE" ? { enabled: false } : {}),
          });
        }, title))}
      </View>
      <Text style={{ fontWeight: "600" }}>Feature layout</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {(["SEAMLESS_BACKGROUND", "BANNER_STRIP"] as const).map((layout: ThemeFeatureLayout) => button(layout, current.featureLayout === layout, () => patch({ featureLayout: layout }), layout === "SEAMLESS_BACKGROUND" ? "Seamless background" : "Banner strip"))}
      </View>
      <Text style={{ fontWeight: "600" }}>Announcement colours</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {([ ["announcementBackgroundColor", "Background (#RRGGBB)"], ["announcementTextColor", "Text (#RRGGBB)"] ] as const).map(([key, caption]) => (
          <View key={key} style={{ flex: 1, minWidth: 150, gap: 4 }}>
            <Text style={{ fontSize: 12 }}>{caption}</Text>
            <TextInput editable={!disabled} maxLength={7} value={current[key] ?? ""}
              onChangeText={value => patch({ [key]: value })}
              style={{ borderWidth: 1, borderColor: current[key] && !isHex(current[key]!) ? "#B91C1C" : "#CBD5E1", borderRadius: 8, padding: 10, color: "#17212B" }} />
          </View>
        ))}
      </View>
      <Text style={{ fontWeight: "600" }}>Feature scene colours</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {([ ["featureBackgroundColor", "Background (#RRGGBB)"], ["featureTextColor", "Text (#RRGGBB)"] ] as const).map(([key, caption]) => (
          <View key={key} style={{ flex: 1, minWidth: 150, gap: 4 }}>
            <Text style={{ fontSize: 12 }}>{caption}</Text>
            <TextInput editable={!disabled} maxLength={7} value={current[key] ?? ""}
              onChangeText={value => patch({ [key]: value })}
              style={{ borderWidth: 1, borderColor: current[key] && !isHex(current[key]!) ? "#B91C1C" : "#CBD5E1", borderRadius: 8, padding: 10, color: "#17212B" }} />
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: "#64748B" }}>Announcement message, rotation, schedule and action link remain organization-owned.</Text>
    </View>
  );
}
