import { ID } from "../domain/common";
import { BusinessContext } from "../context/business-context";

import { SUNRISE_BAKERY_CONTEXT } from "./sunrise-bakery";
import { GLOW_STUDIO_CONTEXT } from "./glow-studio";
import { STEEP_SIP_CONTEXT } from "./steep-sip";

/**
 * Business context registry.
 *
 * Existing entries represent actual organizations/tenants.
 *
 * Platform onboarding templates are NOT stored here.
 */
export const BUSINESS_CONTEXTS: Record<ID, BusinessContext> = {
  [SUNRISE_BAKERY_CONTEXT.organization.id]: SUNRISE_BAKERY_CONTEXT,

  [GLOW_STUDIO_CONTEXT.organization.id]: GLOW_STUDIO_CONTEXT,

  [STEEP_SIP_CONTEXT.organization.id]: STEEP_SIP_CONTEXT,
};

/**
 * Current development/demo organization.
 *
 * This controls which existing organization opens when
 * the application starts.
 *
 * IMPORTANT:
 * This is NOT used as an onboarding template.
 */
export const DEFAULT_ACTIVE_ORG_ID: ID = STEEP_SIP_CONTEXT.organization.id;

/**
 * Register a newly created organization.
 *
 * The current UI implementation uses an in-memory registry
 * so that newly onboarded organizations can immediately be
 * selected by BusinessProvider.
 *
 * The production backend will eventually become the source
 * of truth for organization contexts.
 */
export function registerBusinessContext(context: BusinessContext): void {
  BUSINESS_CONTEXTS[context.organization.id] = context;
}

/**
 * Resolve a business context by organization ID.
 */
export function getBusinessContext(
  organizationId: ID,
): BusinessContext | undefined {
  return BUSINESS_CONTEXTS[organizationId];
}
