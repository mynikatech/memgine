import { useLocalSearchParams, useRouter } from "expo-router";

import { useCallback, useEffect, useRef, useState } from "react";

import { View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";

import type {
  Benefit,
  BenefitUsageRule,
  MembershipProduct,
  Offer,
  Organization,
  OrganizationBranding,
  OrganizationDetails,
  Redemption,
  Store,
  Subscription,
  Status as DomainStatus,
  TemplateDefaultContent,
  TemplateDefinition,
} from "@/src/core";

import { services } from "@/src/core";

import { BusinessExperience } from "@/src/experience";

import { entityStatusApi } from "@/src/data/api/entity-status-api";

import {
  BusinessPreviewScope,
  useCustomerContext,
  useTheme,
  useTranslation,
} from "@/src/providers";

import { StateView } from "@/src/ui";

import type {
  CustomerCombinedOffer,
  CustomerRedemptionItemStatus,
} from "@/src/data/api/customer-data-api";

type MembershipBundle = {
  subscription: Subscription;

  subscriptionStatus?: DomainStatus;

  product: MembershipProduct;

  benefits: Benefit[];

  redemptions: Redemption[];
};

type BusinessData = {
  organization: Organization;

  details: OrganizationDetails | null;
  publishedBranding: OrganizationBranding | null;

  logoUrl?: string;

  tagline?: string;

  heroImageUrl?: string;

  content: TemplateDefaultContent;

  template: TemplateDefinition;

  memberships: MembershipBundle[];

  availableMemberships: MembershipProduct[];

  benefitUsageRules: BenefitUsageRule[];

  offers: Offer[];

  membershipPurchaseOffers: CustomerCombinedOffer[];

  stores: Store[];

  redemptionItemStatusesBySubscription: Record<
    string,
    CustomerRedemptionItemStatus[]
  >;
};

/** Live customer subscription detail. The former local release snapshot is not read. */

export default function BusinessExperienceRoute() {
  const router = useRouter();

  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();

  const {
    customerId,

    organizationId: activeOrganizationId,

    subscriptionId: activeSubscriptionId,

    customersLoading,

    customersError,

    landing,

    refreshCustomers,

    membershipSummary,

    setActiveContext,

    setActiveSubscription,
  } = useCustomerContext();

  const { t } = useTranslation();

  const theme = useTheme();

  const [data, setData] = useState<BusinessData | null>(null);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const [resolvedOrganizationId, setResolvedOrganizationId] = useState<
    string | null
  >(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  const activeOrganizationIdRef = useRef(activeOrganizationId);

  const requestIdRef = useRef(0);

  activeOrganizationIdRef.current = activeOrganizationId;

  const load = useCallback(
    async (isCurrent: () => boolean) => {
      try {
        if (!landing) return;

        if (!customerId || !subscriptionId)
          throw new Error("Select a customer and membership.");

        const relationships = landing.relationships.filter(
          (relationship) => relationship.userId === customerId,
        );

        const activeRelationship = relationships.find(
          (relationship) =>
            relationship.organizationId === activeOrganizationIdRef.current,
        );

        let selected:
          | {
              organizationId: string;

              summary: Awaited<ReturnType<typeof membershipSummary>>;
            }
          | undefined;

        if (activeRelationship) {
          const summary = await membershipSummary(
            activeRelationship.organizationId,
          );

          if (summary.subscriptions.some((row) => row.id === subscriptionId)) {
            selected = {
              organizationId: activeRelationship.organizationId,

              summary,
            };
          }
        }

        if (!selected) {
          for (const relationship of relationships) {
            if (relationship.organizationId === activeOrganizationIdRef.current)
              continue;

            const summary = await membershipSummary(
              relationship.organizationId,
            );

            if (
              summary.subscriptions.some((row) => row.id === subscriptionId)
            ) {
              selected = {
                organizationId: relationship.organizationId,

                summary,
              };

              break;
            }
          }
        }

        if (!selected)
          throw new Error("Membership not found for the selected customer.");

        const orgId = selected.organizationId;

        const foundSubscriptions = selected.summary.subscriptions;

        const catalog = selected.summary.membershipProducts;

        const allBenefits = selected.summary.benefits;

        const branding = selected.summary.branding;

        // Membership Summary returns branding from the published Customer
        // Experience release, including the complete Branding V2 configuration.
        //
        // Use it as the primary source rather than replacing it with the
        // reduced branding projection from Customer Discovery.
        let publishedBranding: OrganizationBranding | null = branding ?? null;

        // Fallback for organizations where Membership Summary does not
        // provide branding. Never allow a discovery failure to block access.
        if (!publishedBranding) {
          try {
            const publishedDetail =
              await services.customerData.discoverOrganizationDetail(orgId);

            publishedBranding =
              (publishedDetail.publishedExperience.organizationBranding as
                | OrganizationBranding
                | null
                | undefined) ?? null;
          } catch {
            // Branding is optional; retain the standard customer experience.
          }
        }

        const [
          organization,

          details,

          joinCatalog,

          combinedOffers,

          stores,

          allRedemptions,

          statusLists,
        ] = await Promise.all([
          services.organization.getOrganization(orgId),

          services.organization.getOrganizationDetails(orgId),

          services.customerData.membershipProducts(orgId),

          services.customerData.combinedOffers(orgId),

          services.customerData.stores(orgId, customerId),

          services.customerData.redemptions(orgId, customerId),

          Promise.all(
            foundSubscriptions.map((row) =>
              services.customerData.redemptionItemStatuses(orgId, row.id),
            ),
          ),
        ]);

        if (!organization) throw new Error("Business not found.");

        const benefitUsageRules = (
          await Promise.all(
            allBenefits.map((benefit) =>
              services.customerData.benefitRules(orgId, customerId, benefit.id),
            ),
          )
        ).flat();

        const templateItem =
          await services.template.getDefaultTemplateForOrganizationType(
            organization.organizationTypeId,
          );

        if (!templateItem)
          throw new Error("Customer experience template is unavailable.");

        const bundles: MembershipBundle[] = [];

        for (const row of foundSubscriptions) {
          const product = catalog.find(
            (item) => item.id === row.membershipProductId,
          );

          if (!product) throw new Error("Membership product is unavailable.");

          const subscriptionStatusId = await entityStatusApi.resolveStatusId(
            row.subscriptionStatusId,
          );

          const status = await services.status.getStatus(subscriptionStatusId);

          const subscription = {
            id: row.id,

            subscriptionNumber: row.subscriptionNumber,

            subscriptionPlanId: row.subscriptionPlanId,

            organizationUserId: row.organizationUserId,

            subscriptionDate: row.subscriptionDate,

            startDate: row.startDate,

            endDate: row.endDate,

            subscriptionStatusId,

            totalAmount: {
              amountMinor: Math.round(row.totalAmount * 100),

              currency: row.currencyCode,
            },

            createdAt: row.createdAt,

            createdBy: customerId,

            updatedAt: row.createdAt,

            updatedBy: customerId,

            isDeleted: false,

            versionNo: 1,
          } as Subscription;

          bundles.push({
            subscription,

            subscriptionStatus: status ?? undefined,

            product,

            benefits: allBenefits.filter((benefit) =>
              product.benefitIds.includes(benefit.id),
            ),

            redemptions: allRedemptions

              .filter((item) => item.subscriptionId === row.id)

              .map(
                (item) =>
                  ({
                    id: item.id,

                    redemptionNumber: item.redemptionNumber,

                    subscriptionId: item.subscriptionId,

                    benefitId: item.benefitId,

                    storeId: item.storeId,

                    staffId: item.staffId ?? undefined,

                    redemptionDateTime: item.redemptionDateTime,

                    quantity: item.quantity,

                    redemptionStatusId: item.redemptionStatusId,

                    remarks: item.remarks ?? undefined,

                    createdAt: item.createdAt,

                    createdBy: item.createdBy,

                    updatedAt: item.updatedAt,

                    updatedBy: item.updatedBy,

                    versionNo: item.versionNo,

                    isDeleted: false,

                    // Redemption method is not recorded in the physical schema.
                  }) as Redemption,
              ),
          });
        }

        // An active subscription prevents another purchase of the same product.

        // A cancelled or expired subscription is historical, not active ownership.

        // Other and unresolved statuses remain blocked from automatic repurchase.

        const repurchasableStatuses = new Set([
          "CANCELLED",

          "CANCELED",

          "EXPIRED",
        ]);

        const owned = new Set(
          bundles

            .filter(
              (item) =>
                !repurchasableStatuses.has(
                  item.subscriptionStatus?.statusCode?.toUpperCase() ?? "",
                ),
            )

            .map((item) => item.product.id),
        );

        const redemptionItemStatusesBySubscription = Object.fromEntries(
          foundSubscriptions.map((row, index) => [row.id, statusLists[index]]),
        );

        if (!isCurrent()) return;

        setData({
          organization,

          details,

          publishedBranding,

          logoUrl: publishedBranding?.logoUrl ?? branding?.logoUrl,

          tagline: publishedBranding?.tagline ?? branding?.tagline,

          heroImageUrl:
            publishedBranding?.heroImageUrl ?? branding?.heroImageUrl,

          content: templateItem.content,

          template: templateItem.template,

          memberships: bundles,

          availableMemberships: joinCatalog.filter(
            (item) => !owned.has(item.id),
          ),

          offers: combinedOffers.flatMap((offer) =>
            offer.offerType === "REGULAR" && offer.regularOffer
              ? [offer.regularOffer]
              : [],
          ),

          membershipPurchaseOffers: combinedOffers.filter(
            (offer) => offer.offerType === "MEMBERSHIP_PURCHASE",
          ),

          stores,

          benefitUsageRules,

          redemptionItemStatusesBySubscription,
        });

        setSelectedSubId(subscriptionId);

        setResolvedOrganizationId(orgId);
      } catch (failure) {
        if (!isCurrent()) return;

        setData(null);

        setResolvedOrganizationId(null);

        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load membership.",
        );
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },

    [customerId, subscriptionId, landing, membershipSummary],
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    const isCurrent = () => requestId === requestIdRef.current;

    if (customersLoading || (!landing && !customersError)) {
      setLoading(true);

      setError(null);

      setData(null);

      setResolvedOrganizationId(null);

      return;
    }

    if (customersError) {
      setLoading(false);

      setData(null);

      setResolvedOrganizationId(null);

      return;
    }

    setLoading(true);

    setError(null);

    setData(null);

    setResolvedOrganizationId(null);

    void load(isCurrent);
  }, [customersLoading, customersError, landing, load, reloadKey]);

  useEffect(() => {
    if (!resolvedOrganizationId || !subscriptionId) return;

    if (
      activeOrganizationId !== resolvedOrganizationId ||
      activeSubscriptionId !== subscriptionId
    ) {
      setActiveContext(resolvedOrganizationId, subscriptionId);
    }
  }, [
    activeOrganizationId,

    activeSubscriptionId,

    resolvedOrganizationId,

    setActiveContext,

    subscriptionId,
  ]);

  const activeMemberships =
    data?.memberships.filter(
      (item) => item.subscriptionStatus?.statusCode?.toUpperCase() === "ACTIVE",
    ) ?? [];

  const current =
    data?.memberships.find((item) => item.subscription.id === selectedSubId) ??
    data?.memberships[0];

  if (!loading && data && current) {
    const orgId = data.organization.id;

    return (
      <BusinessPreviewScope organizationId={orgId} template={data.template}>
        <BusinessExperience
          content={data.content}
          subscription={current.subscription}
          subscriptionStatus={current.subscriptionStatus}
          product={current.product}
          benefits={current.benefits}
          offers={data.offers}
          stores={data.stores}
          membershipPurchaseOffers={data.membershipPurchaseOffers}
          benefitUsageRules={data.benefitUsageRules}
          redemptionItemStatuses={
            data.redemptionItemStatusesBySubscription[
              current.subscription.id
            ] ?? []
          }
          redemptions={current.redemptions}
          memberships={activeMemberships.map((item) => ({
            subscription: item.subscription,

            product: item.product,
          }))}
          selectedSubscriptionId={current.subscription.id}
          onSelectSubscription={(id) => {
            setSelectedSubId(id);

            setActiveSubscription(id);
          }}
          availableMemberships={data.availableMemberships}
          onJoin={(productId) =>
            router.push(
              `${APP_ROUTES.join.membership(orgId, productId)}&customerId=${encodeURIComponent(customerId)}` as never,
            )
          }
          onUseMembershipPurchaseOffer={(offerId, displayName, productId) =>
            router.push(
              `${APP_ROUTES.join.membership(orgId, productId)}&customerId=${encodeURIComponent(customerId)}&explicitOfferId=${encodeURIComponent(offerId)}&explicitOfferName=${encodeURIComponent(displayName)}` as never,
            )
          }
          onExit={() => router.replace(APP_ROUTES.customer.cards)}
          onRefreshRedemptionState={() =>
            setReloadKey((currentReloadKey) => currentReloadKey + 1)
          }
          organizationOverride={data.organization}
          detailsOverride={data.details}
          brandingOverride={data.publishedBranding}
          membershipLogoUrl={data.logoUrl}
          tagline={data.tagline}
          heroImageUrl={data.heroImageUrl}
          customerUserId={customerId}
          referralProgramOverride={null}
          renderMode="customer"
        />
      </BusinessPreviewScope>
    );
  }

  return (
    <View
      style={{
        flex: 1,

        backgroundColor: theme.colors.background,

        justifyContent: "center",

        padding: theme.spacing.lg,
      }}
    >
      {error || customersError ? (
        <StateView
          kind="error"
          title={t("common.error")}
          message={customersError ?? error ?? "Unable to load membership."}
          actionLabel={t("common.retry")}
          onAction={() =>
            customersError
              ? void refreshCustomers()
              : setReloadKey((currentReloadKey) => currentReloadKey + 1)
          }
          testID="experience-state"
        />
      ) : (
        <StateView
          kind="loading"
          message={t("common.loading")}
          testID="experience-state"
        />
      )}
    </View>
  );
}
