import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  CustomerExperience,
  Store,
  Subscription,
  TemplateDefaultContent,
} from "@/src/core";

import { services } from "@/src/core";

import type { PreviewDomainData } from "@/src/experience/customer-experience-preview-data";
import type { ExperienceTabKey } from "@/src/experience/resolve-experience";
import { loadPreviewData } from "@/src/experience/customer-experience-preview-data";

import { APP_ROUTES } from "@/src/constants/navigation";

import { useBusiness } from "@/src/providers";
import { Screen } from "@/src/layout";

import {
  Badge,
  Button,
  Card,
  Header,
  Section,
  StateView,
  Text,
} from "@/src/ui";

import { BusinessExperience } from "@/src/experience/BusinessExperience";

type LoadStatus = "loading" | "error" | "ready";

type PreviewMode = "current" | "proposed";

type PreviewPanelProps = {
  title: string;
  subtitle: string;
  experience?: CustomerExperience | null;
  mode: PreviewMode;
  domainData: PreviewDomainData;
  content: TemplateDefaultContent;
  selectedMembershipId: string;
  onSelectMembership: (membershipId: string) => void;
  activeTab: ExperienceTabKey;
  onTabChange: (tab: ExperienceTabKey) => void;
};

export default function CustomerExperiencePreview() {
  const router = useRouter();

  const { organization } = useBusiness();

  const [status, setStatus] = useState<LoadStatus>("loading");

  /**
   * Current = published/live experience.
   *
   * This MUST NOT be populated from the mutable draft.
   */
  const [currentExperience, setCurrentExperience] =
    useState<CustomerExperience | null>(null);

  /**
   * Proposed = current draft.
   */
  const [proposedExperience, setProposedExperience] =
    useState<CustomerExperience | null>(null);

  /**
   * Domain data used by the customer renderer.
   *
   * NOTE:
   * Store/Product/Offer/etc. domain data is currently loaded from the
   * organization data source. The actual Current/Proposed distinction for
   * domain records such as Stores requires a staged/published domain model.
   */
  const [previewData, setPreviewData] = useState<PreviewDomainData | null>(
    null,
  );

  const [selectedPreviewMembershipId, setSelectedPreviewMembershipId] =
    useState("");

  /**
   * Keep Current and Proposed navigation independent.
   */
  const [currentPreviewTab, setCurrentPreviewTab] =
    useState<ExperienceTabKey>("card");

  const [proposedPreviewTab, setProposedPreviewTab] =
    useState<ExperienceTabKey>("card");

  const [publishing, setPublishing] = useState(false);

  const [notificationStatus, setNotificationStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");

  /* ---------------------------------------------------------------------- */
  /* LOAD                                                                   */
  /* ---------------------------------------------------------------------- */

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      /*
       * --------------------------------------------------------------------
       * 1. Load the draft
       * --------------------------------------------------------------------
       *
       * This is the Proposed customer experience.
       */
      const draft = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      if (!draft) {
        throw new Error(
          `Customer Experience could not be initialized for organization '${organization.id}'.`,
        );
      }

      /*
       * --------------------------------------------------------------------
       * 2. Load the published experience
       * --------------------------------------------------------------------
       *
       * This is the Current customer experience.
       *
       * IMPORTANT:
       *
       * Never use getBusinessContent() here because that can represent
       * mutable/local organization configuration and therefore cause the
       * Current side to change together with Proposed.
       */
      const published =
        await services.customerExperience.getPublishedCustomerExperience(
          organization.id,
        );

      /*
       * --------------------------------------------------------------------
       * 3. Load customer-facing domain data
       * --------------------------------------------------------------------
       */
      const domainData = await loadPreviewData(organization.id);

      setProposedExperience(draft);
      setCurrentExperience(published);
      setPreviewData(domainData);

      setSelectedPreviewMembershipId((current) => {
        if (
          current &&
          domainData.memberships.some(
            (membership) => membership.product.id === current,
          )
        ) {
          return current;
        }

        return domainData.memberships[0]?.product.id ?? "";
      });

      setStatus("ready");
    } catch (error) {
      console.error("[CustomerExperiencePreview] load failed:", error);
      setStatus("error");
    }
  }, [organization.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------------------------------------------------------------- */
  /* PUBLISH                                                                */
  /* ---------------------------------------------------------------------- */

  const publish = useCallback(async () => {
    if (!proposedExperience) {
      return;
    }

    setPublishing(true);

    try {
      /*
       * Publish the draft.
       *
       * After this succeeds the newly published experience becomes Current.
       */
      const published =
        await services.customerExperience.publishCustomerExperience(
          organization.id,
          organization.updatedBy,
        );

      setCurrentExperience(published);

      /*
       * Reload the draft because publishing may create/reset/update the
       * draft lifecycle state.
       */
      const draft = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      setProposedExperience(draft);

      /*
       * Refresh customer-facing domain data.
       */
      const refreshedDomainData = await loadPreviewData(organization.id);

      setPreviewData(refreshedDomainData);

      setSelectedPreviewMembershipId((current) => {
        if (
          current &&
          refreshedDomainData.memberships.some(
            (membership) => membership.product.id === current,
          )
        ) {
          return current;
        }

        return refreshedDomainData.memberships[0]?.product.id ?? "";
      });
    } catch (error) {
      console.error("[CustomerExperiencePreview] publish failed:", error);
    } finally {
      setPublishing(false);
    }
  }, [organization.id, organization.updatedBy, proposedExperience]);

  /* ---------------------------------------------------------------------- */
  /* NOTIFICATION                                                           */
  /* ---------------------------------------------------------------------- */

  const notifyCustomers = useCallback(async () => {
    setNotificationStatus("sending");

    try {
      const result = await services.notification.notifyCustomersForOffer(
        organization.id,
        "preview-offer",
      );

      setNotificationStatus(result.success ? "success" : "error");
    } catch (error) {
      console.error("[CustomerExperiencePreview] notification failed:", error);

      setNotificationStatus("error");
    }
  }, [organization.id]);

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                */
  /* ---------------------------------------------------------------------- */

  if (status === "loading") {
    return (
      <Screen edges={["top"]}>
        <StateView kind="loading" message="Loading customer experience..." />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ERROR                                                                  */
  /* ---------------------------------------------------------------------- */

  if (status === "error" || !proposedExperience || !previewData) {
    return (
      <Screen edges={["top"]}>
        <StateView
          kind="error"
          title="Unable to load preview"
          message="Unable to initialize the customer experience."
          actionLabel="Retry"
          onAction={() => {
            void load();
          }}
        />
      </Screen>
    );
  }

  /*
   * ------------------------------------------------------------------------
   * CURRENT CONTENT
   * ------------------------------------------------------------------------
   *
   * This is the important correction.
   *
   * If there is a published experience, Current is taken entirely from
   * that published experience.
   *
   * If there has never been a publication, we deliberately use the
   * organization's initial/current content as the baseline.
   *
   * We do NOT use the draft here.
   */
  const currentContent: TemplateDefaultContent =
    currentExperience?.experienceDefinition.content ??
    proposedExperience.experienceDefinition.content;

  /*
   * Proposed always comes from the current draft.
   */
  const proposedContent: TemplateDefaultContent =
    proposedExperience.experienceDefinition.content;

  return (
    <Screen edges={["top"]}>
      <Header
        title="Customer Experience Preview"
        subtitle="Compare the current customer experience with your proposed experience."
      />

      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================================== */}
        {/* FINAL REVIEW                                                       */}
        {/* ================================================================== */}

        <Card padding="md">
          <View style={styles.actionHeader}>
            <View style={styles.actionText}>
              <Text variant="title" color="text">
                Final Review
              </Text>

              <Text variant="bodySmall" color="textMuted">
                Review the complete customer experience before making the
                proposed changes live.
              </Text>
            </View>

            <Badge
              label={proposedExperience.lifecycleStatus ?? "DRAFT"}
              tone="brand"
            />
          </View>

          <View style={styles.actionButtons}>
            <Button
              label="Back"
              onPress={() => router.back()}
              variant="secondary"
            />

            <Button
              label={publishing ? "Publishing..." : "Accept & Publish"}
              onPress={() => {
                void publish();
              }}
              disabled={publishing}
            />
          </View>
        </Card>

        {/* ================================================================== */}
        {/* OVERALL PREVIEW                                                    */}
        {/* ================================================================== */}

        <View style={styles.heading}>
          <Text variant="h2" color="text">
            Customer Preview
          </Text>

          <Text variant="bodySmall" color="textMuted">
            The same customer-facing experience is rendered on both sides.
            Current shows the live experience; Proposed shows the draft.
          </Text>
        </View>

        <View style={styles.compareContainer}>
          <PreviewPanel
            title="Current"
            subtitle={
              currentExperience
                ? "Currently live"
                : "No published experience yet"
            }
            experience={currentExperience}
            mode="current"
            domainData={previewData}
            content={currentContent}
            selectedMembershipId={selectedPreviewMembershipId}
            onSelectMembership={setSelectedPreviewMembershipId}
            activeTab={currentPreviewTab}
            onTabChange={setCurrentPreviewTab}
          />

          <PreviewPanel
            title="Proposed"
            subtitle="Current draft"
            experience={proposedExperience}
            mode="proposed"
            domainData={previewData}
            content={proposedContent}
            selectedMembershipId={selectedPreviewMembershipId}
            onSelectMembership={setSelectedPreviewMembershipId}
            activeTab={proposedPreviewTab}
            onTabChange={setProposedPreviewTab}
          />
        </View>

        {/* ================================================================== */}
        {/* INDIVIDUAL PREVIEWS                                                */}
        {/* ================================================================== */}

        <Card padding="md">
          <Section title="Individual Preview">
            <Text variant="bodySmall" color="textMuted">
              Open a specific customer-facing section using the same production
              renderer.
            </Text>

            <View style={styles.individualPreviewGrid}>
              <IndividualPreviewLink
                label="Membership / Card"
                section="membership"
                router={router}
              />

              <IndividualPreviewLink
                label="Benefits"
                section="benefits"
                router={router}
              />

              <IndividualPreviewLink
                label="Offers"
                section="offers"
                router={router}
              />

              <IndividualPreviewLink
                label="Profile → Locations"
                section="stores"
                router={router}
              />

              <IndividualPreviewLink
                label="Activity / History"
                section="activity"
                router={router}
              />

              <IndividualPreviewLink
                label="Business Information"
                section="business-information"
                router={router}
              />
            </View>
          </Section>
        </Card>

        {/* ================================================================== */}
        {/* CUSTOMER NOTIFICATION                                              */}
        {/* ================================================================== */}

        <Card padding="md">
          <Section title="Customer Notification">
            <Text variant="bodySmall" color="textMuted">
              After an offer is published, the notification service can notify
              subscribed customers using their configured channels.
            </Text>

            <View style={styles.notificationButton}>
              <Button
                label={
                  notificationStatus === "sending"
                    ? "Sending..."
                    : "Notify Customers"
                }
                onPress={() => {
                  void notifyCustomers();
                }}
                disabled={notificationStatus === "sending"}
                variant="secondary"
              />
            </View>

            {notificationStatus === "success" ? (
              <Text variant="bodySmall" color="text">
                Notification request submitted successfully.
              </Text>
            ) : null}

            {notificationStatus === "error" ? (
              <Text variant="bodySmall" color="text">
                Notification request failed.
              </Text>
            ) : null}
          </Section>
        </Card>

        {/* ================================================================== */}
        {/* EXPERIENCE DETAILS                                                 */}
        {/* ================================================================== */}

        <Card padding="md">
          <Section title="Experience Details">
            <DetailRow label="Template" value={proposedExperience.templateId} />

            <DetailRow
              label="Version"
              value={String(proposedExperience.versionNo)}
            />

            <DetailRow
              label="Status"
              value={proposedExperience.lifecycleStatus}
            />

            <DetailRow
              label="Published"
              value={
                currentExperience
                  ? "Yes"
                  : "No — no Customer Experience has been published yet"
              }
            />
          </Section>
        </Card>
      </ScrollView>
    </Screen>
  );
}

/* ========================================================================== */
/* INDIVIDUAL PREVIEW LINK                                                    */
/* ========================================================================== */

function IndividualPreviewLink({
  label,
  section,
  router,
}: {
  label: string;
  section:
    | "membership"
    | "benefits"
    | "offers"
    | "stores"
    | "activity"
    | "business-information";
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Pressable
      onPress={() =>
        router.push(
          APP_ROUTES.orgAdmin.customerExperienceSection(section) as never,
        )
      }
      accessibilityRole="link"
      style={styles.individualPreviewLink}
    >
      <Text
        variant="bodySmall"
        color="primary"
        style={styles.individualPreviewLinkText}
      >
        Preview · {label}
      </Text>
    </Pressable>
  );
}

/* ========================================================================== */
/* PREVIEW PANEL                                                              */
/* ========================================================================== */

function PreviewPanel({
  title,
  subtitle,
  experience,
  mode,
  domainData,
  content,
  selectedMembershipId,
  onSelectMembership,
  activeTab,
  onTabChange,
}: PreviewPanelProps) {
  const selectedMembership =
    domainData.memberships.find(
      (membership) => membership.product.id === selectedMembershipId,
    ) ?? domainData.memberships[0];

  return (
    <View style={styles.comparePanel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderText}>
          <Text variant="title" color="text">
            {title}
          </Text>

          <Text variant="bodySmall" color="textMuted">
            {subtitle}
          </Text>
        </View>

        <Badge label={mode === "current" ? "LIVE" : "PROPOSED"} tone="brand" />
      </View>

      <View style={styles.customerPreviewFrame}>
        <BusinessExperience
          content={content}
          subscription={selectedMembership?.subscription}
          subscriptionStatus={selectedMembership?.subscriptionStatus}
          product={selectedMembership?.product}
          benefits={selectedMembership?.benefits ?? []}
          offers={domainData.offers}
          stores={domainData.stores}
          redemptions={selectedMembership?.redemptions ?? []}
          memberships={domainData.memberships
            .filter((membership) => membership.subscription)
            .map((membership) => ({
              subscription: membership.subscription as Subscription,
              product: membership.product,
            }))}
          selectedSubscriptionId={selectedMembership?.subscription?.id ?? ""}
          onSelectSubscription={(subscriptionId) => {
            const membership = domainData.memberships.find(
              (candidate) => candidate.subscription?.id === subscriptionId,
            );

            if (membership) {
              onSelectMembership(membership.product.id);
            }
          }}
          availableMemberships={domainData.availableMemberships}
          onJoin={() => {
            /*
             * Read-only admin preview.
             */
          }}
          onExit={() => {
            /*
             * Read-only admin preview.
             */
          }}
          previewDefinition={
            mode === "proposed" ? experience?.experienceDefinition : undefined
          }
          initialTab="card"
          activeTab={activeTab}
          onTabChange={onTabChange}
          previewMode
        />
      </View>
    </View>
  );
}

/* ========================================================================== */
/* DETAIL ROW                                                                 */
/* ========================================================================== */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodySmall" color="textMuted">
        {label}
      </Text>

      <Text variant="bodySmall" color="text" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

/* ========================================================================== */
/* STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 20,
  },

  actionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  actionText: {
    flex: 1,
    gap: 4,
  },

  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },

  heading: {
    gap: 4,
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
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 2,
  },

  panelHeaderText: {
    flex: 1,
    gap: 2,
  },

  customerPreviewFrame: {
    minHeight: 720,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E1E5EA",
    backgroundColor: "#FFFFFF",
  },

  individualPreviewGrid: {
    gap: 8,
    marginTop: 14,
  },

  individualPreviewLink: {
    paddingVertical: 4,
  },

  individualPreviewLinkText: {
    textDecorationLine: "underline",
    fontWeight: "600",
  },

  notificationButton: {
    marginTop: 14,
    marginBottom: 10,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  detailValue: {
    flex: 1,
    textAlign: "right",
  },
});
