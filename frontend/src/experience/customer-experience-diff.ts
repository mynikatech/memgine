import type {
  Benefit,
  BenefitUsageRule,
  CustomerExperienceReleaseSnapshot,
  MembershipProduct,
  Offer,
  OfferUsageRule,
  OrganizationBranding,
  OrganizationDetails,
  ReferralProgram,
  Store,
  SubscriptionPlan,
} from "@/src/core";

export type ExperienceDiffKind =
  | "ADDED"
  | "MODIFIED"
  | "REMOVED"
  | "CONFIGURATION";

export type ExperienceDiffItem = {
  kind: ExperienceDiffKind;
  area: string;
  label: string;
  detail: string;
  /** Raw values used by the review UI for visual fields such as images. */
  beforeValue?: unknown;
  afterValue?: unknown;
};

export type ExperienceDiff = {
  items: ExperienceDiffItem[];
  added: number;
  modified: number;
  removed: number;
};

export type ExperienceDiffSummary = {
  area: string;
  added: number;
  modified: number;
  removed: number;
  items: ExperienceDiffItem[];
};

type Change = {
  label: string;
  before: unknown;
  after: unknown;
  formatter?: (value: unknown) => string;
};

export function diffCustomerExperience(
  current: CustomerExperienceReleaseSnapshot | null,
  proposed: CustomerExperienceReleaseSnapshot,
): ExperienceDiff {
  const items: ExperienceDiffItem[] = [];

  compareDefinition(
    current?.customerExperience.experienceDefinition,
    proposed.customerExperience.experienceDefinition,
    items,
  );

  compareBusinessInformation(current, proposed, items);

  compareBranding(
    current?.organizationBranding,
    proposed.organizationBranding,
    items,
  );

  compareMemberships(
    current?.membershipProducts ?? [],
    proposed.membershipProducts,
    items,
  );

  compareBenefits(current?.benefits ?? [], proposed.benefits, items);

  const membershipNames = new Map(
    [
      ...(current?.membershipProducts ?? []),
      ...proposed.membershipProducts,
    ].map((membership) => [membership.id, membershipLabel(membership)]),
  );

  const storeNames = new Map(
    [...(current?.stores ?? []), ...proposed.stores].map((store) => [
      store.id,
      storeLabel(store),
    ]),
  );

  compareOffers(
    current?.offers ?? [],
    proposed.offers,
    items,
    membershipNames,
    storeNames,
  );

  compareStores(current?.stores ?? [], proposed.stores, items);

  const offerNames = new Map(
    [...(current?.offers ?? []), ...proposed.offers].map((offer) => [
      offer.id,
      offerLabel(offer),
    ]),
  );

  compareUsageRules(
    current?.offerUsageRules ?? [],
    proposed.offerUsageRules ?? [],
    "Offers",
    items,
    (rule) => rule.offerId,
    (rule) => `${offerNames.get(rule.offerId) ?? "Offer"} — usage rule`,
  );

  const benefitNames = new Map(
    [...(current?.benefits ?? []), ...proposed.benefits].map((benefit) => [
      benefit.id,
      benefitLabel(benefit),
    ]),
  );

  compareUsageRules(
    current?.benefitUsageRules ?? [],
    proposed.benefitUsageRules ?? [],
    "Benefits",
    items,
    (rule) => rule.benefitId,
    (rule) => `${benefitNames.get(rule.benefitId) ?? "Benefit"} — usage rule`,
  );

  compareReferralProgram(
    current?.referralProgram ?? null,
    proposed.referralProgram ?? null,
    items,
  );

  return {
    items,
    added: items.filter((item) => item.kind === "ADDED").length,
    modified: items.filter(
      (item) => item.kind === "MODIFIED" || item.kind === "CONFIGURATION",
    ).length,
    removed: items.filter((item) => item.kind === "REMOVED").length,
  };
}

export function summarizeCustomerExperienceDiff(
  diff: ExperienceDiff,
): ExperienceDiffSummary[] {
  const groups = new Map<string, ExperienceDiffSummary>();

  for (const item of diff.items) {
    let group = groups.get(item.area);

    if (!group) {
      group = {
        area: item.area,
        added: 0,
        modified: 0,
        removed: 0,
        items: [],
      };

      groups.set(item.area, group);
    }

    if (item.kind === "ADDED") {
      group.added += 1;
    } else if (item.kind === "REMOVED") {
      group.removed += 1;
    } else {
      group.modified += 1;
    }

    group.items.push(item);
  }

  return Array.from(groups.values());
}

/* ========================================================================== */
/* CUSTOMER EXPERIENCE DEFINITION                                             */
/* ========================================================================== */

function compareDefinition(
  current: any,
  proposed: any,
  items: ExperienceDiffItem[],
) {
  if (!current) {
    items.push({
      kind: "CONFIGURATION",
      area: "Customer Experience",
      label: "Initial configuration",
      detail: "The first customer-facing configuration will be published.",
    });

    return;
  }

  pushGroupedDefinitionChanges(
    "Business Information",
    "Business identity",
    [
      change(
        "Display name",
        read(current, "businessIdentity.displayName"),
        read(proposed, "businessIdentity.displayName"),
      ),
      change(
        "Tagline",
        read(current, "businessIdentity.tagline"),
        read(proposed, "businessIdentity.tagline"),
      ),
      imageChange(
        "Logo",
        read(current, "businessIdentity.logoUrl"),
        read(proposed, "businessIdentity.logoUrl"),
      ),
      imageChange(
        "Hero image",
        read(current, "businessIdentity.heroImageUrl"),
        read(proposed, "businessIdentity.heroImageUrl"),
      ),
      imageChange(
        "Dark-theme logo",
        read(current, "businessIdentity.darkThemeLogoUrl"),
        read(proposed, "businessIdentity.darkThemeLogoUrl"),
      ),
      imageChange(
        "Favicon",
        read(current, "businessIdentity.faviconUrl"),
        read(proposed, "businessIdentity.faviconUrl"),
      ),
      imageChange(
        "Splash image",
        read(current, "businessIdentity.splashScreenImageUrl"),
        read(proposed, "businessIdentity.splashScreenImageUrl"),
      ),
    ],
    items,
  );

  pushGroupedDefinitionChanges(
    "Membership",
    "Membership presentation",
    [
      change(
        "Visible",
        read(current, "membership.enabled"),
        read(proposed, "membership.enabled"),
        formatBoolean,
      ),
      change(
        "Card style",
        read(current, "membership.cardStyle"),
        read(proposed, "membership.cardStyle"),
        formatEnum,
      ),
      change(
        "Headline",
        read(current, "membership.headline"),
        read(proposed, "membership.headline"),
      ),
      change(
        "Description",
        read(current, "membership.description"),
        read(proposed, "membership.description"),
      ),
    ],
    items,
  );

  pushGroupedDefinitionChanges(
    "Offers",
    "Offers presentation",
    [
      change(
        "Visible",
        read(current, "offersPresentation.enabled"),
        read(proposed, "offersPresentation.enabled"),
        formatBoolean,
      ),
      change(
        "Title",
        read(current, "offersPresentation.title"),
        read(proposed, "offersPresentation.title"),
      ),
      change(
        "Layout",
        read(current, "offersPresentation.presentation"),
        read(proposed, "offersPresentation.presentation"),
        formatEnum,
      ),
      change(
        "Images",
        read(current, "offersPresentation.showImages"),
        read(proposed, "offersPresentation.showImages"),
        formatBoolean,
      ),
      change(
        "Expiry",
        read(current, "offersPresentation.showExpiry"),
        read(proposed, "offersPresentation.showExpiry"),
        formatBoolean,
      ),
    ],
    items,
  );

  const currentSections = current.sections ?? {};
  const proposedSections = proposed.sections ?? {};
  const sectionChanges: Change[] = [];

  for (const key of new Set([
    ...Object.keys(currentSections),
    ...Object.keys(proposedSections),
  ])) {
    sectionChanges.push(
      change(
        humanize(key),
        currentSections[key],
        proposedSections[key],
        formatBoolean,
      ),
    );
  }

  pushGroupedDefinitionChanges(
    "Sections",
    "Section visibility",
    sectionChanges,
    items,
  );

  compareTheme(current.theme ?? {}, proposed.theme ?? {}, items);

  compareTemplateContent(current.content, proposed.content, items);
}

function compareTheme(
  current: any,
  proposed: any,
  items: ExperienceDiffItem[],
) {
  const changes = compactChanges([
    change(
      "Primary colour",
      current?.primaryColor,
      proposed?.primaryColor,
      formatColorName,
    ),
    change(
      "Secondary colour",
      current?.secondaryColor,
      proposed?.secondaryColor,
      formatColorName,
    ),
    change(
      "Accent colour",
      current?.accentColor,
      proposed?.accentColor,
      formatColorName,
    ),
    change(
      "Background colour",
      current?.backgroundColor,
      proposed?.backgroundColor,
      formatColorName,
    ),
    change("Card style", current?.cardStyle, proposed?.cardStyle, formatEnum),
  ]);

  if (changes.length) {
    items.push({
      kind: "CONFIGURATION",
      area: "Theme",
      label: "Theme configuration",
      detail: changes.join(" · "),
    });
    return;
  }

  if (stable(current) !== stable(proposed)) {
    items.push({
      kind: "CONFIGURATION",
      area: "Theme",
      label: "Theme configuration",
      detail: "Customer-facing theme settings changed.",
    });
  }
}

function compareTemplateContent(
  current: any,
  proposed: any,
  items: ExperienceDiffItem[],
) {
  if (!current || !proposed) {
    return;
  }

  pushGroupedDefinitionChanges(
    "Business Information",
    "Customer-facing content",
    [
      change(
        "Display name",
        read(current, "businessIdentity.displayName"),
        read(proposed, "businessIdentity.displayName"),
      ),
      change(
        "Tagline",
        read(current, "businessIdentity.tagline"),
        read(proposed, "businessIdentity.tagline"),
      ),
      imageChange(
        "Logo",
        read(current, "businessIdentity.logoUrl"),
        read(proposed, "businessIdentity.logoUrl"),
      ),
      imageChange(
        "Hero image",
        read(current, "businessIdentity.heroImageUrl"),
        read(proposed, "businessIdentity.heroImageUrl"),
      ),
      change(
        "About",
        read(current, "businessInformation.about"),
        read(proposed, "businessInformation.about"),
      ),
      change(
        "Support email",
        read(current, "businessInformation.supportEmail"),
        read(proposed, "businessInformation.supportEmail"),
      ),
      change(
        "Support phone",
        read(current, "businessInformation.supportPhone"),
        read(proposed, "businessInformation.supportPhone"),
      ),
      change(
        "Website",
        read(current, "businessInformation.website"),
        read(proposed, "businessInformation.website"),
      ),
    ],
    items,
  );

  pushGroupedDefinitionChanges(
    "Membership",
    "Membership content",
    [
      change(
        "Tier name",
        read(current, "membership.tierName"),
        read(proposed, "membership.tierName"),
      ),
      change(
        "Product name",
        read(current, "membership.productName"),
        read(proposed, "membership.productName"),
      ),
      change(
        "Description",
        read(current, "membership.description"),
        read(proposed, "membership.description"),
      ),
      change(
        "Price label",
        read(current, "membership.priceLabel"),
        read(proposed, "membership.priceLabel"),
      ),
    ],
    items,
  );

  pushGroupedDefinitionChanges(
    "Business Preferences",
    "Preference defaults",
    [
      change(
        "Notifications",
        read(current, "businessPreferences.notifications"),
        read(proposed, "businessPreferences.notifications"),
        formatBoolean,
      ),
      change(
        "Marketing emails",
        read(current, "businessPreferences.marketingEmails"),
        read(proposed, "businessPreferences.marketingEmails"),
        formatBoolean,
      ),
      change(
        "Favourite roast",
        read(current, "businessPreferences.favoriteRoast"),
        read(proposed, "businessPreferences.favoriteRoast"),
      ),
    ],
    items,
  );

  pushGroupedDefinitionChanges(
    "Referral",
    "Referral content",
    [
      change(
        "Headline",
        read(current, "referral.headline"),
        read(proposed, "referral.headline"),
      ),
      change(
        "Description",
        read(current, "referral.description"),
        read(proposed, "referral.description"),
      ),
      change(
        "Reward",
        read(current, "referral.rewardLabel"),
        read(proposed, "referral.rewardLabel"),
      ),
      change(
        "Code",
        read(current, "referral.code"),
        read(proposed, "referral.code"),
      ),
    ],
    items,
  );

  compareContentArray(
    current.activeBenefits,
    proposed.activeBenefits,
    "Benefits",
    "Starter benefit content",
    (value: any) => value?.title ?? "Benefit",
    [
      ["title", "Title"],
      ["description", "Description"],
      ["type", "Type", formatEnum],
    ],
    items,
  );

  compareContentArray(
    current.offers,
    proposed.offers,
    "Offers",
    "Starter offer content",
    (value: any) => value?.title ?? "Offer",
    [
      ["title", "Title"],
      ["description", "Description"],
      ["badge", "Badge"],
      ["imageUrl", "Image", formatImageValue],
    ],
    items,
  );

  compareContentArray(
    current.stores,
    proposed.stores,
    "Stores",
    "Starter store content",
    (value: any) => value?.name ?? "Store",
    [
      ["name", "Name"],
      ["area", "Area"],
      ["addressLine", "Address"],
      ["hours", "Hours"],
    ],
    items,
  );
}

function pushGroupedDefinitionChanges(
  area: string,
  label: string,
  changes: Change[],
  items: ExperienceDiffItem[],
) {
  const details = compactChanges(changes);

  if (!details.length) {
    return;
  }

  items.push({
    kind: "CONFIGURATION",
    area,
    label,
    detail: details.join(" · "),
  });
}

function compareContentArray(
  current: any[] | undefined,
  proposed: any[] | undefined,
  area: string,
  labelPrefix: string,
  getLabel: (value: any) => string,
  fields: Array<[string, string, ((value: unknown) => string)?]>,
  items: ExperienceDiffItem[],
) {
  const before = current ?? [];
  const after = proposed ?? [];
  const maxLength = Math.max(before.length, after.length);

  for (let index = 0; index < maxLength; index += 1) {
    const previous = before[index];
    const next = after[index];

    if (!previous && next) {
      items.push({
        kind: "CONFIGURATION",
        area,
        label: `${labelPrefix}: ${getLabel(next)}`,
        detail: "Added to customer-facing starter content.",
      });
      continue;
    }

    if (previous && !next) {
      items.push({
        kind: "CONFIGURATION",
        area,
        label: `${labelPrefix}: ${getLabel(previous)}`,
        detail: "Removed from customer-facing starter content.",
      });
      continue;
    }

    if (!previous || !next) {
      continue;
    }

    const details = compactChanges(
      fields.map(([key, fieldLabel, formatter]) =>
        change(fieldLabel, previous[key], next[key], formatter),
      ),
    );

    if (details.length) {
      items.push({
        kind: "CONFIGURATION",
        area,
        label: `${labelPrefix}: ${getLabel(next)}`,
        detail: details.join(" · "),
      });
    }
  }
}

/* ========================================================================== */
/* BUSINESS INFORMATION                                                       */
/* ========================================================================== */

function compareBusinessInformation(
  current: CustomerExperienceReleaseSnapshot | null,
  proposed: CustomerExperienceReleaseSnapshot,
  items: ExperienceDiffItem[],
) {
  const currentOrganization = current?.organization;
  const proposedOrganization = proposed.organization;
  const currentDetails = current?.organizationDetails;
  const proposedDetails = proposed.organizationDetails;

  const changes = compactChanges([
    change(
      "Display name",
      currentOrganization?.displayName,
      proposedOrganization.displayName,
    ),
    change(
      "Business name",
      currentOrganization?.name,
      proposedOrganization.name,
    ),
    change(
      "Primary email",
      currentOrganization?.primaryEmail,
      proposedOrganization.primaryEmail,
    ),
    change(
      "Primary phone",
      currentOrganization?.primaryPhone,
      proposedOrganization.primaryPhone,
      formatPhone,
    ),
    change(
      "Website",
      currentOrganization?.website,
      proposedOrganization.website,
    ),
    change(
      "About",
      currentDetails?.aboutOrganization,
      proposedDetails?.aboutOrganization,
    ),
    change(
      "Support email",
      currentDetails?.supportEmail,
      proposedDetails?.supportEmail,
    ),
    change(
      "Support phone",
      currentDetails?.supportPhone,
      proposedDetails?.supportPhone,
      formatPhone,
    ),
    change(
      "Address line 1",
      currentDetails?.address?.line1,
      proposedDetails?.address?.line1,
    ),
    change(
      "Address line 2",
      currentDetails?.address?.line2,
      proposedDetails?.address?.line2,
    ),
    change(
      "City",
      currentDetails?.address?.city,
      proposedDetails?.address?.city,
    ),
    change(
      "Region",
      currentDetails?.address?.region,
      proposedDetails?.address?.region,
      formatRegionName,
    ),
    change(
      "Postal code",
      currentDetails?.address?.postalCode,
      proposedDetails?.address?.postalCode,
    ),
    change(
      "Country",
      currentDetails?.address?.countryCode,
      proposedDetails?.address?.countryCode,
      formatCountryName,
    ),
  ]);

  if (changes.length) {
    items.push({
      kind: "CONFIGURATION",
      area: "Business Information",
      label: "Business information",
      detail: changes.join(" · "),
    });
  }
}

/* ========================================================================== */
/* BRANDING                                                                   */
/* ========================================================================== */

function compareBranding(
  current: OrganizationBranding | null | undefined,
  proposed: OrganizationBranding | null | undefined,
  items: ExperienceDiffItem[],
) {
  if (!current && !proposed) {
    return;
  }

  if (!current && proposed) {
    items.push({
      kind: "CONFIGURATION",
      area: "Branding",
      label: "Branding",
      detail: "Customer-facing branding added.",
    });
    return;
  }

  if (current && !proposed) {
    items.push({
      kind: "CONFIGURATION",
      area: "Branding",
      label: "Branding",
      detail: "Customer-facing branding removed.",
    });
    return;
  }

  const changes = compactChanges([
    change("Brand name", current?.brandingName, proposed?.brandingName),
    change("Tagline", current?.tagline, proposed?.tagline),
    imageChange("Logo", current?.logoUrl, proposed?.logoUrl),
    imageChange(
      "Dark-theme logo",
      current?.darkThemeLogoUrl,
      proposed?.darkThemeLogoUrl,
    ),
    imageChange("Favicon", current?.faviconUrl, proposed?.faviconUrl),
    imageChange(
      "Splash image",
      current?.splashScreenImageUrl,
      proposed?.splashScreenImageUrl,
    ),
    imageChange("Hero image", current?.heroImageUrl, proposed?.heroImageUrl),
    change(
      "Primary colour",
      current?.primaryColor,
      proposed?.primaryColor,
      formatColorName,
    ),
    change(
      "Secondary colour",
      current?.secondaryColor,
      proposed?.secondaryColor,
      formatColorName,
    ),
    change(
      "Accent colour",
      current?.accentColor,
      proposed?.accentColor,
      formatColorName,
    ),
    change(
      "Visual template",
      current?.themeTemplateId,
      proposed?.themeTemplateId,
    ),
  ]);

  if (changes.length) {
    items.push({
      kind: "CONFIGURATION",
      area: "Branding",
      label: "Branding",
      detail: changes.join(" · "),
      beforeValue: current?.logoUrl ?? current?.heroImageUrl,
      afterValue: proposed?.logoUrl ?? proposed?.heroImageUrl,
    });
  }
}

/* ========================================================================== */
/* MEMBERSHIPS                                                                */
/* ========================================================================== */

function compareMemberships(
  current: MembershipProduct[],
  proposed: MembershipProduct[],
  items: ExperienceDiffItem[],
) {
  compareCollection(
    current,
    proposed,
    "Memberships",
    items,
    membershipLabel,
    (previous, next) => describeMembershipModification(previous, next),
  );
}

function describeMembershipModification(
  previous: MembershipProduct,
  next: MembershipProduct,
): string {
  const details = compactChanges([
    change("Name", previous.membershipProductName, next.membershipProductName),
    change("Display name", previous.displayName, next.displayName),
    change("Tier", previous.tier, next.tier),
    change("Tier order", previous.tierSequence, next.tierSequence),
    change("Description", previous.description, next.description),
    change(
      "Effective date",
      previous.effectiveDate,
      next.effectiveDate,
      formatDate,
    ),
    change("Expiry date", previous.expiryDate, next.expiryDate, formatDate),
    change(
      "Benefits",
      previous.benefitIds.length,
      next.benefitIds.length,
      formatValue,
    ),
  ]);

  details.push(...describePlanChanges(previous.plans, next.plans));

  return details.length ? details.join(" · ") : "Customer-facing data changed.";
}

function describePlanChanges(
  previous: SubscriptionPlan[],
  next: SubscriptionPlan[],
): string[] {
  const details: string[] = [];
  const previousMap = new Map(previous.map((plan) => [plan.id, plan]));
  const nextMap = new Map(next.map((plan) => [plan.id, plan]));
  const multiplePlans = Math.max(previous.length, next.length) > 1;

  for (const [id, plan] of nextMap) {
    const oldPlan = previousMap.get(id);
    const prefix = multiplePlans
      ? `${plan.subscriptionPlanName || plan.subscriptionPlanCode} `
      : "";

    if (!oldPlan) {
      details.push(`${prefix}plan: Added`);
      continue;
    }

    details.push(
      ...compactChanges([
        change(
          `${prefix}plan name`.trim(),
          oldPlan.subscriptionPlanName,
          plan.subscriptionPlanName,
        ),
        change(
          `${prefix}description`.trim(),
          oldPlan.description,
          plan.description,
        ),
        change(`${prefix}price`.trim(), oldPlan.price, plan.price, formatMoney),
        change(
          `${prefix}validity`.trim(),
          formatPlanValidity(oldPlan),
          formatPlanValidity(plan),
        ),
        change(
          `${prefix}effective date`.trim(),
          oldPlan.effectiveDate,
          plan.effectiveDate,
          formatDate,
        ),
        change(
          `${prefix}expiry date`.trim(),
          oldPlan.expiryDate,
          plan.expiryDate,
          formatDate,
        ),
      ]),
    );
  }

  for (const [id, plan] of previousMap) {
    if (!nextMap.has(id)) {
      const prefix = multiplePlans
        ? `${plan.subscriptionPlanName || plan.subscriptionPlanCode} `
        : "";
      details.push(`${prefix}plan: Removed`);
    }
  }

  return details;
}

/* ========================================================================== */
/* BENEFITS                                                                   */
/* ========================================================================== */

function compareBenefits(
  current: Benefit[],
  proposed: Benefit[],
  items: ExperienceDiffItem[],
) {
  compareCollection(
    current,
    proposed,
    "Benefits",
    items,
    benefitLabel,
    (previous, next) => {
      const details = compactChanges([
        change("Name", previous.benefitName, next.benefitName),
        change("Display name", previous.displayName, next.displayName),
        change("Description", previous.description, next.description),
        change(
          "Effective date",
          previous.effectiveDate,
          next.effectiveDate,
          formatDate,
        ),
        change("Expiry date", previous.expiryDate, next.expiryDate, formatDate),
        change("Benefit type", previous.benefitTypeId, next.benefitTypeId),
      ]);

      return details.length
        ? details.join(" · ")
        : "Customer-facing data changed.";
    },
  );
}

/* ========================================================================== */
/* OFFERS                                                                     */
/* ========================================================================== */

function compareOffers(
  current: Offer[],
  proposed: Offer[],
  items: ExperienceDiffItem[],
  membershipNames: Map<string, string>,
  storeNames: Map<string, string>,
) {
  compareCollection(
    current,
    proposed,
    "Offers",
    items,
    offerLabel,
    (previous, next) => {
      const details = compactChanges([
        change("Name", previous.offerName, next.offerName),
        change("Description", previous.description, next.description),
        imageChange(
          "Promotion image",
          previous.promotionImageUrl,
          next.promotionImageUrl,
        ),
        change("Badge", previous.badgeText, next.badgeText),
        change(
          "Availability",
          previous.availabilityText,
          next.availabilityText,
        ),
        change(
          "Membership",
          previous.membershipProductId,
          next.membershipProductId,
          (value) =>
            value
              ? (membershipNames.get(String(value)) ?? String(value))
              : "All memberships",
        ),
        change("Store", previous.storeId, next.storeId, (value) =>
          value
            ? (storeNames.get(String(value)) ?? String(value))
            : "All stores",
        ),
        change(
          "Discount",
          previous.discountPercentage,
          next.discountPercentage,
          formatPercentage,
        ),
        change(
          "Effective date",
          previous.effectiveDate,
          next.effectiveDate,
          formatDate,
        ),
        change("Expiry date", previous.expiryDate, next.expiryDate, formatDate),
        change("Button label", previous.ctaLabel, next.ctaLabel),
        change("Action", previous.ctaType, next.ctaType, formatEnum),
        change("Action target", previous.ctaTarget, next.ctaTarget),
      ]);

      return details.length
        ? details.join(" · ")
        : "Customer-facing data changed.";
    },
  );
}

/* ========================================================================== */
/* STORES                                                                     */
/* ========================================================================== */

function compareStores(
  current: Store[],
  proposed: Store[],
  items: ExperienceDiffItem[],
) {
  compareCollection(
    current,
    proposed,
    "Stores",
    items,
    storeLabel,
    (previous, next) => {
      const details = compactChanges([
        change("Name", previous.name, next.name),
        change("Store code", previous.storeCode, next.storeCode),
        change("Phone", previous.phoneNumber, next.phoneNumber, formatPhone),
        change("Email", previous.emailAddress, next.emailAddress),
        change("Address line 1", previous.address?.line1, next.address?.line1),
        change("Address line 2", previous.address?.line2, next.address?.line2),
        change("City", previous.address?.city, next.address?.city),
        change(
          "Region",
          previous.address?.region,
          next.address?.region,
          formatRegionName,
        ),
        change(
          "Postal code",
          previous.address?.postalCode,
          next.address?.postalCode,
        ),
        change(
          "Country",
          previous.address?.countryCode,
          next.address?.countryCode,
          formatCountryName,
        ),
        change("Timezone", previous.timezone, next.timezone),
        change(
          "Opening date",
          previous.openingDate,
          next.openingDate,
          formatDate,
        ),
        change(
          "Closing date",
          previous.closingDate,
          next.closingDate,
          formatDate,
        ),
      ]);

      return details.length
        ? details.join(" · ")
        : "Customer-facing data changed.";
    },
  );
}

/* ========================================================================== */
/* USAGE RULES                                                                */
/* ========================================================================== */

function compareUsageRules<
  T extends {
    id: string;
    isDeleted: boolean;
  },
>(
  current: T[],
  proposed: T[],
  area: string,
  items: ExperienceDiffItem[],
  ownerId: (rule: T) => string,
  ownerLabel: (rule: T) => string,
) {
  const currentByOwner = groupActiveRules(current, ownerId);
  const proposedByOwner = groupActiveRules(proposed, ownerId);

  const ownerIds = new Set([
    ...currentByOwner.keys(),
    ...proposedByOwner.keys(),
  ]);

  for (const id of ownerIds) {
    const before = currentByOwner.get(id) ?? [];
    const after = proposedByOwner.get(id) ?? [];

    if (stable(before) === stable(after)) {
      continue;
    }

    const representative = after[0] ?? before[0];

    if (!representative) {
      continue;
    }

    items.push({
      kind:
        before.length && after.length
          ? "MODIFIED"
          : before.length
            ? "REMOVED"
            : "ADDED",
      area,
      label: ownerLabel(representative),
      detail: describeUsageRuleModification(before, after),
    });
  }
}

function groupActiveRules<T extends { isDeleted: boolean }>(
  rules: T[],
  ownerId: (rule: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const rule of rules) {
    if (rule.isDeleted) {
      continue;
    }

    const key = ownerId(rule);
    const list = grouped.get(key) ?? [];
    list.push(rule);
    grouped.set(key, list);
  }

  return grouped;
}

function describeUsageRuleModification(before: any[], after: any[]): string {
  if (!before.length) {
    return after.length === 1
      ? `Usage rule added: ${describeUsageRule(after[0])}`
      : `${after.length} usage rules added.`;
  }

  if (!after.length) {
    return before.length === 1
      ? `Usage rule removed: ${describeUsageRule(before[0])}`
      : `${before.length} usage rules removed.`;
  }

  const beforeMap = new Map(before.map((rule) => [rule.id, rule]));
  const afterMap = new Map(after.map((rule) => [rule.id, rule]));
  const details: string[] = [];

  for (const [id, rule] of afterMap) {
    const previous = beforeMap.get(id);

    if (!previous) {
      details.push(`Rule added: ${describeUsageRule(rule)}`);
      continue;
    }

    const prefix =
      after.length > 1 || before.length > 1
        ? `${rule.ruleName || "Rule"} `
        : "";

    details.push(
      ...compactChanges([
        change(`${prefix}name`.trim(), previous.ruleName, rule.ruleName),
        change(
          `${prefix}frequency`.trim(),
          formatRuleFrequency(previous),
          formatRuleFrequency(rule),
        ),
        change(
          `${prefix}limit`.trim(),
          previous.usageLimit,
          rule.usageLimit,
          formatValue,
        ),
        change(
          `${prefix}days`.trim(),
          usageDays([previous]),
          usageDays([rule]),
        ),
        change(
          `${prefix}time`.trim(),
          formatRuleWindow(previous),
          formatRuleWindow(rule),
        ),
        change(`${prefix}timezone`.trim(), previous.timeZone, rule.timeZone),
        change(
          `${prefix}effective date`.trim(),
          previous.effectiveDate,
          rule.effectiveDate,
          formatDate,
        ),
        change(
          `${prefix}expiry date`.trim(),
          previous.expiryDate,
          rule.expiryDate,
          formatDate,
        ),
      ]),
    );
  }

  for (const [id, rule] of beforeMap) {
    if (!afterMap.has(id)) {
      details.push(`Rule removed: ${rule.ruleName || describeUsageRule(rule)}`);
    }
  }

  return details.length ? details.join(" · ") : "Usage rule changed.";
}

function describeUsageRule(rule: any): string {
  return [
    rule.ruleName,
    formatRuleFrequency(rule),
    `${rule.usageLimit} use${rule.usageLimit === 1 ? "" : "s"}`,
    usageDays([rule]),
    formatRuleWindow(rule),
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatRuleFrequency(rule: any): string {
  const type = formatEnum(rule.frequencyType);
  const interval = Number(rule.frequencyInterval ?? 1);

  return interval > 1 ? `Every ${interval} ${type.toLowerCase()}` : type;
}

function formatRuleWindow(rule: any): string {
  const start = rule.windowStartTime;
  const end = rule.windowEndTime;

  if (!start && !end) {
    return "Any time";
  }

  return `${start || "Any time"}–${end || "Any time"}`;
}

function usageDays(rules: any[]): string {
  const days = Array.from(
    new Set(rules.flatMap((rule) => rule.applicableDays ?? [])),
  );

  const order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const ordered = order.filter((day) => days.includes(day));

  if (ordered.length === 7) {
    return "Every day";
  }

  return ordered.length ? ordered.join("–") : "Any day";
}

/* ========================================================================== */
/* REFERRAL PROGRAM                                                           */
/* ========================================================================== */

function compareReferralProgram(
  current: ReferralProgram | null,
  proposed: ReferralProgram | null,
  items: ExperienceDiffItem[],
) {
  if (!current && !proposed) {
    return;
  }

  if (!current && proposed) {
    items.push({
      kind: "ADDED",
      area: "Referral",
      label: proposed.referralProgramName,
      detail: "Referral program added to the customer-facing experience.",
    });
    return;
  }

  if (current && !proposed) {
    items.push({
      kind: "REMOVED",
      area: "Referral",
      label: current.referralProgramName,
      detail: "Referral program removed from the customer-facing experience.",
    });
    return;
  }

  const details = compactChanges([
    change("Name", current?.referralProgramName, proposed?.referralProgramName),
    change("Description", current?.description, proposed?.description),
    change(
      "Referrer reward",
      current?.referrerRewardValue,
      proposed?.referrerRewardValue,
      formatValue,
    ),
    change(
      "Referee reward",
      current?.refereeRewardValue,
      proposed?.refereeRewardValue,
      formatValue,
    ),
    change(
      "Effective date",
      current?.effectiveDate,
      proposed?.effectiveDate,
      formatDate,
    ),
    change(
      "Expiry date",
      current?.expiryDate,
      proposed?.expiryDate,
      formatDate,
    ),
  ]);

  if (details.length) {
    items.push({
      kind: "MODIFIED",
      area: "Referral",
      label:
        proposed?.referralProgramName ??
        current?.referralProgramName ??
        "Referral",
      detail: details.join(" · "),
    });
  }
}

/* ========================================================================== */
/* GENERIC COLLECTION COMPARISON                                              */
/* ========================================================================== */

function compareCollection<
  T extends {
    id: string;
    isDeleted: boolean;
  },
>(
  current: T[],
  proposed: T[],
  area: string,
  items: ExperienceDiffItem[],
  label: (value: T) => string,
  describe: (previous: T, next: T) => string,
) {
  const currentMap = new Map(current.map((value) => [value.id, value]));
  const proposedMap = new Map(proposed.map((value) => [value.id, value]));

  for (const [id, value] of proposedMap) {
    const previous = currentMap.get(id);

    if (!previous) {
      items.push({
        kind: "ADDED",
        area,
        label: label(value),
        detail: "Added to the customer-facing experience.",
      });
    } else if (stable(previous) !== stable(value)) {
      const detail = describe(previous, value);

      /*
       * Ignore audit-only changes. The snapshot records may carry a new
       * updatedAt/versionNo even when nothing a customer can see changed.
       */
      if (detail !== "Customer-facing data changed.") {
        items.push({
          kind: "MODIFIED",
          area,
          label: label(value),
          detail,
        });
      }
    }
  }

  for (const [id, value] of currentMap) {
    if (!proposedMap.has(id)) {
      items.push({
        kind: "REMOVED",
        area,
        label: label(value),
        detail: "Removed from the customer-facing experience.",
      });
    }
  }
}

/* ========================================================================== */
/* FORMATTERS                                                                 */
/* ========================================================================== */

const membershipLabel = (value: MembershipProduct) =>
  value.displayName || value.membershipProductName;

const benefitLabel = (value: Benefit) => value.displayName || value.benefitName;

const offerLabel = (value: Offer) => value.offerName;

const storeLabel = (value: Store) => value.name || value.storeCode;

function change(
  label: string,
  before: unknown,
  after: unknown,
  formatter?: (value: unknown) => string,
): Change {
  return { label, before, after, formatter };
}

function imageChange(label: string, before: unknown, after: unknown): Change {
  return change(label, before, after, formatImageValue);
}

function compactChanges(changes: Change[]): string[] {
  return changes
    .filter((item) => stable(item.before) !== stable(item.after))
    .map((item) => {
      const formatter = item.formatter ?? formatValue;

      return `${capitalizeFirst(item.label)}: ${formatter(item.before)} → ${formatter(item.after)}`;
    });
}

function formatImageValue(value: unknown): string {
  return value === undefined || value === null || value === ""
    ? "Not set"
    : "Updated";
}

function formatPhone(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "—";
  }

  const phone = value as {
    callingCode?: string;
    number?: string;
  };

  return (
    [phone.callingCode, phone.number].filter(Boolean).join(" ").trim() || "—"
  );
}

function formatMoney(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "—";
  }

  const money = value as {
    amountMinor?: number;
    currency?: string;
  };

  if (typeof money.amountMinor !== "number") {
    return "—";
  }

  const amount = money.amountMinor / 100;
  const currency = money.currency ?? "";

  try {
    return new Intl.NumberFormat("en-CA", {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency ? `${currency} ` : ""}${amount}`;
  }
}

function formatPlanValidity(plan: SubscriptionPlan): string {
  const period = Number(plan.subscriptionPeriod ?? 0);
  const unit = String(plan.subscriptionPeriodUnit ?? "").trim();

  if (!period || !unit) {
    return "—";
  }

  const friendlyUnit = humanize(unit.toLowerCase());

  return `${period} ${friendlyUnit}${period === 1 ? "" : "s"}`;
}

function formatRegionName(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const code = String(value).trim().toUpperCase();

  /*
   * Canadian postal/administrative abbreviations.
   *
   * Region is currently persisted as the standard province/territory code.
   * The release diff is customer-facing, so display the friendly name rather
   * than leaking the storage code.
   */
  const canadianRegions: Record<string, string> = {
    AB: "Alberta",
    BC: "British Columbia",
    MB: "Manitoba",
    NB: "New Brunswick",
    NL: "Newfoundland and Labrador",
    NS: "Nova Scotia",
    NT: "Northwest Territories",
    NU: "Nunavut",
    ON: "Ontario",
    PE: "Prince Edward Island",
    QC: "Quebec",
    SK: "Saskatchewan",
    YT: "Yukon",
  };

  return canadianRegions[code] ?? String(value);
}

function formatCountryName(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const code = String(value).trim().toUpperCase();

  const knownCountries: Record<string, string> = {
    CA: "Canada",
    IN: "India",
    US: "United States",
    GB: "United Kingdom",
  };

  return knownCountries[code] ?? String(value);
}

function formatPercentage(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  return `${value}%`;
}

function formatDate(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const text = String(value);

  return text.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10)
    : text;
}

function formatBoolean(value: unknown): string {
  return value ? "Enabled" : "Disabled";
}

function formatEnum(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  return humanize(String(value).toLowerCase().replace(/_/g, " "));
}

function formatColorName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "Not set";
  }

  const hex = normalizeHexColor(value);

  if (!hex) {
    return formatValue(value);
  }

  const knownColors: Record<string, string> = {
    "#FFFFFF": "White",
    "#000000": "Black",
    "#A16207": "Warm Brown",
    "#92400E": "Dark Brown",
    "#D97706": "Amber",
    "#F59E0B": "Amber",
    "#7C3AED": "Purple",
    "#8B5CF6": "Purple",
    "#6D28D9": "Dark Purple",
    "#2563EB": "Blue",
    "#3B82F6": "Blue",
    "#1D4ED8": "Dark Blue",
    "#0F766E": "Teal",
    "#14B8A6": "Teal",
    "#15803D": "Green",
    "#22C55E": "Green",
    "#DC2626": "Red",
    "#EF4444": "Red",
    "#64748B": "Slate Grey",
    "#6B7280": "Grey",
    "#9CA3AF": "Light Grey",
    "#F8FAFC": "Off White",
    "#F3F4F6": "Light Grey",
  };

  const known = knownColors[hex];

  if (known) {
    return known;
  }

  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);

  return approximateColorName(red, green, blue);
}

function normalizeHexColor(value: string): string | null {
  const input = value.trim().toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(input)) {
    return input;
  }

  if (/^#[0-9A-F]{3}$/.test(input)) {
    return `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}`;
  }

  return null;
}

function approximateColorName(
  red: number,
  green: number,
  blue: number,
): string {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  if (max < 45) {
    return "Black";
  }

  if (min > 225) {
    return "White";
  }

  if (max - min < 18) {
    if (max < 100) {
      return "Dark Grey";
    }

    if (max < 190) {
      return "Grey";
    }

    return "Light Grey";
  }

  if (red > green * 1.35 && red > blue * 1.35) {
    if (green > blue * 1.5) {
      return red < 180 ? "Brown" : "Orange";
    }

    return red < 160 ? "Dark Red" : "Red";
  }

  if (green > red * 1.25 && green > blue * 1.25) {
    return green < 150 ? "Dark Green" : "Green";
  }

  if (blue > red * 1.25 && blue > green * 1.25) {
    if (red > green * 1.15) {
      return blue < 170 ? "Dark Purple" : "Purple";
    }

    return blue < 150 ? "Dark Blue" : "Blue";
  }

  if (red > 120 && blue > 120 && green < Math.min(red, blue) * 0.8) {
    return "Purple";
  }

  if (green > 100 && blue > 100 && red < Math.min(green, blue) * 0.8) {
    return "Teal";
  }

  if (red > 150 && green > 90 && blue < 90) {
    return "Orange";
  }

  return "Custom colour";
}

function stable(value: unknown): string {
  if (value === undefined) {
    return "<undefined>";
  }

  return JSON.stringify(sortValue(value));
}

function sortValue(value: any): any {
  if (Array.isArray(value)) {
    return value
      .map(sortValue)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce(
        (result, key) => {
          result[key] = sortValue(value[key]);

          return result;
        },
        {} as Record<string, unknown>,
      );
  }

  return value;
}

function read(value: any, path: string): unknown {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (Array.isArray(value)) {
    return String(value.length);
  }

  return String(value);
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
