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
  BENEFIT_TYPES,
  CITIES,
  COUNTRIES,
  CURRENCIES,
  INTEGRATION_TYPES,
  ORGANIZATION_TYPES,
  PRODUCT_CATEGORIES,
  PRODUCT_TYPES,
  REGIONS,
  STORE_TYPES,
  THEME_TEMPLATES,
} from "./reference-data-data";

/**
 * Raw in-memory reference-data implementation.
 *
 * Status is intentionally not part of this service.
 */
export class InMemoryReferenceDataService implements ReferenceDataService {
  async listCountries(): Promise<CountryReference[]> {
    return COUNTRIES.filter((item) => item.active);
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return ORGANIZATION_TYPES.filter((item) => item.active);
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

  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return INTEGRATION_TYPES.filter((item) => item.active);
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return STORE_TYPES.filter((item) => item.active);
  }

  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return BENEFIT_CATEGORIES.filter((item) => item.active);
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return BENEFIT_TYPES.filter((item) => item.active);
  }

  async listProductCategories(): Promise<ReferenceDataItem[]> {
    return PRODUCT_CATEGORIES.filter((item) => item.active);
  }

  async listProductTypes(): Promise<ReferenceDataItem[]> {
    return PRODUCT_TYPES.filter((item) => item.active);
  }

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return CURRENCIES.filter((item) => item.active);
  }
}

/**
 * Raw mock reference-data source.
 */
export const mockReferenceDataSource = new InMemoryReferenceDataService();

/**
 * Public reference-data service.
 *
 * UI
 *   ↓
 * services.referenceData
 *   ↓
 * CachedReferenceDataService
 *   ↓
 * mockReferenceDataSource
 */
export const mockReferenceDataService = new CachedReferenceDataService(
  mockReferenceDataSource,
);
