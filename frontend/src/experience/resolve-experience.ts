import type {
  Benefit,
  BusinessConfiguration,
  DefaultBusinessInformationContent,
  DefaultBusinessPreferencesContent,
  DefaultPromotionContent,
  DefaultReferralContent,
  MembershipProduct,
  Offer,
  Organization,
  Redemption,
  Status,
  Store,
  Subscription,
  TemplateDefaultContent,
  TemplateDefinition,
} from "@/src/core";

import { TemplateSectionKey } from "@/src/core";

/**
 * resolve-experience — the pure, framework-free brain of the Business
 * Experience renderer.
 *
 * Production:
 *   Domain data comes from the real customer.
 *
 * Admin preview:
 *   Domain data may come from preview/mock data supplied by the admin
 *   preview layer.
 *
 * The renderer itself does not know or care where the data originated.
 */

export type ExperienceTabKey = "card" | "offers" | "history" | "profile";

export interface ExperienceTab {
  key: ExperienceTabKey;
  /** i18n key for the tab label. */
  labelKey: string;
  icon: string;
  iconOutline: string;
}

export interface ResolvedMembership {
  tier: string;
  productName: string;
  description: string;
  active: boolean;
  validUntilLabel: string;
  daysRemaining: number | null;
  memberId: string;
}

export interface ResolvedActivity {
  id: string;
  title: string;
  location: string;
  timeLabel: string;
}

export type RedeemableBenefit = Benefit & {
  available: boolean;
};

export interface ResolvedExperience {
  displayName: string;
  monogram: string;
  tagline: string;
  heroImageUrl: string;

  heroPromotion?: DefaultPromotionContent;
  featuredPromotion?: DefaultPromotionContent;

  membership?: ResolvedMembership;

  benefits: Benefit[];
  redeemableBenefits: RedeemableBenefit[];

  offers: Offer[];
  stores: Store[];

  activity: ResolvedActivity[];
  activityCount: number;
  mostVisited?: string;

  businessInformation?: DefaultBusinessInformationContent;
  businessPreferences?: DefaultBusinessPreferencesContent;
  referral?: DefaultReferralContent;

  showOffers: boolean;
  showStores: boolean;
  showActivity: boolean;

  tabs: ExperienceTab[];
}

export interface PreviewMembershipOverride {
  /**
   * Product comes directly from the organization's configured
   * membership products.
   */
  product: MembershipProduct;

  /**
   * Preview state is deliberately independent of a real customer.
   */
  active: boolean;

  /**
   * Optional deterministic preview values.
   */
  validUntilLabel?: string;
  memberId?: string;
}

export interface ResolveExperienceInput {
  organization: Organization;

  configuration: BusinessConfiguration;

  template: TemplateDefinition;

  content: TemplateDefaultContent;

  /**
   * Production customer data.
   *
   * These remain optional because the admin preview does not need
   * a real customer subscription.
   */
  subscription?: Subscription;
  subscriptionStatus?: Status;
  product?: MembershipProduct;

  benefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  redemptions: Redemption[];

  formatDate: (date: string) => string;

  /**
   * Admin preview only.
   *
   * When supplied, this takes precedence over the real customer
   * subscription/product combination above.
   */
  previewMembership?: PreviewMembershipOverride;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveExperience(
  input: ResolveExperienceInput,
): ResolvedExperience {
  const {
    organization,
    configuration,
    template,
    content,
    subscription,
    subscriptionStatus,
    product,
    previewMembership,
  } = input;

  const cx = configuration.customerExperience;

  const templateHas = (key: TemplateSectionKey) =>
    template.sections.some((section) => section.key === key);

  /*
   * Optional sections are only surfaced when the template permits them
   * AND the business has switched them on.
   */
  const showOffers = cx.showOffers && templateHas(TemplateSectionKey.OFFERS);

  const showStores = cx.showStores && templateHas(TemplateSectionKey.STORES);

  const showActivity =
    cx.showActivity && templateHas(TemplateSectionKey.ACTIVITY);

  /* ---------------------------------------------------------------------- */
  /* Membership                                                             */
  /* ---------------------------------------------------------------------- */

  let membership: ResolvedMembership | undefined;

  /*
   * ADMIN PREVIEW
   *
   * The preview membership is derived from an organization's configured
   * MembershipProduct. It does NOT require a real customer subscription.
   */
  if (previewMembership) {
    const previewProduct = previewMembership.product;

    membership = {
      tier: previewProduct.displayName ?? previewProduct.membershipProductName,

      productName: previewProduct.membershipProductName,

      description: previewProduct.description ?? content.membership.description,

      active: previewMembership.active,

      validUntilLabel: previewMembership.validUntilLabel ?? "—",

      daysRemaining: null,

      memberId:
        previewMembership.memberId ??
        `MG-PREVIEW-${previewProduct.id
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")}`,
    };
  } else if (subscription && product) {
    /*
     * PRODUCTION CUSTOMER EXPERIENCE
     *
     * This remains exactly subscription/domain driven.
     */
    const active = subscriptionStatus?.statusCode.toUpperCase() === "ACTIVE";

    const validUntilLabel = subscription.endDate
      ? input.formatDate(subscription.endDate)
      : "—";

    const daysRemaining = subscription.endDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(subscription.endDate).getTime() - Date.now()) / DAY_MS,
          ),
        )
      : null;

    membership = {
      tier: product.displayName ?? product.membershipProductName,

      productName: product.membershipProductName,

      description: product.description ?? content.membership.description,

      active,

      validUntilLabel,

      daysRemaining,

      memberId: `MG-${subscription.id.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Benefits / redemptions                                                 */
  /* ---------------------------------------------------------------------- */

  const benefitsById = new Map(
    input.benefits.map((benefit) => [benefit.id, benefit]),
  );

  const storesById = new Map(input.stores.map((store) => [store.id, store]));

  /*
   * Redemptions are:
   *
   * - real customer redemptions in production
   * - deterministic mock redemptions in preview
   */
  const usedBenefitIds = new Set(
    input.redemptions.map((redemption) => redemption.benefitId),
  );

  const redeemableBenefits: RedeemableBenefit[] = membership
    ? input.benefits.map((benefit) => ({
        ...benefit,
        available: !usedBenefitIds.has(benefit.id),
      }))
    : [];

  /* ---------------------------------------------------------------------- */
  /* Activity                                                               */
  /* ---------------------------------------------------------------------- */

  const activity: ResolvedActivity[] = input.redemptions.map((redemption) => ({
    id: redemption.id,

    title:
      benefitsById.get(redemption.benefitId)?.displayName ??
      benefitsById.get(redemption.benefitId)?.benefitName ??
      "Reward redeemed",

    location:
      storesById.get(redemption.storeId)?.name ?? organization.displayName,

    timeLabel: input.formatDate(redemption.redemptionDateTime),
  }));

  /* ---------------------------------------------------------------------- */
  /* Most visited store                                                     */
  /* ---------------------------------------------------------------------- */

  let mostVisited: string | undefined;

  if (input.redemptions.length) {
    const counts = new Map<string, number>();

    for (const redemption of input.redemptions) {
      counts.set(redemption.storeId, (counts.get(redemption.storeId) ?? 0) + 1);
    }

    let topId: string | undefined;
    let topN = -1;

    counts.forEach((count, id) => {
      if (count > topN) {
        topN = count;
        topId = id;
      }
    });

    mostVisited = topId ? storesById.get(topId)?.name : undefined;
  }

  /* ---------------------------------------------------------------------- */
  /* Identity                                                               */
  /* ---------------------------------------------------------------------- */

  const displayName = configuration.identity.displayName;

  /* ---------------------------------------------------------------------- */
  /* Tabs                                                                   */
  /* ---------------------------------------------------------------------- */

  const tabs: ExperienceTab[] = [
    {
      key: "card",
      labelKey: "experience.tabCard",
      icon: "wallet",
      iconOutline: "wallet-outline",
    },
  ];

  if (showOffers) {
    tabs.push({
      key: "offers",
      labelKey: "experience.tabOffers",
      icon: "pricetags",
      iconOutline: "pricetags-outline",
    });
  }

  if (showActivity) {
    tabs.push({
      key: "history",
      labelKey: "experience.tabHistory",
      icon: "time",
      iconOutline: "time-outline",
    });
  }

  tabs.push({
    key: "profile",
    labelKey: "experience.tabProfile",
    icon: "person",
    iconOutline: "person-outline",
  });

  return {
    displayName,

    monogram: displayName.trim().charAt(0).toUpperCase(),

    tagline: content.businessIdentity.tagline,

    heroImageUrl: content.businessIdentity.heroImageUrl,

    heroPromotion: templateHas(TemplateSectionKey.HERO_PROMOTION)
      ? content.heroPromotion
      : undefined,

    featuredPromotion: templateHas(TemplateSectionKey.FEATURED_PROMOTION)
      ? content.featuredPromotion
      : undefined,

    membership,

    /*
     * Benefits are the benefits supplied to this particular
     * selected membership.
     */
    benefits: membership ? input.benefits : [],

    redeemableBenefits,

    offers: input.offers,

    stores: input.stores,

    activity,

    activityCount: input.redemptions.length,

    mostVisited,

    businessInformation: templateHas(TemplateSectionKey.BUSINESS_INFORMATION)
      ? content.businessInformation
      : undefined,

    businessPreferences: templateHas(TemplateSectionKey.BUSINESS_PREFERENCES)
      ? content.businessPreferences
      : undefined,

    referral: templateHas(TemplateSectionKey.REFERRAL)
      ? content.referral
      : undefined,

    showOffers,

    showStores,

    showActivity,

    tabs,
  };
}
