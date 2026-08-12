import { ID } from "../domain/common";
import { TemplateDefaultContent } from "../template/template-content";
import { F_AND_B_DEFAULT_CONTENT } from "./f-and-b-default-content";
import { SUNRISE_BAKERY_CONTENT } from "./sunrise-bakery-content";
import { GLOW_STUDIO_CONTENT } from "./glow-studio-content";

/**
 * Business content registry — maps an Organization to the resolved
 * TemplateDefaultContent that seeds its experience. This is the replaceable
 * content layer the Business Experience renderer reads from; adding a new
 * business here (or, later, loading from a backend) changes the rendered
 * experience with NO UI code changes.
 */
const BUSINESS_CONTENT_BY_ORG: Record<ID, TemplateDefaultContent> = {
  "org-sunrise": SUNRISE_BAKERY_CONTENT,
  "org-glow": GLOW_STUDIO_CONTENT,
};

/**
 * Resolve the content object for an organization, falling back to the template
 * default/starter content when a business has not customised anything yet.
 */
export function getBusinessContent(organizationId: ID): TemplateDefaultContent {
  return BUSINESS_CONTENT_BY_ORG[organizationId] ?? F_AND_B_DEFAULT_CONTENT;
}
