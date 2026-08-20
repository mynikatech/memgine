import { mockServices } from "../mocks/mock-services";

import { mockReferenceDataService } from "../mocks/mock-reference-data";

import { OrganizationService } from "./service-contracts";

import { ReferenceDataService } from "./reference-data";

/**
 * Application service registry.
 *
 * UI components consume these provider-neutral services.
 *
 * Current implementation:
 *   Mock API/data implementation
 *
 * Production implementation:
 *   API-backed implementation
 *
 * The UI should not change when the implementation changes.
 */
export type MemgineServices = {
  organization: OrganizationService;

  referenceData: ReferenceDataService;
};

export const services: MemgineServices = {
  organization: mockServices.organization,

  referenceData: mockReferenceDataService,
};
