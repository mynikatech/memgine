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
  Store,
  Status,
  Subscription,
  TemplateDefaultContent,
  TemplateDefinition,
} from "@/src/core";

import { TemplateSectionKey } from "@/src/core";

/**
 * resolve-experience — the pure, framework-free brain of the Business
 * Experience renderer.
 *
 * It composes a single view model from the three separated layers plus live
 * domain data, honouring their precedence:
 *   - Domain data     (subscription, product, benefits, offers, stores, …)
 *   - BusinessConfiguration (identity name, brand, section on/off flags)
 *   - TemplateDefaultContent (replaceable copy & imagery)
 * bounded by what the TemplateDefinition permits (mandatory vs optional
 * sections, and which navigation surfaces they may occupy).
 *
 * No business value is hard-coded here; everything is derived from inputs, so
 * the same function drives ANY F&B business.
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

export type RedeemableBenefit = Benefit & { available: boolean };

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

export interface ResolveExperienceInput {
  organization: Organization;
  configuration: BusinessConfiguration;
  template: TemplateDefinition;
  content: TemplateDefaultContent;
  subscription?: Subscription;
  subscriptionStatus?: Status;
  product?: MembershipProduct;
  benefits: Benefit[];
  offers: Offer[];
  stores: Store[];
  redemptions: Redemption[];
  formatDate: (date: string) => string;
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
  } = input;
  const cx = configuration.customerExperience;

  const templateHas = (key: TemplateSectionKey) =>
    template.sections.some((s) => s.key === key);

  // Optional sections are only surfaced when the template permits them AND the
  // business has switched them on. Mandatory sections are always present.
  const showOffers = cx.showOffers && templateHas(TemplateSectionKey.OFFERS);
  const showStores = cx.showStores && templateHas(TemplateSectionKey.STORES);
  const showActivity =
    cx.showActivity && templateHas(TemplateSectionKey.ACTIVITY);

  // Membership status is domain-derived (subscription + product). The focused
  // membership is OPTIONAL — an org-level (QR) entry may have no owned membership.
  let membership: ResolvedMembership | undefined;
  if (subscription && product) {
    console.log("RESOLVE EXP", {
      membershipActive: subscriptionStatus?.statusCode.toUpperCase(),
    });
    //subscription-status-active
    const active = subscriptionStatus?.statusCode.toUpperCase() === "ACTIVE";
    /**const active =
      subscription.subscriptionStatusId === "subscription-status-active";**/
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

  const benefitsById = new Map(input.benefits.map((b) => [b.id, b]));
  const storesById = new Map(input.stores.map((s) => [s.id, s]));

  // A benefit is unavailable (already used) if it appears in this
  // subscription's redemption history. Empty when there is no focused membership.
  const usedBenefitIds = new Set(input.redemptions.map((r) => r.benefitId));
  const redeemableBenefits: RedeemableBenefit[] = membership
    ? input.benefits.map((b) => ({
        ...b,
        available: !usedBenefitIds.has(b.id),
      }))
    : [];

  const activity: ResolvedActivity[] = input.redemptions.map(
    (r: Redemption) => ({
      id: r.id,
      title:
        benefitsById.get(r.benefitId)?.displayName ??
        benefitsById.get(r.benefitId)?.benefitName ??
        "Reward redeemed",
      location: storesById.get(r.storeId)?.name ?? organization.displayName,
      timeLabel: input.formatDate(r.redemptionDateTime),
    }),
  );

  // Most-visited store (simple domain-derived summary for the History tab).
  let mostVisited: string | undefined;
  if (input.redemptions.length) {
    const counts = new Map<string, number>();
    for (const r of input.redemptions)
      counts.set(r.storeId, (counts.get(r.storeId) ?? 0) + 1);
    let topId: string | undefined;
    let topN = -1;
    counts.forEach((n, id) => {
      if (n > topN) {
        topN = n;
        topId = id;
      }
    });
    mostVisited = topId ? storesById.get(topId)?.name : undefined;
  }

  const displayName = configuration.identity.displayName;

  // Tabs are computed from the template's section catalogue + config flags —
  // NOT a fixed vertical page. Card (mandatory overview) and Profile
  // (business detail/preferences/referral) always exist; Offers and History
  // appear only when their optional sections are enabled.
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
  console.log(
    "🔎 PROPOSED TAB RESOLUTION:",
    JSON.stringify(
      {
        business: organization.displayName,
        organizationId: organization.id,

        configured: {
          showOffers: cx.showOffers,
          showStores: cx.showStores,
          showActivity: cx.showActivity,
        },

        template: {
          templateId: template.id,
          templateCategory: template.category,
          offers: templateHas(TemplateSectionKey.OFFERS),
          stores: templateHas(TemplateSectionKey.STORES),
          activity: templateHas(TemplateSectionKey.ACTIVITY),
        },

        resolved: {
          showOffers,
          showStores,
          showActivity,
        },

        tabs: tabs.map((tab) => tab.key),
      },
      null,
      2,
    ),
  );
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
