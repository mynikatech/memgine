import { httpClient } from "@/src/data/api/http-client";

import type {
  CityReference,
  CountryReference,
  ReferenceDataItem,
  ReferenceDataService,
  RegionReference,
} from "./reference-data";

type ReferenceDataSnapshot = {
  languages: ReferenceDataItem[];
  organizationTypes: ReferenceDataItem[];
  organizationUserTypes: ReferenceDataItem[];
  storeTypes: ReferenceDataItem[];
  productCategories: ReferenceDataItem[];
  productTypes: ReferenceDataItem[];
  benefitCategories: ReferenceDataItem[];
  benefitTypes: ReferenceDataItem[];
  currencies: ReferenceDataItem[];
  integrationTypes: ReferenceDataItem[];
  countries: CountryReference[];
  regions: RegionReference[];
  cities: CityReference[];
};

export class ServerReferenceDataService implements ReferenceDataService {
  private snapshot: ReferenceDataSnapshot | null = null;

  async refresh(): Promise<void> {
    this.snapshot = await this.load();
  }

  private async load(): Promise<ReferenceDataSnapshot> {
    const result = await httpClient.get<ReferenceDataSnapshot>(
      "/api/v1/reference-data",
    );

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  private async getSnapshot(): Promise<ReferenceDataSnapshot> {
    if (!this.snapshot) {
      this.snapshot = await this.load();
    }

    return this.snapshot;
  }

  async listLanguages(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).languages;
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).organizationTypes;
  }

  async listOrganizationUserTypes(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).organizationUserTypes;
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).storeTypes;
  }

  async listProductCategories(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).productCategories;
  }

  async listProductTypes(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).productTypes;
  }

  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).benefitCategories;
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).benefitTypes;
  }

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).currencies;
  }

  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return (await this.getSnapshot()).integrationTypes;
  }

  async listCountries(): Promise<CountryReference[]> {
    return (await this.getSnapshot()).countries;
  }

  async listRegions(countryCode: string): Promise<RegionReference[]> {
    const normalizedCountryCode = countryCode.trim().toUpperCase();

    return (await this.getSnapshot()).regions
      .filter(
        (region) =>
          region.countryCode.trim().toUpperCase() === normalizedCountryCode,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listCities(
    countryCode: string,
    regionCode: string,
  ): Promise<CityReference[]> {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    const normalizedRegionCode = regionCode.trim().toUpperCase();

    return (await this.getSnapshot()).cities
      .filter(
        (city) =>
          city.countryCode.trim().toUpperCase() === normalizedCountryCode &&
          city.regionCode.trim().toUpperCase() === normalizedRegionCode,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
