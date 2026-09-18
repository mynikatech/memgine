import type { ID } from "../domain/common";
import { OrgAdminCustomerApi, type CreateOrgAdminProspect, type OrgAdminCustomer } from "@/src/data/api/org-admin-customer-api";

export class OrgAdminCustomerService {
  constructor(private readonly api: OrgAdminCustomerApi) {}

  async list(organizationId: ID): Promise<OrgAdminCustomer[]> {
    const result = await this.api.list(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async createProspect(organizationId: ID, prospect: CreateOrgAdminProspect): Promise<ID> {
    const result = await this.api.createProspect(organizationId, prospect);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }
}
