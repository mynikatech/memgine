import { ID } from "../domain/common";

import { Organization } from "../domain/entities";

import {
  OnboardOrganizationInput,
  OnboardOrganizationResult,
} from "../services/service-contracts";

import { services } from "../services/service-registry";

/**
 * Application-level organization onboarding operation.
 *
 * The UI calls this function.
 *
 * It does NOT:
 * - construct Organization records
 * - generate database IDs
 * - resolve templates
 * - manipulate mock registries
 *
 * Those responsibilities belong behind the service/API boundary.
 */
export async function onboardOrganization(
  input: OnboardOrganizationInput,
): Promise<OnboardOrganizationResult> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Business name is required.");
  }

  if (name.length < 2) {
    throw new Error("Business name must contain at least 2 characters.");
  }

  if (name.length > 150) {
    throw new Error("Business name must not exceed 150 characters.");
  }

  if (!input.organizationTypeId) {
    throw new Error("Business type is required.");
  }

  return services.organization.onboardOrganization({
    name,
    organizationTypeId: input.organizationTypeId,
  });
}

/**
 * Convenience function used by Platform Admin.
 */
export async function listOrganizations(): Promise<Organization[]> {
  return services.organization.listOrganizations();
}
