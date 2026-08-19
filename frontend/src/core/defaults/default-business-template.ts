import { ID } from "../domain/common";
import { TemplateDefaultContent } from "../template/template-content";
import {
  F_AND_B_BAKERY_V1,
  TemplateDefinition,
} from "../template/template-definition";
import { SALON_V1 } from "../template/salon-template-definition";

import { F_AND_B_DEFAULT_CONTENT } from "./f-and-b-default-content";
import { SALON_DEFAULT_CONTENT } from "./salon-default-content";

/**
 * Platform-level default business template.
 *
 * IMPORTANT:
 * These are templates, NOT organizations.
 *
 * Existing businesses such as Sunrise Bakery, Glow Studio and
 * Steep & Sip must never be used as onboarding templates.
 *
 * Each organization type maps to a platform-owned template
 * definition and its corresponding starter content.
 */
export type DefaultBusinessTemplate = {
  id: ID;
  organizationType: string;
  template: TemplateDefinition;
  content: TemplateDefaultContent;
};

/**
 * Default templates available to Platform Admin onboarding.
 *
 * More organization types/templates can be added here later
 * without changing the onboarding UI.
 */
export const DEFAULT_BUSINESS_TEMPLATES: Record<
  string,
  DefaultBusinessTemplate
> = {
  BAKERY: {
    id: F_AND_B_BAKERY_V1.id,
    organizationType: "BAKERY",
    template: F_AND_B_BAKERY_V1,
    content: F_AND_B_DEFAULT_CONTENT,
  },

  COFFEE_SHOP: {
    id: F_AND_B_BAKERY_V1.id,
    organizationType: "COFFEE_SHOP",
    template: F_AND_B_BAKERY_V1,
    content: F_AND_B_DEFAULT_CONTENT,
  },

  SALON: {
    id: SALON_V1.id,
    organizationType: "SALON",
    template: SALON_V1,
    content: SALON_DEFAULT_CONTENT,
  },

  /*
   * Gym can be added when the platform Gym template exists.
   *
   * We intentionally do not point it at another organization's
   * context or content.
   */
};

/**
 * Resolve the platform default template for an organization type.
 *
 * Unknown types currently fall back to the F&B template because
 * that is the currently available general-purpose starter template.
 *
 * This fallback can later be removed once every supported
 * organization type has its own platform template.
 */
export function getDefaultBusinessTemplate(
  organizationType: string,
): DefaultBusinessTemplate {
  const normalizedType = organizationType.trim().toUpperCase();

  return (
    DEFAULT_BUSINESS_TEMPLATES[normalizedType] ??
    DEFAULT_BUSINESS_TEMPLATES.BAKERY
  );
}
