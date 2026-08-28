import type {
  ID,
  Organization,
  OrganizationAccount,
  OrganizationBranding,
  OrganizationDetails,
} from "@/src/core";

export type OrganizationAggregate = {
  organization: Organization;
  account: OrganizationAccount;
  details: OrganizationDetails;
  branding: OrganizationBranding;
};

export type CreateOrganizationRepositoryInput = OrganizationAggregate;

export interface OrganizationRepository {
  get(organizationId: ID): Promise<Organization | null>;

  getAggregate(organizationId: ID): Promise<OrganizationAggregate | null>;

  list(): Promise<Organization[]>;

  create(input: CreateOrganizationRepositoryInput): Promise<Organization>;

  update(organizationId: ID, organization: Organization): Promise<Organization>;

  updateDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<OrganizationDetails>;
}
