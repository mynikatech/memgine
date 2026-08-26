import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  Benefit,
  CustomerExperience,
  MembershipProduct,
  Offer,
  Redemption,
  Store,
  Status,
  Subscription,
  TemplateDefaultContent,
} from "@/src/core";

import { getBusinessContent, services } from "@/src/core";

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

  onPreviewTab?: (tab: ExperienceTabKey) => void;
};

export default function CustomerExperiencePreview() {
  const router = useRouter();

  const { organization } = useBusiness();

  const [status, setStatus] = useState<LoadStatus>("loading");

  const [currentExperience, setCurrentExperience] =
    useState<CustomerExperience | null>(null);

  const [proposedExperience, setProposedExperience] =
    useState<CustomerExperience | null>(null);

  const [previewData, setPreviewData] = useState<PreviewDomainData | null>(
    null,
  );

  /*
   * Membership currently selected in the admin preview.
   *
   * This is preview state only. It is not a real customer subscription.
   * The first active configured membership is the initial selection.
   */
  const [selectedPreviewMembershipId, setSelectedPreviewMembershipId] =
    useState("");

  /**
   * Current and Proposed intentionally have independent tab state.
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
      console.log(
        "[CustomerExperiencePreview] loading organization:",
        organization.id,
      );

      /*
       * --------------------------------------------------------------
       * 1. Draft Customer Experience
       * --------------------------------------------------------------
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
       * --------------------------------------------------------------
       * 2. Published Customer Experience
       * --------------------------------------------------------------
       *
       * Lifecycle information only.
       *
       * It is NOT the source of the Current customer UI.
       */

      const published =
        await services.customerExperience.getPublishedCustomerExperience(
          organization.id,
        );

      /*
       * --------------------------------------------------------------
       * 3. Independent organization preview data
       * --------------------------------------------------------------
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
      const published =
        await services.customerExperience.publishCustomerExperience(
          organization.id,
          organization.updatedBy,
        );

      setCurrentExperience(published);

      const draft = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      setProposedExperience(draft);

      /*
       * Re-read organization configuration/products.
       *
       * Still completely independent of customer data.
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

  const currentContent = getBusinessContent(organization.id);

  const proposedContent = proposedExperience.experienceDefinition.content;

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
            Overall Customer Experience
          </Text>

          <Text variant="bodySmall" color="textMuted">
            This is the complete customer experience. The left side shows what
            customers see today; the right side shows the proposed experience.
          </Text>
        </View>

        <View style={styles.compareContainer}>
          <PreviewPanel
            title="Current"
            subtitle={
              currentExperience
                ? "Currently live"
                : "Existing customer experience"
            }
            experience={currentExperience}
            mode="current"
            domainData={previewData}
            content={currentContent}
            selectedMembershipId={selectedPreviewMembershipId}
            onSelectMembership={setSelectedPreviewMembershipId}
            activeTab={currentPreviewTab}
            onTabChange={setCurrentPreviewTab}
            onPreviewTab={(tab) =>
              router.push(
                APP_ROUTES.orgAdmin.customerExperienceSection(
                  tab === "history"
                    ? "activity"
                    : tab === "profile"
                      ? "business-information"
                      : tab,
                ) as never,
              )
            }
          />

          <PreviewPanel
            title="Proposed"
            subtitle="Ready to publish"
            experience={proposedExperience}
            mode="proposed"
            domainData={previewData}
            content={proposedContent}
            selectedMembershipId={selectedPreviewMembershipId}
            onSelectMembership={setSelectedPreviewMembershipId}
            activeTab={proposedPreviewTab}
            onTabChange={setProposedPreviewTab}
            onPreviewTab={(tab) =>
              router.push(
                APP_ROUTES.orgAdmin.customerExperienceSection(
                  tab === "history"
                    ? "activity"
                    : tab === "profile"
                      ? "business-information"
                      : tab,
                ) as never,
              )
            }
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
                label="Stores"
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
                  : "No — existing customer experience is shown on the left"
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
      style={{
        paddingVertical: 4,
      }}
    >
      <Text
        variant="bodySmall"
        color="primary"
        style={{
          textDecorationLine: "underline",
          fontWeight: "600",
        }}
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
/* PREVIEW DATA LOADER                                                        */
/* ========================================================================== */

/**
 * IMPORTANT:
 *
 * This loader deliberately does NOT load:
 *
 *   organization users
 *   customer subscriptions
 *   customer redemption history
 *
 * The admin preview is a business/configuration preview, not a
 * customer-account preview.
 *
 * Sources:
 *
 *   Membership products -> organization
 *   Benefits            -> membership products / organization
 *   Offers              -> organization
 *   Stores              -> organization
 *
 * Customer-specific state is represented by deterministic preview data.
 */
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
