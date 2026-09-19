import { Capability, RoleCode, type ID } from "@/src/core";
import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type RbacRole = { roleId: ID; roleCode: RoleCode; roleName: string; description: string | null };
export type RbacCapability = { capabilityCode: Capability; capabilityName: string; description: string | null };
export type RbacAssignment = {
  assignmentId: ID; organizationId: ID | null; roleCode: RoleCode | "MANAGER";
  assignmentStatusId: ID; effectiveFrom: string; effectiveTo: string | null;
  assignmentReason: string | null;
};
export type EffectiveRole = { roleId: ID; roleCode: RoleCode; organizationId: ID | null };
export type EffectiveCapability = { capabilityCode: Capability; organizationId: ID | null };
export type AssignRoleInput = {
  userId: ID; effectiveFrom?: string | null; effectiveTo?: string | null;
  reason?: string | null;
};

const userPath = (userId: ID) => `/api/v1/dev/rbac/users/${encodeURIComponent(userId)}`;
const scopeQuery = (organizationId?: ID) =>
  organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";

/** Local/Dev RBAC maintenance API. The server derives mutation actors from the authenticated session. */
export class RbacApi {
  roles(): Promise<ApiResult<RbacRole[]>> {
    return httpClient.get("/api/v1/dev/rbac/roles");
  }
  capabilities(): Promise<ApiResult<RbacCapability[]>> {
    return httpClient.get("/api/v1/dev/rbac/capabilities");
  }
  assignments(userId: ID): Promise<ApiResult<RbacAssignment[]>> {
    return httpClient.get(`${userPath(userId)}/assignments`);
  }
  effectiveRoles(userId: ID, organizationId?: ID): Promise<ApiResult<EffectiveRole[]>> {
    return httpClient.get(`${userPath(userId)}/effective-roles${scopeQuery(organizationId)}`);
  }
  effectiveCapabilities(userId: ID, organizationId?: ID): Promise<ApiResult<EffectiveCapability[]>> {
    return httpClient.get(`${userPath(userId)}/effective-capabilities${scopeQuery(organizationId)}`);
  }
  hasCapability(userId: ID, capability: Capability, organizationId?: ID): Promise<ApiResult<{ allowed: boolean }>> {
    return httpClient.get(`${userPath(userId)}/capabilities/${encodeURIComponent(capability)}${scopeQuery(organizationId)}`);
  }
  assignOrganizationRole(organizationId: ID, input: AssignRoleInput & { roleCode: RoleCode }): Promise<ApiResult<{ assignmentId: ID }>> {
    return httpClient.post(`/api/v1/dev/rbac/organizations/${encodeURIComponent(organizationId)}/assignments`, input);
  }
  revokeOrganizationRole(organizationId: ID, assignmentId: ID): Promise<ApiResult<{ revoked: boolean }>> {
    return httpClient.post(`/api/v1/dev/rbac/organizations/${encodeURIComponent(organizationId)}/assignments/${encodeURIComponent(assignmentId)}/revoke`, {});
  }
  assignPlatformRole(input: AssignRoleInput): Promise<ApiResult<{ assignmentId: ID }>> {
    return httpClient.post("/api/v1/dev/rbac/platform-assignments", input);
  }
  revokePlatformRole(assignmentId: ID): Promise<ApiResult<{ revoked: boolean }>> {
    return httpClient.post(`/api/v1/dev/rbac/platform-assignments/${encodeURIComponent(assignmentId)}/revoke`, {});
  }
}

export const rbacApi = new RbacApi();
