import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  RegionReference,
} from "../services/reference-data";

export const COUNTRIES: CountryReference[] = [
  // current COUNTRIES array
];

export const REGIONS: RegionReference[] = [
  // current REGIONS array
];

export const CITIES: CityReference[] = [
  // current CITIES array
];

export const ORGANIZATION_TYPES: ReferenceDataItem[] = [
  // current ORGANIZATION_TYPES array
];

export const ORGANIZATION_STATUSES: ReferenceDataItem[] = [
  // current ORGANIZATION_STATUSES array
];

export const THEME_TEMPLATES: ReferenceDataItem[] = [
  // current THEME_TEMPLATES array
];

export const BRANDING_STATUSES: ReferenceDataItem[] = [
  // current BRANDING_STATUSES array
];

export const INTEGRATION_TYPES: ReferenceDataItem[] = [
  // current INTEGRATION_TYPES array
];

export const STORE_TYPES: ReferenceDataItem[] = [
  // current STORE_TYPES array
];

export const STORE_STATUSES: ReferenceDataItem[] = [
  // current STORE_STATUSES array
];

export const STAFF_STATUSES: ReferenceDataItem[] = [
  // current STAFF_STATUSES array
];

export const BENEFIT_CATEGORIES: ReferenceDataItem[] = [
  {
    id: "benefit-category-discount",
    code: "DISCOUNT",
    name: "Discount",
    displayOrder: 1,
    active: true,
  },
  {
    id: "benefit-category-food",
    code: "FOOD",
    name: "Food & Beverage",
    displayOrder: 2,
    active: true,
  },
  {
    id: "benefit-category-service",
    code: "SERVICE",
    name: "Service",
    displayOrder: 3,
    active: true,
  },
  {
    id: "benefit-category-reward",
    code: "REWARD",
    name: "Reward",
    displayOrder: 4,
    active: true,
  },
];

export const BENEFIT_TYPES: ReferenceDataItem[] = [
  {
    id: "benefit-type-discount",
    code: "DISCOUNT",
    name: "Discount",
    displayOrder: 1,
    active: true,
  },
  {
    id: "benefit-type-freebie",
    code: "FREEBIE",
    name: "Freebie",
    displayOrder: 2,
    active: true,
  },
  {
    id: "benefit-type-reward",
    code: "REWARD",
    name: "Reward",
    displayOrder: 3,
    active: true,
  },
  {
    id: "benefit-type-perk",
    code: "PERK",
    name: "Perk",
    displayOrder: 4,
    active: true,
  },
];

export const BENEFIT_STATUSES: ReferenceDataItem[] = [
  {
    id: "benefit-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "benefit-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 2,
    active: true,
  },
  {
    id: "benefit-status-suspended",
    code: "SUSPENDED",
    name: "Suspended",
    displayOrder: 3,
    active: true,
  },
];

export const PRODUCT_CATEGORIES: ReferenceDataItem[] = [
  // current PRODUCT_CATEGORIES
];

export const PRODUCT_TYPES: ReferenceDataItem[] = [
  // current PRODUCT_TYPES
];

export const PRODUCT_STATUSES: ReferenceDataItem[] = [
  // current PRODUCT_STATUSES
];

export const SUBSCRIPTION_PLAN_STATUSES: ReferenceDataItem[] = [
  // current SUBSCRIPTION_PLAN_STATUSES
];

export const CURRENCIES: ReferenceDataItem[] = [
  // current CURRENCIES
];

export const OFFER_STATUSES: ReferenceDataItem[] = [
  {
    id: "offer-status-draft",
    code: "DRAFT",
    name: "Draft",
    displayOrder: 1,
    active: true,
  },
  {
    id: "offer-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 2,
    active: true,
  },
  {
    id: "offer-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 3,
    active: true,
  },
];
