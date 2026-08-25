import { useLocalSearchParams, useRouter } from "expo-router";

import { useCallback, useEffect, useState } from "react";

import { ScrollView, View } from "react-native";

import type {
  Benefit,
  CustomerExperience,
  MembershipProduct,
  Offer,
  Redemption,
  Status,
  Store,
  Subscription,
} from "@/src/core";

import { getBusinessContent, services } from "@/src/core";

import { BusinessExperience } from "@/src/experience/BusinessExperience";

import { useBusiness } from "@/src/providers";

import { Button, Card, Header, StateView, Text } from "@/src/ui";

import { Screen } from "@/src/layout";

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

type MembershipBundle = {
  subscription: Subscription;
  subscriptionStatus?: Status;
  product: MembershipProduct;
  benefits: Benefit[];
  redemptions: Redemption[];
};

type PreviewData = {
  memberships: MembershipBundle[];
  availableMemberships: MembershipProduct[];
  offers: Offer[];
  stores: Store[];
};

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

export default function CustomerExperienceSectionPreview() {
  const router = useRouter();

  const { section } = useLocalSearchParams<{
    section?: string;
  }>();

  const { organization } = useBusiness();

  const [status, setStatus] = useState<StatusState>("loading");

  const [experience, setExperience] = useState<CustomerExperience | null>(null);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      const result = await services.customerExperience.getCustomerExperience(
        organization.id,
      );

      if (!result) {
        setStatus("error");
        return;
      }

      const data = await loadPreviewData(organization.id);

      setExperience(result);
      setPreviewData(data);

      setStatus("ready");
    } catch (error) {
      console.error("[CustomerExperienceSectionPreview] load failed:", error);

      setStatus("error");
    }
  }, [organization.id]);

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

  if (status === "error" || !experience || !previewData) {
    return (
      <Screen edges={["top"]}>
        <StateView
          kind="error"
          title="Unable to load preview"
          message="Unable to initialize this customer experience preview."
          actionLabel="Retry"
          onAction={() => {
            void load();
          }}
        />
      </Screen>
    );
  }

  const selected = previewData.memberships[0];

  const membershipList = previewData.memberships.map((membership) => ({
    subscription: membership.subscription,
    product: membership.product,
  }));

  /*
   * Map configuration sections to the REAL customer tabs.
   */
  const initialTab =
    section === "offers"
      ? "offers"
      : section === "activity"
        ? "history"
        : "card";

  return (
    <Screen edges={["top"]}>
      <Header
        title={SECTION_TITLES[section]}
        subtitle="Customer-facing preview"
      />

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card padding="md">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <View
              style={{
                flex: 1,
                gap: 4,
              }}
            >
              <Text variant="title" color="text">
                {SECTION_TITLES[section]}
              </Text>

              <Text variant="bodySmall" color="textMuted">
                This is the same customer experience renderer used by the live
                customer application.
              </Text>
            </View>

            <Button
              label="Back"
              onPress={() => router.back()}
              variant="secondary"
            />
          </View>
        </Card>

        <View
          style={{
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "#E1E5EA",
            borderRadius: 18,
            backgroundColor: "#FFFFFF",
            minHeight: 720,
          }}
        >
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
            selectedSubscriptionId={selected?.subscription.id ?? ""}
            onSelectSubscription={() => {
              /*
               * Read-only preview.
               */
            }}
            availableMemberships={previewData.availableMemberships}
            onJoin={() => {
              /*
               * Read-only preview.
               */
            }}
            onExit={() => {
              /*
               * Read-only preview.
               */
            }}
            previewDefinition={experience.experienceDefinition}
            initialTab={initialTab}
            previewMode
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ========================================================================== */
/* PREVIEW DATA                                                               */
/* ========================================================================== */

async function loadPreviewData(organizationId: string): Promise<PreviewData> {
  const organizationUsers =
    await services.organization.listOrganizationUsers(organizationId);

  const memberships: MembershipBundle[] = [];

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

      const entityStatus = await services.status.getEntityStatus(
        subscription.subscriptionStatusId,
      );

      const subscriptionStatus = entityStatus
        ? ((await services.status.getStatus(entityStatus.statusId)) ??
          undefined)
        : undefined;

      memberships.push({
        subscription,
        subscriptionStatus,
        product,
        benefits,
        redemptions,
      });
    }
  }

  const [offers, stores, products] = await Promise.all([
    services.offer.listByOrganization(organizationId),

    services.organization.listStores(organizationId),

    services.membershipProduct.listProducts(organizationId),
  ]);

  const ownedProductIds = new Set(
    memberships.map((membership) => membership.product.id),
  );

  const availableMemberships = products.filter(
    (product) =>
      product.productStatusId === "product-status-active" &&
      !ownedProductIds.has(product.id),
  );

  return {
    memberships,
    availableMemberships,
    offers,
    stores,
  };
}
