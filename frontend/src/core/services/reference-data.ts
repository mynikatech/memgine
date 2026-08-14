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

/**
 * Provider-neutral reference-data contract.
 * The first implementation is in-memory; production can back the same contract
 * with an API plus local cache without changing consuming screens.
 */
export interface ReferenceDataService {
  listCountries(): Promise<CountryReference[]>;
  listOrganizationTypes(): Promise<ReferenceDataItem[]>;
  listOrganizationStatuses(): Promise<ReferenceDataItem[]>;
}
