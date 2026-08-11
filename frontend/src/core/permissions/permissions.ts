import { ID } from "../domain/common";

/**
 * Capability-based access model (frozen MVP RBAC). UI access is decided by
 * capabilities, NOT by whether a user is the business owner.
 */
export enum Capability {
  VIEW_CONFIG = "VIEW_CONFIG",
  EDIT_CONFIG = "EDIT_CONFIG",
  MANAGE_MEMBERSHIP_PRODUCTS = "MANAGE_MEMBERSHIP_PRODUCTS",
  MANAGE_BENEFITS = "MANAGE_BENEFITS",
  MANAGE_OFFERS = "MANAGE_OFFERS",
  MANAGE_STAFF = "MANAGE_STAFF",
  VIEW_CUSTOMERS = "VIEW_CUSTOMERS",
  PERFORM_REDEMPTION = "PERFORM_REDEMPTION",
  VIEW_ACTIVITY = "VIEW_ACTIVITY",
}

export enum StaffRole {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  STAFF = "STAFF",
}

/** Contract-level default role → capabilities mapping (not an enforcement engine). */
export const DEFAULT_ROLE_CAPABILITIES: Record<StaffRole, Capability[]> = {
  [StaffRole.OWNER]: [
    Capability.VIEW_CONFIG,
    Capability.EDIT_CONFIG,
    Capability.MANAGE_MEMBERSHIP_PRODUCTS,
    Capability.MANAGE_BENEFITS,
    Capability.MANAGE_OFFERS,
    Capability.MANAGE_STAFF,
    Capability.VIEW_CUSTOMERS,
    Capability.PERFORM_REDEMPTION,
    Capability.VIEW_ACTIVITY,
  ],
  [StaffRole.MANAGER]: [
    Capability.VIEW_CONFIG,
    Capability.MANAGE_MEMBERSHIP_PRODUCTS,
    Capability.MANAGE_BENEFITS,
    Capability.MANAGE_OFFERS,
    Capability.VIEW_CUSTOMERS,
    Capability.PERFORM_REDEMPTION,
    Capability.VIEW_ACTIVITY,
  ],
  [StaffRole.STAFF]: [Capability.VIEW_CUSTOMERS, Capability.PERFORM_REDEMPTION],
};

/** The current actor consuming the UI. */
export type PrincipalKind = "STAFF" | "CUSTOMER";

export interface StaffPrincipal {
  kind: "STAFF";
  staffId: ID;
  organizationId: ID;
  role: StaffRole;
  capabilities: Capability[];
}

export interface CustomerPrincipal {
  kind: "CUSTOMER";
  customerId: ID;
}

export type Principal = StaffPrincipal | CustomerPrincipal;

export function hasCapability(principal: Principal, capability: Capability): boolean {
  return principal.kind === "STAFF" && principal.capabilities.includes(capability);
}

export function canEditConfig(principal: Principal): boolean {
  return hasCapability(principal, Capability.EDIT_CONFIG);
}

export function canPerformRedemption(principal: Principal): boolean {
  return hasCapability(principal, Capability.PERFORM_REDEMPTION);
}
