import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";

import type { BrandingThemeV2, PlatformBrandingThemeV2 } from "@/src/core";
import { pickBrandingAsset, type PickedBrandingAsset } from "@/src/core/brandingAssetPicker";
import { platformBrandingThemeApi } from "@/src/data/api/platform-branding-theme-api";
import { CustomerThemePreview } from "@/src/ui/domain/CustomerThemePreview";
import { API_BASE_URL } from "@/src/data/api/http-client";
import { BrandColourSelect, Button, Image, Input, Modal, Text } from "@/src/ui";

const emptyTheme: BrandingThemeV2 = {
  primaryColor: "#0F766E",
  secondaryColor: "#115E59",
  accentColor: "#F59E0B",
  backgroundColor: "#FFFFFF",
  textColor: "#1F2937",
  backgroundImageUrl: null,
  decoration: { style: "NONE", intensity: "SUBTLE", cardTreatment: "SOLID", headerTreatment: "SOLID", pattern: "NONE", borderStyle: "NONE" },
};

const colourFields: Array<{
  key: keyof Pick<BrandingThemeV2, "primaryColor" | "secondaryColor" | "accentColor" | "backgroundColor" | "textColor">;
  label: string;
}> = [
  { key: "primaryColor", label: "Primary color" },
  { key: "secondaryColor", label: "Secondary color" },
  { key: "accentColor", label: "Accent color" },
  { key: "backgroundColor", label: "Background color" },
  { key: "textColor", label: "Text color" },
];

const MAX_THEME_IMAGE_BYTES = 10 * 1024 * 1024;

const previewImageUrl = (path: string | null | undefined) => {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
  if (path.startsWith("/api/")) return `${API_BASE_URL.replace(/\/$/, "")}${path}`;
  if (path.startsWith("api/")) return `${API_BASE_URL.replace(/\/$/, "")}/${path}`;
  return undefined;
};

const isHexColour = (value: string) => /^#[0-9A-F]{6}$/i.test(value.trim());

function normalizeTheme(theme?: BrandingThemeV2 | null): BrandingThemeV2 {
  return {
    primaryColor: typeof theme?.primaryColor === "string" ? theme.primaryColor : "",
    secondaryColor: typeof theme?.secondaryColor === "string" ? theme.secondaryColor : "",
    accentColor: typeof theme?.accentColor === "string" ? theme.accentColor : "",
    backgroundColor: typeof theme?.backgroundColor === "string" ? theme.backgroundColor : "",
    textColor: typeof theme?.textColor === "string" ? theme.textColor : "",
    backgroundImageUrl: typeof theme?.backgroundImageUrl === "string" ? theme.backgroundImageUrl : null,
    decoration: theme?.decoration ?? emptyTheme.decoration,
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
  const [selectedImage, setSelectedImage] = useState<PickedBrandingAsset | null>(null);
  const [imageTarget, setImageTarget] = useState<"page" | "card">("page");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
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
  const canUpload = Boolean(draft?.id && draft.code.trim() && selectedImage);

  const edit = (theme?: PlatformBrandingThemeV2) => {
    setDraft(editorTheme(theme));
    setSelectedImage(null);
    setImageError(null);
    setImageNotice(null);
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

  const selectImage = async (target: "page" | "card" = "page") => {
    setImageTarget(target);
    setImageError(null);
    setImageNotice(null);
    try {
      const asset = await pickBrandingAsset({ assetType: "platformThemeBackground" });
      if (!asset) return;
      // The picker does not expose a reliable size on every platform.
      // On web, the blob URL can be measured before accepting the image.
      if (typeof window !== "undefined") {
        const file = await fetch(asset.uri).then((response) => response.blob());
        if (file.size > MAX_THEME_IMAGE_BYTES) {
          setSelectedImage(null);
          setImageError(`Image is ${(file.size / 1048576).toFixed(1)} MB. Select an image smaller than 10 MB.`);
          return;
        }
      }
      setSelectedImage(asset);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Unable to select image.");
    }
  };

  const uploadImage = async () => {
    setImageError(null);
    setImageNotice(null);
    if (!draft?.id || !draft.code.trim() || !selectedImage) {
      setImageError("Save Draft first, then select a background image to upload.");
      return;
    }
    setUploadingImage(true);
    try {
      const path = await platformBrandingThemeApi.uploadBackgroundImage(draft.code, selectedImage);
      if (imageTarget === "card") {
        updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), cardBackgroundImageUrl: path });
      } else {
        updateTheme("backgroundImageUrl", path);
      }
      setSelectedImage(null);
      setImageNotice("Image uploaded. Click Save Draft to retain it in this theme.");
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Unable to upload image. Please retry.");
    } finally {
      setUploadingImage(false);
    }
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
      setImageNotice(null);
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
            <Button label="Close Editor" variant="secondary" onPress={() => { setOpen(false); setSelectedImage(null); }} />
          </View>
          <View style={{ flexDirection: width >= 1000 ? "row" : "column", alignItems: "flex-start", gap: 26 }}>
            <View style={{ flex: width >= 1000 ? 1 : undefined, width: width >= 1000 ? undefined : "100%", gap: 12 }}>
              <Text variant="h3">Theme settings</Text>
              <Input label="Theme name" value={draft.displayName ?? ""} onChangeText={(displayName) => setDraft((current) => current ? { ...current, displayName } : current)} />
              <Input label="Theme code" value={draft.code ?? ""} onChangeText={() => undefined} editable={false} placeholder="Generated after first Save Draft" />
              <Input label="Description" value={draft.description ?? ""} onChangeText={(description) => setDraft((current) => current ? { ...current, description } : current)} />
              <View style={{ gap: 10, paddingVertical: 12 }}><Text variant="h3">Decoration configuration</Text>
                <Text variant="label">Style</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button label="NONE" size="sm" variant={values.decoration?.style === "NONE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), style: "NONE" })} />
                  <Button label="CORNERS" size="sm" variant={values.decoration?.style === "CORNERS" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), style: "CORNERS" })} />
                  <Button label="PATTERN" size="sm" variant={values.decoration?.style === "PATTERN" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), style: "PATTERN" })} />
                  <Button label="CONFETTI" size="sm" variant={values.decoration?.style === "CONFETTI" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), style: "CONFETTI" })} />
                  <Button label="BORDER" size="sm" variant={values.decoration?.style === "BORDER" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), style: "BORDER" })} />
                </View>
                <Text variant="label">Intensity</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button label="SUBTLE" size="sm" variant={values.decoration?.intensity === "SUBTLE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), intensity: "SUBTLE" })} />
                  <Button label="BALANCED" size="sm" variant={values.decoration?.intensity === "BALANCED" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), intensity: "BALANCED" })} />
                  <Button label="FESTIVE" size="sm" variant={values.decoration?.intensity === "FESTIVE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), intensity: "FESTIVE" })} />
                </View>
                <Text variant="label">Card treatment</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button label="SOLID" size="sm" variant={values.decoration?.cardTreatment === "SOLID" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), cardTreatment: "SOLID" })} />
                  <Button label="DECORATIVE" size="sm" variant={values.decoration?.cardTreatment === "DECORATIVE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), cardTreatment: "DECORATIVE" })} />
                  <Button label="IMAGE_OVERLAY" size="sm" variant={values.decoration?.cardTreatment === "IMAGE_OVERLAY" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), cardTreatment: "IMAGE_OVERLAY" })} />
                </View>
                <Text variant="label">Header treatment</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button label="SOLID" size="sm" variant={values.decoration?.headerTreatment === "SOLID" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), headerTreatment: "SOLID" })} />
                  <Button label="DECORATIVE" size="sm" variant={values.decoration?.headerTreatment === "DECORATIVE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), headerTreatment: "DECORATIVE" })} />
                  <Button label="IMAGE" size="sm" variant={values.decoration?.headerTreatment === "IMAGE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), headerTreatment: "IMAGE" })} />
                </View>
                <Text variant="label">Pattern</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button label="NONE" size="sm" variant={values.decoration?.pattern === "NONE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), pattern: "NONE" })} />
                  <Button label="DOTS" size="sm" variant={values.decoration?.pattern === "DOTS" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), pattern: "DOTS" })} />
                  <Button label="SPARKLES" size="sm" variant={values.decoration?.pattern === "SPARKLES" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), pattern: "SPARKLES" })} />
                  <Button label="DIAMONDS" size="sm" variant={values.decoration?.pattern === "DIAMONDS" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), pattern: "DIAMONDS" })} />
                </View>
                <Text variant="label">Border</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button label="NONE" size="sm" variant={values.decoration?.borderStyle === "NONE" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), borderStyle: "NONE" })} />
                  <Button label="SOLID" size="sm" variant={values.decoration?.borderStyle === "SOLID" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), borderStyle: "SOLID" })} />
                  <Button label="ELEGANT" size="sm" variant={values.decoration?.borderStyle === "ELEGANT" ? "primary" : "secondary"} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), borderStyle: "ELEGANT" })} />
                </View>
              </View>
              <Text variant="label">Five-colour palette</Text>
              {colourFields.map((field) => (
                <BrandColourSelect key={field.key} label={field.label} value={values[field.key]} onChange={(value) => updateTheme(field.key, value)} />
              ))}
              <View style={{ borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 15, gap: 9 }}>
                <Text variant="h3">Background image</Text>
                <Text variant="bodySmall" color="textMuted">Accepted image size: less than 10 MB. Save Draft first to generate a theme code, upload the image, then Save Draft again to retain it. The server must also allow multipart requests up to 12 MB.</Text>
                {previewImageUrl(values.backgroundImageUrl) ? <Image source={{ uri: previewImageUrl(values.backgroundImageUrl)! }} style={{ width: "100%", height: 150, borderRadius: 8 }} resizeMode="cover" /> : <Text variant="bodySmall" color="textMuted">No background image linked.</Text>}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Button label={values.backgroundImageUrl ? "Replace Image" : "Select Image"} variant="secondary" onPress={() => void selectImage("page")} />
                  <Button label={uploadingImage ? "Uploading…" : "Upload Image"} disabled={!canUpload || uploadingImage} onPress={() => void uploadImage()} />
                  <Button label="Remove Image" variant="secondary" disabled={!values.backgroundImageUrl} onPress={() => updateTheme("backgroundImageUrl", null)} />
                </View>
                <Text variant="h3">Shared card artwork</Text>
                <Text variant="bodySmall" color="textMuted">Upload one dedicated decorative background for membership, benefit and offer cards. The page background remains separate.</Text>
                {previewImageUrl(values.decoration?.cardBackgroundImageUrl) ? <Image source={{ uri: previewImageUrl(values.decoration?.cardBackgroundImageUrl) }} style={{ width: "100%", height: 130, borderRadius: 8 }} resizeMode="contain" /> : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Button label={values.decoration?.cardBackgroundImageUrl ? "Replace Card Artwork" : "Select Card Artwork"} variant="secondary" onPress={() => void selectImage("card")} />
                  <Button label="Remove Card Artwork" variant="secondary" disabled={!values.decoration?.cardBackgroundImageUrl} onPress={() => updateTheme("decoration", { ...(values.decoration ?? emptyTheme.decoration!), cardBackgroundImageUrl: null })} />
                </View>
                {selectedImage ? <Text variant="bodySmall">Selected image type: {imageTarget === "card" ? "Card artwork" : "Page background"}</Text> : null}
                {selectedImage ? <Text variant="bodySmall">Selected: {selectedImage.fileName}{!draft.id ? " — save the draft before uploading." : ""}</Text> : null}
                {imageError ? (
                  <View style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderWidth: 1, borderRadius: 8, padding: 10 }}>
                    <Text variant="bodySmall" style={{ color: "#B91C1C" }}>{imageError}</Text>
                  </View>
                ) : null}
                {imageNotice ? (
                  <View style={{ backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", borderWidth: 1, borderRadius: 8, padding: 10 }}>
                    <Text variant="bodySmall" style={{ color: "#047857" }}>{imageNotice}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ flex: width >= 1000 ? 1.2 : undefined, width: width >= 1000 ? undefined : "100%", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <Text variant="h3">Live customer preview</Text>
                <Button label="Expand Preview" variant="secondary" onPress={() => setPreview(true)} />
              </View>
              <Text variant="bodySmall" color="textMuted">Sample content; colours and background image update as you edit.</Text>
              <CustomerThemePreview theme={values} />
            </View>
          </View>
          {actionFeedback ? (
            <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: actionFeedback.kind === "success" ? "#A7F3D0" : "#FECACA", backgroundColor: actionFeedback.kind === "success" ? "#ECFDF5" : "#FEF2F2" }}>
              <Text variant="bodySmall" style={{ color: actionFeedback.kind === "success" ? "#065F46" : "#B91C1C" }}>{actionFeedback.message}</Text>
            </View>
          ) : null}
          <View style={{ borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 15, flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <Button label="Save Draft" disabled={busy || uploadingImage || !canSave} onPress={() => void save()} />
            <Button label="Preview" variant="secondary" onPress={() => setPreview(true)} />
            <Button label="Publish" disabled={!draft.id || busy || uploadingImage || !canSave} onPress={() => void publish()} />
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
                  <CustomerThemePreview theme={cardTheme} compact businessName="Sample business" />
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
          <CustomerThemePreview theme={values} />
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}
