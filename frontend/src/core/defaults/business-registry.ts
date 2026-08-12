import { ID } from "../domain/common";
import { BusinessContext } from "../context/business-context";
import { SUNRISE_BAKERY_CONTEXT } from "./sunrise-bakery";
import { GLOW_STUDIO_CONTEXT } from "./glow-studio";

/**
 * Business context registry — maps an Organization to its full BusinessContext
 * (organization + account + configuration + template). The BusinessProvider
 * reads from this so the active business (and therefore branding, template and
 * locale) can switch per organization with NO renderer changes. Adding a
 * business here (or, later, loading from a backend) is all it takes.
 */
export const BUSINESS_CONTEXTS: Record<ID, BusinessContext> = {
  [SUNRISE_BAKERY_CONTEXT.organization.id]: SUNRISE_BAKERY_CONTEXT,
  [GLOW_STUDIO_CONTEXT.organization.id]: GLOW_STUDIO_CONTEXT,
};

/** The business shown before the customer enters any specific membership. */
export const DEFAULT_ACTIVE_ORG_ID: ID = SUNRISE_BAKERY_CONTEXT.organization.id;
