export const LOCAL_DATA_KEYS = {
  organizationList: () => "memgine.organizations",
  organization: (organizationId: string) =>
    `memgine.organization.${organizationId}`,
  organizationAccount: (organizationId: string) =>
    `memgine.organization.${organizationId}.account`,
  userAcquisitions: (organizationId: string) =>
    `memgine:organization:${organizationId}:user-acquisitions`,
  organizationDetails: (organizationId: string) =>
    `memgine.organization.${organizationId}.details`,
  organizationBranding: (organizationId: string) =>
    `memgine.organization.${organizationId}.branding`,
  organizationCustomerExperience: (organizationId: string) =>
    `memgine.organization.${organizationId}.customer-experience`,
  organizationStores: (organizationId: string) =>
    `memgine:organization:${organizationId}:stores`,
  notificationConfiguration: (organizationId: string) =>
    `memgine.organization.${organizationId}.notification-configuration`,
  integrationConfigurations: (organizationId: string) =>
    `memgine.organization.${organizationId}.integration-configurations`,
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
  benefitUsageRules: () => "memgine:benefit-usage-rules",
  benefitOrganizations: () => `memgine:benefit-organizations`,
  subscriptions: () => `memgine:subscriptions`,
  redemptions: () => `memgine:redemptions`,
  offers: (organizationId: string) =>
    `memgine:organization:${organizationId}:offers`,

  // Customer Preference reference/configuration data.
  preferenceTypes: () => `memgine:preference-types`,

  // User-owned preference values.
  customerPreferences: (userId: string) =>
    `memgine:user:${userId}:customer-preferences`,

  // Organization-owned referral configuration and referral instances.
  referralProgram: (organizationId: string) =>
    `memgine:organization:${organizationId}:referral-program`,
  referrals: (organizationId: string) =>
    `memgine:organization:${organizationId}:referrals`,

  statusStatuses: () => "memgine.status.statuses",
  statusEntityTypes: () => "memgine.status.entity-types",
  statusEntityStatuses: () => "memgine.status.entity-statuses",
} as const;
