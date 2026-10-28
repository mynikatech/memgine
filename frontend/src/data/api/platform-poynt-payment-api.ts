import { httpClient } from "./http-client";
import type { ApiResult } from "./result";
import { entityStatusApi } from "./entity-status-api";

export type PlatformPoyntPaymentConfiguration = {
  organizationId: string;
  organizationName: string;
  integrationConfigurationId: string;
  integrationName: string;
  provider: string;
  integrationTypeId: string;
  integrationStatusId: string;
  integrationStatus: string;
  integrationVersionNo: number;
  applicationId?: string | null;
  providerBusinessId?: string | null;
  providerStoreId?: string | null;
  merchantCurrencyCode?: string | null;
  credentialProfileId?: string | null;
  credentialStatus:
    | "CONFIGURED"
    | "NOT_CONFIGURED"
    | "VERIFICATION_UNAVAILABLE";
  connectionStatus: "NOT_TESTED" | "VERIFIED" | "FAILED";
  lastVerifiedAt?: string | null;
  versionNo: number;
};
export type PlatformPoyntPaymentWrite = {
  applicationId: string;
  providerBusinessId: string;
  providerStoreId?: string | null;
  credentialProfileId: string;
  merchantCurrencyCode: string;
  versionNo: number;
};
export type PoyntCredentialProfile = {
  credentialProfileId: string;
  displayName: string;
};
export type PoyntApplePayArtifact = {
  artifactId: string;
  sha256: string;
  status: "CANDIDATE" | "APPROVED" | "RETIRED" | string;
  retrievedAt?: string | null;
  lastCheckedAt?: string | null;
};
export type PoyntApplePayReadiness = {
  integrationConfigurationId: string;
  checkoutDomain: string;
  status: string;
  registrationHttpStatus?: number | null;
  configuredDomainRegistered?: boolean | null;
  associationStatus: string;
  providerAssociationSha256?: string | null;
  installedAssociationSha256?: string | null;
  publicAssociationSha256?: string | null;
};
export type PoyntApplePayConfiguration = {
  integrationConfigurationId: string;
  organizationName: string;
  businessId: string;
  providerEnvironment: string;
  checkoutHostname: string;
  artifact?: PoyntApplePayArtifact | null;
  readiness: PoyntApplePayReadiness;
  capabilityEnabled: boolean;
  effectiveAvailability: string;
  artifactStorageConfigured: boolean;
  registrationActionEnabled: boolean;
  registrationLastVerifiedAt?: string | null;
};
export type PlatformPoyntIntegrationWrite = {
  id: string;
  integrationName: string;
  integrationTypeId: string;
  provider: "POYNT";
  integrationStatusId: string;
  versionNo: number;
};
export type PlatformPoyntTerminalBinding = {
  bindingId: string;
  posDeviceId: string;
  organizationId: string;
  storeId: string;
  storeName: string;
  deviceName: string;
  poyntBusinessId: string;
  poyntStoreId: string;
  poyntTerminalId: string;
  active: boolean;
  createdAt: string;
};
export type PlatformPoyntTerminalBindingWrite = {
  storeId: string;
  deviceName: string;
  poyntBusinessId: string;
  poyntStoreId: string;
  poyntTerminalId: string;
  active: boolean;
};
export type OrganizationPoyntPaymentSummary = {
  integrationConfigurationId: string;
  integrationName: string;
  integrationStatus: string;
  providerBusinessId?: string | null;
  providerStoreId?: string | null;
  merchantCurrencyCode?: string | null;
  credentialStatus:
    | "CONFIGURED"
    | "NOT_CONFIGURED"
    | "VERIFICATION_UNAVAILABLE";
  connectionStatus: "NOT_TESTED" | "VERIFIED" | "FAILED";
  lastVerifiedAt?: string | null;
};
export type OrganizationPoyntTerminalBinding = PlatformPoyntTerminalBinding;
export type OrganizationPoyntTerminalBindingWrite = {
  storeId: string;
  deviceName: string;
  poyntStoreId?: string | null;
  poyntTerminalId: string;
  active: boolean;
};

export type PoyntOperationalStore = {
  id: string;
  name?: string | null;
};

export type PoyntOperationalTerminal = {
  id: string;
  name?: string | null;
  storeId: string;
  catalogId?: string | null;
  catalogName?: string | null;
  configurationEligible: boolean;
  ineligibilityReason?: string | null;
};

export type PoyntStoreCatalogConfiguration = {
  storeId: string;
  storeName: string;
  poyntStoreId?: string | null;
  effectiveCatalogId?: string | null;
  effectiveCatalogName?: string | null;
  configurationStatus: string;
  terminalBindings: OrganizationPoyntTerminalBinding[];
};

export type PoyntStoreTerminalAssignmentWrite = {
  storeId: string;
  poyntStoreId: string;
  terminalId: string;
};

async function resolveIntegrationStatusId(
  integrationStatusId: string,
): Promise<string> {
  const statusId = integrationStatusId.startsWith("entity-status-")
    ? await entityStatusApi.resolveStatusId(integrationStatusId)
    : integrationStatusId;

  return entityStatusApi.resolveEntityStatusId(
    "INTEGRATION_CONFIGURATION",
    statusId,
  );
}

export const platformPaymentConfigurationApi = {
  list: (): Promise<ApiResult<PlatformPoyntPaymentConfiguration[]>> =>
    httpClient.get("/api/v1/platform/payment-configurations"),
  createIntegration: async (
    organizationId: string,
    body: PlatformPoyntIntegrationWrite,
  ): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> => {
    const integrationStatusId = await resolveIntegrationStatusId(
      body.integrationStatusId,
    );

    return httpClient.post(
      `/api/v1/platform/payment-configurations/integrations?organizationId=${encodeURIComponent(organizationId)}`,
      {
        ...body,
        integrationStatusId,
      },
    );
  },

  updateIntegration: async (
    organizationId: string,
    id: string,
    body: PlatformPoyntIntegrationWrite,
  ): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> => {
    const integrationStatusId = await resolveIntegrationStatusId(
      body.integrationStatusId,
    );

    return httpClient.put(
      `/api/v1/platform/payment-configurations/integrations/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
      {
        ...body,
        integrationStatusId,
      },
    );
  },
  save: (
    id: string,
    body: PlatformPoyntPaymentWrite,
  ): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> =>
    httpClient.put(
      `/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}`,
      body,
    ),
  credentialProfiles: (): Promise<ApiResult<PoyntCredentialProfile[]>> =>
    httpClient.get(
      "/api/v1/platform/payment-configurations/poynt/credential-profiles",
    ),
  test: (id: string): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> =>
    httpClient.post(
      `/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/test-connection`,
      {},
    ),
  applePay: (id: string): Promise<ApiResult<PoyntApplePayConfiguration>> =>
    httpClient.get(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay`),
  retrieveApplePayAssociation: (id: string): Promise<ApiResult<PoyntApplePayArtifact>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay/retrieve`, {}),
  refreshApplePayAssociation: (id: string): Promise<ApiResult<PoyntApplePayArtifact>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay/refresh`, {}),
  approveApplePayAssociation: (id: string, artifactId: string): Promise<ApiResult<PoyntApplePayArtifact>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay/approve`, { artifactId }),
  publishApplePayAssociation: (id: string, artifactId: string): Promise<ApiResult<PoyntApplePayReadiness>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay/publish-and-verify`, { artifactId }),
  registerApplePay: (id: string): Promise<ApiResult<{ status: string; readiness: PoyntApplePayReadiness }>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay-registration`, { confirmed: true }),
  setApplePayCapability: (id: string, enabled: boolean): Promise<ApiResult<PoyntApplePayConfiguration>> =>
    httpClient.put(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/apple-pay/capability`, { enabled }),
  terminals: (id: string): Promise<ApiResult<PlatformPoyntTerminalBinding[]>> =>
    httpClient.get(
      `/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals`,
    ),
  createTerminal: (
    id: string,
    body: PlatformPoyntTerminalBindingWrite,
  ): Promise<ApiResult<PlatformPoyntTerminalBinding>> =>
    httpClient.post(
      `/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals`,
      body,
    ),
  updateTerminal: (
    id: string,
    bindingId: string,
    body: PlatformPoyntTerminalBindingWrite,
  ): Promise<ApiResult<PlatformPoyntTerminalBinding>> =>
    httpClient.put(
      `/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals/${encodeURIComponent(bindingId)}`,
      body,
    ),
  deactivateTerminal: (
    id: string,
    bindingId: string,
  ): Promise<ApiResult<PlatformPoyntTerminalBinding>> =>
    httpClient.delete(
      `/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals/${encodeURIComponent(bindingId)}`,
    ),
};

export const organizationPoyntPaymentApi = {
  summaries: (
    organizationId: string,
  ): Promise<ApiResult<OrganizationPoyntPaymentSummary[]>> =>
    httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries`,
    ),
  terminals: (
    organizationId: string,
    integrationId: string,
  ): Promise<ApiResult<OrganizationPoyntTerminalBinding[]>> =>
    httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals`,
    ),
  createTerminal: (
    organizationId: string,
    integrationId: string,
    body: OrganizationPoyntTerminalBindingWrite,
  ): Promise<ApiResult<OrganizationPoyntTerminalBinding>> =>
    httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals`,
      body,
    ),
  updateTerminal: (
    organizationId: string,
    integrationId: string,
    bindingId: string,
    body: OrganizationPoyntTerminalBindingWrite,
  ): Promise<ApiResult<OrganizationPoyntTerminalBinding>> =>
    httpClient.put(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals/${encodeURIComponent(bindingId)}`,
      body,
    ),
  deactivateTerminal: (
    organizationId: string,
    integrationId: string,
    bindingId: string,
  ): Promise<ApiResult<OrganizationPoyntTerminalBinding>> =>
    httpClient.delete(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals/${encodeURIComponent(bindingId)}`,
    ),
};

export const organizationPoyntOperationalApi = {
  stores: (
    organizationId: string,
    integrationId: string,
  ): Promise<ApiResult<PoyntOperationalStore[]>> =>
    httpClient
      .get<{ stores: PoyntOperationalStore[] }>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/integrations/${encodeURIComponent(integrationId)}/poynt/stores`,
      )
      .then((result) =>
        result.success
          ? { success: true, data: result.data.stores }
          : result,
      ),
  terminals: (
    organizationId: string,
    integrationId: string,
    poyntStoreId: string,
  ): Promise<ApiResult<PoyntOperationalTerminal[]>> =>
    httpClient
      .get<{ terminals: PoyntOperationalTerminal[] }>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/integrations/${encodeURIComponent(integrationId)}/poynt/stores/${encodeURIComponent(poyntStoreId)}/terminals`,
      )
      .then((result) =>
        result.success
          ? { success: true, data: result.data.terminals }
          : result,
      ),
  configurations: (
    organizationId: string,
    integrationId: string,
  ): Promise<ApiResult<PoyntStoreCatalogConfiguration[]>> =>
    httpClient
      .get<{ configurations: PoyntStoreCatalogConfiguration[] }>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/integrations/${encodeURIComponent(integrationId)}/poynt/store-configurations`,
      )
      .then((result) =>
        result.success
          ? { success: true, data: result.data.configurations }
          : result,
      ),
  saveAssignment: (
    organizationId: string,
    integrationId: string,
    body: PoyntStoreTerminalAssignmentWrite,
  ): Promise<ApiResult<{ bindingId: string }>> =>
    httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/integrations/${encodeURIComponent(integrationId)}/poynt/store-configurations`,
      body,
    ),
};
