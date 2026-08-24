import { ID } from "../domain/common";

/**
 * Shared reference-data item used by selectors throughout the UI.
 *
 * Status is deliberately NOT represented by this interface.
 * Status has its own Status / EntityType / EntityStatus model.
 */
export interface ReferenceDataItem {
  id: ID;
  code: string;
  name: string;
  displayOrder: number;
  active: boolean;
}

/**
 * Country reference data used by phone and address controls.
 */
export interface CountryReference extends ReferenceDataItem {
  countryCode: string;
  callingCode: string;
}

/**
 * Region reference data used by address controls.
 */
export interface RegionReference {
  id: ID;
  countryCode: string;
  code: string;
  name: string;
}

/**
 * City reference data used by address controls.
 */
export interface CityReference {
  id: ID;
  countryCode: string;
  regionCode: string;
  name: string;
}

/**
 * Provider-neutral ordinary reference-data contract.
 *
 * Status is intentionally excluded and is exposed through StatusService.
 */
export interface ReferenceDataService {
  listCountries(): Promise<CountryReference[]>;

  listOrganizationTypes(): Promise<ReferenceDataItem[]>;

  listRegions(countryCode: string): Promise<RegionReference[]>;

  listCities(countryCode: string, regionCode: string): Promise<CityReference[]>;

  listThemeTemplates(): Promise<ReferenceDataItem[]>;

  listIntegrationTypes(): Promise<ReferenceDataItem[]>;

  listStoreTypes(): Promise<ReferenceDataItem[]>;

  listBenefitCategories(): Promise<ReferenceDataItem[]>;

  listBenefitTypes(): Promise<ReferenceDataItem[]>;

  listProductCategories(): Promise<ReferenceDataItem[]>;

  listProductTypes(): Promise<ReferenceDataItem[]>;

  listCurrencies(): Promise<ReferenceDataItem[]>;
}
