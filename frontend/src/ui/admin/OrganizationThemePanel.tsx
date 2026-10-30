import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import type { OrganizationBranding, PlatformBrandingThemeV2 } from "@/src/core";
import { platformBrandingThemeApi } from "@/src/data/api/platform-branding-theme-api";
import {
  BrandColourSelect,
  Button,
  Card,
  Section,
  Text,
} from "@/src/ui";
import { CustomerThemePreview } from "@/src/ui/domain/CustomerThemePreview";
import { AnnouncementEditor } from "@/src/experience/announcements/AnnouncementEditor";
import { AnnouncementDisplay } from "@/src/experience/announcements/AnnouncementDisplay";
import { resolveAnnouncementConfiguration } from "@/src/experience/announcements/announcement-model";

type Props = {
  branding: OrganizationBranding;
  editing: boolean;
  organizationId: string;
  organizationName: string;
  onDraftChange: (branding: OrganizationBranding) => void;
  resetKey: number;
};
const fields = [
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "textColor",
] as const;
const previewTheme = (b: OrganizationBranding) => ({
  primaryColor: b.primaryColor ?? "#0F766E",
  secondaryColor: b.secondaryColor ?? "#115E59",
  accentColor: b.accentColor ?? "#F59E0B",
  backgroundColor: b.backgroundColor ?? "#FFFFFF",
  textColor: b.textColor ?? "#1F2937",
});
export function OrganizationThemePanel({
  branding,
  editing,
  organizationId,
  organizationName,
  onDraftChange,
  resetKey,
}: Props) {
  const [themes, setThemes] = useState<PlatformBrandingThemeV2[]>([]);
  const [draft, setDraft] = useState<OrganizationBranding>(branding);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = !editing;
  useEffect(() => {
    setDraft(branding);
  }, [branding, resetKey]);
  useEffect(() => {
    let active = true;
    void platformBrandingThemeApi
      .listPublished()
      .then((result) => {
        if (!active) return;
        if (result.success) setThemes(result.data);
        else setError(result.error.message);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load themes");
      });
    return () => {
      active = false;
    };
  }, []);
  const available = useMemo(
    () =>
      themes.filter(
        (t) =>
          t.isActive &&
          t.publicationStatus === "PUBLISHED" &&
          !!t.publishedTheme,
      ),
    [themes],
  );
  const selected = available.find((t) => t.code === draft.platformThemeCode);
  const change = (patch: Partial<OrganizationBranding>) => {
    if (locked) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange(next);
    setNotice(null);
    setError(null);
  };
  const choose = (t: PlatformBrandingThemeV2) => {
    if (locked || !t.publishedTheme) return;
    // Selecting a platform theme must not replace organization-specific announcements.
    change({
      platformThemeCode: t.code,
      primaryColor: t.publishedTheme.primaryColor,
      secondaryColor: t.publishedTheme.secondaryColor,
      accentColor: t.publishedTheme.accentColor,
      backgroundColor: t.publishedTheme.backgroundColor,
      textColor: t.publishedTheme.textColor,
      backgroundImageUrl: null,
      decoration: null,
    });
    setNotice(`Selected ${t.displayName}. Save Changes to retain changes.`);
  };
  return (
    <Card padding="lg" elevation="sm">
      <Section
        title="Brand Colors & Themes"
        description="Choose a published platform theme, then customize your organization's own draft."
      >
        <View style={{ gap: 16 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={{ maxWidth: "100%" }}
            contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
          >
            {available.map((t) => {
              const p = t.publishedTheme!;
              const isSelected = draft.platformThemeCode === t.code;
              return (
                <View
                  key={t.id}
                  style={{
                    width: 174,
                    gap: 7,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? "#0F766E" : "#D6DEE4",
                    padding: 9,
                    borderRadius: 12,
                  }}
                >
                  <Text variant="bodyStrong">{t.displayName}</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      height: 18,
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    {[
                      p.primaryColor,
                      p.secondaryColor,
                      p.accentColor,
                      p.backgroundColor,
                      p.textColor,
                    ].map((c, i) => (
                      <View key={i} style={{ flex: 1, backgroundColor: c }} />
                    ))}
                  </View>
                  <CustomerThemePreview theme={p} compact />
                  <Button
                    label={isSelected ? "Selected" : "Select Theme"}
                    variant="secondary"
                    disabled={locked || isSelected}
                    onPress={() => choose(t)}
                  />
                </View>
              );
            })}
          </ScrollView>
          {available.length === 0 ? (
            <Text variant="bodySmall" color="textSecondary">
              No published themes available. Check that the public theme API
              returns publishedTheme values.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {fields.map((key) => (
              <View key={key} style={{ width: 235, maxWidth: "100%" }}>
                <View
                  pointerEvents={locked ? "none" : "auto"}
                  style={{ opacity: locked ? 0.7 : 1 }}
                >
                  <BrandColourSelect
                    label={key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (c) => c.toUpperCase())}
                    value={draft[key] ?? ""}
                    onChange={(value) =>
                      change({ [key]: value } as Partial<OrganizationBranding>)
                    }
                  />
                </View>
              </View>
            ))}
          </View>
          <Button
            label="Restore Preset Colours"
            variant="secondary"
            disabled={locked || !selected}
            onPress={() => {
              if (selected?.publishedTheme) {
                const preset = selected.publishedTheme;
                change({
                  primaryColor: preset.primaryColor,
                  secondaryColor: preset.secondaryColor,
                  accentColor: preset.accentColor,
                  backgroundColor: preset.backgroundColor,
                  textColor: preset.textColor,
                });
              }
            }}
          />
          <Section title="Announcements" description="Messages remain draft until Customer Experience is published.">
            <AnnouncementEditor
              key={resetKey}
              value={resolveAnnouncementConfiguration(draft)}
              onChange={announcementConfiguration => change({ announcementConfiguration })}
              disabled={locked}
            />
            <View style={{ marginTop: 12, maxWidth: 860, gap: 8 }}>
              <Text variant="bodyStrong">Announcement preview</Text>
              <AnnouncementDisplay
                configuration={resolveAnnouncementConfiguration(draft)}
                fallbackBackground={/^#[0-9a-f]{6}$/i.test(draft.accentColor ?? "") ? draft.accentColor! : "#F59E0B"}
                paddingHorizontal={16}
                paddingVertical={10}
              />
            </View>
          </Section>
          {notice ? (
            <Text variant="bodySmall" color="primary">
              {notice}
            </Text>
          ) : null}
          {error ? (
            <Text variant="bodySmall" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Section>
    </Card>
  );
}
