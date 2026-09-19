import { ID } from "../domain/common";

/**
 * Capability-based access model (frozen MVP RBAC). UI access is decided by
 * capabilities, NOT by whether a user is the business owner.
 */
export enum Capability {
  PLATFORM_ADMIN_ACCESS = "PLATFORM_ADMIN_ACCESS",
  BUSINESS_OWNER_ACCESS = "BUSINESS_OWNER_ACCESS",
  ORG_ADMIN_ACCESS = "ORG_ADMIN_ACCESS",
  COUNTER_ACCESS = "COUNTER_ACCESS",
  CUSTOMER_ACCESS = "CUSTOMER_ACCESS",
}

export enum RoleCode {
  PLATFORM_ADMIN = "PLATFORM_ADMIN",
  BUSINESS_OWNER = "BUSINESS_OWNER",
  ORG_ADMIN = "ORG_ADMIN",
  STAFF = "STAFF",
  CUSTOMER = "CUSTOMER",
}

export enum StaffRole {
  OWNER = "BUSINESS_OWNER",
  ORG_ADMIN = "ORG_ADMIN",
  MANAGER = "MANAGER",
  STAFF = "STAFF",
}

/** Contract-level default role → capabilities mapping (not an enforcement engine). */
export const ROLE_CAPABILITIES: Record<RoleCode, Capability[]> = {
  [RoleCode.PLATFORM_ADMIN]: [Capability.PLATFORM_ADMIN_ACCESS],
  [RoleCode.BUSINESS_OWNER]: [Capability.BUSINESS_OWNER_ACCESS, Capability.ORG_ADMIN_ACCESS, Capability.COUNTER_ACCESS],
  [RoleCode.ORG_ADMIN]: [Capability.ORG_ADMIN_ACCESS, Capability.COUNTER_ACCESS],
  [RoleCode.STAFF]: [Capability.COUNTER_ACCESS],
  [RoleCode.CUSTOMER]: [Capability.CUSTOMER_ACCESS],
};

/** Preview defaults only. Server effective capabilities are authoritative. */
export const DEFAULT_ROLE_CAPABILITIES: Record<StaffRole, Capability[]> = {
  [StaffRole.OWNER]: ROLE_CAPABILITIES[RoleCode.BUSINESS_OWNER],
  [StaffRole.ORG_ADMIN]: ROLE_CAPABILITIES[RoleCode.ORG_ADMIN],
  [StaffRole.MANAGER]: [],
  [StaffRole.STAFF]: ROLE_CAPABILITIES[RoleCode.STAFF],
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
  capabilities?: Capability[];
}

export type Principal = StaffPrincipal | CustomerPrincipal;

export function hasCapability(principal: Principal, capability: Capability): boolean {
  return principal.capabilities?.includes(capability) ?? false;
}

export function canEditConfig(principal: Principal): boolean {
  return hasCapability(principal, Capability.ORG_ADMIN_ACCESS);
}

export function canPerformRedemption(principal: Principal): boolean {
  return hasCapability(principal, Capability.COUNTER_ACCESS);
}
