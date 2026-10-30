import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";

import type { BrandingThemeV2, PlatformBrandingThemeV2 } from "@/src/core";
import { platformBrandingThemeApi } from "@/src/data/api/platform-branding-theme-api";
import { CustomerThemePreview } from "@/src/ui/domain/CustomerThemePreview";
import { BrandColourSelect, Button, Input, Modal, Text } from "@/src/ui";

const emptyTheme: BrandingThemeV2 = {
  primaryColor: "#0F766E",
  secondaryColor: "#115E59",
  accentColor: "#F59E0B",
  backgroundColor: "#FFFFFF",
  textColor: "#1F2937",
};

const colourFields: {
  key: keyof Pick<BrandingThemeV2, "primaryColor" | "secondaryColor" | "accentColor" | "backgroundColor" | "textColor">;
  label: string;
}[] = [
  { key: "primaryColor", label: "Primary color" },
  { key: "secondaryColor", label: "Secondary color" },
  { key: "accentColor", label: "Accent color" },
  { key: "backgroundColor", label: "Background color" },
  { key: "textColor", label: "Text color" },
];

const isHexColour = (value: string) => /^#[0-9A-F]{6}$/i.test(value.trim());

function normalizeTheme(theme?: BrandingThemeV2 | null): BrandingThemeV2 {
  return {
    primaryColor: typeof theme?.primaryColor === "string" ? theme.primaryColor : "",
    secondaryColor: typeof theme?.secondaryColor === "string" ? theme.secondaryColor : "",
    accentColor: typeof theme?.accentColor === "string" ? theme.accentColor : "",
    backgroundColor: typeof theme?.backgroundColor === "string" ? theme.backgroundColor : "",
    textColor: typeof theme?.textColor === "string" ? theme.textColor : "",
    // Keep legacy fields when editing an existing record, but never offer
    // image/decoration controls or create new manual artwork settings.
    ...(theme?.backgroundImageUrl ? { backgroundImageUrl: theme.backgroundImageUrl } : {}),
    ...(theme?.decoration ? { decoration: theme.decoration } : {}),
  };
}

function editorTheme(theme?: PlatformBrandingThemeV2): PlatformBrandingThemeV2 {
  if (!theme) {
    return {
      id: "",
      code: "",
      displayName: "",
      description: "",
      draftTheme: { ...emptyTheme },
      publicationStatus: "DRAFT",
      isActive: true,
      versionNo: 0,
    };
  }
  return {
    ...theme,
    code: theme.code ?? "",
    displayName: theme.displayName ?? "",
    description: theme.description ?? "",
    draftTheme: normalizeTheme(theme.draftTheme ?? theme.publishedTheme),
  };
}

export default function PlatformThemeBuilder() {
  const { width } = useWindowDimensions();
  const columns = width >= 1350 ? 3 : width >= 850 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : columns === 2 ? "48%" : "31.8%";
  const [themes, setThemes] = useState<PlatformBrandingThemeV2[]>([]);
  const [draft, setDraft] = useState<PlatformBrandingThemeV2 | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    const result = await platformBrandingThemeApi.listAll();
    if (!result.success) throw new Error(result.error.message);
    setThemes(result.data);
  }, []);

  useEffect(() => {
    void load().catch((error) => setActionFeedback({ kind: "error", message: error instanceof Error ? error.message : "Unable to load themes." }));
  }, [load]);

  const values = useMemo(() => normalizeTheme(draft?.draftTheme ?? draft?.publishedTheme), [draft]);
  const canSave = Boolean(draft?.displayName.trim() && colourFields.every((field) => isHexColour(values[field.key])));

  const edit = (theme?: PlatformBrandingThemeV2) => {
    setDraft(editorTheme(theme));
    setActionFeedback(null);
    setPreview(false);
    setOpen(true);
  };

  const updateTheme = <K extends keyof BrandingThemeV2>(key: K, value: BrandingThemeV2[K]) => {
    setDraft((current) => current ? {
      ...current,
      draftTheme: { ...normalizeTheme(current.draftTheme ?? current.publishedTheme), [key]: value },
    } : current);
  };

  const save = async () => {
    if (!draft || !canSave) {
      setActionFeedback({ kind: "error", message: "Enter a name and valid six-digit HEX values for every colour." });
      return;
    }
    setActionFeedback(null);
    setBusy(true);
    try {
      const body = { displayName: draft.displayName, description: draft.description ?? "", theme: values, versionNo: draft.id ? draft.versionNo : undefined };
      const result = draft.id ? await platformBrandingThemeApi.saveDraft(draft.id, body) : await platformBrandingThemeApi.create(body);
      if (!result.success) throw new Error(result.error.message);
      setDraft(editorTheme(result.data));
      await load();
      setActionFeedback({ kind: "success", message: `Draft saved successfully for ${result.data.displayName}. Only Platform Admin can see these changes until you publish.` });
    } catch (error) {
      setActionFeedback({ kind: "error", message: `Unable to save draft: ${error instanceof Error ? error.message : "Please retry."}` });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!draft?.id) return;
    setActionFeedback(null);
    setBusy(true);
    try {
      const result = await platformBrandingThemeApi.publish(draft.id, draft.versionNo);
      if (!result.success) throw new Error(result.error.message);
      setDraft(editorTheme(result.data));
      await load();
      setActionFeedback({ kind: "success", message: `${result.data.displayName} published successfully. It is now available for future organization selections; existing organization settings are unchanged.` });
    } catch (error) {
      setActionFeedback({ kind: "error", message: `Unable to publish theme: ${error instanceof Error ? error.message : "Please retry."}` });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (theme: PlatformBrandingThemeV2) => {
    setActionFeedback(null);
    try {
      const result = await platformBrandingThemeApi.setActive(theme.id, theme.versionNo, !theme.isActive);
      if (!result.success) throw new Error(result.error.message);
      await load();
      setActionFeedback({
        kind: "success",
        message: `${theme.displayName} ${theme.isActive ? "deactivated" : "activated"} successfully.`,
      });
    } catch (error) {
      setActionFeedback({ kind: "error", message: `Unable to update ${theme.displayName}: ${error instanceof Error ? error.message : "Please retry."}` });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: width < 700 ? 14 : 24, paddingBottom: 50, gap: 20 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ gap: 4, flex: 1, minWidth: 220 }}>
          <Text variant="title">Theme Studio</Text>
          <Text variant="bodySmall" color="textMuted">Create global reusable themes. Draft edits do not affect organizations until published.</Text>
        </View>
        <Button label="Create New Theme" onPress={() => edit()} />
      </View>

      {actionFeedback ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 9,
            borderWidth: 1,
            backgroundColor: actionFeedback.kind === "success" ? "#ECFDF5" : "#FEF2F2",
            borderColor: actionFeedback.kind === "success" ? "#A7F3D0" : "#FECACA",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: actionFeedback.kind === "success" ? "#065F46" : "#B91C1C" }}>
              {actionFeedback.message}
            </Text>
          </View>
          <Button label="Dismiss" variant="secondary" onPress={() => setActionFeedback(null)} />
        </View>
      ) : null}

      {open && draft ? (
        <View style={{ padding: width < 700 ? 14 : 22, gap: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE3EA", borderRadius: 16 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Text variant="h3">{draft.id ? `Editing ${draft.displayName || "theme"}` : "Create a new theme"}</Text>
              <Text variant="bodySmall" color="textMuted">Save draft changes before publishing.</Text>
            </View>
            <Button label="Close Editor" variant="secondary" onPress={() => setOpen(false)} />
          </View>
          <View style={{ flexDirection: width >= 1000 ? "row" : "column", alignItems: "flex-start", gap: 26 }}>
            <View style={{ flex: width >= 1000 ? 1 : undefined, width: width >= 1000 ? undefined : "100%", gap: 12 }}>
              <Text variant="h3">Theme settings</Text>
              <Input label="Theme name" value={draft.displayName ?? ""} onChangeText={(displayName) => setDraft((current) => current ? { ...current, displayName } : current)} />
              <Input label="Theme code" value={draft.code ?? ""} onChangeText={() => undefined} editable={false} placeholder="Generated after first Save Draft" />
              <Input label="Description" value={draft.description ?? ""} onChangeText={(description) => setDraft((current) => current ? { ...current, description } : current)} />
              <Text variant="label">Five-colour palette</Text>
              {colourFields.map((field) => (
                <BrandColourSelect key={field.key} label={field.label} value={values[field.key]} onChange={(value) => updateTheme(field.key, value)} />
              ))}
            </View>
            <View style={{ flex: width >= 1000 ? 1.2 : undefined, width: width >= 1000 ? undefined : "100%", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <Text variant="h3">Live customer preview</Text>
                <Button label="Expand Preview" variant="secondary" onPress={() => setPreview(true)} />
              </View>
              <Text variant="bodySmall" color="textMuted">Sample content; the five colours and code-defined artwork update as you edit.</Text>
              <CustomerThemePreview theme={values} themeCode={draft.code} />
            </View>
          </View>
          {actionFeedback ? (
            <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: actionFeedback.kind === "success" ? "#A7F3D0" : "#FECACA", backgroundColor: actionFeedback.kind === "success" ? "#ECFDF5" : "#FEF2F2" }}>
              <Text variant="bodySmall" style={{ color: actionFeedback.kind === "success" ? "#065F46" : "#B91C1C" }}>{actionFeedback.message}</Text>
            </View>
          ) : null}
          <View style={{ borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 15, flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <Button label="Save Draft" disabled={busy || !canSave} onPress={() => void save()} />
            <Button label="Preview" variant="secondary" onPress={() => setPreview(true)} />
            <Button label="Publish" disabled={!draft.id || busy || !canSave} onPress={() => void publish()} />
          </View>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <Text variant="h3">Theme gallery · {themes.length} themes</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {themes.map((theme) => {
            const cardTheme = normalizeTheme(theme.draftTheme ?? theme.publishedTheme);
            const hasUnpublishedChanges = Boolean(theme.draftTheme && theme.publishedTheme && JSON.stringify(theme.draftTheme) !== JSON.stringify(theme.publishedTheme));
            return (
              <View key={theme.id} style={{ width: cardWidth as any, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#DEE4EA", backgroundColor: "#FFFFFF" }}>
                <View style={{ padding: 12, backgroundColor: "#F8FAFC" }}>
                  <CustomerThemePreview theme={cardTheme} themeCode={theme.code} compact businessName="Sample business" />
                </View>
                <View style={{ padding: 14, gap: 10 }}>
                  <View style={{ gap: 3 }}>
                    <Text variant="h3">{theme.displayName}</Text>
                    <Text variant="bodySmall" color="textMuted">{theme.code} · {theme.isActive ? (hasUnpublishedChanges ? "Published · Draft changes" : theme.publicationStatus) : "Inactive"}</Text>
                  </View>
                  <Text variant="bodySmall">{theme.description || "No description"}</Text>
                  <View style={{ flexDirection: "row", gap: 5 }}>
                    {colourFields.map((field) => (
                      <View key={field.key} style={{ flex: 1, height: 11, borderRadius: 4, backgroundColor: isHexColour(cardTheme[field.key]) ? cardTheme[field.key] : "#E5E7EB", borderWidth: 1, borderColor: "#E5E7EB" }} />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Button label="Edit" variant="secondary" onPress={() => edit(theme)} />
                    <Button label="Preview" variant="secondary" onPress={() => { setDraft(editorTheme(theme)); setPreview(true); }} />
                    <Button label={theme.isActive ? "Deactivate" : "Activate"} variant="secondary" onPress={() => void toggle(theme)} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <Modal visible={preview} title="Customer theme preview" onClose={() => setPreview(false)}>
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <Text variant="bodySmall" color="textMuted">Illustrative sample content. Org Admin can reuse this preview with its own organization data.</Text>
          <CustomerThemePreview theme={values} themeCode={draft?.code} />
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}
