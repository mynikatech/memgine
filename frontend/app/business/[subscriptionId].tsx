import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import type { Benefit, BenefitUsageRule, MembershipProduct, Offer, Organization, OrganizationDetails,
  Redemption, Store, Subscription, Status as DomainStatus, TemplateDefaultContent,
  TemplateDefinition } from "@/src/core";
import { services } from "@/src/core";
import { BusinessExperience } from "@/src/experience";
import { BusinessPreviewScope, useBusiness, useCustomerContext,
  useTheme, useTranslation } from "@/src/providers";
import { StateView } from "@/src/ui";

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
  logoUrl?: string;
  tagline?: string;
  heroImageUrl?: string;
  content: TemplateDefaultContent;
  template: TemplateDefinition;
  memberships: MembershipBundle[];
  availableMemberships: MembershipProduct[];
  benefitUsageRules: BenefitUsageRule[];
  offers: Offer[];
  stores: Store[];
};

/** Live customer subscription detail. The former local release snapshot is not read. */
export default function BusinessExperienceRoute() {
  const router = useRouter();
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId: string }>();
  const { setActiveBusiness, configuration } = useBusiness();
  const { customerId, profiles, setActiveContext, setActiveSubscription } = useCustomerContext();
  const { t } = useTranslation();
  const theme = useTheme();
  const [data, setData] = useState<BusinessData | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!customerId || !subscriptionId) throw new Error("Select a customer and membership.");
      const relationships = profiles.length ? profiles : await services.customerData.profiles(customerId);
      let foundOrg: string | null = null;
      let foundSubscriptions: Awaited<ReturnType<typeof services.customerData.subscriptions>> = [];
      for (const relationship of relationships) {
        const rows = await services.customerData.subscriptions(relationship.organizationId, customerId);
        if (rows.some((row) => row.id === subscriptionId)) {
          foundOrg = relationship.organizationId;
          foundSubscriptions = rows;
          break;
        }
      }
      if (!foundOrg) throw new Error("Membership not found for the selected customer.");
      const orgId = foundOrg;
      const [organization, details, branding, catalog, joinCatalog, allBenefits, offers, stores,
        allRedemptions] = await Promise.all([
        services.organization.getOrganization(orgId),
        services.organization.getOrganizationDetails(orgId),
        services.organization.getOrganizationBranding(orgId),
        services.customerData.membershipProducts(orgId, customerId),
        services.customerData.membershipProducts(orgId),
        services.customerData.benefits(orgId, customerId),
        services.customerData.offers(orgId, customerId),
        services.customerData.stores(orgId, customerId),
        services.customerData.redemptions(orgId, customerId),
      ]);
      if (!organization) throw new Error("Business not found.");
      const benefitUsageRules = (await Promise.all(allBenefits.map((benefit) =>
        services.customerData.benefitRules(orgId, customerId, benefit.id)))).flat();
      const templateItem = await services.template.getDefaultTemplateForOrganizationType(
        organization.organizationTypeId);
      if (!templateItem) throw new Error("Customer experience template is unavailable.");
      const bundles: MembershipBundle[] = [];
      for (const row of foundSubscriptions) {
        const product = catalog.find((item) => item.id === row.membershipProductId);
        if (!product) throw new Error("Membership product is unavailable.");
        const status = await services.status.getStatus(row.subscriptionStatusId);
        const subscription = {
          id: row.id, subscriptionNumber: row.subscriptionNumber,
          subscriptionPlanId: row.subscriptionPlanId,
          organizationUserId: row.organizationUserId, subscriptionDate: row.subscriptionDate,
          startDate: row.startDate, endDate: row.endDate,
          subscriptionStatusId: row.subscriptionStatusId,
          totalAmount: { amountMinor: Math.round(row.totalAmount * 100), currency: row.currencyCode },
          createdAt: row.createdAt, createdBy: customerId, updatedAt: row.createdAt,
          updatedBy: customerId, isDeleted: false, versionNo: 1,
        } as Subscription;
        bundles.push({ subscription, subscriptionStatus: status ?? undefined, product,
          benefits: allBenefits.filter((benefit) => product.benefitIds.includes(benefit.id)),
          redemptions: allRedemptions.filter((item) => item.subscriptionId === row.id).map((item) => ({
            id: item.id, redemptionNumber: item.redemptionNumber,
            subscriptionId: item.subscriptionId, benefitId: item.benefitId,
            storeId: item.storeId, staffId: item.staffId ?? undefined,
            redemptionDateTime: item.redemptionDateTime, quantity: item.quantity,
            redemptionStatusId: item.redemptionStatusId, remarks: item.remarks ?? undefined,
            createdAt: item.createdAt, createdBy: item.createdBy,
            updatedAt: item.updatedAt, updatedBy: item.updatedBy,
            versionNo: item.versionNo, isDeleted: false,
            // Redemption method is not recorded in the physical schema.
          } as Redemption)),
        });
      }
      const owned = new Set(bundles.map((item) => item.product.id));
      setData({ organization, details, logoUrl: branding?.logoUrl,
        tagline: branding?.tagline, heroImageUrl: branding?.heroImageUrl,
        content: templateItem.content, template: templateItem.template,
        memberships: bundles, availableMemberships: joinCatalog.filter((item) => !owned.has(item.id)),
        offers, stores, benefitUsageRules });
      setSelectedSubId(subscriptionId);
      setActiveBusiness(orgId);
      setActiveContext(orgId, subscriptionId);
    } catch (failure) {
      setData(null);
      setError(failure instanceof Error ? failure.message : "Unable to load membership.");
    } finally { setLoading(false); }
  }, [customerId, subscriptionId, profiles, setActiveBusiness, setActiveContext]);

  useEffect(() => { void load(); }, [load]);

  const current = data?.memberships.find((item) => item.subscription.id === selectedSubId)
    ?? data?.memberships[0];
  if (!loading && data && current) {
    const orgId = data.organization.id;
    return (
      <BusinessPreviewScope organizationId={orgId} configuration={configuration}
        template={data.template}>
        <BusinessExperience content={data.content} subscription={current.subscription}
          subscriptionStatus={current.subscriptionStatus} product={current.product}
          benefits={current.benefits} offers={data.offers} stores={data.stores}
          benefitUsageRules={data.benefitUsageRules}
          redemptions={current.redemptions} memberships={data.memberships.map((item) => ({
            subscription: item.subscription, product: item.product,
          }))} selectedSubscriptionId={current.subscription.id}
          onSelectSubscription={(id) => { setSelectedSubId(id); setActiveSubscription(id); }}
          availableMemberships={data.availableMemberships}
          onJoin={(productId) => router.push(
            `${APP_ROUTES.join.membership(orgId, productId)}&customerId=${encodeURIComponent(customerId)}` as never)}
          onExit={() => router.replace(APP_ROUTES.customer.cards)}
          organizationOverride={data.organization} detailsOverride={data.details}
          membershipLogoUrl={data.logoUrl} tagline={data.tagline}
          heroImageUrl={data.heroImageUrl} customerUserId={customerId}
          referralProgramOverride={null} renderMode="customer" />
      </BusinessPreviewScope>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background,
      justifyContent: "center", padding: theme.spacing.lg }}>
      {error ? <StateView kind="error" title={t("common.error")} message={error}
        actionLabel={t("common.retry")} onAction={() => void load()} testID="experience-state" />
        : <StateView kind="loading" message={t("common.loading")} testID="experience-state" />}
    </View>
  );
}
