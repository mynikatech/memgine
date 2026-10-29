import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import type { BrandingThemeV2, PlatformBrandingThemeV2 } from "@/src/core";
import {
  pickBrandingAsset,
  type PickedBrandingAsset,
} from "@/src/core/brandingAssetPicker";
import { platformBrandingThemeApi } from "@/src/data/api/platform-branding-theme-api";
import {
  BrandColourSelect,
  Button,
  Card,
  Image,
  Input,
  Modal,
  Text,
} from "@/src/ui";

const emptyTheme: BrandingThemeV2 = {
  primaryColor: "#0F766E",
  secondaryColor: "#115E59",
  accentColor: "#F59E0B",
  backgroundColor: "#FFFFFF",
  textColor: "#1F2937",
  backgroundImageUrl: null,
};

const colourFields: Array<{
  key: keyof Omit<BrandingThemeV2, "backgroundImageUrl">;
  label: string;
}> = [
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
    secondaryColor:
      typeof theme?.secondaryColor === "string" ? theme.secondaryColor : "",
    accentColor: typeof theme?.accentColor === "string" ? theme.accentColor : "",
    backgroundColor:
      typeof theme?.backgroundColor === "string" ? theme.backgroundColor : "",
    textColor: typeof theme?.textColor === "string" ? theme.textColor : "",
    backgroundImageUrl:
      typeof theme?.backgroundImageUrl === "string"
        ? theme.backgroundImageUrl
        : null,
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
  const [themes, setThemes] = useState<PlatformBrandingThemeV2[]>([]);
  const [draft, setDraft] = useState<PlatformBrandingThemeV2 | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PickedBrandingAsset | null>(
    null,
  );
  const [uploadingImage, setUploadingImage] = useState(false);

  const load = useCallback(async () => {
    const result = await platformBrandingThemeApi.listAll();
    if (!result.success) {
      throw new Error(result.error.message);
    }
    setThemes(result.data);
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      Alert.alert(
        "Unable to load themes",
        error instanceof Error ? error.message : "Unable to load themes",
      ),
    );
  }, [load]);

  const values = useMemo(
    () => normalizeTheme(draft?.draftTheme ?? draft?.publishedTheme),
    [draft],
  );
  const canSave = Boolean(
    draft?.displayName.trim() &&
      colourFields.every((field) => isHexColour(values[field.key])),
  );
  const canUpload = Boolean(draft?.id && draft.code.trim() && selectedImage);

  const edit = (theme?: PlatformBrandingThemeV2) => {
    setDraft(editorTheme(theme));
    setSelectedImage(null);
    setOpen(true);
  };

  const updateTheme = (key: keyof BrandingThemeV2, value: string | null) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            draftTheme: {
              ...normalizeTheme(current.draftTheme ?? current.publishedTheme),
              [key]: value,
            },
          }
        : current,
    );
  };

  const selectImage = async () => {
    try {
      const asset = await pickBrandingAsset({ assetType: "platformThemeBackground" });
      if (asset) {
        setSelectedImage(asset);
      }
    } catch (error) {
      Alert.alert(
        "Unable to select image",
        error instanceof Error ? error.message : "Unable to select image",
      );
    }
  };

  const uploadImage = async () => {
    if (!draft?.id || !draft.code.trim() || !selectedImage) {
      Alert.alert(
        "Save Draft first",
        "Save the theme draft before uploading its background image.",
      );
      return;
    }

    setUploadingImage(true);
    try {
      const path = await platformBrandingThemeApi.uploadBackgroundImage(
        draft.code,
        selectedImage,
      );
      updateTheme("backgroundImageUrl", path);
      setSelectedImage(null);
    } catch (error) {
      Alert.alert(
        "Unable to upload image",
        error instanceof Error ? error.message : "Unable to upload image",
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const save = async () => {
    if (!draft || !canSave) {
      Alert.alert(
        "Complete the theme",
        "Enter a name and valid six-digit HEX values for every color.",
      );
      return;
    }

    setBusy(true);
    try {
      const body = {
        displayName: draft.displayName,
        description: draft.description ?? "",
        theme: values,
        versionNo: draft.id ? draft.versionNo : undefined,
      };
      const result = draft.id
        ? await platformBrandingThemeApi.saveDraft(draft.id, body)
        : await platformBrandingThemeApi.create(body);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      setDraft(editorTheme(result.data));
      await load();
      Alert.alert(
        "Draft saved",
        "This theme is visible only to Platform Admin until published.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to save draft",
        error instanceof Error ? error.message : "Unable to save draft",
      );
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!draft?.id) {
      return;
    }

    setBusy(true);
    try {
      const result = await platformBrandingThemeApi.publish(
        draft.id,
        draft.versionNo,
      );
      if (!result.success) {
        throw new Error(result.error.message);
      }
      setDraft(editorTheme(result.data));
      await load();
      Alert.alert(
        "Theme published",
        "The published theme is now available for future organization selections.",
      );
    } catch (error) {
      Alert.alert(
        "Unable to publish",
        error instanceof Error ? error.message : "Unable to publish",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (theme: PlatformBrandingThemeV2) => {
    const result = await platformBrandingThemeApi.setActive(
      theme.id,
      theme.versionNo,
      !theme.isActive,
    );
    if (!result.success) {
      Alert.alert("Unable to update theme", result.error.message);
      return;
    }
    await load();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View>
        <Text variant="title">Theme Builder</Text>
        <Text variant="body" color="textMuted">
          Create global reusable themes. Draft edits do not affect organizations
          until published.
        </Text>
      </View>

      <Button label="Create New Theme" onPress={() => edit()} />

      {themes.map((theme) => {
        const cardTheme = normalizeTheme(theme.draftTheme ?? theme.publishedTheme);
        const hasUnpublishedChanges =
          theme.draftTheme &&
          theme.publishedTheme &&
          JSON.stringify(theme.draftTheme) !== JSON.stringify(theme.publishedTheme);

        return (
          <Card key={theme.id} style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="h3">{theme.displayName}</Text>
                <Text variant="bodySmall" color="textMuted">
                  {theme.code} · {theme.isActive
                    ? hasUnpublishedChanges
                      ? "Published with unpublished changes"
                      : theme.publicationStatus
                    : "Inactive"}
                </Text>
              </View>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: cardTheme.primaryColor || "transparent",
                }}
              />
            </View>
            <Text variant="bodySmall">{theme.description || "No description"}</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button label="Edit" variant="secondary" onPress={() => edit(theme)} />
              <Button
                label={theme.isActive ? "Deactivate" : "Activate"}
                variant="secondary"
                onPress={() => void toggle(theme)}
              />
            </View>
          </Card>
        );
      })}

      <Modal
        visible={open}
        title={draft?.id ? "Edit Theme" : "Create Theme"}
        onClose={() => setOpen(false)}
      >
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          <Input
            label="Theme name"
            value={draft?.displayName ?? ""}
            onChangeText={(displayName) =>
              setDraft((current) =>
                current ? { ...current, displayName } : current,
              )
            }
          />
          <Input
            label="Theme code"
            value={draft?.code ?? ""}
            onChangeText={() => undefined}
            editable={false}
            placeholder="Generated after the first Save Draft"
          />
          <Input
            label="Description"
            value={draft?.description ?? ""}
            onChangeText={(description) =>
              setDraft((current) =>
                current ? { ...current, description } : current,
              )
            }
          />

          {colourFields.map((field) => (
            <BrandColourSelect
              key={field.key}
              label={field.label}
              value={values[field.key]}
              onChange={(value) => updateTheme(field.key, value)}
            />
          ))}

          <View style={{ gap: 8 }}>
            <Text variant="label">Background image</Text>
            {values.backgroundImageUrl ? (
              <Image
                source={{ uri: values.backgroundImageUrl }}
                style={{ width: "100%", height: 140, borderRadius: 8 }}
                resizeMode="cover"
              />
            ) : (
              <Text variant="bodySmall" color="textMuted">
                No background image selected.
              </Text>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                label={values.backgroundImageUrl ? "Replace Image" : "Select Image"}
                variant="secondary"
                onPress={() => void selectImage()}
              />
              <Button
                label={uploadingImage ? "Uploading…" : "Upload Image"}
                disabled={!canUpload || uploadingImage}
                onPress={() => void uploadImage()}
              />
              <Button
                label="Remove Image"
                variant="secondary"
                disabled={!values.backgroundImageUrl}
                onPress={() => updateTheme("backgroundImageUrl", null)}
              />
            </View>
            {selectedImage ? (
              <Text variant="bodySmall">
                Selected: {selectedImage.fileName}
                {!draft?.id ? " — save the draft before uploading." : ""}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              padding: 18,
              borderRadius: 8,
              backgroundColor: values.backgroundColor || "#FFFFFF",
              gap: 8,
            }}
          >
            <Text variant="h3" style={{ color: values.textColor || "#1F2937" }}>
              Sample business
            </Text>
            {values.backgroundImageUrl ? (
              <Image
                source={{ uri: values.backgroundImageUrl }}
                style={{ width: "100%", height: 92, borderRadius: 6 }}
                resizeMode="cover"
              />
            ) : null}
            <Text variant="body" style={{ color: values.textColor || "#1F2937" }}>
              Membership · Benefit · Offer
            </Text>
            <View
              style={{
                backgroundColor: values.primaryColor || "#0F766E",
                padding: 10,
                borderRadius: 6,
              }}
            >
              <Text variant="body" style={{ color: "#FFFFFF" }}>
                Join now
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button label="Save Draft" disabled={busy} onPress={() => void save()} />
            <Button label="Preview" variant="secondary" onPress={() => setPreview(true)} />
            <Button
              label="Publish"
              disabled={!draft?.id || busy}
              onPress={() => void publish()}
            />
          </View>
        </ScrollView>
      </Modal>

      <Modal visible={preview} title="Theme Preview" onClose={() => setPreview(false)}>
        <View
          style={{
            minHeight: 260,
            padding: 24,
            borderRadius: 8,
            backgroundColor: values.backgroundColor || "#FFFFFF",
            gap: 14,
          }}
        >
          <Text variant="title" style={{ color: values.textColor || "#1F2937" }}>
            Memgine Bakery
          </Text>
          <Card style={{ backgroundColor: values.secondaryColor || "#115E59" }}>
            <Text variant="h3" style={{ color: "#FFFFFF" }}>
              Sample Membership
            </Text>
          </Card>
          <Card style={{ borderColor: values.accentColor || "#F59E0B" }}>
            <Text variant="body" style={{ color: values.textColor || "#1F2937" }}>
              A member benefit and seasonal offer.
            </Text>
          </Card>
          <Button label="Primary action" onPress={() => undefined} />
        </View>
      </Modal>
    </ScrollView>
  );
}
