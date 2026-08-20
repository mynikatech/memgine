import {
  CountryReference,
  ReferenceDataItem,
  ReferenceDataService,
  CityReference,
  RegionReference,
} from "../services/reference-data";

const COUNTRIES: CountryReference[] = [
  {
    id: "country-ca",
    code: "CA",
    name: "Canada",
    countryCode: "CA",
    callingCode: "+1",
    displayOrder: 1,
    active: true,
  },
  {
    id: "country-us",
    code: "US",
    name: "United States",
    countryCode: "US",
    callingCode: "+1",
    displayOrder: 2,
    active: true,
  },
  {
    id: "country-in",
    code: "IN",
    name: "India",
    countryCode: "IN",
    callingCode: "+91",
    displayOrder: 3,
    active: true,
  },
  {
    id: "country-gb",
    code: "GB",
    name: "United Kingdom",
    countryCode: "GB",
    callingCode: "+44",
    displayOrder: 4,
    active: true,
  },
  {
    id: "country-sg",
    code: "SG",
    name: "Singapore",
    countryCode: "SG",
    callingCode: "+65",
    displayOrder: 5,
    active: true,
  },
  {
    id: "country-au",
    code: "AU",
    name: "Australia",
    countryCode: "AU",
    callingCode: "+61",
    displayOrder: 6,
    active: true,
  },
];

const REGIONS: RegionReference[] = [
  {
    id: "region-ca-on",
    countryCode: "CA",
    code: "ON",
    name: "Ontario",
  },
  {
    id: "region-ca-bc",
    countryCode: "CA",
    code: "BC",
    name: "British Columbia",
  },
  {
    id: "region-ca-qc",
    countryCode: "CA",
    code: "QC",
    name: "Quebec",
  },
  {
    id: "region-us-ca",
    countryCode: "US",
    code: "CA",
    name: "California",
  },
  {
    id: "region-us-ny",
    countryCode: "US",
    code: "NY",
    name: "New York",
  },
];

const CITIES: CityReference[] = [
  {
    id: "city-ca-on-toronto",
    countryCode: "CA",
    regionCode: "ON",
    name: "Toronto",
  },
  {
    id: "city-ca-on-ottawa",
    countryCode: "CA",
    regionCode: "ON",
    name: "Ottawa",
  },
  {
    id: "city-ca-on-mississauga",
    countryCode: "CA",
    regionCode: "ON",
    name: "Mississauga",
  },
  {
    id: "city-ca-bc-vancouver",
    countryCode: "CA",
    regionCode: "BC",
    name: "Vancouver",
  },
  {
    id: "city-ca-bc-victoria",
    countryCode: "CA",
    regionCode: "BC",
    name: "Victoria",
  },
  {
    id: "city-ca-qc-montreal",
    countryCode: "CA",
    regionCode: "QC",
    name: "Montreal",
  },
  {
    id: "city-us-ca-los-angeles",
    countryCode: "US",
    regionCode: "CA",
    name: "Los Angeles",
  },
  {
    id: "city-us-ca-san-francisco",
    countryCode: "US",
    regionCode: "CA",
    name: "San Francisco",
  },
  {
    id: "city-us-ny-new-york",
    countryCode: "US",
    regionCode: "NY",
    name: "New York City",
  },
];

const ORGANIZATION_TYPES: ReferenceDataItem[] = [
  {
    id: "org-type-food-beverage",
    code: "FOOD_AND_BEVERAGE",
    name: "Food & Beverage",
    displayOrder: 1,
    active: true,
  },
  {
    id: "org-type-beauty-wellness",
    code: "BEAUTY_AND_WELLNESS",
    name: "Beauty & Wellness",
    displayOrder: 2,
    active: true,
  },
];

const ORGANIZATION_STATUSES: ReferenceDataItem[] = [
  {
    id: "org-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "org-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 2,
    active: true,
  },
  {
    id: "org-status-suspended",
    code: "SUSPENDED",
    name: "Suspended",
    displayOrder: 3,
    active: true,
  },
];

const THEME_TEMPLATES: ReferenceDataItem[] = [
  {
    id: "theme-template-default",
    code: "DEFAULT",
    name: "Memgine Default",
    displayOrder: 1,
    active: true,
  },
  {
    id: "theme-template-bakery",
    code: "BAKERY",
    name: "Bakery",
    displayOrder: 2,
    active: true,
  },
  {
    id: "theme-template-beauty",
    code: "BEAUTY",
    name: "Beauty & Wellness",
    displayOrder: 3,
    active: true,
  },
];

const BRANDING_STATUSES: ReferenceDataItem[] = [
  {
    id: "branding-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "branding-status-draft",
    code: "DRAFT",
    name: "Draft",
    displayOrder: 2,
    active: true,
  },
  {
    id: "branding-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 3,
    active: true,
  },
];

const INTEGRATION_TYPES: ReferenceDataItem[] = [
  {
    id: "integration-type-payment",
    code: "PAYMENT",
    name: "Payment",
    displayOrder: 1,
    active: true,
  },
  {
    id: "integration-type-pos",
    code: "POS",
    name: "Point of Sale",
    displayOrder: 2,
    active: true,
  },
  {
    id: "integration-type-erp",
    code: "ERP",
    name: "Enterprise Resource Planning",
    displayOrder: 3,
    active: true,
  },
  {
    id: "integration-type-crm",
    code: "CRM",
    name: "Customer Relationship Management",
    displayOrder: 4,
    active: true,
  },
  {
    id: "integration-type-accounting",
    code: "ACCOUNTING",
    name: "Accounting",
    displayOrder: 5,
    active: true,
  },
  {
    id: "integration-type-loyalty",
    code: "LOYALTY",
    name: "Loyalty",
    displayOrder: 6,
    active: true,
  },
  {
    id: "integration-type-ecommerce",
    code: "ECOMMERCE",
    name: "E-Commerce",
    displayOrder: 7,
    active: true,
  },
  {
    id: "integration-type-identity",
    code: "IDENTITY",
    name: "Identity Provider",
    displayOrder: 8,
    active: true,
  },
  {
    id: "integration-type-email",
    code: "EMAIL",
    name: "Email Service",
    displayOrder: 9,
    active: true,
  },
  {
    id: "integration-type-sms",
    code: "SMS",
    name: "SMS Service",
    displayOrder: 10,
    active: true,
  },
  {
    id: "integration-type-whatsapp",
    code: "WHATSAPP",
    name: "WhatsApp",
    displayOrder: 11,
    active: true,
  },
  {
    id: "integration-type-push",
    code: "PUSH",
    name: "Push Notification",
    displayOrder: 12,
    active: true,
  },
  {
    id: "integration-type-storage",
    code: "STORAGE",
    name: "File Storage",
    displayOrder: 13,
    active: true,
  },
  {
    id: "integration-type-analytics",
    code: "ANALYTICS",
    name: "Analytics",
    displayOrder: 14,
    active: true,
  },
  {
    id: "integration-type-webhook",
    code: "WEBHOOK",
    name: "Webhook",
    displayOrder: 15,
    active: true,
  },
  {
    id: "integration-type-api",
    code: "API",
    name: "External API",
    displayOrder: 16,
    active: true,
  },
  {
    id: "integration-type-custom",
    code: "CUSTOM",
    name: "Custom",
    displayOrder: 17,
    active: true,
  },
];

const STORE_TYPES: ReferenceDataItem[] = [
  {
    id: "store-type-retail",
    code: "RETAIL",
    name: "Retail",
    displayOrder: 1,
    active: true,
  },
  {
    id: "store-type-kiosk",
    code: "KIOSK",
    name: "Kiosk",
    displayOrder: 2,
    active: true,
  },
  {
    id: "store-type-cafe",
    code: "CAFE",
    name: "Cafe",
    displayOrder: 3,
    active: true,
  },
  {
    id: "store-type-other",
    code: "OTHER",
    name: "Other",
    displayOrder: 4,
    active: true,
  },
];

const STORE_STATUSES: ReferenceDataItem[] = [
  {
    id: "store-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "store-status-closed",
    code: "CLOSED",
    name: "Closed",
    displayOrder: 2,
    active: true,
  },
  {
    id: "store-status-suspended",
    code: "SUSPENDED",
    name: "Suspended",
    displayOrder: 3,
    active: true,
  },
];

const STAFF_STATUSES: ReferenceDataItem[] = [
  {
    id: "staff-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "staff-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 2,
    active: true,
  },
  {
    id: "staff-status-suspended",
    code: "SUSPENDED",
    name: "Suspended",
    displayOrder: 3,
    active: true,
  },
];

const PRODUCT_CATEGORIES: ReferenceDataItem[] = [
  {
    id: "product-category-membership",
    code: "MEMBERSHIP",
    name: "Membership",
    displayOrder: 1,
    active: true,
  },
  {
    id: "product-category-loyalty",
    code: "LOYALTY",
    name: "Loyalty",
    displayOrder: 2,
    active: true,
  },
  {
    id: "product-category-subscription",
    code: "SUBSCRIPTION",
    name: "Subscription",
    displayOrder: 3,
    active: true,
  },
];

const PRODUCT_TYPES: ReferenceDataItem[] = [
  {
    id: "product-type-individual",
    code: "INDIVIDUAL",
    name: "Individual",
    displayOrder: 1,
    active: true,
  },
  {
    id: "product-type-family",
    code: "FAMILY",
    name: "Family",
    displayOrder: 2,
    active: true,
  },
  {
    id: "product-type-corporate",
    code: "CORPORATE",
    name: "Corporate",
    displayOrder: 3,
    active: true,
  },
];

const PRODUCT_STATUSES: ReferenceDataItem[] = [
  {
    id: "product-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "product-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 2,
    active: true,
  },
  {
    id: "product-status-suspended",
    code: "SUSPENDED",
    name: "Suspended",
    displayOrder: 3,
    active: true,
  },
];

const SUBSCRIPTION_PLAN_STATUSES: ReferenceDataItem[] = [
  {
    id: "subscription-plan-status-active",
    code: "ACTIVE",
    name: "Active",
    displayOrder: 1,
    active: true,
  },
  {
    id: "subscription-plan-status-inactive",
    code: "INACTIVE",
    name: "Inactive",
    displayOrder: 2,
    active: true,
  },
  {
    id: "subscription-plan-status-suspended",
    code: "SUSPENDED",
    name: "Suspended",
    displayOrder: 3,
    active: true,
  },
];

const CURRENCIES: ReferenceDataItem[] = [
  {
    id: "currency-inr",
    code: "INR",
    name: "Indian Rupee",
    displayOrder: 1,
    active: true,
  },
  {
    id: "currency-usd",
    code: "USD",
    name: "US Dollar",
    displayOrder: 2,
    active: true,
  },
  {
    id: "currency-cad",
    code: "CAD",
    name: "Canadian Dollar",
    displayOrder: 3,
    active: true,
  },
];

export class InMemoryReferenceDataService implements ReferenceDataService {
  async listCountries(): Promise<CountryReference[]> {
    return COUNTRIES.filter((item) => item.active);
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return ORGANIZATION_TYPES.filter((item) => item.active);
  }

  async listOrganizationStatuses(): Promise<ReferenceDataItem[]> {
    return ORGANIZATION_STATUSES.filter((item) => item.active);
  }

  async listRegions(countryCode: string): Promise<RegionReference[]> {
    return REGIONS.filter((region) => region.countryCode === countryCode);
  }

  async listCities(
    countryCode: string,
    regionCode: string,
  ): Promise<CityReference[]> {
    return CITIES.filter(
      (city) =>
        city.countryCode === countryCode && city.regionCode === regionCode,
    );
  }
  async listThemeTemplates(): Promise<ReferenceDataItem[]> {
    return THEME_TEMPLATES.filter((item) => item.active);
  }

  async listBrandingStatuses(): Promise<ReferenceDataItem[]> {
    return BRANDING_STATUSES.filter((item) => item.active);
  }
  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return INTEGRATION_TYPES.filter((item) => item.active);
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return STORE_TYPES.filter((item) => item.active);
  }

  async listStoreStatuses(): Promise<ReferenceDataItem[]> {
    return STORE_STATUSES.filter((item) => item.active);
  }

  async listStaffStatuses(): Promise<ReferenceDataItem[]> {
    return STAFF_STATUSES;
  }
  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return [
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
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return [
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
  }

  async listBenefitStatuses(): Promise<ReferenceDataItem[]> {
    return [
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
  }

  async listOfferStatuses(): Promise<ReferenceDataItem[]> {
    return [
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
  }
  async listProductCategories(): Promise<ReferenceDataItem[]> {
    return PRODUCT_CATEGORIES.filter((item) => item.active);
  }

  async listProductTypes(): Promise<ReferenceDataItem[]> {
    return PRODUCT_TYPES.filter((item) => item.active);
  }

  async listProductStatuses(): Promise<ReferenceDataItem[]> {
    return PRODUCT_STATUSES.filter((item) => item.active);
  }

  async listSubscriptionPlanStatuses(): Promise<ReferenceDataItem[]> {
    return SUBSCRIPTION_PLAN_STATUSES.filter((item) => item.active);
  }

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return CURRENCIES.filter((item) => item.active);
  }
}

export const mockReferenceDataService = new InMemoryReferenceDataService();
