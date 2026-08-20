import { ID } from "../domain/common";
import { TemplateDefaultContent } from "../template/template-content";

import { F_AND_B_DEFAULT_CONTENT } from "./f-and-b-default-content";
import { SUNRISE_BAKERY_CONTENT } from "./sunrise-bakery-content";
import { GLOW_STUDIO_CONTENT } from "./glow-studio-content";

/**
 * Organization-owned customer experience content.
 *
 * Existing organizations have their own content.
 *
 * Newly onboarded organizations receive a COPY of the
 * appropriate platform template content at onboarding time.
 *
 * After onboarding, changing the platform template does not
 * change the organization's content.
 */
const BUSINESS_CONTENT_BY_ORG: Record<ID, TemplateDefaultContent> = {
  "org-sunrise": SUNRISE_BAKERY_CONTENT,

  "org-glow": GLOW_STUDIO_CONTENT,
};

/**
 * Deep-clone starter content before assigning it to a new
 * organization.
 *
 * The template content is treated as immutable platform
 * starter data. Organization content must be independent.
 */
export function cloneBusinessContent(
  content: TemplateDefaultContent,
): TemplateDefaultContent {
  return JSON.parse(JSON.stringify(content)) as TemplateDefaultContent;
}

/**
 * Register organization-owned content.
 */
export function registerBusinessContent(
  organizationId: ID,
  content: TemplateDefaultContent,
): void {
  BUSINESS_CONTENT_BY_ORG[organizationId] = cloneBusinessContent(content);
}

/**
 * Resolve organization-owned content.
 */
export function getBusinessContent(organizationId: ID): TemplateDefaultContent {
  const content = BUSINESS_CONTENT_BY_ORG[organizationId];

  if (!content) {
    throw new Error(
      `Business experience content was not found for organization '${organizationId}'.`,
    );
  }

  return content;
}
/**
 * Resolve starter content when creating a new organization.
 *
 * This function is intentionally separate from getBusinessContent().
 */
export function getStarterBusinessContent(
  content: TemplateDefaultContent,
): TemplateDefaultContent {
  return cloneBusinessContent(content);
}
