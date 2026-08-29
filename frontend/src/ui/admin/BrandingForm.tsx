import { useEffect, useMemo, useState } from "react";

import {
  Image,
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
  Status,
  TemplateCatalogueItem,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import {
  BrandColourSelect,
  Button,
  Card,
  Input,
  ReferenceSelect,
  Section,
  Text,
} from "@/src/ui";

type BrandingFormProps = {
  organization: Organization;
  branding: OrganizationBranding | null;
  templates: TemplateCatalogueItem[];
  brandingStatuses: Status[];
  onSave: (branding: OrganizationBranding) => Promise<void>;
};

function createEmptyBranding(
  organizationId: ID,
  createdBy: ID,
  defaultTemplateId: ID,
  defaultStatusId: ID,
): OrganizationBranding {
  const now = new Date().toISOString();

  return {
    id: `branding-${organizationId}`,
    organizationId,
    brandingName: "",
    themeTemplateId: defaultTemplateId,

    /*
     * No configured logo means the customer experience
     * must use the organization's monogram.
     */
    logoUrl: undefined,
    darkThemeLogoUrl: undefined,
    faviconUrl: undefined,
    splashScreenImageUrl: undefined,

    primaryColor: undefined,
    secondaryColor: undefined,
    accentColor: undefined,

    brandingStatusId: defaultStatusId,

    createdAt: now,
    createdBy,

    updatedAt: now,
    updatedBy: createdBy,

    isDeleted: false,
    versionNo: 1,
  };
}

function isValidImageUrl(value?: string): boolean {
  if (!value?.trim()) {
    return false;
  }

  return /^https?:\/\//i.test(value.trim());
}

function getMonogram(value?: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    return "?";
  }

  /*
   * Keep this deliberately simple.
   *
   * The customer-facing experience can later use the same
   * shared monogram resolver if we decide to support
   * multi-word initials.
   */
  return normalized.charAt(0).toUpperCase();
}

type AssetPreviewProps = {
  label: string;
  description: string;
  url?: string;
  compact?: boolean;
};

function AssetPreview({
  label,
  description,
  url,
  compact = false,
}: AssetPreviewProps) {
  const theme = useTheme();

  const hasImage = isValidImageUrl(url);

  return (
    <View
      style={[
        styles.assetPreview,
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
              backgroundColor: hasImage
                ? theme.colors.primarySoft
                : theme.colors.surface,
            },
          ]}
        >
          <Text variant="caption" color={hasImage ? "primary" : "textMuted"}>
            {hasImage ? "Configured" : "Not set"}
          </Text>
        </View>
      </View>

      <View
        style={[
          compact ? styles.assetImageCompact : styles.assetImage,
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {hasImage ? (
          <Image
            source={{ uri: url }}
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
    </View>
  );
}

export function BrandingForm({
  organization,
  branding,
  templates,
  brandingStatuses,
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

  const defaultStatusId = brandingStatuses[0]?.id ?? "";

  const [form, setForm] = useState<OrganizationBranding>(
    branding ??
      createEmptyBranding(
        organization.id,
        organization.updatedBy,
        defaultTemplateId,
        defaultStatusId,
      ),
  );

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(
      branding ??
        createEmptyBranding(
          organization.id,
          organization.updatedBy,
          defaultTemplateId,
          defaultStatusId,
        ),
    );

    setDirty(false);
    setError(null);
  }, [
    branding,
    organization.id,
    organization.updatedBy,
    organization.organizationTypeId,
    defaultTemplateId,
    defaultStatusId,
  ]);

  const update = <K extends keyof OrganizationBranding>(
    field: K,
    value: OrganizationBranding[K],
  ) => {
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

    if (!form.brandingStatusId.trim()) {
      return "Branding Status is required.";
    }

    const selectedStatus = brandingStatuses.find(
      (status) => status.id === form.brandingStatusId,
    );

    if (!selectedStatus) {
      return "Please select a valid branding status.";
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
          defaultStatusId,
        ),
    );

    setDirty(false);
    setError(null);
  };

  const templateDisabled = compatibleTemplates.length <= 1 || saving;

  /*
   * These are the effective colours used by the preview.
   *
   * Empty branding values fall back to the platform theme.
   */
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
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

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

        {dirty ? (
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
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Error                                                            */}
      {/* ---------------------------------------------------------------- */}

      {error ? (
        <Card
          padding="md"
          elevation="sm"
          style={[
            styles.errorCard,
            {
              borderColor: theme.colors.danger,
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <View style={styles.errorContent}>
            <Text variant="body" color="danger">
              Unable to save branding
            </Text>

            <Text variant="bodySmall" color="danger">
              {error}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Brand Identity                                                   */}
      {/* ---------------------------------------------------------------- */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Identity"
          description="Define the identity and platform template for this organization."
        >
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Branding Name"
                required
                value={form.brandingName}
                onChangeText={(value) => update("brandingName", value)}
                placeholder={organization.displayName}
                editable={!saving}
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
                disabled={templateDisabled}
                error={
                  compatibleTemplates.length === 0
                    ? "No template is configured for this organization type."
                    : undefined
                }
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Branding Status"
                required
                value={form.brandingStatusId}
                items={brandingStatuses}
                onChange={(value) => update("brandingStatusId", value)}
                placeholder={
                  brandingStatuses.length === 0
                    ? "No statuses available"
                    : "Select status"
                }
                disabled={saving}
              />
            </View>
          </View>
        </Section>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Brand Assets                                                     */}
      {/* ---------------------------------------------------------------- */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Assets"
          description="These assets are used by the branded customer experience and application shell."
        >
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Logo URL"
                value={form.logoUrl ?? ""}
                onChangeText={(value) => update("logoUrl", value)}
                keyboardType="url"
                placeholder="https://..."
                editable={!saving}
              />
            </View>

            <View style={styles.fullWidth}>
              <Input
                label="Dark Theme Logo URL"
                value={form.darkThemeLogoUrl ?? ""}
                onChangeText={(value) => update("darkThemeLogoUrl", value)}
                keyboardType="url"
                placeholder="https://..."
                editable={!saving}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Favicon URL"
                value={form.faviconUrl ?? ""}
                onChangeText={(value) => update("faviconUrl", value)}
                keyboardType="url"
                placeholder="https://..."
                editable={!saving}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Splash Screen Image URL"
                value={form.splashScreenImageUrl ?? ""}
                onChangeText={(value) => update("splashScreenImageUrl", value)}
                keyboardType="url"
                placeholder="https://..."
                editable={!saving}
              />
            </View>
          </View>

          <View style={[styles.assetGrid, compact && styles.assetGridCompact]}>
            <AssetPreview
              label="Primary Logo"
              description="Light theme / normal customer UI"
              url={form.logoUrl}
              compact={compact}
            />

            <AssetPreview
              label="Dark Theme Logo"
              description="Dark surfaces and dark mode"
              url={form.darkThemeLogoUrl}
              compact={compact}
            />

            <AssetPreview
              label="Favicon"
              description="Browser / web application icon"
              url={form.faviconUrl}
              compact
            />

            <AssetPreview
              label="Splash Screen"
              description="Application launch screen"
              url={form.splashScreenImageUrl}
              compact
            />
          </View>
        </Section>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Brand Colors                                                     */}
      {/* ---------------------------------------------------------------- */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Colors"
          description="Configure the colors used throughout the customer-facing experience."
        >
          <View style={styles.grid}>
            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <BrandColourSelect
                label="Primary Brand Color"
                value={form.primaryColor}
                onChange={(value) => update("primaryColor", value)}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <BrandColourSelect
                label="Secondary Brand Color"
                value={form.secondaryColor}
                onChange={(value) => update("secondaryColor", value)}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <BrandColourSelect
                label="Accent Color"
                value={form.accentColor}
                onChange={(value) => update("accentColor", value)}
              />
            </View>
          </View>
        </Section>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Brand Preview                                                    */}
      {/* ---------------------------------------------------------------- */}

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section
          title="Brand Preview"
          description="Preview the configured visual identity. The customer experience will use the same branding values."
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
            {/* Header --------------------------------------------------- */}

            <View style={styles.previewTop}>
              <View
                style={[
                  styles.logoContainer,
                  {
                    /*
                     * The container itself uses the effective
                     * secondary colour rather than white.
                     */
                    backgroundColor: theme.colors.background,
                    borderColor: secondaryColor,
                  },
                ]}
              >
                {isValidImageUrl(form.logoUrl) ? (
                  <Image
                    source={{
                      uri: form.logoUrl,
                    }}
                    resizeMode="contain"
                    style={styles.logo}
                  />
                ) : (
                  /*
                   * IMPORTANT:
                   *
                   * No configured logo -> MONOGRAM.
                   *
                   * Do not render an empty white square.
                   */
                  <View
                    style={[
                      styles.monogram,
                      {
                        backgroundColor: accentColor,
                      },
                    ]}
                  >
                    <Text
                      variant="h2"
                      color="onPrimary"
                      style={{
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
                  Customer experience preview
                </Text>
              </View>
            </View>

            {/* Membership ------------------------------------------------ */}

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
                  color="onPrimary"
                  style={{
                    fontWeight: "600",
                  }}
                >
                  View
                </Text>
              </View>
            </View>

            {/* Colour summary ------------------------------------------- */}

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

      {/* ---------------------------------------------------------------- */}
      {/* Actions                                                          */}
      {/* ---------------------------------------------------------------- */}

      <View style={[styles.actions, narrow && styles.actionsStacked]}>
        {dirty ? (
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
              Discard Changes
            </Text>
          </Pressable>
        ) : null}

        <Button
          label={saving ? "Saving..." : "Save Changes"}
          onPress={save}
          disabled={
            saving ||
            compatibleTemplates.length === 0 ||
            brandingStatuses.length === 0
          }
        />
      </View>
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

  assetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
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

  assetImage: {
    height: 130,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  assetImageCompact: {
    height: 90,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  placeholderAsset: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },

  brandPreview: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 20,
    minHeight: 250,
  },

  previewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  logoContainer: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
    gap: 3,
  },

  previewMembership: {
    minHeight: 90,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  previewMembershipText: {
    flex: 1,
    gap: 4,
  },

  previewAction: {
    minWidth: 64,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  colorSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
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
    gap: 12,
    paddingBottom: 28,
  },

  actionsStacked: {
    alignItems: "stretch",
    flexDirection: "column-reverse",
  },
});
