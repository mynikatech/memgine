import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type PlatformPoyntPaymentConfiguration = {
  organizationId: string; organizationName: string; integrationConfigurationId: string;
  integrationName: string; provider: string; integrationTypeId: string; integrationStatusId: string;
  integrationStatus: string; integrationVersionNo: number; applicationId?: string | null;
  providerBusinessId?: string | null; providerStoreId?: string | null;
  merchantCurrencyCode?: string | null;
  credentialProfileId?: string | null;
  credentialStatus: "CONFIGURED" | "NOT_CONFIGURED" | "VERIFICATION_UNAVAILABLE";
  connectionStatus: "NOT_TESTED" | "VERIFIED" | "FAILED";
  lastVerifiedAt?: string | null; versionNo: number;
};
export type PlatformPoyntPaymentWrite = {
  applicationId: string; providerBusinessId: string; providerStoreId?: string | null;
  credentialProfileId: string; merchantCurrencyCode: string; versionNo: number;
};
export type PoyntCredentialProfile = {
  credentialProfileId: string;
  displayName: string;
};
export type PlatformPoyntIntegrationWrite = {
  id: string; integrationName: string; integrationTypeId: string;
  provider: "POYNT"; integrationStatusId: string; versionNo: number;
};
export type PlatformPoyntTerminalBinding = {
  bindingId: string; posDeviceId: string; organizationId: string;
  storeId: string; storeName: string; deviceName: string;
  poyntBusinessId: string; poyntStoreId: string; poyntTerminalId: string;
  active: boolean; createdAt: string;
};
export type PlatformPoyntTerminalBindingWrite = {
  storeId: string; deviceName: string; poyntBusinessId: string;
  poyntStoreId: string; poyntTerminalId: string; active: boolean;
};
export type OrganizationPoyntPaymentSummary = {
  integrationConfigurationId: string; integrationName: string; integrationStatus: string;
  providerBusinessId?: string | null; providerStoreId?: string | null;
  merchantCurrencyCode?: string | null;
  credentialStatus: "CONFIGURED" | "NOT_CONFIGURED" | "VERIFICATION_UNAVAILABLE";
  connectionStatus: "NOT_TESTED" | "VERIFIED" | "FAILED";
  lastVerifiedAt?: string | null;
};
export type OrganizationPoyntTerminalBinding = PlatformPoyntTerminalBinding;
export type OrganizationPoyntTerminalBindingWrite = {
  storeId: string; deviceName: string; poyntStoreId?: string | null;
  poyntTerminalId: string; active: boolean;
};

export const platformPaymentConfigurationApi = {
  list: (): Promise<ApiResult<PlatformPoyntPaymentConfiguration[]>> => httpClient.get("/api/v1/platform/payment-configurations"),
  createIntegration: (organizationId: string, body: PlatformPoyntIntegrationWrite): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/integrations?organizationId=${encodeURIComponent(organizationId)}`, body),
  updateIntegration: (organizationId: string, id: string, body: PlatformPoyntIntegrationWrite): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> =>
    httpClient.put(`/api/v1/platform/payment-configurations/integrations/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`, body),
  save: (id: string, body: PlatformPoyntPaymentWrite): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> => httpClient.put(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}`, body),
  credentialProfiles: (): Promise<ApiResult<PoyntCredentialProfile[]>> =>
    httpClient.get("/api/v1/platform/payment-configurations/poynt/credential-profiles"),
  test: (id: string): Promise<ApiResult<PlatformPoyntPaymentConfiguration>> => httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/test-connection`, {}),
  terminals: (id: string): Promise<ApiResult<PlatformPoyntTerminalBinding[]>> =>
    httpClient.get(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals`),
  createTerminal: (id: string, body: PlatformPoyntTerminalBindingWrite): Promise<ApiResult<PlatformPoyntTerminalBinding>> =>
    httpClient.post(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals`, body),
  updateTerminal: (id: string, bindingId: string, body: PlatformPoyntTerminalBindingWrite): Promise<ApiResult<PlatformPoyntTerminalBinding>> =>
    httpClient.put(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals/${encodeURIComponent(bindingId)}`, body),
  deactivateTerminal: (id: string, bindingId: string): Promise<ApiResult<PlatformPoyntTerminalBinding>> =>
    httpClient.delete(`/api/v1/platform/payment-configurations/poynt/${encodeURIComponent(id)}/terminals/${encodeURIComponent(bindingId)}`),
};

export const organizationPoyntPaymentApi = {
  summaries: (organizationId: string): Promise<ApiResult<OrganizationPoyntPaymentSummary[]>> =>
    httpClient.get(`/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries`),
  terminals: (organizationId: string, integrationId: string): Promise<ApiResult<OrganizationPoyntTerminalBinding[]>> =>
    httpClient.get(`/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals`),
  createTerminal: (organizationId: string, integrationId: string, body: OrganizationPoyntTerminalBindingWrite): Promise<ApiResult<OrganizationPoyntTerminalBinding>> =>
    httpClient.post(`/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals`, body),
  updateTerminal: (organizationId: string, integrationId: string, bindingId: string, body: OrganizationPoyntTerminalBindingWrite): Promise<ApiResult<OrganizationPoyntTerminalBinding>> =>
    httpClient.put(`/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals/${encodeURIComponent(bindingId)}`, body),
  deactivateTerminal: (organizationId: string, integrationId: string, bindingId: string): Promise<ApiResult<OrganizationPoyntTerminalBinding>> =>
    httpClient.delete(`/api/v1/organizations/${encodeURIComponent(organizationId)}/commerce/poynt-payment-summaries/${encodeURIComponent(integrationId)}/terminals/${encodeURIComponent(bindingId)}`),
};
