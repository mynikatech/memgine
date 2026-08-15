import { ID } from "../domain/common";

/** Shared reference-data item used by selectors throughout the UI. */
export interface ReferenceDataItem {
  id: ID;
  code: string;
  name: string;
  displayOrder: number;
  active: boolean;
}

/** Country reference data used by phone and address controls. */
export interface CountryReference extends ReferenceDataItem {
  countryCode: string;
  callingCode: string;
}

/** Region reference data used by address controls. */
export interface RegionReference {
  id: ID;
  countryCode: string;
  code: string;
  name: string;
}
/** City reference data used by address controls. */
export interface CityReference {
  id: ID;
  countryCode: string;
  regionCode: string;
  name: string;
}

/**
 * Provider-neutral reference-data contract.
 * The first implementation is in-memory; production can back the same contract
 * with an API plus local cache without changing consuming screens.
 */
export interface ReferenceDataService {
  listCountries(): Promise<CountryReference[]>;
  listOrganizationTypes(): Promise<ReferenceDataItem[]>;
  listOrganizationStatuses(): Promise<ReferenceDataItem[]>;
  listRegions(countryCode: string): Promise<RegionReference[]>;
  listCities(countryCode: string, regionCode: string): Promise<CityReference[]>;
  listThemeTemplates(): Promise<ReferenceDataItem[]>;
  listBrandingStatuses(): Promise<ReferenceDataItem[]>;
  listIntegrationTypes(): Promise<ReferenceDataItem[]>;
  listStoreTypes(): Promise<ReferenceDataItem[]>;
  listStoreStatuses(): Promise<ReferenceDataItem[]>;
  listStaffStatuses(): Promise<ReferenceDataItem[]>;
  listBenefitCategories(): Promise<ReferenceDataItem[]>;
  listBenefitTypes(): Promise<ReferenceDataItem[]>;
  listBenefitStatuses(): Promise<ReferenceDataItem[]>;
  listProductCategories(): Promise<ReferenceDataItem[]>;
  listProductTypes(): Promise<ReferenceDataItem[]>;
  listProductStatuses(): Promise<ReferenceDataItem[]>;
  listSubscriptionPlanStatuses(): Promise<ReferenceDataItem[]>;
  listCurrencies(): Promise<ReferenceDataItem[]>;
  listOfferStatuses(): Promise<ReferenceDataItem[]>;
}
