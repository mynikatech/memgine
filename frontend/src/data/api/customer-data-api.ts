import type {
  Benefit,
  BenefitUsageRule,
  BusinessConfiguration,
  CustomerExperienceDefinition,
  ID,
  MembershipProduct,
  Offer,
  OfferUsageRule,
  Organization,
  OrganizationBranding,
  OrganizationDetails,
  Store,
} from "@/src/core";
import type { TemplateDefinition } from "@/src/core/template/template-definition";
import type { CounterPurchaseResult, CounterSubscription } from "./counter-api";
import type {
  MembershipPurchaseQuote,
  PaymentConfirmation,
  PaymentIntent,
} from "./counter-api";
import type { OrgAdminRedemption } from "./org-admin-transaction-api";
import type {
  CustomerChoice,
  CustomerProfile,
} from "@/src/core/services/customer-data-service";
import { entityStatusApi } from "./entity-status-api";
import { API_BASE_URL, httpClient } from "./http-client";
import { apiSuccess, type ApiResult } from "./result";
import { MembershipProductApi } from "./membership-product-api";
import { BenefitApi } from "./benefit-api";
import { OfferApi } from "./offer-api";
import { StoreApi } from "./store-api";
const base = (organizationId: ID) =>
  `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}`;
export type RedemptionProductChoice = {
  productId: ID;
  productName: string;
  productCode?: string | null;
  availableStoreIds?: string[] | null;
};
export type PoyntCollectBootstrap = {
  sdkUrl: string;
  businessId: string;
  applicationId: string;
  branding?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
  } | null;
  wallet?: {
    country: string;
    currency: string;
    merchantName: string;
    amount: string; // Decimal string produced on the backend, never recomputed in frontend.
    /** The selected payment-route Poynt integration completed Platform Admin Apple Pay onboarding. */
    applePayEnabled?: boolean;
  } | null;
};
export type CustomerHomeBootstrap = {
  discoverableOrganizations: CustomerDiscoverableOrganization[];
  relationships: CustomerProfile[];
  unreadNotificationCount?: number | null;
};
export type CustomerSelfProfile = {
  userId: ID;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  primaryEmail?: string | null;
  primaryPhone: string;
  versionNo: number;
};
export type CustomerOtpChallenge = {
  challengeId: string;
  expiresAt: string;
  resendAt: string;
  destination?: string;
  devCode?: string | null;
  requiresCurrentPhoneVerification: boolean;
};
export type CustomerMembershipSummary = {
  organizationId: ID;
  subscriptions: CounterSubscription[];
  membershipProducts: MembershipProduct[];
  benefits: Benefit[];
  branding?: OrganizationBranding | null;
};
export type PoyntCollectPaymentMethod = "card" | "apple_pay" | "google_pay";
export type PoyntCollectRecovery = {
  outcome:
    | "FULFILLED"
    | "CAPTURED_UNFULFILLED"
    | "PAYMENT_PENDING"
    | "PAYMENT_FAILED"
    | "OUTCOME_UNKNOWN";
  payment: PaymentIntent;
  subscription?: CounterPurchaseResult | null;
};
/** Stage B: customer-visible, captured-but-unfulfilled financial review case. */
export type PoyntCollectFinancialException = {
  financialExceptionId: string;
  paymentIntentId: string;
  classification: string;
  caseStatus: string;
  relatedPaymentIntentId?: string | null;
  relatedSubscriptionId?: string | null;
  amountMinor: number;
  currencyCode: string;
};
export type PoyntCollectCheckoutSession = { checkoutUrl: string };
export type PoyntCollectBrowserCheckout = {
  csrfToken: string;
  payment: PaymentIntent;
};
const collectPaymentPath = (organizationId: ID, paymentIntentId: ID) =>
  `/api/v1/organizations/${encodeURIComponent(organizationId)}/payments/${encodeURIComponent(paymentIntentId)}`;
const CHECKOUT_READ_TIMEOUT_MS = 20_000;
const PAYMENT_STATUS_TIMEOUT_MS = 15_000;
const PAYMENT_CONFIRM_TIMEOUT_MS = 45_000;
async function browserCheckoutRequest<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  csrfToken?: string,
  timeoutMs: number = CHECKOUT_READ_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrfToken ? { "X-Memgine-Checkout-CSRF": csrfToken } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      data?: T;
      error?: { message?: string; code?: string };
    } | null;
    if (!response.ok || !payload?.success || payload.data == null) {
      throw Object.assign(
        new Error(payload?.error?.message ?? "Secure checkout is unavailable."),
        { code: payload?.error?.code },
      );
    }
    return payload.data;
  } catch (error) {
    if (controller.signal.aborted) {
      // Timeout is an unknown outcome, NOT a payment decline.
      throw new Error(
        "The request timed out. Payment status may still be pending.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export type CustomerDiscoverableOrganization = {
  organizationId: ID;
  name: string;
  displayName?: string | null;
  logoUrl?: string | null;
  tagline?: string | null;
  heroImageUrl?: string | null;
};
export type CustomerCombinedOffer = {
  offerId: ID;
  offerType: "REGULAR" | "MEMBERSHIP_PURCHASE";
  displayName: string;
  regularOffer?: Offer | null;
  applicableMembershipProductIds: ID[];
};
export type CustomerMembershipPurchaseOfferQr = {
  qrReference: string;
  offerId: ID;
  displayName: string;
  expiresAt: string;
};
export type CustomerDiscoveryDetail = {
  organization: Pick<
    Organization,
    "id" | "name" | "displayName" | "website" | "primaryEmail" | "primaryPhone"
  >;
  publishedExperience: {
    configuration: BusinessConfiguration;
    template: Pick<
      TemplateDefinition,
      "id" | "sections" | "supportedCardStyles"
    >;
    definition: CustomerExperienceDefinition;
    organizationBranding?: Pick<
      OrganizationBranding,
      | "logoUrl"
      | "darkThemeLogoUrl"
      | "faviconUrl"
      | "splashScreenImageUrl"
      | "tagline"
      | "heroImageUrl"
      | "primaryColor"
      | "secondaryColor"
      | "accentColor"
      | "backgroundColor"
      | "textColor"
      | "announcementEnabled"
      | "announcementMessage"
      | "announcementStyle"
      | "announcementBackgroundColor"
      | "announcementTextColor"
      | "announcementLinkUrl"
      | "announcementStartsAt"
      | "announcementEndsAt"
      | "announcementConfiguration"
    > | null;
    organizationDetails?: Pick<
      OrganizationDetails,
      "aboutOrganization" | "supportEmail" | "supportPhone"
    > | null;
  };
  membershipProducts: MembershipProduct[];
  benefits: Benefit[];
  benefitUsageRules: BenefitUsageRule[];
  offers: Offer[];
  offerUsageRules: OfferUsageRule[];
  stores: Store[];
};
export type CustomerRedemptionTransactionRequest = {
  subscriptionId: ID;
  benefitIds: ID[];
  offerIds: ID[];
  redemptionMethod: "CUSTOMER_QR";
  productSelections?: Record<string, ID>;
};
export type PendingRedemptionTransaction = {
  transactionId: ID;
  transactionNumber: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "CANCELLED";
  expiresAt?: string | null;
};
export type RedemptionTransactionQr = {
  qrReference: string;
  transactionNumber: string;
  expiresAt: string;
};
export type CounterQrSummary = PendingRedemptionTransaction & {
  storeName?: string | null;
  timezone?: string | null;
  items: {
    id: string;
    type: "BENEFIT" | "OFFER";
    name?: string | null;
    productName?: string | null;
    quantity: number;
  }[];
};
export type CustomerRedemptionTransactionStatus = {
  transactionId: ID;
  status: "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "CANCELLED";
  expiresAt?: string | null;
  completedAt?: string | null;
};
export type CustomerRedemptionItemStatus = {
  itemId: ID;
  itemType: "BENEFIT" | "OFFER";
  status:
    | "AVAILABLE"
    | "LIMIT_REACHED"
    | "UNAVAILABLE_TODAY"
    | "UNAVAILABLE"
    | "NOT_APPLICABLE"
    | "INACTIVE";
  displayReason?: string | null;
};
export type TransactionActualSavings = {
  transactionId: ID;
  subscriptionId?: ID | null;
  redemptionTransactionId?: ID | null;
  currencyCode?: string | null;
  originalDiscountMinor?: number | null;
  reversalMinor?: number | null;
  netSavingsMinor?: number | null;
  verificationState: string;
  completedAt?: string | null;
};

export type SubscriptionActualSavings = {
  subscriptionId: ID;
  currencyCode?: string | null;
  netSavingsMinor?: number | null;
  verifiedNetSavingsMinor?: number | null;
  verifiedRedemptionCount?: number;
  coverageState: string;
};

export type BusinessActualSavings = {
  coverageState:
    | "COMPLETE"
    | "PARTIAL"
    | "NO_REDEMPTION_HISTORY"
    | "UNAVAILABLE";
  activePlanCurrencyCode?: string | null;
  totals: {
    currencyCode: string;
    verifiedNetSavingsMinor: number;
    coverageState: "COMPLETE" | "PARTIAL";
  }[];
  memberships: (SubscriptionActualSavings & {
    membershipName: string;
    planName: string;
  })[];
};

/** Immutable server-issued receipt. Amounts are minor units from the receipt snapshot. */
export type TransactionReceipt = {
  transactionReceiptId: ID;
  receiptNumber: string;
  organizationId: ID;
  storeId?: ID | null;
  customerUserId?: ID | null;
  receiptKind: "MEMBERSHIP_PURCHASE" | "COUNTER_REDEMPTION" | "REFUND";
  sourceTransactionId: ID;
  currencyCode: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentMethod?: string | null;
  providerReference?: string | null;
  /** Server snapshot; clients render but never recompute its financial facts. */
  receiptSnapshot: string;
  issuedAt: string;
  actualSavings?: TransactionActualSavings | null;
};
export type TransactionHistoryItem = {
  transactionId: ID;
  transactionNumber: string;
  organizationId: ID;
  organizationName: string;
  storeId?: ID | null;
  storeName?: string | null;
  customerUserId?: ID | null;
  transactionType: string;
  status: string;
  paymentMethod?: string | null;
  currencyCode: string;
  totalMinor: number;
  occurredAt: string;
  receiptId?: ID | null;
  receiptNumber?: string | null;
  receiptAvailable: boolean;
  refundStatus?: string | null;
  actualSavings?: TransactionActualSavings | null;
  subscriptionId?: ID | null;
  itemDescription?: string | null;
  canonicalOrderId?: ID | null;
};
export type CustomerFulfillmentJourney =
  | "IMMEDIATE_PAY_AT_COUNTER"
  | "ADVANCE_PAY_NOW"
  | "ADVANCE_PAY_AT_COUNTER";

export type CustomerFulfillmentSelection = {
  subscriptionId: ID;
  benefitIds: ID[];
  offerIds: ID[];
};

export type CustomerFulfillmentStore = {
  id: ID;
  name: string;
  customerLabel?: string;
  journeys: CustomerFulfillmentJourney[];
  products: Record<string, RedemptionProductChoice[]>;
  payNowProducts?: Record<string, RedemptionProductChoice[]> | null;
};

export type CustomerFulfillmentRequest = {
  selection: CustomerFulfillmentSelection;
  storeId: ID;
  productSelections: Record<string, ID>;
  journey: CustomerFulfillmentJourney;
  collectionLocalTime?: string;
  requestKey?: string;
  quoteHash?: string;
};

export type CustomerFulfillmentReview = {
  customerLabel: string;
  fulfillmentType: string;
  requestTiming: "ADVANCE";
  paymentTiming: "PAY_AT_COUNTER" | "PAY_NOW";
  storeName: string;
  timezone: string;
  expectedCollectionAt: string;
  collectionWindowEndsAt: string;
  schedulingSupported: boolean;
  quote: {
    currencyCode: string;
    subtotalMinor: number;
    adjustmentTotalMinor: number;
    taxTotalMinor: number;
    totalMinor: number;
    quoteHash: string;
    lines: {
      itemType: "BENEFIT" | "OFFER";
      itemId: ID;
      productName: string;
      quantity: number;
      unitPriceMinor: number;
      subtotalMinor: number;
      discountMinor: number;
    }[];
  };
};

export type CustomerFulfillmentStatus =
  | "PLACED"
  | "PREPARING"
  | "READY"
  | "FULFILLED"
  | "CANCEL_REQUESTED"
  | "CANCELLED";

export type CustomerFulfillment = {
  id: ID;
  customerLabel: string;
  referenceNumber: string;
  storeName: string;
  storeId?: string | null;
  storeAddress?: {
    line1: string;
    line2?: string | null;
    city: string;
    region?: string | null;
    postalCode?: string | null;
    countryCode: string;
  } | null;
  status: CustomerFulfillmentStatus;
  workflow: "NONE" | "SIMPLE" | "DETAILED";
  paymentState: string;
  paymentTiming: string;
  redemptionState?: string | null;
  currencyCode?: string | null;
  totalMinor?: number | null;
  subtotalMinor?: number | null;
  discountMinor?: number | null;
  taxMinor?: number | null;
  verifiedSavingsMinor?: number | null;
  receiptId?: ID | null;
  commerceId?: ID | null;
  redemptionId?: ID | null;
  timezone?: string | null;
  expectedCollectionAt?: string | null;
  collectionWindowEndsAt?: string | null;
  expectedCompletionAt?: string | null;
  acceptedAt: string;
  fulfilledAt?: string | null;
  refundStates: string[];
  timeline?:
    | {
        id: ID;
        type: string;
        at: string;
        previousAt?: string | null;
        proposedAt?: string | null;
        reason?: string | null;
      }[]
    | null;
  lines?:
    | {
        id: ID;
        name: string;
        quantity: number;
        fulfilledQuantity?: number | null;
        unitPriceMinor?: number | null;
        subtotalMinor?: number | null;
        discountMinor?: number | null;
      }[]
    | null;
  version: number;
  canRequestCancellation: boolean;
  canRequestCollectionChange: boolean;
  canShowPickup?: boolean;
};

export type CustomerFulfillmentPayment = {
  paymentIntentId: ID;
  subscriptionId: ID;
  status: string;
  customerLabel: string;
  requiresReconciliation: boolean;
  verifiedCapture?: boolean;
};

export type CustomerFulfillmentSubmission = {
  fulfillment?: CustomerFulfillment | null;
  payment?: CustomerFulfillmentPayment | null;
};

export type CustomerEntitlementReservation = {
  itemType: "BENEFIT" | "OFFER";
  itemId: ID;
  fulfillmentId: ID;
  referenceNumber: string;
  quantity: number;
};

export type CustomerFulfillmentActivity = {
  orders: CustomerFulfillment[];
  reservations: CustomerEntitlementReservation[];
  itemStatuses: CustomerRedemptionItemStatus[];
  counterQrs?: ActiveCustomerCounterQr[];
};

export type ActiveCustomerCounterQr = {
  transactionId: ID;
  transactionNumber: string;
  expiresAt: string;
  items: { itemType: "BENEFIT" | "OFFER"; itemId: ID }[];
};

export class CustomerDataApi {
  fulfillmentActivity(
    organizationId: ID,
    subscriptionId: ID,
  ): Promise<ApiResult<CustomerFulfillmentActivity>> {
    return httpClient.get(
      `${base(organizationId)}/fulfillment/activity/${encodeURIComponent(subscriptionId)}`,
    );
  }
  fulfillmentStores(
    organizationId: ID,
    selection: CustomerFulfillmentSelection,
  ): Promise<ApiResult<CustomerFulfillmentStore[]>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/stores`,
      selection,
    );
  }

  createStoreRedemption(
    organizationId: ID,
    request: CustomerFulfillmentRequest,
  ): Promise<ApiResult<PendingRedemptionTransaction>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/counter-redemption`,
      request,
    );
  }

  counterQrSummary(
    organizationId: ID,
    selection: CustomerFulfillmentSelection,
    lookup?: { transactionId?: ID; paymentIntentId?: ID },
  ): Promise<ApiResult<{ redemption?: CounterQrSummary }>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/counter-redemption/lookup`,
      { selection, ...lookup },
    );
  }

  fulfillmentQuote(
    organizationId: ID,
    request: CustomerFulfillmentRequest,
  ): Promise<ApiResult<CustomerFulfillmentReview>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/quote`,
      request,
    );
  }

  submitFulfillment(
    organizationId: ID,
    request: CustomerFulfillmentRequest,
  ): Promise<ApiResult<CustomerFulfillmentSubmission>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/requests`,
      request,
    );
  }

  pendingFulfillmentPayment(
    organizationId: ID,
    subscriptionId: ID,
  ): Promise<ApiResult<CustomerFulfillmentSubmission>> {
    return httpClient.get(
      `${base(organizationId)}/fulfillment/payments?subscriptionId=${encodeURIComponent(subscriptionId)}`,
    );
  }

  reconcileFulfillmentPayment(
    organizationId: ID,
    intentId: ID,
  ): Promise<ApiResult<CustomerFulfillmentSubmission>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/payments/${encodeURIComponent(intentId)}/reconcile`,
      {},
    );
  }

  fulfillments(
    organizationId: ID,
    subscriptionId: ID | null,
    offset: number,
  ): Promise<ApiResult<CustomerFulfillment[]>> {
    const query = new URLSearchParams({ limit: "25", offset: String(offset) });
    if (subscriptionId) query.set("subscriptionId", subscriptionId);
    return httpClient.get(
      `${base(organizationId)}/fulfillment/requests?${query}`,
    );
  }

  fulfillment(
    organizationId: ID,
    id: ID,
  ): Promise<ApiResult<CustomerFulfillment>> {
    return httpClient.get(
      `${base(organizationId)}/fulfillment/requests/${encodeURIComponent(id)}`,
    );
  }

  requestFulfillmentChange(
    organizationId: ID,
    id: ID,
    request: { version: number; collectionLocalTime?: string },
  ): Promise<ApiResult<CustomerFulfillment>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/requests/${encodeURIComponent(id)}/change`,
      request,
    );
  }
  fulfillmentPickupCode(
    organizationId: ID,
    id: ID,
  ): Promise<ApiResult<{ code: string; expiresAt: string }>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/requests/${encodeURIComponent(id)}/pickup-code`,
      {},
    );
  }

  fulfillmentPickup(
    organizationId: ID,
    id: ID,
  ): Promise<ApiResult<{ reference: string; expiresAt: string }>> {
    return httpClient.post(
      `${base(organizationId)}/fulfillment/requests/${encodeURIComponent(id)}/pickup`,
      {},
    );
  }
  selfProfile(): Promise<ApiResult<CustomerSelfProfile>> {
    return httpClient.get("/api/v1/customer/profile");
  }
  saveSelfProfile(
    input: Pick<
      CustomerSelfProfile,
      "firstName" | "middleName" | "lastName" | "primaryEmail" | "versionNo"
    >,
  ): Promise<ApiResult<CustomerSelfProfile>> {
    return httpClient.put("/api/v1/customer/profile", input);
  }
  requestCurrentPhoneChange(input: {
    newPhone: string;
    regionCode?: string;
  }): Promise<ApiResult<CustomerOtpChallenge>> {
    return httpClient.post(
      "/api/v1/customer/profile/phone-change/current/request",
      input,
    );
  }
  verifyCurrentPhoneChange(input: {
    challengeId: string;
    otp: string;
    newPhone: string;
    regionCode?: string;
  }): Promise<ApiResult<CustomerOtpChallenge>> {
    return httpClient.post(
      "/api/v1/customer/profile/phone-change/current/verify",
      input,
    );
  }
  verifyCorporateCode(
    organizationId: ID,
    productId: ID,
    code: string,
  ): Promise<ApiResult<{ verified: boolean }>> {
    return httpClient.post(`${base(organizationId)}/corporate-access/verify`, {
      productId,
      code,
    });
  }
  confirmReplacementPhone(input: {
    challengeId: string;
    otp: string;
  }): Promise<ApiResult<CustomerSelfProfile>> {
    return httpClient.post(
      "/api/v1/customer/profile/phone-change/replacement/confirm",
      input,
    );
  }
  transactionHistory(
    organizationId?: ID,
    options: {
      status?: string;
      transactionType?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ApiResult<TransactionHistoryItem[]>> {
    const params = new URLSearchParams();
    if (organizationId) params.set("organizationId", organizationId);
    if (options.status) params.set("status", options.status);
    if (options.transactionType)
      params.set("transactionType", options.transactionType);
    if (options.search) params.set("search", options.search);
    params.set("limit", String(options.limit ?? 25));
    params.set("offset", String(options.offset ?? 0));
    return httpClient.get(`/api/v1/customer/transactions?${params.toString()}`);
  }
  transactions(
    organizationId: ID,
    limit = 25,
    offset = 0,
  ): Promise<ApiResult<TransactionReceipt[]>> {
    return httpClient.get(
      `${base(organizationId)}/transactions?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    );
  }
  subscriptionActualSavings(
    organizationId: ID,
    subscriptionId: ID,
  ): Promise<ApiResult<SubscriptionActualSavings[]>> {
    return httpClient.get(
      `${base(organizationId)}/subscriptions/${encodeURIComponent(subscriptionId)}/actual-savings`,
    );
  }
  businessActualSavings(
    organizationId: ID,
  ): Promise<ApiResult<BusinessActualSavings>> {
    return httpClient.get(`${base(organizationId)}/actual-savings`);
  }
  receipt(
    organizationId: ID,
    receiptId: ID,
  ): Promise<ApiResult<TransactionReceipt>> {
    return httpClient.get(
      `${base(organizationId)}/receipts/${encodeURIComponent(receiptId)}`,
    );
  }
  createRedemptionTransaction(
    organizationId: ID,
    request: CustomerRedemptionTransactionRequest,
  ): Promise<ApiResult<PendingRedemptionTransaction>> {
    return httpClient.post(
      `${base(organizationId)}/redemption-transactions`,
      request,
    );
  }
  issueRedemptionTransactionCode(
    organizationId: ID,
    transactionId: ID,
  ): Promise<ApiResult<{ code: string; expiresAt: string }>> {
    return httpClient.post(
      `${base(organizationId)}/redemption-transactions/${encodeURIComponent(transactionId)}/code`,
      {},
    );
  }
  issueRedemptionTransactionQr(
    organizationId: ID,
    transactionId: ID,
  ): Promise<ApiResult<RedemptionTransactionQr>> {
    return httpClient.post(
      `${base(organizationId)}/redemption-transactions/${encodeURIComponent(transactionId)}/qr`,
      {},
    );
  }
  issueMembershipPurchaseOfferQr(
    organizationId: ID,
    offerId: ID,
  ): Promise<ApiResult<CustomerMembershipPurchaseOfferQr>> {
    return httpClient.post(
      `${base(organizationId)}/membership-purchase-offers/${encodeURIComponent(offerId)}/qr`,
      {},
    );
  }
  redemptionProductChoices(
    organizationId: ID,
    subscriptionId: ID,
    itemType: "BENEFIT" | "OFFER",
    itemId: ID,
  ): Promise<ApiResult<RedemptionProductChoice[]>> {
    const query =
      `subscriptionId=${encodeURIComponent(subscriptionId)}` +
      `&itemType=${itemType}` +
      `&itemId=${encodeURIComponent(itemId)}`;
    return httpClient.get(
      `${base(organizationId)}/redemption-product-choices?${query}`,
    );
  }
  redemptionTransactionStatus(
    organizationId: ID,
    transactionId: ID,
  ): Promise<ApiResult<CustomerRedemptionTransactionStatus>> {
    return httpClient.get(
      `${base(organizationId)}/redemption-transactions/${encodeURIComponent(transactionId)}`,
    );
  }
  redemptionItemStatuses(
    organizationId: ID,
    subscriptionId: ID,
  ): Promise<ApiResult<CustomerRedemptionItemStatus[]>> {
    return httpClient.get(
      `${base(organizationId)}/subscriptions/${encodeURIComponent(subscriptionId)}/redemption-item-status`,
    );
  }
  discoverOrganizations(): Promise<
    ApiResult<CustomerDiscoverableOrganization[]>
  > {
    return httpClient.get("/api/v1/customer/discover/organizations");
  }
  discoverOrganizationDetail(
    organizationId: ID,
  ): Promise<ApiResult<CustomerDiscoveryDetail>> {
    return httpClient.get(
      `/api/v1/customer/discover/organizations/${encodeURIComponent(organizationId)}`,
    );
  }
  choices(): Promise<ApiResult<CustomerChoice[]>> {
    return httpClient.get("/api/v1/customer/dev/choices");
  }
  profiles(_userId?: ID): Promise<ApiResult<CustomerProfile[]>> {
    return httpClient.get(
      `/api/v1/customer/relationships?refresh=${Date.now()}`,
    );
  }
  homeBootstrap(): Promise<ApiResult<CustomerHomeBootstrap>> {
    return httpClient.get("/api/v1/customer/home/bootstrap");
  }
  membershipSummary(
    organizationId: ID,
  ): Promise<ApiResult<CustomerMembershipSummary>> {
    return httpClient.get(`${base(organizationId)}/membership-summary`);
  }
  purchase(
    organizationId: ID,
    input: {
      planId: ID;
      customerUserId?: ID;
      firstName?: string;
      lastName?: string;
      primaryEmail?: string;
      primaryPhone?: string;
    },
  ): Promise<ApiResult<CounterPurchaseResult>> {
    const { customerUserId: _customerUserId, ...request } = input;
    return httpClient.post(`${base(organizationId)}/purchases`, request);
  }
  startAuthenticatedPayment(
    organizationId: ID,
    planId: ID,
    idempotencyKey: string,
    productId?: ID,
    explicitOfferId?: ID,
  ): Promise<ApiResult<PaymentIntent>> {
    return httpClient.post(
      `${base(organizationId)}/purchases/payment/start-authenticated`,
      {
        planId,
        idempotencyKey,
        returnContext: productId ? { productId } : undefined,
        explicitOfferId,
      },
    );
  }

  activateFreeMembership(
    organizationId: ID,
    planId: ID,
    idempotencyKey: string,
    explicitOfferId?: ID,
  ): Promise<ApiResult<CounterPurchaseResult>> {
    return httpClient.post(`${base(organizationId)}/purchases/activate-free`, {
      planId,
      idempotencyKey,
      explicitOfferId,
    });
  }
  purchaseQuote(
    organizationId: ID,
    planId: ID,
    explicitOfferId?: ID,
  ): Promise<ApiResult<MembershipPurchaseQuote>> {
    return httpClient.get(
      `${base(organizationId)}/purchases/quote?planId=${encodeURIComponent(planId)}${explicitOfferId ? `&explicitOfferId=${encodeURIComponent(explicitOfferId)}` : ""}`,
    );
  }
  combinedOffers(
    organizationId: ID,
  ): Promise<ApiResult<CustomerCombinedOffer[]>> {
    return httpClient.get(`${base(organizationId)}/combined-offers`);
  }
  confirmTestPayment(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PaymentConfirmation>> {
    return httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/payments/${encodeURIComponent(paymentIntentId)}/test-result`,
      { status: "SUCCEEDED" },
    );
  }
  confirmMonerisPayment(
    organizationId: ID,
    paymentIntentId: ID,
    temporaryToken: string,
  ): Promise<ApiResult<PaymentConfirmation>> {
    return httpClient.post(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/payments/${encodeURIComponent(paymentIntentId)}/moneris/confirm`,
      { temporaryToken },
    );
  }
  collectBootstrap(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PoyntCollectBootstrap>> {
    return httpClient.get(
      `${collectPaymentPath(organizationId, paymentIntentId)}/poynt-collect/config`,
    );
  }
  createCollectBrowserCheckout(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PoyntCollectCheckoutSession>> {
    return httpClient.post(
      `${collectPaymentPath(organizationId, paymentIntentId)}/poynt-collect/checkout-session`,
      {},
    );
  }
  async confirmCollectPayment(
    organizationId: ID,
    paymentIntentId: ID,
    nonce: string,
    method: PoyntCollectPaymentMethod = "card",
  ): Promise<ApiResult<PaymentConfirmation>> {
    // W39 TEMPORARY TEST — local development only.
    // Options: "delay", "lost", "off"
    const w39Mode = (process.env.EXPO_PUBLIC_W39_TEST_MODE ?? "off") as
      | "delay"
      | "lost"
      | "off";
    const isLocalWebTest =
      __DEV__ &&
      typeof window !== "undefined" &&
      typeof window.location !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const response = await httpClient.post<
      { nonce: string; method: PoyntCollectPaymentMethod },
      PaymentConfirmation
    >(
      `${collectPaymentPath(organizationId, paymentIntentId)}/poynt-collect/confirm`,
      { nonce, method },
    );
    if (isLocalWebTest && w39Mode !== "off" && response.success) {
      console.log("[W39] Successful API response. Delaying 45 seconds.");
      await new Promise<void>((resolve) => setTimeout(resolve, 45_000));
      if (w39Mode === "lost") {
        console.log("[W39] Simulating lost response.");
        throw new Error("W39 simulated confirmation response timeout");
      }
    }
    return response;
  }
  /** Non-charging recovery action; the server can verify and finalize an existing intent. */
  reconcileCollectPayment(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PoyntCollectRecovery>> {
    return httpClient.post<Record<string, never>, PoyntCollectRecovery>(
      `${collectPaymentPath(organizationId, paymentIntentId)}/reconcile`,
      {},
    );
  }
  /** Read-only lookup. The backend verifies payment ownership. */
  collectFinancialException(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PoyntCollectFinancialException | null>> {
    return httpClient.get(
      `${collectPaymentPath(organizationId, paymentIntentId)}/financial-exception`,
    );
  }
  paymentStatus(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PaymentConfirmation>> {
    return httpClient.get(collectPaymentPath(organizationId, paymentIntentId));
  }
  cancelPayment(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PaymentIntent>> {
    return httpClient.post(
      `${collectPaymentPath(organizationId, paymentIntentId)}/cancel`,
      {},
    );
  }
  preference(
    organizationId: ID,
    userId: ID,
    code: string,
  ): Promise<ApiResult<{ value: string | null }>> {
    return httpClient.get(
      `${base(organizationId)}/preferences/${encodeURIComponent(code)}`,
    );
  }
  setPreference(
    organizationId: ID,
    userId: ID,
    code: string,
    value: string,
  ): Promise<ApiResult<{ value: string }>> {
    return httpClient.put(
      `${base(organizationId)}/preferences/${encodeURIComponent(code)}`,
      { value },
    );
  }
  async subscriptions(
    organizationId: ID,
    userId: ID,
  ): Promise<ApiResult<CounterSubscription[]>> {
    const result = await httpClient.get<CounterSubscription[]>(
      `${base(organizationId)}/subscriptions`,
    );
    if (!result.success) return result;
    return apiSuccess(
      await Promise.all(
        result.data.map(async (row) => ({
          ...row,
          subscriptionStatusId: await entityStatusApi.resolveStatusId(
            row.subscriptionStatusId,
          ),
        })),
      ),
    );
  }
  async redemptions(
    organizationId: ID,
    userId: ID,
  ): Promise<ApiResult<OrgAdminRedemption[]>> {
    const result = await httpClient.get<OrgAdminRedemption[]>(
      `${base(organizationId)}/history/redemptions`,
    );
    if (!result.success) return result;
    return apiSuccess(
      await Promise.all(
        result.data.map(async (row) => ({
          ...row,
          redemptionStatusId: await entityStatusApi.resolveStatusId(
            row.redemptionStatusId,
          ),
        })),
      ),
    );
  }
  membershipProducts(
    organizationId: ID,
    userId?: ID,
  ): Promise<ApiResult<MembershipProduct[]>> {
    return new MembershipProductApi().listForCustomer(organizationId, userId);
  }
  benefits(organizationId: ID, userId?: ID): Promise<ApiResult<Benefit[]>> {
    return new BenefitApi().listForCustomer(organizationId, userId);
  }
  async benefitRules(
    organizationId: ID,
    userId: ID,
    benefitId: ID,
  ): Promise<BenefitUsageRule[]> {
    return new BenefitApi().rulesForCustomer(organizationId, userId, benefitId);
  }
  offers(organizationId: ID, userId: ID): Promise<ApiResult<Offer[]>> {
    return new OfferApi().listForCustomer(organizationId, userId);
  }
  stores(organizationId: ID, userId: ID): Promise<ApiResult<Store[]>> {
    return new StoreApi().listForCustomer(organizationId, userId);
  }
}
/** Browser-only cookie session API used by the native Poynt Collect hand-off. */
export const poyntCollectBrowserApi = {
  redeem(session: string): Promise<PoyntCollectBrowserCheckout> {
    return browserCheckoutRequest(
      "/api/v1/poynt-collect/checkout/redeem",
      "POST",
      { session },
    );
  },
  bootstrap(): Promise<PoyntCollectBootstrap> {
    return browserCheckoutRequest(
      "/api/v1/poynt-collect/checkout/bootstrap",
      "GET",
    );
  },
  status(): Promise<PaymentConfirmation> {
    return browserCheckoutRequest(
      "/api/v1/poynt-collect/checkout/status",
      "GET",
      undefined,
      undefined,
      PAYMENT_STATUS_TIMEOUT_MS,
    );
  },
  confirm(
    nonce: string,
    csrfToken: string,
    method: PoyntCollectPaymentMethod = "card",
  ): Promise<PaymentConfirmation> {
    return browserCheckoutRequest(
      "/api/v1/poynt-collect/checkout/confirm",
      "POST",
      { nonce, method },
      csrfToken,
      PAYMENT_CONFIRM_TIMEOUT_MS,
    );
  },
};
