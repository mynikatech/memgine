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
  private initialization: Promise<void> | null = null;
  private refreshQueue: Promise<void> = Promise.resolve();
  private requestVersion = 0;

  async initialize(): Promise<void> {
    if (this.snapshot) {
      return;
    }

    if (this.initialization) {
      return this.initialization;
    }

    this.initialization = this.loadAndReplaceSnapshot().finally(() => {
      this.initialization = null;
    });

    return this.initialization;
  }

  async refresh(): Promise<void> {
    const initializationToWaitFor = this.initialization;
    const refresh = this.refreshQueue
      .catch(() => undefined)
      .then(async () => {
        await initializationToWaitFor?.catch(() => undefined);
        await this.loadAndReplaceSnapshot();
      });

    this.refreshQueue = refresh;
    return refresh;
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

  private async loadAndReplaceSnapshot(): Promise<void> {
    const requestVersion = ++this.requestVersion;
    const snapshot = await this.load();

    if (requestVersion === this.requestVersion) {
      this.snapshot = snapshot;
    }
  }

  getSnapshot(): ReferenceDataSnapshot {
    if (!this.snapshot) {
      throw new Error("Reference data has not been initialized.");
    }

    return this.snapshot;
  }

  async listLanguages(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().languages;
  }

  async listOrganizationTypes(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().organizationTypes;
  }

  async listOrganizationUserTypes(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().organizationUserTypes;
  }

  async listStoreTypes(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().storeTypes;
  }

  async listProductCategories(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().productCategories;
  }

  async listProductTypes(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().productTypes;
  }

  async listBenefitCategories(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().benefitCategories;
  }

  async listBenefitTypes(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().benefitTypes;
  }

  async listCurrencies(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().currencies;
  }

  async listIntegrationTypes(): Promise<ReferenceDataItem[]> {
    return this.getSnapshot().integrationTypes;
  }

  async listCountries(): Promise<CountryReference[]> {
    return this.getSnapshot().countries;
  }

  async listRegions(countryCode: string): Promise<RegionReference[]> {
    const normalizedCountryCode = countryCode.trim().toUpperCase();

    return this.getSnapshot().regions
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

    return this.getSnapshot().cities
      .filter(
        (city) =>
          city.countryCode.trim().toUpperCase() === normalizedCountryCode &&
          city.regionCode.trim().toUpperCase() === normalizedRegionCode,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
