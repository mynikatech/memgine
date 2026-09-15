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
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export class ServerReferenceDataService implements ReferenceDataService {
  private snapshot: ReferenceDataSnapshot | null = null;

  constructor(private readonly baseUrl: string) {}

  async refresh(): Promise<void> {
    this.snapshot = await this.load();
  }

  private async load(): Promise<ReferenceDataSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/v1/reference-data`);

    if (!response.ok) {
      throw new Error(`Reference data request failed: ${response.status}`);
    }

    const body = (await response.json()) as ApiResponse<ReferenceDataSnapshot>;

    if (!body.success || !body.data) {
      throw new Error(body.error?.message ?? "Unable to load reference data");
    }

    return body.data;
  }

  private async getSnapshot(): Promise<ReferenceDataSnapshot> {
    if (!this.snapshot) {
      this.snapshot = await this.load();
    }

    return this.snapshot;
  }

  async listLanguages() {
    return (await this.getSnapshot()).languages;
  }

  async listOrganizationTypes() {
    return (await this.getSnapshot()).organizationTypes;
  }

  async listOrganizationUserTypes() {
    return (await this.getSnapshot()).organizationUserTypes;
  }

  async listStoreTypes() {
    return (await this.getSnapshot()).storeTypes;
  }

  async listProductCategories() {
    return (await this.getSnapshot()).productCategories;
  }

  async listProductTypes() {
    return (await this.getSnapshot()).productTypes;
  }

  async listBenefitCategories() {
    return (await this.getSnapshot()).benefitCategories;
  }

  async listBenefitTypes() {
    return (await this.getSnapshot()).benefitTypes;
  }

  async listCurrencies() {
    return (await this.getSnapshot()).currencies;
  }

  async listIntegrationTypes() {
    return (await this.getSnapshot()).integrationTypes;
  }

  /*
   * Geography remains on the existing geography source for this changeset.
   * We have deliberately not put country/region/city into 041 because those
   * were not part of the agreed first server reference-data catalogue.
   */
  async listCountries(): Promise<CountryReference[]> {
    return [];
  }

  async listRegions(_countryCode: string): Promise<RegionReference[]> {
    return [];
  }

  async listCities(
    _countryCode: string,
    _regionCode: string,
  ): Promise<CityReference[]> {
    return [];
  }
}
