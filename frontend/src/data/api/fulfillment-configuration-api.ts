import { httpClient } from "./http-client";
import type { ApiResult } from "./result";

export type FulfillmentJourney =
  | "IMMEDIATE_PAY_AT_COUNTER"
  | "ADVANCE_PAY_NOW"
  | "ADVANCE_PAY_AT_COUNTER";

export type FulfillmentWorkflow = "NONE" | "SIMPLE" | "DETAILED";
export type CollectionPolicy = "ASAP_ONLY" | "ASAP_OR_SCHEDULED";
export type CollectionHour = { start: string; end: string };
export type CollectionHours = Partial<
  Record<
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY",
    CollectionHour[]
  >
>;

export type OrderFulfillmentPolicy = {
  enabled: boolean;
  workflow: FulfillmentWorkflow;
  partialHandoverEnabled: boolean;
  journeys: Record<FulfillmentJourney, boolean>;
  customerLabel: string;
  defaultPreparationMinutes: number;
  minimumLeadMinutes: number;
  maximumHorizonMinutes: number;
  collectionPolicy: CollectionPolicy;
  collectionWindowMinutes: number;
  showExpectedCompletion: boolean;
  showExpectedCollection: boolean;
  customerExtensionRequestsEnabled: boolean;
  recommendedExtensionMinutes: number;
  recommendedExtensionCount: number;
  recommendedTotalExtensionMinutes: number;
  extensionOverrideAdminOnly: boolean;
  customerCancellationRequestsEnabled: boolean;
  cancellationCutoffMinutes: number;
  noShowGraceMinutes: number;
  staffNoShowRecordingEnabled: boolean;
  notificationEvents: string[];
  pickupReminderLeadMinutes: number;
  collectionHours?: CollectionHours;
};

export type FulfillmentCatalogCategory = {
  targetKind: "CATEGORY" | "POS_CATEGORY";
  categoryId: string;
  categoryName: string;
  catalogId: string;
  catalogName: string;
  productCount: number;
};
export type FulfillmentCatalogProduct = {
  productId: string;
  productName: string;
  categoryId: string | null;
  categoryName: string | null;
  catalogName: string;
};
export type FulfillmentWorkflowRule = {
  targetKind: "CATEGORY" | "POS_CATEGORY" | "PRODUCT";
  targetId: string;
  storeId: string | null;
  workflow: FulfillmentWorkflow | null;
  versionNo: number;
};
export type FulfillmentWorkflowRuleChoices = {
  categories: FulfillmentCatalogCategory[];
  products: FulfillmentCatalogProduct[];
  rules: FulfillmentWorkflowRule[];
};
export type FulfillmentPolicy = {
  fulfillmentTypes: { ORDER: OrderFulfillmentPolicy };
};
export type FulfillmentOverrides = {
  fulfillmentTypes?: { ORDER?: Partial<OrderFulfillmentPolicy> };
};

export type OrganizationFulfillmentConfiguration = {
  organizationId: string;
  versionNo: number;
  savedPolicy: Record<string, unknown>;
  effectivePolicy: FulfillmentPolicy;
};
export type StoreFulfillmentConfiguration = {
  organizationId: string;
  storeId: string;
  versionNo: number;
  savedOverrides: FulfillmentOverrides;
  effectivePolicy: FulfillmentPolicy;
};
export type FulfillmentReferenceChoice = {
  code: string;
  label: string;
  supported: boolean;
};
export type FulfillmentReferenceChoices = Record<
  string,
  FulfillmentReferenceChoice[]
>;

const root = (org: string) =>
  `/api/v1/organizations/${encodeURIComponent(org)}/fulfillment-configuration`;

export const fulfillmentConfigurationApi = {
  organization: (
    org: string,
  ): Promise<ApiResult<OrganizationFulfillmentConfiguration>> =>
    httpClient.get(root(org)),
  saveOrganization: (
    org: string,
    policy: FulfillmentPolicy,
    versionNo: number,
  ): Promise<ApiResult<OrganizationFulfillmentConfiguration>> =>
    httpClient.put(root(org), { policy, versionNo }),
  store: (
    org: string,
    store: string,
  ): Promise<ApiResult<StoreFulfillmentConfiguration>> =>
    httpClient.get(`${root(org)}/stores/${encodeURIComponent(store)}`),
  saveStore: (
    org: string,
    store: string,
    overrides: FulfillmentOverrides,
    versionNo: number,
  ): Promise<ApiResult<StoreFulfillmentConfiguration>> =>
    httpClient.put(`${root(org)}/stores/${encodeURIComponent(store)}`, {
      overrides,
      versionNo,
    }),
  references: (org: string): Promise<ApiResult<FulfillmentReferenceChoices>> =>
    httpClient.get(`${root(org)}/references`),
  workflowRules: (
    org: string,
    storeId = "",
    search = "",
  ): Promise<ApiResult<FulfillmentWorkflowRuleChoices>> =>
    httpClient.get(
      `${root(org)}/workflow-rules?storeId=${encodeURIComponent(storeId)}&search=${encodeURIComponent(search)}`,
    ),
  saveWorkflowRule: (
    org: string,
    request: {
      storeId: string | null;
      targetKind: "CATEGORY" | "POS_CATEGORY" | "PRODUCT";
      targetId: string;
      workflow: FulfillmentWorkflow | null;
      versionNo: number;
    },
  ): Promise<ApiResult<FulfillmentWorkflowRule>> =>
    httpClient.put(`${root(org)}/workflow-rules`, request),
};
