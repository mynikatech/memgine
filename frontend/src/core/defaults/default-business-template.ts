import type { ID } from "../domain/common";

import {
  F_AND_B_BAKERY_V1,
  type TemplateDefinition,
} from "../template/template-definition";

import { SALON_V1 } from "../template/salon-template-definition";

import type { TemplateDefaultContent } from "../template/template-content";

import { F_AND_B_DEFAULT_CONTENT } from "./f-and-b-default-content";
import { SALON_DEFAULT_CONTENT } from "./salon-default-content";

export type DefaultBusinessTemplate = {
  id: ID;

  /**
   * Reference-data organization type ID.
   */
  organizationTypeId: ID;

  /**
   * Frozen platform template definition.
   */
  template: TemplateDefinition;

  /**
   * Platform-owned starter content.
   *
   * This is used only during organization onboarding.
   * It is never the runtime organization configuration.
   */
  content: TemplateDefaultContent;
};

/**
 * Platform-owned default templates.
 *
 * MVP:
 *
 * BAKERY → F_AND_B_BAKERY_V1
 * SALON  → SALON_V1
 *
 * Other organization types may exist in reference data, but are not
 * currently onboardable because they do not have an active starter
 * template assigned.
 */
export const DEFAULT_BUSINESS_TEMPLATES: Record<ID, DefaultBusinessTemplate> = {
  "organization-type-bakery": {
    id: F_AND_B_BAKERY_V1.id,
    organizationTypeId: "organization-type-bakery",
    template: F_AND_B_BAKERY_V1,
    content: F_AND_B_DEFAULT_CONTENT,
  },

  "organization-type-salon": {
    id: SALON_V1.id,
    organizationTypeId: "organization-type-salon",
    template: SALON_V1,
    content: SALON_DEFAULT_CONTENT,
  },
};

export function getDefaultBusinessTemplate(
  organizationTypeId: ID,
): DefaultBusinessTemplate {
  const normalizedId = organizationTypeId.trim();

  if (!normalizedId) {
    throw new Error("Organization type is required.");
  }

  const template = DEFAULT_BUSINESS_TEMPLATES[normalizedId];

  if (!template) {
    throw new Error(
      `No Memgine default template is configured for organization type '${organizationTypeId}'.`,
    );
  }

  return template;
}
