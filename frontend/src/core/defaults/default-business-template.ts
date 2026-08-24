import { ID } from "../domain/common";

import { TemplateDefaultContent } from "../template/template-content";

import {
  F_AND_B_BAKERY_V1,
  TemplateDefinition,
} from "../template/template-definition";

import { SALON_V1 } from "../template/salon-template-definition";

import { F_AND_B_DEFAULT_CONTENT } from "./f-and-b-default-content";
import { SALON_DEFAULT_CONTENT } from "./salon-default-content";

export type DefaultBusinessTemplate = {
  id: ID;

  /**
   * Organization Type reference-data ID.
   */
  organizationTypeId: ID;

  /**
   * Template definition controlled by Memgine.
   */
  template: TemplateDefinition;

  /**
   * Starter content copied into a newly created organization.
   */
  content: TemplateDefaultContent;
};

/**
 * Platform-owned default templates.
 *
 * These are NOT organizations.
 *
 * Current MVP:
 *
 * COFFEE     → F&B Bakery template
 * BAKERY     → F&B Bakery template
 * RESTAURANT → F&B Bakery template
 * SALON      → Salon template
 *
 * The F&B template is currently shared by Coffee, Bakery and
 * Restaurant organizations. These can be split into separate
 * templates later without changing the onboarding architecture.
 *
 * Other organization types do not currently have a Memgine
 * default template configured.
 */
export const DEFAULT_BUSINESS_TEMPLATES: Record<ID, DefaultBusinessTemplate> = {
  "organization-type-coffee": {
    id: F_AND_B_BAKERY_V1.id,
    organizationTypeId: "organization-type-coffee",
    template: F_AND_B_BAKERY_V1,
    content: F_AND_B_DEFAULT_CONTENT,
  },

  "organization-type-bakery": {
    id: F_AND_B_BAKERY_V1.id,
    organizationTypeId: "organization-type-bakery",
    template: F_AND_B_BAKERY_V1,
    content: F_AND_B_DEFAULT_CONTENT,
  },

  "organization-type-restaurant": {
    id: F_AND_B_BAKERY_V1.id,
    organizationTypeId: "organization-type-restaurant",
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

/**
 * Resolve the platform template for an organization type.
 *
 * There is deliberately NO fallback to another organization type.
 *
 * If an organization type does not yet have a Memgine default
 * template, onboarding fails explicitly rather than assigning
 * an inappropriate template.
 */
export function getDefaultBusinessTemplate(
  organizationTypeId: ID,
): DefaultBusinessTemplate {
  const normalizedId = organizationTypeId.trim();

  const template = DEFAULT_BUSINESS_TEMPLATES[normalizedId];

  if (!template) {
    throw new Error(
      `No Memgine default template is configured for organization type '${organizationTypeId}'.`,
    );
  }

  return template;
}
