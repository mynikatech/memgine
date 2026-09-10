import { useEffect, useMemo, useState } from "react";

import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import type {
  ID,
  Organization,
  OrganizationBranding,
  TemplateCatalogueItem,
} from "@/src/core";

import { pickBrandingAsset } from "@/src/core/brandingAssetPicker";

import { useTheme } from "@/src/providers";

import {
  BrandColourSelect,
  Button,
  Card,
  Image,
  Input,
  ReferenceSelect,
  Section,
  Text,
} from "@/src/ui";

type BrandingAssetField =
  | "logoUrl"
  | "darkThemeLogoUrl"
  | "faviconUrl"
  | "splashScreenImageUrl"
  | "heroImageUrl";

type BrandingAssetType =
  | "logo"
  | "darkThemeLogo"
  | "favicon"
  | "splashScreen"
  | "heroImage";

type BrandingFormProps = {
  organization: Organization;
  branding: OrganizationBranding | null;
  templates: TemplateCatalogueItem[];
  onSave: (branding: OrganizationBranding) => Promise<void>;
};

function createEmptyBranding(
  organizationId: ID,
  createdBy: ID,
  defaultTemplateId: ID,
): OrganizationBranding {
  const now = new Date().toISOString();

  return {
    id: `branding-${organizationId}`,
    organizationId,

    brandingName: "",
    themeTemplateId: defaultTemplateId,

    logoUrl: undefined,
    darkThemeLogoUrl: undefined,
    faviconUrl: undefined,
    splashScreenImageUrl: undefined,
    tagline: undefined,
    heroImageUrl: undefined,

    primaryColor: undefined,
    secondaryColor: undefined,
    accentColor: undefined,

    /*
     * Branding Status is intentionally not exposed in the
     * Organization Admin UI at this stage.
     *
     * The field remains part of the domain model.
     */
    brandingStatusId: "branding-status-active",

    createdAt: now,
    createdBy,

    updatedAt: now,
    updatedBy: createdBy,

    isDeleted: false,
    versionNo: 1,
  };
}

function hasImage(value?: string): boolean {
  if (!value?.trim()) {
    return false;
  }

  return (
    /^https?:\/\//i.test(value.trim()) || /^data:image\//i.test(value.trim())
  );
}

function getMonogram(value?: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    return "?";
  }

  return normalized.charAt(0).toUpperCase();
}

function getAssetType(field: BrandingAssetField): BrandingAssetType {
  switch (field) {
    case "logoUrl":
      return "logo";

    case "darkThemeLogoUrl":
      return "darkThemeLogo";

    case "faviconUrl":
      return "favicon";

    case "splashScreenImageUrl":
      return "splashScreen";

    case "heroImageUrl":
      return "heroImage";
  }
}

type AssetPreviewProps = {
  label: string;
  description: string;
  value?: string;
  compact?: boolean;
  editable: boolean;
  saving: boolean;
  onPick: () => void;
  onRemove: () => void;
};

function AssetPreview({
  label,
  description,
  value,
  compact = false,
  editable,
  saving,
  onPick,
  onRemove,
}: AssetPreviewProps) {
  const theme = useTheme();

  const configured = hasImage(value);

  return (
    <View
      style={[
        styles.assetPreview,
        compact && styles.assetPreviewCompact,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <View style={styles.assetPreviewHeader}>
        <View style={styles.assetPreviewTitle}>
          <Text variant="body" color="text">
            {label}
          </Text>

          <Text variant="caption" color="textSecondary">
            {description}
          </Text>
        </View>

        <View
          style={[
            styles.assetStatus,
            {
              backgroundColor: configured
                ? theme.colors.primarySoft
                : theme.colors.surface,
            },
          ]}
        >
          <Text variant="caption" color={configured ? "primary" : "textMuted"}>
            {configured ? "Configured" : "Not set"}
          </Text>
        </View>
      </View>

      {/*
       * Deliberately compact square preview.
       *
       * The image itself occupies the complete preview area,
       * while contain keeps the complete uploaded asset visible.
       */}
      <View
        style={[
          styles.assetImage,
          compact && styles.assetImageCompact,
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {configured ? (
          <Image
            source={{ uri: value }}
            resizeMode="contain"
            style={styles.image}
          />
        ) : (
          <View style={styles.placeholderAsset}>
            <Text variant="bodySmall" color="textMuted">
              No asset configured
            </Text>
          </View>
        )}
      </View>

      {editable ? (
        <View style={styles.assetActions}>
          <Button
            label={configured ? "Replace Image" : "Choose Image"}
            onPress={onPick}
            disabled={saving}
          />

          {configured ? (
            <Pressable
              disabled={saving}
              onPress={onRemove}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: theme.spacing.sm,
                opacity: saving
                  ? theme.states.disabledOpacity
                  : pressed
                    ? theme.states.pressedOpacity
                    : 1,
              })}
            >
              <Text variant="bodySmall" color="danger">
                Remove
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function BrandingForm({
  organization,
  branding,
  templates,
  onSave,
}: BrandingFormProps) {
  const theme = useTheme();

  const { width } = useWindowDimensions();

  const compact = width < 760;
  const narrow = width < 520;

  const compatibleTemplates = useMemo(
    () =>
      templates.filter(
        (item) => item.organizationTypeId === organization.organizationTypeId,
      ),
    [templates, organization.organizationTypeId],
  );

  const defaultTemplate = compatibleTemplates[0];

  const defaultTemplateId = defaultTemplate?.id ?? "";

  const [form, setForm] = useState<OrganizationBranding>(
    branding ??
      createEmptyBranding(
        organization.id,
        organization.updatedBy,
        defaultTemplateId,
      ),
  );

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setForm(
      branding ??
        createEmptyBranding(
          organization.id,
          organization.updatedBy,
          defaultTemplateId,
        ),
    );

    setDirty(false);
    setError(null);
    setIsEditing(false);
  }, [
    branding,
    organization.id,
    organization.updatedBy,
    organization.organizationTypeId,
    defaultTemplateId,
  ]);

  const update = <K extends keyof OrganizationBranding>(
    field: K,
    value: OrganizationBranding[K],
  ) => {
    if (!isEditing) {
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setDirty(true);
    setError(null);
  };

  const templateItems = useMemo(
    () =>
      compatibleTemplates.map((item) => ({
        id: item.id,
        code: item.id,
        name: item.template.displayName,
        displayOrder: 0,
        active: true,
      })),
    [compatibleTemplates],
  );

  const validate = (): string | null => {
    if (!form.brandingName.trim()) {
      return "Branding Name is required.";
    }

    if (!form.themeTemplateId.trim()) {
      return "Theme Template is required.";
    }

    const selectedTemplate = compatibleTemplates.find(
      (item) => item.id === form.themeTemplateId,
    );

    if (!selectedTemplate) {
      return "Please select a valid theme template for this organization type.";
    }

    return null;
  };

  const save = async () => {
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated: OrganizationBranding = {
        ...form,

        brandingName: form.brandingName.trim(),

        logoUrl: form.logoUrl?.trim() || undefined,

        darkThemeLogoUrl: form.darkThemeLogoUrl?.trim() || undefined,

        faviconUrl: form.faviconUrl?.trim() || undefined,

        splashScreenImageUrl: form.splashScreenImageUrl?.trim() || undefined,

        tagline: form.tagline?.trim() || undefined,

        heroImageUrl: form.heroImageUrl?.trim() || undefined,

        primaryColor: form.primaryColor?.trim() || undefined,

        secondaryColor: form.secondaryColor?.trim() || undefined,

        accentColor: form.accentColor?.trim() || undefined,

        updatedAt: new Date().toISOString(),

        updatedBy: organization.updatedBy,

        versionNo: form.versionNo + 1,
      };

      await onSave(updated);

      setForm(updated);
      setDirty(false);
      setIsEditing(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save branding.",
      );
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setForm(
      branding ??
        createEmptyBranding(
          organization.id,
          organization.updatedBy,
          defaultTemplateId,
        ),
    );

    setDirty(false);
    setError(null);
    setIsEditing(false);
  };

  const enterEditMode = () => {
    setError(null);
    setIsEditing(true);
  };

  const handlePickAsset = async (field: BrandingAssetField) => {
    if (!isEditing || saving) {
      return;
    }

    setError(null);

    try {
      const selectedAsset = await pickBrandingAsset({
        assetType: getAssetType(field),
      });

      if (!selectedAsset) {
        return;
      }

      setForm((current) => ({
        ...current,
        [field]: selectedAsset,
      }));

      setDirty(true);
    } catch (pickError) {
      setError(
        pickError instanceof Error
          ? pickError.message
          : "Unable to select the image.",
      );
    }
  };

  const handleRemoveAsset = (field: BrandingAssetField) => {
    if (!isEditing || saving) {
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: undefined,
    }));

    setDirty(true);
    setError(null);
  };

  const controlsDisabled = !isEditing || saving;

  const primaryColor = form.primaryColor?.trim() || theme.colors.primary;

  const secondaryColor = form.secondaryColor?.trim() || theme.colors.secondary;

  const accentColor = form.accentColor?.trim() || theme.colors.primary;

  const previewName =
    form.brandingName.trim() || organization.displayName || "Your Business";

  const previewMonogram = getMonogram(previewName);

  return (
    <ScrollView
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
      contentContainerStyle={[
        styles.content,
        {
          padding: narrow ? theme.spacing.md : theme.spacing.xl,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}

      <View style={styles.pageHeader}>
        <View style={styles.headerText}>
          <Text variant="h1" color="text">
            Branding
          </Text>

          <Text variant="bodySmall" color="textSecondary">
            Configure how {organization.displayName} is presented throughout the
            Memgine customer experience.
          </Text>
        </View>

        <View style={styles.headerActions}>
          {isEditing && dirty ? (
            <View
              style={[
                styles.unsavedBadge,
                {
                  backgroundColor: theme.colors.primarySoft,
                },
              ]}
            >
              <View
                style={[
                  styles.unsavedDot,
                  {
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              />

              <Text variant="caption" color="primary">
                Unsaved changes
              </Text>
            </View>
          ) : null}

          {!isEditing ? (
            <Button
              label="Edit Branding"
              onPress={enterEditMode}
              disabled={saving}
            />
          ) : null}
        </View>
      </View>

      {/* Error */}

      {error ? (
        <Card
          padding="md"
          elevation="sm"
          style={[
            styles.errorCard,
            {
              borderColor: theme.colors.danger,
            },
          ]}
        >
          <View style={styles.errorContent}>
            <Text variant="bodyStrong" color="danger">
              Unable to save branding
            </Text>

            <Text variant="bodySmall" color="danger">
              {error}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Brand Identity */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Identity"
          description="Define the name and platform template used by this organization."
        >
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Branding Name"
                required
                value={form.brandingName}
                onChangeText={(value) => update("brandingName", value)}
                placeholder={organization.displayName}
                editable={!controlsDisabled}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Tagline"
                value={form.tagline ?? ""}
                onChangeText={(value) => update("tagline", value)}
                placeholder="Great products, great experiences, every day."
                editable={!controlsDisabled}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Theme Template"
                required
                value={form.themeTemplateId}
                items={templateItems}
                onChange={(value) => update("themeTemplateId", value)}
                placeholder={
                  compatibleTemplates.length === 0
                    ? "No template available"
                    : "Select theme template"
                }
                disabled={controlsDisabled || compatibleTemplates.length <= 1}
                error={
                  compatibleTemplates.length === 0
                    ? "No template is configured for this organization type."
                    : undefined
                }
              />
            </View>
          </View>
        </Section>
      </Card>

      {/* Brand Assets */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Assets"
          description="Configure the visual assets used by the branded customer experience."
        >
          <View style={[styles.assetGrid, compact && styles.assetGridCompact]}>
            <AssetPreview
              label="Primary Logo"
              description="Light theme / normal customer UI"
              value={form.logoUrl}
              compact
              editable={isEditing}
              saving={saving}
              onPick={() => void handlePickAsset("logoUrl")}
              onRemove={() => handleRemoveAsset("logoUrl")}
            />

            <AssetPreview
              label="Dark Theme Logo"
              description="Dark surfaces and dark mode"
              value={form.darkThemeLogoUrl}
              compact
              editable={isEditing}
              saving={saving}
              onPick={() => void handlePickAsset("darkThemeLogoUrl")}
              onRemove={() => handleRemoveAsset("darkThemeLogoUrl")}
            />

            <AssetPreview
              label="Favicon"
              description="Browser / web application icon"
              value={form.faviconUrl}
              compact
              editable={isEditing}
              saving={saving}
              onPick={() => void handlePickAsset("faviconUrl")}
              onRemove={() => handleRemoveAsset("faviconUrl")}
            />

            <AssetPreview
              label="Splash Screen"
              description="Application launch screen"
              value={form.splashScreenImageUrl}
              compact
              editable={isEditing}
              saving={saving}
              onPick={() => void handlePickAsset("splashScreenImageUrl")}
              onRemove={() => handleRemoveAsset("splashScreenImageUrl")}
            />

            <AssetPreview
              label="Hero Image"
              description="Primary customer experience hero/banner"
              value={form.heroImageUrl}
              compact
              editable={isEditing}
              saving={saving}
              onPick={() => void handlePickAsset("heroImageUrl")}
              onRemove={() => handleRemoveAsset("heroImageUrl")}
            />
          </View>
        </Section>
      </Card>

      {/* Brand Colors */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Colors"
          description="Configure the colors used throughout the customer-facing experience."
        >
          <View style={styles.grid}>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <View pointerEvents={controlsDisabled ? "none" : "auto"}>
                <BrandColourSelect
                  label="Primary Brand Color"
                  value={form.primaryColor}
                  onChange={(value) => update("primaryColor", value)}
                />
              </View>
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <View pointerEvents={controlsDisabled ? "none" : "auto"}>
                <BrandColourSelect
                  label="Secondary Brand Color"
                  value={form.secondaryColor}
                  onChange={(value) => update("secondaryColor", value)}
                />
              </View>
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <View pointerEvents={controlsDisabled ? "none" : "auto"}>
                <BrandColourSelect
                  label="Accent Color"
                  value={form.accentColor}
                  onChange={(value) => update("accentColor", value)}
                />
              </View>
            </View>
          </View>
        </Section>
      </Card>

      {/* Brand Preview */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Preview"
          description="Preview the configured visual identity."
        >
          <View
            style={[
              styles.brandPreview,
              {
                backgroundColor: primaryColor,
                borderColor: secondaryColor,
              },
            ]}
          >
            <View style={styles.previewTop}>
              <View
                style={[
                  styles.logoContainer,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: secondaryColor,
                  },
                ]}
              >
                {hasImage(form.logoUrl) ? (
                  <Image
                    source={{
                      uri: form.logoUrl,
                    }}
                    resizeMode="contain"
                    style={styles.logo}
                  />
                ) : (
                  <View
                    style={[
                      styles.monogram,
                      {
                        backgroundColor: primaryColor,
                      },
                    ]}
                  >
                    <Text
                      variant="h2"
                      style={{
                        color: accentColor,
                        fontWeight: "700",
                      }}
                    >
                      {previewMonogram}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.previewIdentity}>
                <Text variant="h2" color="text">
                  {previewName}
                </Text>

                <Text variant="bodySmall" color="textSecondary">
                  {form.tagline?.trim() || "Customer experience preview"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.previewMembership,
                {
                  backgroundColor: theme.colors.background,
                },
              ]}
            >
              <View style={styles.previewMembershipText}>
                <Text variant="bodySmall" color="textMuted">
                  MEMBERSHIP
                </Text>

                <Text variant="title" color="text">
                  Member Experience
                </Text>
              </View>

              <View
                style={[
                  styles.previewAction,
                  {
                    backgroundColor: accentColor,
                  },
                ]}
              >
                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.background,
                    fontWeight: "600",
                  }}
                >
                  View
                </Text>
              </View>
            </View>

            {hasImage(form.heroImageUrl) ? (
              <View style={styles.previewHero}>
                <Image
                  source={{ uri: form.heroImageUrl }}
                  resizeMode="cover"
                  style={styles.previewHeroImage}
                />
              </View>
            ) : null}

            <View style={styles.colorSummary}>
              <View style={styles.colorSummaryItem}>
                <View
                  style={[
                    styles.colorCircle,
                    {
                      backgroundColor: primaryColor,
                    },
                  ]}
                />

                <Text variant="caption" color="textSecondary">
                  Primary
                </Text>
              </View>

              <View style={styles.colorSummaryItem}>
                <View
                  style={[
                    styles.colorCircle,
                    {
                      backgroundColor: secondaryColor,
                    },
                  ]}
                />

                <Text variant="caption" color="textSecondary">
                  Secondary
                </Text>
              </View>

              <View style={styles.colorSummaryItem}>
                <View
                  style={[
                    styles.colorCircle,
                    {
                      backgroundColor: accentColor,
                    },
                  ]}
                />

                <Text variant="caption" color="textSecondary">
                  Accent
                </Text>
              </View>
            </View>
          </View>
        </Section>
      </Card>

      {/* Actions */}

      {isEditing ? (
        <View style={[styles.actions, narrow && styles.actionsStacked]}>
          <Pressable
            disabled={saving}
            onPress={resetChanges}
            style={({ pressed }) => ({
              minHeight: 48,
              justifyContent: "center",
              paddingHorizontal: theme.spacing.md,
              opacity: saving
                ? theme.states.disabledOpacity
                : pressed
                  ? theme.states.pressedOpacity
                  : 1,
            })}
          >
            <Text variant="body" color="textSecondary">
              {dirty ? "Discard Changes" : "Cancel"}
            </Text>
          </Pressable>

          <Button
            label={saving ? "Saving..." : "Save Changes"}
            onPress={() => {
              void save();
            }}
            disabled={saving || !dirty || compatibleTemplates.length === 0}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    gap: 20,
  },

  pageHeader: {
    gap: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  headerText: {
    flex: 1,
    gap: 6,
  },

  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },

  unsavedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  unsavedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  errorCard: {
    borderWidth: 1,
  },

  errorContent: {
    gap: 4,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },

  fullWidth: {
    width: "100%",
  },

  halfWidth: {
    width: "48%",
  },

  /*
   * Four asset cards are intentionally compact.
   */
  assetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  assetGridCompact: {
    flexDirection: "column",
  },

  assetPreview: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },

  assetPreviewCompact: {
    /*
     * Keeps the cards compact even on wide screens.
     */
    width: "48%",
  },

  assetPreviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },

  assetPreviewTitle: {
    flex: 1,
    gap: 2,
  },

  assetStatus: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  /*
   * Small square preview.
   *
   * The square is intentionally fixed rather than consuming
   * the entire width of the asset card.
   */
  assetImage: {
    width: 150,
    height: 150,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  assetImageCompact: {
    width: 120,
    height: 120,
  },

  image: {
    width: "100%",
    height: "100%",
  },

  placeholderAsset: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },

  assetActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },

  brandPreview: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 16,
  },

  previewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  logoContainer: {
    width: 72,
    height: 72,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  logo: {
    width: "100%",
    height: "100%",
  },

  monogram: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  previewIdentity: {
    flex: 1,
    gap: 4,
  },

  previewMembership: {
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  previewMembershipText: {
    flex: 1,
    gap: 4,
  },

  previewHero: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },

  previewHeroImage: {
    width: "100%",
    height: "100%",
  },

  previewAction: {
    minWidth: 72,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  colorSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },

  colorSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  colorCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingBottom: 24,
  },

  actionsStacked: {
    flexDirection: "column-reverse",
    alignItems: "stretch",
  },
});
