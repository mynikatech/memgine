import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import type { OrganizationBranding, PlatformBrandingTheme } from "@/src/core";
import { pickBrandingAsset } from "@/src/core/brandingAssetPicker";
import { brandingAssetApi } from "@/src/data/api/branding-asset-api";
import { platformBrandingThemeApi } from "@/src/data/api/platform-branding-theme-api";
import { BrandColourSelect, Button, Card, Section, Text } from "@/src/ui";
import { CustomerThemePreview } from "@/src/ui/domain/CustomerThemePreview";
import { AnnouncementEditor } from "@/src/experience/announcements/AnnouncementEditor";
import { AnnouncementDisplay } from "@/src/experience/announcements/AnnouncementDisplay";
import { resolveAnnouncementConfiguration } from "@/src/experience/announcements/announcement-model";
import { ThemeExperienceEditor } from "./ThemeExperienceEditor";
import { resolveThemeExperience } from "@/src/core/theme-experience.types";
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
export function OrganizationThemePanel({
  branding,
  editing,
  organizationId,
  organizationName,
  onDraftChange,
  resetKey,
}: Props) {
  const [themes, setThemes] = useState<PlatformBrandingTheme[]>([]);
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
  const choose = (t: PlatformBrandingTheme) => {
    if (locked || !t.publishedTheme) return;
    const published = t.publishedTheme;
    // Choose only the published seasonal experience. Never spread a platform theme
    // across organization-owned branding, content, announcements, or assets.
    change({
      platformThemeCode: t.code,
      themeExperience: resolveThemeExperience(published.themeExperience),
    });
    setNotice(
      `Selected ${t.displayName}. Review Theme Experience and save changes.`,
    );
  };
  const upload = async () => {
    if (locked) return;
    try {
      const file = await pickBrandingAsset({ assetType: "themeBackground" });
      if (!file) return;
      const uploaded = await brandingAssetApi.upload(
        organizationId,
        "themeBackground",
        file,
      );
      change({ backgroundImageUrl: uploaded.path });
      setNotice("Background uploaded. Use Save Changes to retain it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Background upload failed");
    }
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
          <Section
            title="Organization theme draft preview"
            description="Uses your organization's own colours with the selected published seasonal artwork. This is a sample layout; the Proposed Customer Experience preview uses actual content."
          >
            <View style={{ width: "100%", maxWidth: 440 }}>
              <CustomerThemePreview
                theme={{
                  ...draft,
                  primaryColor: draft.primaryColor ?? "#0F766E",
                  secondaryColor: draft.secondaryColor ?? "#115E59",
                  accentColor: draft.accentColor ?? "#F59E0B",
                  backgroundColor: draft.backgroundColor ?? "#FFFFFF",
                  textColor: draft.textColor ?? "#1F2937",
                }}
                businessName={organizationName}
              />
            </View>
          </Section>

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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              label={
                draft.backgroundImageUrl
                  ? "Replace Background"
                  : "Upload Background"
              }
              variant="secondary"
              disabled={locked}
              onPress={() => void upload()}
            />
            <Button
              label="Remove Background"
              variant="secondary"
              disabled={locked || !draft.backgroundImageUrl}
              onPress={() => change({ backgroundImageUrl: null })}
            />
            <Button
              label="Restore Theme Artwork"
              variant="secondary"
              disabled={locked || !selected}
              onPress={() => {
                if (selected) choose(selected);
              }}
            />
          </View>
          <Text variant="bodySmall" color="textSecondary">
            Seasonal artwork comes from the published Platform theme. Your
            organization can adjust its feature text, animation and display
            toggles without altering the original theme artwork or its business
            identity.
          </Text>
          <ThemeExperienceEditor
            value={draft.themeExperience}
            disabled={locked}
            onChange={(themeExperience) => change({ themeExperience })}
          />
          <Section
            title="Announcements"
            description="Messages remain draft until Customer Experience is published."
          >
            <AnnouncementEditor
              key={resetKey}
              value={resolveAnnouncementConfiguration(draft)}
              onChange={(announcementConfiguration) =>
                change({ announcementConfiguration })
              }
              disabled={locked}
            />
            <View style={{ marginTop: 12, maxWidth: 860, gap: 8 }}>
              <Text variant="bodyStrong">Announcement preview</Text>
              <AnnouncementDisplay
                configuration={resolveAnnouncementConfiguration(draft)}
                fallbackBackground={
                  /^#[0-9a-f]{6}$/i.test(draft.accentColor ?? "")
                    ? draft.accentColor!
                    : "#F59E0B"
                }
                paddingHorizontal={16}
                paddingVertical={10}
                themeExperience={draft.themeExperience}
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
