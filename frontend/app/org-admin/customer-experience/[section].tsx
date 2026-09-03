import { useLocalSearchParams, useRouter } from "expo-router";

import React, { useCallback, useEffect, useState } from "react";

import { ScrollView, StyleSheet, View } from "react-native";

import type { Benefit, CustomerExperience, Store } from "@/src/core";

import { services } from "@/src/core";

import type { PreviewDomainData, PreviewMembership } from "@/src/experience";

import { loadPreviewData } from "@/src/experience";

import {
  BusinessExperience,
  type CustomerExperiencePreviewSection,
} from "@/src/experience/BusinessExperience";

import { useBusiness } from "@/src/providers";

import { Badge, Button, Card, Header, StateView, Text } from "@/src/ui";

import { Screen } from "@/src/layout";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type StatusState = "loading" | "error" | "ready";

type SectionKey = CustomerExperiencePreviewSection;

function isSectionKey(value: string | undefined): value is SectionKey {
  return (
    value === "membership" ||
    value === "benefits" ||
    value === "offers" ||
    value === "stores" ||
    value === "activity" ||
    value === "business-information" ||
    value === "business-preferences" ||
    value === "referral" ||
    value === "profile"
  );
}

function cloneBenefits(benefits: Benefit[]): Benefit[] {
  return benefits.map((benefit) => ({
    ...benefit,
    retailPrice: benefit.retailPrice
      ? {
          ...benefit.retailPrice,
        }
      : undefined,
    cost: benefit.cost
      ? {
          ...benefit.cost,
        }
      : undefined,
  }));
}

function parseArray<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* MAIN                                                                       */
/* -------------------------------------------------------------------------- */

export default function CustomerExperienceSectionPreview() {
  const router = useRouter();

  const {
    section,

    currentStores: currentStoresParam,

    proposedStores: proposedStoresParam,

    currentBenefits: currentBenefitsParam,

    proposedBenefits: proposedBenefitsParam,
  } = useLocalSearchParams<{
    section?: string;

    currentStores?: string;
    proposedStores?: string;

    currentBenefits?: string;
    proposedBenefits?: string;
  }>();

  const { organization } = useBusiness();

  const [status, setStatus] = useState<StatusState>("loading");

  const [experience, setExperience] = useState<CustomerExperience | null>(null);

  const [publishedExperience, setPublishedExperience] =
    useState<CustomerExperience | null>(null);

  const [previewData, setPreviewData] = useState<PreviewDomainData | null>(
    null,
  );

  const [currentStores, setCurrentStores] = useState<Store[]>([]);

  const [proposedStores, setProposedStores] = useState<Store[]>([]);

  const [currentBenefits, setCurrentBenefits] = useState<Benefit[]>([]);

  const [proposedBenefits, setProposedBenefits] = useState<Benefit[]>([]);

  const [selectedMembershipId, setSelectedMembershipId] = useState("");

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                   */
  /* ---------------------------------------------------------------------- */

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      const draft = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      if (!draft) {
        setStatus("error");
        return;
      }

      const published =
        await services.customerExperience.getPublishedCustomerExperience(
          organization.id,
        );

      const data = await loadPreviewData(organization.id);

      const parsedCurrentStores = parseArray<Store>(
        currentStoresParam,
        data.stores,
      );

      const parsedProposedStores = parseArray<Store>(
        proposedStoresParam,
        data.stores,
      );

      const persistedBenefits = data.benefits ?? [];

      const parsedCurrentBenefits = cloneBenefits(
        parseArray<Benefit>(currentBenefitsParam, persistedBenefits),
      );

      const parsedProposedBenefits = cloneBenefits(
        parseArray<Benefit>(proposedBenefitsParam, persistedBenefits),
      );

      setExperience(draft);

      setPublishedExperience(published);

      setPreviewData(data);

      setCurrentStores(parsedCurrentStores);

      setProposedStores(parsedProposedStores);

      setCurrentBenefits(parsedCurrentBenefits);

      setProposedBenefits(parsedProposedBenefits);

      setSelectedMembershipId(data.selectedSubscriptionId);

      setStatus("ready");
    } catch (error) {
      console.error("[CustomerExperienceSectionPreview] load failed:", error);

      setStatus("error");
    }
  }, [
    organization.id,
    currentStoresParam,
    proposedStoresParam,
    currentBenefitsParam,
    proposedBenefitsParam,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------------------------------------------------------------- */
  /* INVALID SECTION                                                        */
  /* ---------------------------------------------------------------------- */

  if (!isSectionKey(section)) {
    return (
      <Screen edges={["top"]}>
        <StateView
          kind="error"
          title="Preview unavailable"
          message="The requested Customer Experience section is not available."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                */
  /* ---------------------------------------------------------------------- */

  if (status === "loading") {
    return (
      <Screen edges={["top"]}>
        <StateView kind="loading" message="Loading customer preview..." />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ERROR                                                                  */
  /* ---------------------------------------------------------------------- */

  if (status === "error" || !experience || !previewData) {
    return (
      <Screen edges={["top"]}>
        <StateView
          kind="error"
          title="Unable to load preview"
          message="Unable to initialize this customer experience preview."
          actionLabel="Retry"
          onAction={() => void load()}
        />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* MEMBERSHIP                                                             */
  /* ---------------------------------------------------------------------- */

  const selectedMembership: PreviewMembership | undefined =
    previewData.memberships.find(
      (membership: PreviewMembership) =>
        membership.subscription.id === selectedMembershipId,
    ) ?? previewData.memberships[0];

  const membershipList = previewData.memberships.map(
    (membership: PreviewMembership) => ({
      subscription: membership.subscription,

      product: membership.product,
    }),
  );

  const selectedSubscriptionId = selectedMembership?.subscription.id ?? "";

  /* ---------------------------------------------------------------------- */
  /* DOMAIN DATA                                                            */
  /* ---------------------------------------------------------------------- */

  const currentDomainData = {
    ...previewData,

    stores: currentStores,

    benefits: currentBenefits,
  };

  const proposedDomainData = {
    ...previewData,

    stores: proposedStores,

    benefits: proposedBenefits,
  };

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <Screen edges={["top"]}>
      <Header
        title={`${section
          .replace(/-/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase())} Preview`}
        subtitle="Customer-facing section preview"
      />

      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================================ */}
        {/* HEADER                                                           */}
        {/* ================================================================ */}

        <Card padding="md">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="title" color="text">
                Customer Preview
              </Text>

              <Text variant="bodySmall" color="textMuted">
                This is the exact same customer renderer used by the complete
                Customer Experience preview and the live customer application.
              </Text>
            </View>

            <Button
              label="Back"
              onPress={() => router.back()}
              variant="secondary"
            />
          </View>
        </Card>

        {/* ================================================================ */}
        {/* CURRENT / PROPOSED                                               */}
        {/* ================================================================ */}

        <View style={styles.compareContainer}>
          {/* CURRENT ------------------------------------------------------ */}

          <View style={styles.comparePanel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderText}>
                <Text variant="title" color="text">
                  Current
                </Text>

                <Text variant="bodySmall" color="textMuted">
                  {publishedExperience
                    ? "Currently live"
                    : "No published experience yet"}
                </Text>
              </View>

              <Badge label="LIVE" tone="neutral" />
            </View>

            <View style={styles.customerExperienceFrame}>
              <BusinessExperience
                content={
                  publishedExperience?.experienceDefinition.content ??
                  experience.experienceDefinition.content
                }
                subscription={selectedMembership?.subscription}
                subscriptionStatus={selectedMembership?.subscriptionStatus}
                product={selectedMembership?.product}
                benefits={currentDomainData.benefits}
                offers={currentDomainData.offers}
                stores={currentDomainData.stores}
                redemptions={selectedMembership?.redemptions ?? []}
                memberships={membershipList}
                selectedSubscriptionId={selectedSubscriptionId}
                onSelectSubscription={setSelectedMembershipId}
                availableMemberships={currentDomainData.availableMemberships}
                onJoin={() => {}}
                onExit={() => router.back()}
                previewDefinition={publishedExperience?.experienceDefinition}
                initialTab="card"
                previewMode
                previewSection={section}
              />
            </View>
          </View>

          {/* PROPOSED ----------------------------------------------------- */}

          <View style={styles.comparePanel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderText}>
                <Text variant="title" color="text">
                  Proposed
                </Text>

                <Text variant="bodySmall" color="textMuted">
                  Current draft
                </Text>
              </View>

              <Badge label="PROPOSED" tone="brand" />
            </View>

            <View style={styles.customerExperienceFrame}>
              <BusinessExperience
                content={experience.experienceDefinition.content}
                subscription={selectedMembership?.subscription}
                subscriptionStatus={selectedMembership?.subscriptionStatus}
                product={selectedMembership?.product}
                benefits={proposedDomainData.benefits}
                offers={proposedDomainData.offers}
                stores={proposedDomainData.stores}
                redemptions={selectedMembership?.redemptions ?? []}
                memberships={membershipList}
                selectedSubscriptionId={selectedSubscriptionId}
                onSelectSubscription={setSelectedMembershipId}
                availableMemberships={proposedDomainData.availableMemberships}
                onJoin={() => {}}
                onExit={() => router.back()}
                previewDefinition={experience.experienceDefinition}
                initialTab="card"
                previewMode
                previewSection={section}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  headerText: {
    flex: 1,
    gap: 5,
  },

  compareContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },

  comparePanel: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },

  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2,
  },

  panelHeaderText: {
    flex: 1,
    gap: 2,
  },

  customerExperienceFrame: {
    minHeight: 720,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E5EA",
    backgroundColor: "#FFFFFF",
  },
});
