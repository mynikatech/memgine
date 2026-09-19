import {
  OrganizationMaintenanceApi,
  type OrganizationAdministrativeUser,
  type SaveOrganizationAdministrativeUser,
} from "@/src/data/api/organization-maintenance-api";

export type {
  AdministrativeRoleCode,
  OrganizationAdministrativeUser,
  SaveOrganizationAdministrativeUser,
} from "@/src/data/api/organization-maintenance-api";

export class OrganizationMaintenanceService {
  constructor(private readonly api: OrganizationMaintenanceApi) {}

  async list(organizationId: string): Promise<OrganizationAdministrativeUser[]> {
    const result = await this.api.list(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async create(
    organizationId: string,
    request: SaveOrganizationAdministrativeUser,
  ): Promise<OrganizationAdministrativeUser> {
    const result = await this.api.create(organizationId, request);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async update(
    organizationId: string,
    userId: string,
    request: SaveOrganizationAdministrativeUser,
  ): Promise<OrganizationAdministrativeUser> {
    const result = await this.api.update(organizationId, userId, request);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }
}
