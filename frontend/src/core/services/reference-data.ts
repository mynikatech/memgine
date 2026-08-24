import { ID } from "../domain/common";

/**
 * Shared reference-data item used by selectors throughout the UI.
 *
 * Status is deliberately NOT represented by this interface.
 * Status has its own Status / EntityType / EntityStatus model.
 *
 * Role and Privilege are also deliberately excluded from ordinary
 * reference data. They belong to the authorization model.
 */
export interface ReferenceDataItem {
  id: ID;
  code: string;
  name: string;
  displayOrder: number;
  active: boolean;
}

/**
 * Country reference data.
 *
 * Uses ISO 3166-1 alpha-2 country codes.
 */
export interface CountryReference extends ReferenceDataItem {
  countryCode: string;
  callingCode: string;
}

/**
 * Region / State / Province reference data.
 *
 * The catalogue defines this as country-dependent geographic reference data.
 * The current catalogue does not yet provide the actual region rows.
 */
export interface RegionReference {
  id: ID;
  countryCode: string;
  code: string;
  name: string;
}

/**
 * City / locality reference data.
 *
 * Cities are dependent on both country and region.
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
 *
 * Role and Privilege are also intentionally excluded because they belong
 * to the authorization model rather than ordinary reference data.
 */
export interface ReferenceDataService {
  /**
   * Refreshes the cached reference-data catalogue from the source.
   *
   * For a source implementation this is a no-op.
   * CachedReferenceDataService overrides this behaviour and replaces
   * its persisted cache from the source.
   */
  refresh(): Promise<void>;
  /**
   * Geographic reference data
   */
  listCountries(): Promise<CountryReference[]>;

  listRegions(countryCode: string): Promise<RegionReference[]>;

  listCities(countryCode: string, regionCode: string): Promise<CityReference[]>;

  /**
   * General reference data
   */
  listLanguages(): Promise<ReferenceDataItem[]>;

  listOrganizationTypes(): Promise<ReferenceDataItem[]>;

  listOrganizationUserTypes(): Promise<ReferenceDataItem[]>;

  listStoreTypes(): Promise<ReferenceDataItem[]>;

  listProductCategories(): Promise<ReferenceDataItem[]>;

  listProductTypes(): Promise<ReferenceDataItem[]>;

  listBenefitCategories(): Promise<ReferenceDataItem[]>;

  listBenefitTypes(): Promise<ReferenceDataItem[]>;

  listCurrencies(): Promise<ReferenceDataItem[]>;

  listIntegrationTypes(): Promise<ReferenceDataItem[]>;
}
