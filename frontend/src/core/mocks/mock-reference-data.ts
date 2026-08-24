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
  LANGUAGES,
  ORGANIZATION_TYPES,
  ORGANIZATION_USER_TYPES,
  PRODUCT_CATEGORIES,
  PRODUCT_TYPES,
  REGIONS,
  STORE_TYPES,
} from "./reference-data-data";

/**
 * Raw in-memory reference-data source.
 *
 * This implementation knows where the current mock/reference data lives.
 *
 * Today:
 *   constants
 *
 * Future:
 *   API / database
 *
 * The application-facing contract does not change.
 *
 * Status is intentionally NOT part of this service.
 * Role and Privilege are intentionally NOT part of this service.
 */
export class InMemoryReferenceDataService implements ReferenceDataService {
  async refresh(): Promise<void> {
    // Source data is already held in memory.
  }
  async listCountries(): Promise<CountryReference[]> {
    return COUNTRIES.filter((item) => item.active).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  async listRegions(countryCode: string): Promise<RegionReference[]> {
    const normalizedCountryCode = countryCode.trim().toUpperCase();

    return REGIONS.filter(
      (region) => region.countryCode.toUpperCase() === normalizedCountryCode,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listCities(
    countryCode: string,
    regionCode: string,
  ): Promise<CityReference[]> {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    const normalizedRegionCode = regionCode.trim().toUpperCase();

    return CITIES.filter(
      (city) =>
        city.countryCode.toUpperCase() === normalizedCountryCode &&
        city.regionCode.toUpperCase() === normalizedRegionCode,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listLanguages(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(LANGUAGES);
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(ORGANIZATION_TYPES);
  }

  async listOrganizationUserTypes(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(ORGANIZATION_USER_TYPES);
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(STORE_TYPES);
  }

  async listProductCategories(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(PRODUCT_CATEGORIES);
  }

  async listProductTypes(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(PRODUCT_TYPES);
  }

  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(BENEFIT_CATEGORIES);
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(BENEFIT_TYPES);
  }

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(CURRENCIES);
  }

  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return this.activeReferenceItems(INTEGRATION_TYPES);
  }

  private activeReferenceItems(
    items: ReferenceDataItem[],
  ): ReferenceDataItem[] {
    return items
      .filter((item) => item.active)
      .sort((a, b) => a.displayOrder - b.displayOrder);
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
 * InMemoryReferenceDataService
 *   ↓
 * reference-data-data.ts
 *
 * In production only the source implementation needs to be replaced
 * by an API/DB-backed implementation.
 */
export const mockReferenceDataService = new CachedReferenceDataService(
  mockReferenceDataSource,
);
