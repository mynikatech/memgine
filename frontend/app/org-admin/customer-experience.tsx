import { useRouter } from "expo-router";

import { useEffect, useMemo, useState } from "react";

import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { CustomerExperience } from "@/src/core";

import { services } from "@/src/core";

import { APP_ROUTES } from "@/src/constants/navigation";

import { useBusiness, useTheme } from "@/src/providers";

import { Card, Section, StateView, Text } from "@/src/ui";

const SECTION_DEFINITIONS = [
  {
    key: "membership",
    title: "Membership",
    description: "Configure the membership presentation and card experience.",
  },
  {
    key: "benefits",
    title: "Benefits",
    description: "Configure how active membership benefits are presented.",
  },
  {
    key: "offers",
    title: "Offers",
    description:
      "Configure how the Offers section appears to customers. Actual offers remain in Offers management.",
  },
  {
    key: "stores",
    title: "Stores",
    description: "Configure the customer-facing store/location section.",
  },
  {
    key: "activity",
    title: "Activity",
    description: "Configure the customer-facing activity/history section.",
  },
  {
    key: "business-information",
    title: "Business Information",
    description: "Configure the business information presentation.",
  },
  {
    key: "business-preferences",
    title: "Business Preferences",
    description:
      "Configure the customer-facing business preferences presentation.",
  },
  {
    key: "referral",
    title: "Referral",
    description: "Configure the customer-facing referral experience.",
  },
] as const;

type SectionKey = (typeof SECTION_DEFINITIONS)[number]["key"];

export default function CustomerExperienceConfiguration() {
  const router = useRouter();

  const theme = useTheme();

  const { organization } = useBusiness();

  const [experience, setExperience] = useState<CustomerExperience | null>(null);

  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );

  const [saving, setSaving] = useState(false);

  const load = async () => {
    setStatus("loading");

    try {
      const result = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      setExperience(result);

      setStatus(result ? "ready" : "error");
    } catch (error) {
      console.error("[CustomerExperience] failed to load", error);

      setStatus("error");
    }
  };

  useEffect(() => {
    void load();
  }, [organization.id]);

  const definition = experience?.experienceDefinition;

  const enabledSections = useMemo(() => {
    if (!definition) {
      return new Set<string>();
    }

    const sections = definition.sections;

    const result = new Set<string>();

    if (sections.membership) {
      result.add("membership");
    }

    if (sections.offers) {
      result.add("offers");
    }

    if (sections.activeBenefits) {
      result.add("benefits");
    }

    if (sections.stores) {
      result.add("stores");
    }

    if (sections.activity) {
      result.add("activity");
    }

    if (sections.businessInformation) {
      result.add("business-information");
    }

    if (sections.businessPreferences) {
      result.add("business-preferences");
    }

    if (sections.referral) {
      result.add("referral");
    }

    return result;
  }, [definition]);

  const openFinalReview = () => {
    router.push(APP_ROUTES.orgAdmin.customerExperiencePreview as never);
  };

  const openSectionPreview = (section: SectionKey) => {
    router.push(
      APP_ROUTES.orgAdmin.customerExperienceSection(section) as never,
    );
  };

  const save = async () => {
    if (!experience) {
      return;
    }

    setSaving(true);

    try {
      const updated =
        await services.customerExperience.updateCustomerExperience(
          organization.id,
          experience,
        );

      setExperience(updated);
    } catch (error) {
      console.error("[CustomerExperience] failed to save", error);
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <StateView kind="loading" message="Loading Customer Experience..." />
    );
  }

  if (status === "error" || !experience) {
    return (
      <StateView
        kind="error"
        title="Unable to load Customer Experience"
        actionLabel="Retry"
        onAction={() => {
          void load();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          padding: theme.spacing.xl,
        },
      ]}
    >
      {/* ================================================================= */}
      {/* HEADER                                                            */}
      {/* ================================================================= */}

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="h1" color="text">
            Customer Experience
          </Text>

          <Text variant="body" color="textSecondary">
            Configure how customers experience your business. The overall
            application layout remains controlled by the Memgine template.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable onPress={openFinalReview} accessibilityRole="link">
            <Text variant="body" color="primary" style={styles.finalReviewLink}>
              Final Review
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ================================================================= */}
      {/* EXPERIENCE SUMMARY                                                */}
      {/* ================================================================= */}

      <Card padding="lg" elevation="sm">
        <Section title="Experience">
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text variant="bodySmall" color="textMuted">
                Experience
              </Text>

              <Text variant="body" color="text">
                {experience.experienceName}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text variant="bodySmall" color="textMuted">
                Status
              </Text>

              <Text variant="body" color="text">
                {experience.lifecycleStatus}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text variant="bodySmall" color="textMuted">
                Version
              </Text>

              <Text variant="body" color="text">
                {experience.versionNo}
              </Text>
            </View>
          </View>
        </Section>
      </Card>

      {/* ================================================================= */}
      {/* FINAL REVIEW                                                      */}
      {/* ================================================================= */}

      <Card padding="lg" elevation="sm">
        <Section title="Overall Customer Experience">
          <Text variant="bodySmall" color="textSecondary">
            Review the complete customer experience side by side, including the
            membership card, offers, history and profile, before publishing.
          </Text>

          <View style={styles.finalReviewRow}>
            <Pressable onPress={openFinalReview} accessibilityRole="link">
              <Text variant="body" color="primary" style={styles.previewLink}>
                Preview
              </Text>
            </Pressable>
          </View>
        </Section>
      </Card>

      {/* ================================================================= */}
      {/* SECTION CONFIGURATION                                             */}
      {/* ================================================================= */}

      <Card padding="lg" elevation="sm">
        <Section title="Configure Sections">
          <View style={styles.sectionList}>
            {SECTION_DEFINITIONS.map((section) => {
              const enabled = enabledSections.has(section.key);

              return (
                <Card key={section.key} padding="md" elevation="none">
                  <View style={styles.sectionRow}>
                    <View style={styles.sectionCopy}>
                      <View style={styles.sectionTitleRow}>
                        <Text variant="title" color="text">
                          {section.title}
                        </Text>

                        {enabled ? (
                          <Pressable
                            onPress={() => openSectionPreview(section.key)}
                            accessibilityRole="link"
                          >
                            <Text
                              variant="bodySmall"
                              color="primary"
                              style={styles.previewLink}
                            >
                              Preview
                            </Text>
                          </Pressable>
                        ) : (
                          <Text variant="caption" color="textMuted">
                            Not enabled
                          </Text>
                        )}
                      </View>

                      <Text variant="bodySmall" color="textSecondary">
                        {section.description}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        </Section>
      </Card>

      {/* ================================================================= */}
      {/* SAVE                                                               */}
      {/* ================================================================= */}

      <View style={styles.actions}>
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={[styles.saveLink, saving && styles.saveLinkDisabled]}
        >
          <Text variant="body" color="primary" style={styles.saveText}>
            {saving ? "Saving..." : "Save Draft"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    gap: 18,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
  },

  headerText: {
    flex: 1,
    gap: 8,
  },

  headerActions: {
    alignItems: "flex-end",
    paddingTop: 8,
  },

  finalReviewLink: {
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 28,
  },

  infoItem: {
    minWidth: 180,
    gap: 4,
  },

  finalReviewRow: {
    marginTop: 16,
    alignItems: "flex-start",
  },

  sectionList: {
    gap: 12,
    marginTop: 8,
  },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },

  sectionCopy: {
    flex: 1,
    gap: 6,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  previewLink: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  actions: {
    alignItems: "flex-end",
    paddingBottom: 30,
  },

  saveLink: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  saveLinkDisabled: {
    opacity: 0.5,
  },

  saveText: {
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
