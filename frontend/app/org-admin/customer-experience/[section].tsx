import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import type { CustomerExperience } from "@/src/core";
import { services } from "@/src/core";

import type { PreviewDomainData, PreviewMembership } from "@/src/experience";

import { loadPreviewData } from "@/src/experience";

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

  const [previewData, setPreviewData] = useState<PreviewDomainData | null>(
    null,
  );

  const [selectedMembershipId, setSelectedMembershipId] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");

    try {
      /*
       * Customer Experience configuration is the only configuration
       * loaded from the actual organization.
       *
       * Customer/customer-subscription data is NOT loaded here.
       *
       * All customer-facing domain data comes from loadPreviewData().
       */
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

      /*
       * First configured membership is the current default.
       *
       * We intentionally do not hard-code Gold/Silver/Platinum here.
       * Later this can be replaced by membership.displayOrder.
       */
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
          onAction={() => void load()}
        />
      </Screen>
    );
  }

  /*
   * IMPORTANT:
   *
   * The selected membership comes exclusively from previewData.
   *
   * There is no organization-user lookup and no real customer
   * subscription involved in this screen.
   */
  const selected: PreviewMembership | undefined =
    previewData.memberships.find(
      (membership: PreviewMembership) =>
        membership.subscription.id === selectedMembershipId,
    ) ?? previewData.memberships[0];

  /*
   * BusinessExperience expects subscriptions to exist for the
   * membership selector. These are synthetic preview subscriptions
   * created by loadPreviewData().
   */
  const membershipList = previewData.memberships.map(
    (membership: PreviewMembership) => ({
      subscription: membership.subscription,
      product: membership.product,
    }),
  );

  const selectedSubscriptionId = selected?.subscription.id ?? "";

  /*
   * Individual section previews open the appropriate customer tab
   * where applicable.
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
        {/* Preview header */}
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

        {/*
         * Membership selector
         *
         * Only the membership section needs its own selector because
         * this is the individual membership preview.
         *
         * The selector changes the synthetic preview membership,
         * not a real customer's subscription.
         */}
        {section === "membership" && membershipList.length > 1 ? (
          <Card padding="md">
            <Text variant="label" color="textMuted">
              Memberships
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: 8,
                paddingTop: 10,
              }}
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

        {/* Customer experience renderer */}
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
            onSelectSubscription={(subscriptionId) => {
              setSelectedMembershipId(subscriptionId);
            }}
            availableMemberships={previewData.availableMemberships}
            onJoin={() => {}}
            onExit={() => router.back()}
            previewDefinition={experience.experienceDefinition}
            initialTab={initialTab}
            previewMode
            previewSection={section}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
