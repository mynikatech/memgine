import type {
  Benefit,
  CustomerExperienceReleaseSnapshot,
  MembershipProduct,
  Offer,
  Store,
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
  compareOrganization(current?.organization, proposed.organization, items);
  compareBranding(
    current?.organizationBranding,
    proposed.organizationBranding,
    items,
  );
  compareCollection(
    current?.membershipProducts ?? [],
    proposed.membershipProducts,
    "Memberships",
    items,
    membershipLabel,
  );
  compareCollection(
    current?.benefits ?? [],
    proposed.benefits,
    "Benefits",
    items,
    benefitLabel,
  );
  compareCollection(
    current?.offers ?? [],
    proposed.offers,
    "Offers",
    items,
    offerLabel,
  );
  compareCollection(
    current?.stores ?? [],
    proposed.stores,
    "Stores",
    items,
    storeLabel,
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

  const fields: Array<[string, string, string]> = [
    ["businessIdentity.displayName", "Business Information", "Display name"],
    ["businessIdentity.tagline", "Business Information", "Tagline"],
    ["membership.enabled", "Membership", "Membership visibility"],
    ["membership.headline", "Membership", "Membership headline"],
    ["membership.description", "Membership", "Membership description"],
    ["offersPresentation.title", "Offers", "Offers title"],
    ["offersPresentation.presentation", "Offers", "Offers presentation"],
    ["offersPresentation.showImages", "Offers", "Offer images"],
    ["offersPresentation.showExpiry", "Offers", "Offer expiry"],
  ];

  for (const [path, area, label] of fields) {
    if (read(current, path) !== read(proposed, path)) {
      items.push({
        kind: "CONFIGURATION",
        area,
        label,
        detail: `${formatValue(read(current, path))} → ${formatValue(read(proposed, path))}`,
      });
    }
  }

  const currentSections = current.sections ?? {};
  const proposedSections = proposed.sections ?? {};
  for (const key of Object.keys(proposedSections)) {
    if (currentSections[key] !== proposedSections[key]) {
      items.push({
        kind: "CONFIGURATION",
        area: "Sections",
        label: humanize(key),
        detail: `${currentSections[key] ? "Enabled" : "Disabled"} → ${proposedSections[key] ? "Enabled" : "Disabled"}`,
      });
    }
  }

  if (
    JSON.stringify(current.theme ?? {}) !== JSON.stringify(proposed.theme ?? {})
  ) {
    items.push({
      kind: "CONFIGURATION",
      area: "Theme",
      label: "Theme configuration",
      detail: "Customer-facing theme settings changed.",
    });
  }
}

function compareOrganization(
  current: any,
  proposed: any,
  items: ExperienceDiffItem[],
) {
  const fields: Array<[string, string]> = [
    ["displayName", "Business display name"],
    ["name", "Business name"],
    ["website", "Website"],
    ["primaryEmail", "Primary email"],
  ];

  for (const [key, label] of fields) {
    if (stable(current?.[key]) !== stable(proposed?.[key])) {
      items.push({
        kind: "CONFIGURATION",
        area: "Business Information",
        label,
        detail: `${formatValue(current?.[key])} → ${formatValue(proposed?.[key])}`,
      });
    }
  }
}

function compareBranding(
  current: any,
  proposed: any,
  items: ExperienceDiffItem[],
) {
  const fields: Array<[string, string]> = [
    ["tagline", "Tagline"],
    ["heroImageUrl", "Hero image"],
    ["logoUrl", "Business logo"],
    ["primaryColor", "Primary color"],
    ["secondaryColor", "Secondary color"],
    ["accentColor", "Accent color"],
  ];

  for (const [key, label] of fields) {
    if (stable(current?.[key]) !== stable(proposed?.[key])) {
      items.push({
        kind: "CONFIGURATION",
        area: "Branding",
        label,
        detail: isImageField(key)
          ? "Customer-facing image changed."
          : `${formatValue(current?.[key])} → ${formatValue(proposed?.[key])}`,
        beforeValue: current?.[key],
        afterValue: proposed?.[key],
      });
    }
  }
}

function compareCollection<T extends { id: string; isDeleted: boolean }>(
  current: T[],
  proposed: T[],
  area: string,
  items: ExperienceDiffItem[],
  label: (value: T) => string,
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
      items.push({
        kind: "MODIFIED",
        area,
        label: label(value),
        detail: describeModification(previous, value),
      });
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

function describeModification(previous: any, next: any): string {
  const fields = [
    ["membershipProductName", "Name"],
    ["displayName", "Display name"],
    ["description", "Description"],
    ["productStatusId", "Status"],
    ["benefitStatusId", "Status"],
    ["statusId", "Status"],
    ["effectiveDate", "Effective date"],
    ["expiryDate", "Expiry date"],
    ["membershipProductId", "Membership association"],
    ["benefitIds", "Benefits"],
    ["plans", "Plans / pricing"],
    ["promotionImageUrl", "Promotion image"],
    ["availabilityText", "Availability"],
    ["discountPercentage", "Discount"],
    ["storeId", "Store association"],
    ["storeCode", "Store code"],
    ["name", "Name"],
    ["address", "Address"],
  ];

  const changed = fields
    .filter(([key]) => stable(previous[key]) !== stable(next[key]))
    .map(([, label]) => label);

  return changed.length
    ? `Updated: ${changed.join(", ")}`
    : "Customer-facing data changed.";
}

const membershipLabel = (value: MembershipProduct) =>
  value.displayName || value.membershipProductName;
const benefitLabel = (value: Benefit) => value.displayName || value.benefitName;
const offerLabel = (value: Offer) => value.offerName;
const storeLabel = (value: Store) => value.name || value.storeCode;

function stable(value: unknown): string {
  if (value === undefined) return "<undefined>";
  return JSON.stringify(sortValue(value));
}

function sortValue(value: any): any {
  if (Array.isArray(value))
    return value
      .map(sortValue)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
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

function isImageField(key: string): boolean {
  return (
    key.toLowerCase().includes("image") || key.toLowerCase().includes("logourl")
  );
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  return String(value);
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
