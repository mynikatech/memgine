import { useLocalSearchParams, useRouter } from "expo-router";

import React, { useCallback, useEffect, useState } from "react";

import { ScrollView, StyleSheet, View } from "react-native";

import type { CustomerExperience } from "@/src/core";
import { services } from "@/src/core";

import type { PreviewDomainData, PreviewMembership } from "@/src/experience";

import { loadPreviewData } from "@/src/experience";

import { BusinessExperience } from "@/src/experience/BusinessExperience";

import { useBusiness } from "@/src/providers";

import { Button, Card, Header, StateView, Text } from "@/src/ui";

import { Screen } from "@/src/layout";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type StatusState = "loading" | "error" | "ready";

type SectionKey =
  | "membership"
  | "benefits"
  | "offers"
  | "stores"
  | "activity"
  | "business-information"
  | "business-preferences"
  | "referral";

/*
 * Derive the tab type directly from BusinessExperience.
 *
 * This avoids duplicating ExperienceTabKey here and guarantees that
 * this file stays compatible if BusinessExperience changes its tab type.
 */
type BusinessExperienceInitialTab = React.ComponentProps<
  typeof BusinessExperience
>["initialTab"];

const SECTION_TITLES: Record<SectionKey, string> = {
  membership: "Membership Preview",
  benefits: "Benefits Preview",
  offers: "Offers Preview",
  stores: "Stores Preview",
  activity: "History Preview",
  "business-information": "Business Information Preview",
  "business-preferences": "Business Preferences Preview",
  referral: "Referral Preview",
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function isSectionKey(value: string | undefined): value is SectionKey {
  return (
    value === "membership" ||
    value === "benefits" ||
    value === "offers" ||
    value === "stores" ||
    value === "activity" ||
    value === "business-information" ||
    value === "business-preferences" ||
    value === "referral"
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN SCREEN                                                                */
/* -------------------------------------------------------------------------- */

export default function CustomerExperienceSectionPreview() {
  const router = useRouter();

  const { section } = useLocalSearchParams<{
    section?: string;
  }>();

  const { organization } = useBusiness();

  const [status, setStatus] = useState<StatusState>("loading");

  /*
   * PROPOSED
   *
   * Organization's current draft.
   */
  const [experience, setExperience] = useState<CustomerExperience | null>(null);

  /*
   * CURRENT
   *
   * Organization's published experience.
   *
   * This MUST remain separate from the draft.
   *
   * Editing the draft must never mutate what is displayed
   * in the Current panel.
   */
  const [publishedExperience, setPublishedExperience] =
    useState<CustomerExperience | null>(null);

  const [previewData, setPreviewData] = useState<PreviewDomainData | null>(
    null,
  );

  const [selectedMembershipId, setSelectedMembershipId] = useState("");

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                    */
  /* ---------------------------------------------------------------------- */

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      /*
       * Draft / Proposed.
       */
      const draft = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      if (!draft) {
        setStatus("error");
        return;
      }

      /*
       * Published / Current.
       *
       * If nothing has been published yet, this can be null.
       * In that situation we fall back to the draft for the
       * Current display, but clearly label it as unpublished.
       */
      const published =
        await services.customerExperience.getPublishedCustomerExperience(
          organization.id,
        );

      /*
       * Customer-facing domain data.
       *
       * This is the existing preview-data mechanism.
       */
      const data = await loadPreviewData(organization.id);

      setExperience(draft);
      setPublishedExperience(published);
      setPreviewData(data);

      setSelectedMembershipId(data.selectedSubscriptionId);

      setStatus("ready");
    } catch (error) {
      console.error("[CustomerExperienceSectionPreview] load failed:", error);

      setStatus("error");
    }
  }, [organization.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------------------------------------------------------------- */
  /* INVALID SECTION                                                         */
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
  /* LOADING                                                                 */
  /* ---------------------------------------------------------------------- */

  if (status === "loading") {
    return (
      <Screen edges={["top"]}>
        <StateView kind="loading" message="Loading customer preview..." />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ERROR                                                                   */
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
  /* MEMBERSHIP DATA                                                         */
  /* ---------------------------------------------------------------------- */

  const selected: PreviewMembership | undefined =
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

  const selectedSubscriptionId = selected?.subscription.id ?? "";

  /* ---------------------------------------------------------------------- */
  /* CUSTOMER TAB                                                            */
  /* ---------------------------------------------------------------------- */

  /*
   * IMPORTANT:
   *
   * Explicitly type this because BusinessExperience expects
   * ExperienceTabKey rather than a generic string.
   */
  const initialTab: BusinessExperienceInitialTab =
    section === "offers"
      ? "offers"
      : section === "activity"
        ? "history"
        : "card";

  const isStoresPreview = section === "stores";

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <Screen edges={["top"]}>
      <Header
        title={SECTION_TITLES[section]}
        subtitle={
          isStoresPreview
            ? "Customer Profile → Locations"
            : "Customer-facing preview"
        }
      />

      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================================ */}
        {/* PAGE HEADER                                                       */}
        {/* ================================================================ */}

        <Card padding="md">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="title" color="text">
                {SECTION_TITLES[section]}
              </Text>

              <Text variant="bodySmall" color="textMuted">
                {isStoresPreview
                  ? "See how customers see locations inside their Profile."
                  : "This is the same customer experience renderer used by the live customer application."}
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
        {/* MEMBERSHIP SELECTOR                                              */}
        {/* ================================================================ */}

        {section === "membership" && membershipList.length > 1 ? (
          <Card padding="md">
            <Text variant="label" color="textMuted">
              Memberships
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.membershipList}
            >
              {membershipList.map((membership) => {
                const isSelected =
                  membership.subscription.id === selectedSubscriptionId;

                const label =
                  membership.product.displayName ??
                  membership.product.membershipProductName;

                return (
                  <Button
                    key={membership.subscription.id}
                    label={label}
                    size="sm"
                    variant={isSelected ? "primary" : "secondary"}
                    onPress={() =>
                      setSelectedMembershipId(membership.subscription.id)
                    }
                  />
                );
              })}
            </ScrollView>
          </Card>
        ) : null}

        {/* ================================================================ */}
        {/* STORES                                                            */}
        {/*                                                                  */}
        {/* Stores are NOT a complete customer-experience preview.           */}
        {/* They are Profile → Locations.                                   */}
        {/*                                                                  */}
        {/* We therefore show only two customer renderers:                   */}
        {/*                                                                  */}
        {/* CURRENT   |   PROPOSED                                           */}
        {/*                                                                  */}
        {/* Both use BusinessExperience.                                    */}
        {/* ================================================================ */}

        {isStoresPreview ? (
          <View style={styles.compareContainer}>
            {/* ========================================================== */}
            {/* CURRENT                                                     */}
            {/* ========================================================== */}

            <StorePreviewPanel
              title="Current"
              subtitle={
                publishedExperience
                  ? "Currently published"
                  : "No published experience yet"
              }
              experience={publishedExperience ?? experience}
              previewData={previewData}
              selected={selected}
              membershipList={membershipList}
              selectedSubscriptionId={selectedSubscriptionId}
              onSelectSubscription={setSelectedMembershipId}
              initialTab={initialTab}
            />

            {/* ========================================================== */}
            {/* PROPOSED                                                    */}
            {/* ========================================================== */}

            <StorePreviewPanel
              title="Proposed"
              subtitle="Current draft"
              experience={experience}
              previewData={previewData}
              selected={selected}
              membershipList={membershipList}
              selectedSubscriptionId={selectedSubscriptionId}
              onSelectSubscription={setSelectedMembershipId}
              initialTab={initialTab}
            />
          </View>
        ) : (
          /* ============================================================ */
          /* OTHER CUSTOMER EXPERIENCE SECTIONS                          */
          /* ============================================================ */

          <View style={styles.customerExperienceFrame}>
            <BusinessExperience
              content={experience.experienceDefinition.content}
              subscription={selected?.subscription}
              subscriptionStatus={selected?.subscriptionStatus}
              product={selected?.product}
              benefits={
                section === "benefits"
                  ? previewData.benefits
                  : (selected?.benefits ?? [])
              }
              offers={previewData.offers}
              stores={previewData.stores}
              redemptions={selected?.redemptions ?? []}
              memberships={membershipList}
              selectedSubscriptionId={selectedSubscriptionId}
              onSelectSubscription={setSelectedMembershipId}
              availableMemberships={previewData.availableMemberships}
              onJoin={() => {}}
              onExit={() => router.back()}
              previewDefinition={experience.experienceDefinition}
              initialTab={initialTab}
              previewMode
              previewSection={section}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ========================================================================== */
/* STORE PREVIEW PANEL                                                        */
/* ========================================================================== */

type StorePreviewPanelProps = {
  title: string;
  subtitle: string;
  experience: CustomerExperience;
  previewData: PreviewDomainData;
  selected?: PreviewMembership;
  membershipList: {
    subscription: PreviewMembership["subscription"];
    product: PreviewMembership["product"];
  }[];
  selectedSubscriptionId: string;
  onSelectSubscription: (id: string) => void;
  initialTab: BusinessExperienceInitialTab;
};

function StorePreviewPanel({
  title,
  subtitle,
  experience,
  previewData,
  selected,
  membershipList,
  selectedSubscriptionId,
  onSelectSubscription,
  initialTab,
}: StorePreviewPanelProps) {
  return (
    <View style={styles.previewPanel}>
      {/* ------------------------------------------------------------------ */}
      {/* PANEL HEADER                                                        */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderText}>
          <Text variant="title" color="text">
            {title}
          </Text>

          <Text variant="bodySmall" color="textMuted">
            {subtitle}
          </Text>
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* CUSTOMER EXPERIENCE                                                */}
      {/* ------------------------------------------------------------------ */}

      <View style={styles.customerExperienceFrame}>
        <BusinessExperience
          content={experience.experienceDefinition.content}
          subscription={selected?.subscription}
          subscriptionStatus={selected?.subscriptionStatus}
          product={selected?.product}
          benefits={selected?.benefits ?? []}
          offers={previewData.offers}
          stores={previewData.stores}
          redemptions={selected?.redemptions ?? []}
          memberships={membershipList}
          selectedSubscriptionId={selectedSubscriptionId}
          onSelectSubscription={onSelectSubscription}
          availableMemberships={previewData.availableMemberships}
          onJoin={() => {}}
          onExit={() => {}}
          previewDefinition={experience.experienceDefinition}
          initialTab={initialTab}
          previewMode
          previewSection="stores"
        />
      </View>
    </View>
  );
}

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  headerText: {
    flex: 1,
    gap: 4,
  },

  membershipList: {
    gap: 8,
    paddingTop: 10,
  },

  compareContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 20,
  },

  previewPanel: {
    flex: 1,
    minWidth: 420,
    gap: 10,
  },

  panelHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  panelHeaderText: {
    gap: 2,
  },

  customerExperienceFrame: {
    minHeight: 720,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E1E5EA",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
});
