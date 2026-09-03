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
  OrganizationDetails,
  Redemption,
  Status,
  Store,
  Subscription,
  TemplateDefaultContent,
  TemplateDefinition,
} from "@/src/core";

import { TemplateSectionKey } from "@/src/core";

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

export type BenefitPresentationMode = "membership" | "organization";

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
  product: MembershipProduct;
  active: boolean;
  validUntilLabel?: string;
  memberId?: string;
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

  previewMembership?: PreviewMembershipOverride;

  detailsOverride?: OrganizationDetails | null;

  /**
   * Normal customer rendering is membership-specific.
   *
   * Org Admin Benefits preview can explicitly present the supplied
   * organization benefits without requiring a membership.
   */
  benefitPresentationMode?: BenefitPresentationMode;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatPhoneNumber(
  phone?: Organization["primaryPhone"] | OrganizationDetails["supportPhone"],
): string {
  if (!phone?.number) {
    return "";
  }

  const callingCode = phone.callingCode?.trim();

  return callingCode
    ? `${callingCode} ${phone.number.trim()}`
    : phone.number.trim();
}

function resolveBusinessInformation(
  detailsOverride: OrganizationDetails | null | undefined,
  organization: Organization,
  content: TemplateDefaultContent,
): DefaultBusinessInformationContent | undefined {
  const templateInformation = content.businessInformation;

  if (!templateInformation && !detailsOverride) {
    return undefined;
  }

  if (!detailsOverride) {
    return templateInformation;
  }

  return {
    about: detailsOverride.aboutOrganization?.trim() ?? "",

    supportEmail:
      organization.primaryEmail?.trim() ||
      detailsOverride.supportEmail?.trim() ||
      "",

    supportPhone:
      formatPhoneNumber(organization.primaryPhone) ||
      formatPhoneNumber(detailsOverride.supportPhone) ||
      "",

    website: organization.website?.trim() ?? "",
  };
}

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
    detailsOverride,
    benefitPresentationMode = "membership",
  } = input;

  const cx = configuration.customerExperience;

  const templateHas = (key: TemplateSectionKey) =>
    template.sections.some((section) => section.key === key);

  const showOffers = cx.showOffers && templateHas(TemplateSectionKey.OFFERS);

  const showStores = cx.showStores && templateHas(TemplateSectionKey.STORES);

  const showActivity =
    cx.showActivity && templateHas(TemplateSectionKey.ACTIVITY);

  let membership: ResolvedMembership | undefined;

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

  const benefitsById = new Map(
    input.benefits.map((benefit) => [benefit.id, benefit]),
  );

  const storesById = new Map(input.stores.map((store) => [store.id, store]));

  const usedBenefitIds = new Set(
    input.redemptions.map((redemption) => redemption.benefitId),
  );

  /*
   * Redemption remains membership-specific. Organization-level Benefits
   * preview does not make benefits redeemable.
   */
  const redeemableBenefits: RedeemableBenefit[] = membership
    ? input.benefits.map((benefit) => ({
        ...benefit,
        available: !usedBenefitIds.has(benefit.id),
      }))
    : [];

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

  const displayName =
    organization.displayName?.trim() ||
    configuration.identity.displayName?.trim() ||
    content.businessIdentity.displayName;

  const resolvedBusinessInformation = resolveBusinessInformation(
    detailsOverride,
    organization,
    content,
  );

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

  const resolvedBenefits =
    benefitPresentationMode === "organization"
      ? input.benefits
      : membership
        ? input.benefits
        : [];

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

    benefits: resolvedBenefits,

    redeemableBenefits,

    offers: input.offers,

    stores: input.stores,

    activity,

    activityCount: input.redemptions.length,

    mostVisited,

    businessInformation: templateHas(TemplateSectionKey.BUSINESS_INFORMATION)
      ? resolvedBusinessInformation
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
