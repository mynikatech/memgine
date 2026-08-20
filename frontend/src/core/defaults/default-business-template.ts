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
 * FOOD & BEVERAGE → F&B Bakery template
 * BEAUTY & WELLNESS → Salon template
 *
 * Additional organization types can be added later without
 * changing the onboarding UI or service contract.
 */
export const DEFAULT_BUSINESS_TEMPLATES: Record<ID, DefaultBusinessTemplate> = {
  "org-type-food-beverage": {
    id: F_AND_B_BAKERY_V1.id,

    organizationTypeId: "org-type-food-beverage",

    template: F_AND_B_BAKERY_V1,

    content: F_AND_B_DEFAULT_CONTENT,
  },

  "org-type-beauty-wellness": {
    id: SALON_V1.id,

    organizationTypeId: "org-type-beauty-wellness",

    template: SALON_V1,

    content: SALON_DEFAULT_CONTENT,
  },
};

/**
 * Resolve the platform template for an organization type.
 *
 * There is deliberately NO fallback to another organization type.
 */
export function getDefaultBusinessTemplate(
  organizationTypeId: ID,
): DefaultBusinessTemplate {
  const template = DEFAULT_BUSINESS_TEMPLATES[organizationTypeId];

  if (!template) {
    throw new Error(
      `No Memgine default template is configured for organization type '${organizationTypeId}'.`,
    );
  }

  return template;
}
