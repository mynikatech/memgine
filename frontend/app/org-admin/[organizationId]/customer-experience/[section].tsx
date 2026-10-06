import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";

import { ScrollView, StyleSheet, View } from "react-native";

import type {
  CustomerExperience,
  CustomerExperienceReleaseSnapshot,
} from "@/src/core";

import {
  loadCustomerExperiencePreviewStates,
  resolvePreviewConfiguration,
  type PreviewDomainData,
  type PreviewMembership,
} from "@/src/experience";

import {
  BusinessExperience,
  type CustomerExperiencePreviewSection,
} from "@/src/experience/BusinessExperience";

import { BusinessPreviewScope, useBusiness } from "@/src/providers";

import { Badge, Button, Card, Header, StateView, Text } from "@/src/ui";

import { Screen } from "@/src/layout";

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

export default function CustomerExperienceSectionPreview() {
  const router = useRouter();

  const { section } = useLocalSearchParams<{ section?: string }>();

  const { organization, configuration, template } = useBusiness();

  const [status, setStatus] = useState<StatusState>("loading");

  const [proposedExperience, setProposedExperience] =
    useState<CustomerExperience | null>(null);

  const [currentExperience, setCurrentExperience] =
    useState<CustomerExperience | null>(null);

  const [currentSnapshot, setCurrentSnapshot] =
    useState<CustomerExperienceReleaseSnapshot | null>(null);

  const [proposedSnapshot, setProposedSnapshot] =
    useState<CustomerExperienceReleaseSnapshot | null>(null);

  const [currentPreviewData, setCurrentPreviewData] =
    useState<PreviewDomainData | null>(null);

  const [proposedPreviewData, setProposedPreviewData] =
    useState<PreviewDomainData | null>(null);

  const [currentSelectedMembershipId, setCurrentSelectedMembershipId] =
    useState("");

  const [proposedSelectedMembershipId, setProposedSelectedMembershipId] =
    useState("");

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      const previewStates = await loadCustomerExperiencePreviewStates(
        organization.id,
        { configuration, template },
      );
      setProposedExperience(previewStates.draft);
      setCurrentExperience(
        previewStates.currentSnapshot?.customerExperience ?? null,
      );
      setCurrentSnapshot(previewStates.currentSnapshot);
      setProposedSnapshot(previewStates.proposedSnapshot);
      setCurrentPreviewData(previewStates.currentDomainData);
      setProposedPreviewData(previewStates.proposedDomainData);
      setCurrentSelectedMembershipId(
        previewStates.currentDomainData.memberships[0]?.product.id ?? "",
      );
      setProposedSelectedMembershipId(
        previewStates.proposedDomainData.memberships[0]?.product.id ?? "",
      );

      setStatus("ready");
    } catch (error) {
      console.error("[CustomerExperienceSectionPreview] load failed:", error);

      setStatus("error");
    }
  }, [
    organization.id,
    configuration,
    template,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (status === "loading") {
    return (
      <Screen edges={["top"]}>
        <StateView kind="loading" message="Loading customer preview..." />
      </Screen>
    );
  }

  if (
    status === "error" ||
    !proposedExperience ||
    !currentPreviewData ||
    !proposedPreviewData ||
    !proposedSnapshot
  ) {
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

  const currentSelectedMembership: PreviewMembership | undefined =
    currentPreviewData.memberships.find(
      (membership: PreviewMembership) =>
        membership.product.id === currentSelectedMembershipId,
    ) ?? currentPreviewData.memberships[0];

  const proposedSelectedMembership: PreviewMembership | undefined =
    proposedPreviewData.memberships.find(
      (membership: PreviewMembership) =>
        membership.product.id === proposedSelectedMembershipId,
    ) ?? proposedPreviewData.memberships[0];

  const renderMemberships = (domainData: PreviewDomainData) =>
    domainData.memberships.map((membership) => ({
      subscription: membership.subscription,
      product: membership.product,
    }));

  const renderSectionPreview = (
    mode: "current" | "proposed",
    domainData: PreviewDomainData,
    snapshot: CustomerExperienceReleaseSnapshot | null,
    experience: CustomerExperience | null,
    selectedMembership: PreviewMembership | undefined,
    onSelectMembership: (membershipId: string) => void,
  ) => {
    const isProposed = mode === "proposed";
    const branding = snapshot?.organizationBranding ?? null;
    const previewConfiguration = resolvePreviewConfiguration(
      snapshot?.configuration,
      branding,
      isProposed ? experience?.experienceDefinition.theme : undefined,
    );

    return (
      <BusinessPreviewScope
        organizationId={snapshot?.organization.id ?? organization.id}
        configuration={previewConfiguration}
        template={snapshot?.template ?? template}
      >
        <BusinessExperience
          content={
            experience?.experienceDefinition.content ??
            proposedExperience.experienceDefinition.content
          }
          subscription={selectedMembership?.subscription}
          subscriptionStatus={selectedMembership?.subscriptionStatus}
          product={selectedMembership?.product}
          benefits={selectedMembership?.benefits ?? []}
          offers={domainData.offers}
          stores={domainData.stores}
          redemptions={selectedMembership?.redemptions ?? []}
          benefitUsageRules={domainData.benefitUsageRules}
          offerUsageRules={domainData.offerUsageRules}
          memberships={renderMemberships(domainData)}
          selectedSubscriptionId={selectedMembership?.subscription.id ?? ""}
          onSelectSubscription={(subscriptionId) => {
            const membership = domainData.memberships.find(
              (candidate) => candidate.subscription.id === subscriptionId,
            );

            if (membership) {
              onSelectMembership(membership.product.id);
            }
          }}
          availableMemberships={domainData.availableMemberships}
          onJoin={() => {}}
          onExit={() => router.back()}
          previewDefinition={
            isProposed ? experience?.experienceDefinition : undefined
          }
          initialTab="card"
          organizationOverride={snapshot?.organization ?? organization}
          detailsOverride={snapshot?.organizationDetails ?? null}
          brandingOverride={branding}
          membershipLogoUrl={branding?.logoUrl ?? undefined}
          tagline={branding?.tagline ?? undefined}
          heroImageUrl={branding?.heroImageUrl ?? undefined}
          referralProgramOverride={snapshot?.referralProgram ?? null}
          renderMode={isProposed ? "proposed-preview" : "current-preview"}
          previewSection={section}
        />
      </BusinessPreviewScope>
    );
  };

  return (
    <Screen edges={["top"]}>
      <Header
        title={`${section
          .replace(/-/g, " ")
          .replace(/\w/g, (letter) => letter.toUpperCase())} Preview`}
        subtitle="Customer-facing section preview"
      />

      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={styles.compareContainer}>
          <View style={styles.comparePanel}>
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderText}>
                <Text variant="title" color="text">
                  Current
                </Text>

                <Text variant="bodySmall" color="textMuted">
                  {currentSnapshot
                    ? "Currently live"
                    : "No published experience yet"}
                </Text>
              </View>

              <Badge label="LIVE" tone="neutral" />
            </View>

            <View style={styles.customerExperienceFrame}>
              {renderSectionPreview(
                "current",
                currentPreviewData,
                currentSnapshot,
                currentExperience,
                currentSelectedMembership,
                setCurrentSelectedMembershipId,
              )}
            </View>
          </View>

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
              {renderSectionPreview(
                "proposed",
                proposedPreviewData,
                proposedSnapshot,
                proposedExperience,
                proposedSelectedMembership,
                setProposedSelectedMembershipId,
              )}
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
