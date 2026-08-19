import { ID } from "../domain/common";
import { TemplateDefaultContent } from "../template/template-content";
import { F_AND_B_DEFAULT_CONTENT } from "./f-and-b-default-content";
import { SUNRISE_BAKERY_CONTENT } from "./sunrise-bakery-content";
import { GLOW_STUDIO_CONTENT } from "./glow-studio-content";

/**
 * Content customized by existing/demo organizations.
 *
 * These are TENANT overrides.
 *
 * They are deliberately separate from platform default templates.
 */
const BUSINESS_CONTENT_BY_ORG: Record<ID, TemplateDefaultContent> = {
  "org-sunrise": SUNRISE_BAKERY_CONTENT,
  "org-glow": GLOW_STUDIO_CONTENT,
};

/**
 * Resolve the content for an organization.
 *
 * Existing organizations can have customized content.
 * A newly onboarded organization falls back to the
 * appropriate platform template content.
 */
export function getBusinessContent(organizationId: ID): TemplateDefaultContent {
  return BUSINESS_CONTENT_BY_ORG[organizationId] ?? F_AND_B_DEFAULT_CONTENT;
}
