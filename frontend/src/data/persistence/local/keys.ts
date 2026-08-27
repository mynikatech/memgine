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
} as const;
