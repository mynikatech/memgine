export const LOCAL_DATA_KEYS = {
  organizationBranding: (organizationId: string) =>
    `memgine.organization.${organizationId}.branding`,
} as const;
