import {
  CountryReference,
  ReferenceDataItem,
  ReferenceDataService,
} from "../services/reference-data";

const COUNTRIES: CountryReference[] = [
  { id: "country-ca", code: "CA", name: "Canada", countryCode: "CA", callingCode: "+1", displayOrder: 1, active: true },
  { id: "country-us", code: "US", name: "United States", countryCode: "US", callingCode: "+1", displayOrder: 2, active: true },
  { id: "country-in", code: "IN", name: "India", countryCode: "IN", callingCode: "+91", displayOrder: 3, active: true },
  { id: "country-gb", code: "GB", name: "United Kingdom", countryCode: "GB", callingCode: "+44", displayOrder: 4, active: true },
  { id: "country-sg", code: "SG", name: "Singapore", countryCode: "SG", callingCode: "+65", displayOrder: 5, active: true },
  { id: "country-au", code: "AU", name: "Australia", countryCode: "AU", callingCode: "+61", displayOrder: 6, active: true },
];

const ORGANIZATION_TYPES: ReferenceDataItem[] = [
  { id: "org-type-food-beverage", code: "FOOD_AND_BEVERAGE", name: "Food & Beverage", displayOrder: 1, active: true },
  { id: "org-type-beauty-wellness", code: "BEAUTY_AND_WELLNESS", name: "Beauty & Wellness", displayOrder: 2, active: true },
];

const ORGANIZATION_STATUSES: ReferenceDataItem[] = [
  { id: "org-status-active", code: "ACTIVE", name: "Active", displayOrder: 1, active: true },
  { id: "org-status-inactive", code: "INACTIVE", name: "Inactive", displayOrder: 2, active: true },
  { id: "org-status-suspended", code: "SUSPENDED", name: "Suspended", displayOrder: 3, active: true },
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
}
