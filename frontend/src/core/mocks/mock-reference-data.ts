import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  ReferenceDataService,
  RegionReference,
} from "../services/reference-data";

import { CachedReferenceDataService } from "../services/reference-data-cache";

import {
  BENEFIT_CATEGORIES,
  BENEFIT_STATUSES,
  BENEFIT_TYPES,
  CITIES,
  COUNTRIES,
  CURRENCIES,
  INTEGRATION_TYPES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  OFFER_STATUSES,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  REGIONS,
  STAFF_STATUSES,
  STORE_STATUSES,
  STORE_TYPES,
  SUBSCRIPTION_PLAN_STATUSES,
  THEME_TEMPLATES,
  BRANDING_STATUSES,
} from "./reference-data-data";

/**
 * Raw in-memory reference-data implementation.
 *
 * This represents the mock/API data source.
 *
 * It must not be consumed directly by UI components.
 */
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
    return STAFF_STATUSES.filter((item) => item.active);
  }

  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return BENEFIT_CATEGORIES.filter((item) => item.active);
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return BENEFIT_TYPES.filter((item) => item.active);
  }

  async listBenefitStatuses(): Promise<ReferenceDataItem[]> {
    return BENEFIT_STATUSES.filter((item) => item.active);
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

  async listOfferStatuses(): Promise<ReferenceDataItem[]> {
    return OFFER_STATUSES.filter((item) => item.active);
  }
}

/**
 * Raw mock reference-data source.
 *
 * In production this layer will be replaced by an API-backed
 * ReferenceDataService implementation.
 */
export const mockReferenceDataSource = new InMemoryReferenceDataService();

/**
 * Public reference-data service used by the application service registry.
 *
 * Architecture:
 *
 * UI
 *   ↓
 * services.referenceData
 *   ↓
 * CachedReferenceDataService
 *   ↓
 * mockReferenceDataSource
 *
 * In production:
 *
 * UI
 *   ↓
 * services.referenceData
 *   ↓
 * CachedReferenceDataService
 *   ↓
 * API ReferenceDataService
 */
export const mockReferenceDataService = new CachedReferenceDataService(
  mockReferenceDataSource,
);
