export const LOCAL_DATA_KEYS = {
  organizationList: () => "memgine.organizations",

  organization: (organizationId: string) =>
    `memgine.organization.${organizationId}`,

  organizationAccount: (organizationId: string) =>
    `memgine.organization.${organizationId}.account`,

  organizationDetails: (organizationId: string) =>
    `memgine.organization.${organizationId}.details`,

  organizationBranding: (organizationId: string) =>
    `memgine.organization.${organizationId}.branding`,

  organizationCustomerExperience: (organizationId: string) =>
    `memgine.organization.${organizationId}.customer-experience`,

  organizationStores: (organizationId: string) =>
    `memgine:organization:${organizationId}:stores`,

  users: () => `memgine:users`,

  organizationUsers: (organizationId: string) =>
    `memgine:organization:${organizationId}:users`,

  staff: (organizationId: string) =>
    `memgine:organization:${organizationId}:staff`,

  staffStoreAssignments: (organizationId: string) =>
    `memgine:organization:${organizationId}:staff-store-assignments`,

  products: (organizationId: string) =>
    `memgine:organization:${organizationId}:products`,

  productOrganizations: () => `memgine:product-organizations`,

  memberships: (organizationId: string) =>
    `memgine:organization:${organizationId}:memberships`,

  membershipOrganizations: () => `memgine:membership-organizations`,

  benefits: (organizationId: string) =>
    `memgine:organization:${organizationId}:benefits`,

  benefitOrganizations: () => `memgine:benefit-organizations`,
} as const;
