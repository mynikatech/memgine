import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import type {
  Benefit,
  CustomerExperience,
  MembershipProduct,
  Offer,
  Redemption,
  Status,
  Store,
  Subscription,
  TemplateDefaultContent,
} from "@/src/core";

import { getBusinessContent, services } from "@/src/core";

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
};

type MembershipBundle = {
  subscription: Subscription;
  subscriptionStatus?: Status;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

type PreviewDomainData = {
  /*
   * Currently selected/representative membership.
   */
  subscription?: Subscription;
  subscriptionStatus?: Status;
  product?: MembershipProduct;

  /*
   * Domain data used by BusinessExperience.
   */
  benefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  redemptions: Redemption[];

  /*
   * Membership switcher data used by the Card tab.
   */
  memberships: {
    subscription: Subscription;
    product: MembershipProduct;
  }[];

  selectedSubscriptionId: string;

  availableMemberships: MembershipProduct[];
};

export default function CustomerExperiencePreview() {
  const router = useRouter();

  const { organization } = useBusiness();

  const [status, setStatus] = useState<LoadStatus>("loading");

  /**
   * The current published Customer Experience record, if one exists.
   *
   * IMPORTANT:
   * This is NOT used as the source of the Current customer UI.
   *
   * Current customer UI comes from getBusinessContent(), because that is
   * what the existing customer experience currently uses.
   */
  const [currentExperience, setCurrentExperience] =
    useState<CustomerExperience | null>(null);

  /**
   * Draft Customer Experience configuration.
   */
  const [proposedExperience, setProposedExperience] =
    useState<CustomerExperience | null>(null);

  /**
   * Real/mock domain data used by BusinessExperience.
   *
   * This is deliberately independent of CustomerExperienceDefinition.
   */
  const [previewData, setPreviewData] = useState<PreviewDomainData | null>(
    null,
  );

  const [publishing, setPublishing] = useState(false);

  const [notificationStatus, setNotificationStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");

  /* ------------------------------------------------------------------------ */
  /* LOAD                                                                     */
  /* ------------------------------------------------------------------------ */

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      console.log(
        "[CustomerExperiencePreview] loading organization:",
        organization.id,
      );

      /*
       * ----------------------------------------------------------------------
       * 1. Draft / proposed Customer Experience
       * ----------------------------------------------------------------------
       *
       * getCustomerExperience() initializes a draft from the platform
       * template when one does not already exist.
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
       * ----------------------------------------------------------------------
       * 2. Currently published Customer Experience
       * ----------------------------------------------------------------------
       *
       * This is useful for lifecycle information only.
       *
       * It is NOT the source of the Current preview.
       */
      const published =
        await services.customerExperience.getPublishedCustomerExperience(
          organization.id,
        );

      /*
       * ----------------------------------------------------------------------
       * 3. Load representative customer/domain data.
       * ----------------------------------------------------------------------
       *
       * This is the same kind of data used by the actual
       * BusinessExperience renderer.
       */
      const domainData = await loadPreviewData(organization.id);

      setProposedExperience(draft);
      setCurrentExperience(published);
      setPreviewData(domainData);

      setStatus("ready");
    } catch (error) {
      console.error("[CustomerExperiencePreview] load failed:", error);

      setStatus("error");
    }
  }, [organization.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------------------------------------------------ */
  /* PUBLISH                                                                  */
  /* ------------------------------------------------------------------------ */

  const publish = useCallback(async () => {
    if (!proposedExperience) {
      return;
    }

    setPublishing(true);

    try {
      console.log(
        "[CustomerExperiencePreview] publishing draft:",
        proposedExperience.id,
      );

      const published =
        await services.customerExperience.publishCustomerExperience(
          organization.id,
          organization.updatedBy,
        );

      console.log("[CustomerExperiencePreview] published:", published);

      setCurrentExperience(published);

      /*
       * Reload the draft after publication so the page reflects the
       * lifecycle state maintained by the service.
       */
      const draft = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      setProposedExperience(draft);

      /*
       * Reload domain data as well. The publish operation may update the
       * organization-owned content used by BusinessExperience.
       */
      const refreshedDomainData = await loadPreviewData(organization.id);

      setPreviewData(refreshedDomainData);
    } catch (error) {
      console.error("[CustomerExperiencePreview] publish failed:", error);
    } finally {
      setPublishing(false);
    }
  }, [organization.id, organization.updatedBy, proposedExperience]);

  /* ------------------------------------------------------------------------ */
  /* NOTIFICATION                                                             */
  /* ------------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------------ */
  /* LOADING                                                                  */
  /* ------------------------------------------------------------------------ */

  if (status === "loading") {
    return (
      <Screen edges={["top"]}>
        <StateView kind="loading" message="Loading customer experience..." />
      </Screen>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* ERROR                                                                    */
  /* ------------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------------ */
  /* CURRENT CUSTOMER CONTENT                                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * THIS is the important distinction.
   *
   * Current = the existing customer experience.
   *
   * It does not depend on whether a CustomerExperience has been published.
   */
  const currentContent = getBusinessContent(organization.id);

  /**
   * Proposed = the Customer Experience draft.
   */
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
        {/* FINAL REVIEW / PUBLISH                                             */}
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
          {/* ================================================================ */}
          {/* CURRENT                                                          */}
          {/* ================================================================ */}

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
          />

          {/* ================================================================ */}
          {/* PROPOSED                                                         */}
          {/* ================================================================ */}

          <PreviewPanel
            title="Proposed"
            subtitle="Ready to publish"
            experience={proposedExperience}
            mode="proposed"
            domainData={previewData}
            content={proposedContent}
          />
        </View>

        {/* ================================================================== */}
        {/* CUSTOMER NOTIFICATION                                               */}
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
/* PREVIEW PANEL                                                              */
/* ========================================================================== */

function PreviewPanel({
  title,
  subtitle,
  experience,
  mode,
  domainData,
  content,
}: PreviewPanelProps & {
  content: TemplateDefaultContent;
}) {
  return (
    <View style={styles.comparePanel}>
      {/* -------------------------------------------------------------------- */}
      {/* Panel heading                                                        */}
      {/* -------------------------------------------------------------------- */}

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

      {/* -------------------------------------------------------------------- */}
      {/* Actual customer renderer                                             */}
      {/* -------------------------------------------------------------------- */}

      <View style={styles.customerPreviewFrame}>
        <BusinessExperience
          /*
           * Current:
           *   getBusinessContent()
           *
           * Proposed:
           *   draft.experienceDefinition.content
           *
           * Both therefore go through the SAME customer renderer.
           */
          content={content}
          /*
           * Use the same representative membership/domain data for
           * both sides.
           */
          subscription={domainData.subscription}
          subscriptionStatus={domainData.subscriptionStatus}
          product={domainData.product}
          benefits={domainData.benefits}
          offers={domainData.offers}
          stores={domainData.stores}
          redemptions={domainData.redemptions}
          memberships={domainData.memberships}
          selectedSubscriptionId={domainData.selectedSubscriptionId}
          onSelectSubscription={() => {
            /*
             * Final review is read-only.
             *
             * Membership switching is intentionally disabled
             * in the admin preview.
             */
          }}
          availableMemberships={domainData.availableMemberships}
          onJoin={() => {
            /*
             * Joining a membership must never be initiated from
             * the admin preview.
             */
          }}
          onExit={() => {
            /*
             * The customer renderer owns its customer-facing
             * navigation. The admin preview itself remains read-only.
             */
          }}
          /*
           * These props allow the renderer to apply the proposed
           * Customer Experience definition where supported.
           *
           * For the Current panel we deliberately do not pass
           * the draft definition.
           */
          previewDefinition={
            mode === "proposed" ? experience?.experienceDefinition : undefined
          }
          initialTab="card"
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
/* DOMAIN DATA LOADER                                                         */
/* ========================================================================== */

/**
 * Loads representative customer/domain data for the preview.
 *
 * IMPORTANT:
 *
 * CustomerExperienceDefinition controls presentation.
 *
 * Actual:
 *   - memberships
 *   - subscriptions
 *   - benefits
 *   - offers
 *   - stores
 *   - redemptions
 *
 * remain domain data.
 *
 * The preview simply feeds those records into the same
 * BusinessExperience renderer used by customers.
 */
async function loadPreviewData(
  organizationId: string,
): Promise<PreviewDomainData> {
  /*
   * ------------------------------------------------------------------------
   * 1. Find organization users
   * ------------------------------------------------------------------------
   */

  const organizationUsers =
    await services.organization.listOrganizationUsers(organizationId);

  const organizationMemberships: MembershipBundle[] = [];

  /*
   * ------------------------------------------------------------------------
   * 2. Resolve memberships/subscriptions
   * ------------------------------------------------------------------------
   */

  for (const organizationUser of organizationUsers) {
    const subscriptions = await services.subscription.listByOrganizationUser(
      organizationUser.id,
    );

    for (const subscription of subscriptions) {
      const plan = await services.subscriptionPlan.getPlan(
        subscription.subscriptionPlanId,
      );

      if (!plan) {
        continue;
      }

      const product = await services.membershipProduct.getProduct(
        plan.membershipProductId,
      );

      if (!product) {
        continue;
      }

      const benefits = await services.benefit.listByProduct(
        plan.membershipProductId,
      );

      const redemptions = await services.redemption.listBySubscription(
        subscription.id,
      );

      /*
       * Resolve canonical subscription status.
       */
      const entityStatus = await services.status.getEntityStatus(
        subscription.subscriptionStatusId,
      );

      const subscriptionStatus = entityStatus
        ? ((await services.status.getStatus(entityStatus.statusId)) ??
          undefined)
        : undefined;

      organizationMemberships.push({
        subscription,
        subscriptionStatus,
        product,
        benefits,
        redemptions,
      });
    }
  }

  /*
   * ------------------------------------------------------------------------
   * 3. Organization-level data
   * ------------------------------------------------------------------------
   */

  const [offers, stores, products] = await Promise.all([
    services.offer.listByOrganization(organizationId),

    services.organization.listStores(organizationId),

    services.membershipProduct.listProducts(organizationId),
  ]);

  /*
   * ------------------------------------------------------------------------
   * 4. Available memberships
   * ------------------------------------------------------------------------
   */

  const ownedProductIds = new Set(
    organizationMemberships.map((membership) => membership.product.id),
  );

  const availableMemberships = products.filter(
    (product) =>
      product.productStatusId === "product-status-active" &&
      !ownedProductIds.has(product.id),
  );

  const memberships = organizationMemberships.map((membership) => ({
    subscription: membership.subscription,
    product: membership.product,
  }));

  /*
   * ------------------------------------------------------------------------
   * 5. Select representative membership
   * ------------------------------------------------------------------------
   *
   * This is intentionally mock/representative data.
   *
   * The preview is not tied to a particular real customer.
   */

  const selected = organizationMemberships[0];
  return {
    subscription: selected?.subscription,
    subscriptionStatus: selected?.subscriptionStatus,
    product: selected?.product,

    benefits: selected?.benefits ?? [],
    redemptions: selected?.redemptions ?? [],

    offers,
    stores,

    memberships,

    selectedSubscriptionId: selected?.subscription.id ?? "",

    availableMemberships,
  };
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
