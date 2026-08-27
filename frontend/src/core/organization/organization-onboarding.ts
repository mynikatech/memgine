import type { Organization } from "../domain/entities";

import type {
  OnboardOrganizationInput,
  OnboardOrganizationResult,
} from "../services/service-contracts";

import { getDefaultBusinessTemplate } from "../defaults/default-business-template";

import { materializeOrganization } from "./organization-materializer";

import { apis } from "@/src/data";

/**
 * Application-level organization onboarding operation.
 *
 * Responsibilities:
 * - validate Platform Admin input
 * - resolve the platform starter template
 * - materialize the initial organization-owned records
 * - delegate persistence to the data/API boundary
 *
 * This operation does NOT:
 * - access AsyncStorage
 * - manipulate mock registries
 * - use InMemoryOrganizationService
 * - persist directly
 */
export async function onboardOrganization(
  input: OnboardOrganizationInput,
): Promise<OnboardOrganizationResult> {
  const name = input.name.trim();

  const organizationTypeId = input.organizationTypeId.trim();

  if (!name) {
    throw new Error("Business name is required.");
  }

  if (name.length < 2) {
    throw new Error("Business name must contain at least 2 characters.");
  }

  if (name.length > 150) {
    throw new Error("Business name must not exceed 150 characters.");
  }

  if (!organizationTypeId) {
    throw new Error("Business type is required.");
  }

  /*
   * Resolve the platform-owned starter template.
   *
   * This does NOT copy the template itself to the
   * organization. It only selects the starter from which
   * organization-owned records are initialized.
   */
  const template = getDefaultBusinessTemplate(organizationTypeId);

  const materialized = materializeOrganization(
    {
      name,
      organizationTypeId,
    },
    template,
  );

  const result = await apis.organization.create({
    organization: materialized.organization,

    account: materialized.account,

    details: materialized.details,

    branding: materialized.branding,
  });

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return {
    organization: materialized.organization,

    account: materialized.account,

    context: materialized.context,
  };
}

/**
 * Convenience function used by Platform Admin.
 */
export async function listOrganizations(): Promise<Organization[]> {
  const result = await apis.organization.list();

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}
