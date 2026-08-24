import { useEffect, useState } from "react";

import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import {
  ID,
  Organization,
  OrganizationBranding,
  TemplateCatalogueItem,
  Status,
} from "@/src/core";

import { useTheme } from "@/src/providers";

import {
  Button,
  Card,
  Input,
  ReferenceSelect,
  Section,
  Text,
  BrandColourSelect,
} from "@/src/ui";

type BrandingFormProps = {
  organization: Organization;
  branding: OrganizationBranding | null;

  /**
   * Platform templates.
   *
   * This is deliberately NOT ReferenceDataItem[].
   * Templates are a separate domain concept.
   */
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

  /**
   * For a new branding record, select the platform default template
   * for this organization's organization type.
   *
   * We deliberately do NOT simply use templates[0].
   */
  const defaultTemplate =
    templates.find(
      (item) => item.organizationTypeId === organization.organizationTypeId,
    ) ?? templates[0];

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
  };

  const templateItems = templates.map((item) => ({
    id: item.id,
    code: item.id,
    name: item.template.displayName,
    displayOrder: 0,
    active: true,
  }));

  const save = async () => {
    setSaving(true);

    try {
      await onSave({
        ...form,

        brandingName: form.brandingName.trim(),

        logoUrl: form.logoUrl?.trim() || undefined,

        darkThemeLogoUrl: form.darkThemeLogoUrl?.trim() || undefined,

        faviconUrl: form.faviconUrl?.trim() || undefined,

        splashScreenImageUrl: form.splashScreenImageUrl?.trim() || undefined,

        primaryColor: form.primaryColor?.trim() || undefined,

        secondaryColor: form.secondaryColor?.trim() || undefined,

        accentColor: form.accentColor?.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          padding: narrow ? theme.spacing.md : theme.spacing.xl,
        },
      ]}
    >
      <View
        style={{
          gap: theme.spacing.xs,
        }}
      >
        <Text variant="h1" color="text">
          Branding
        </Text>

        <Text variant="bodySmall" color="textSecondary">
          Manage how your organization appears across the Memgine experience.
        </Text>
      </View>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Brand Identity">
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Branding Name"
                value={form.brandingName}
                onChangeText={(value) => update("brandingName", value)}
                placeholder={organization.displayName}
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Theme Template"
                value={form.themeTemplateId}
                items={templateItems}
                onChange={(value) => update("themeTemplateId", value)}
                placeholder="Select theme template"
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <ReferenceSelect
                label="Branding Status"
                value={form.brandingStatusId}
                items={brandingStatuses}
                onChange={(value) => update("brandingStatusId", value)}
                placeholder="Select status"
              />
            </View>
          </View>
        </Section>
      </Card>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Brand Assets">
          <View style={styles.grid}>
            <View style={styles.fullWidth}>
              <Input
                label="Logo URL"
                value={form.logoUrl ?? ""}
                onChangeText={(value) => update("logoUrl", value)}
                keyboardType="url"
                placeholder="https://..."
              />
            </View>

            <View style={styles.fullWidth}>
              <Input
                label="Dark Theme Logo URL"
                value={form.darkThemeLogoUrl ?? ""}
                onChangeText={(value) => update("darkThemeLogoUrl", value)}
                keyboardType="url"
                placeholder="https://..."
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Favicon URL"
                value={form.faviconUrl ?? ""}
                onChangeText={(value) => update("faviconUrl", value)}
                keyboardType="url"
                placeholder="https://..."
              />
            </View>

            <View style={compact ? styles.fullWidth : styles.halfWidth}>
              <Input
                label="Splash Screen Image URL"
                value={form.splashScreenImageUrl ?? ""}
                onChangeText={(value) => update("splashScreenImageUrl", value)}
                keyboardType="url"
                placeholder="https://..."
              />
            </View>
          </View>
        </Section>
      </Card>

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Brand Colors">
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

      <Card padding={narrow ? "md" : "lg"} elevation="sm">
        <Section title="Brand Preview">
          <View
            style={[
              styles.preview,
              {
                backgroundColor: form.primaryColor || theme.colors.primary,
              },
            ]}
          >
            <Text variant="h2" color="text">
              {form.brandingName || organization.displayName}
            </Text>

            <Text variant="bodySmall" color="text">
              Your branded Memgine experience
            </Text>

            <View
              style={[
                styles.previewAccent,
                {
                  backgroundColor:
                    form.secondaryColor || theme.colors.secondary,
                },
              ]}
            />
          </View>
        </Section>
      </Card>

      <View style={styles.actions}>
        <Button
          label={saving ? "Saving..." : "Save Changes"}
          onPress={save}
          disabled={saving}
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
    gap: 16,
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

  preview: {
    minHeight: 160,
    borderRadius: 16,
    padding: 24,
    justifyContent: "center",
    gap: 8,
  },

  previewAccent: {
    width: 72,
    height: 8,
    borderRadius: 4,
    marginTop: 12,
  },

  actions: {
    alignItems: "flex-end",
    paddingBottom: 24,
  },
});
