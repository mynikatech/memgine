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
      error?: { message?: string };
    } | null;
    if (!response.ok || !payload?.success || payload.data == null) {
      throw new Error(
        payload?.error?.message ?? "Secure checkout is unavailable.",
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
export class CustomerDataApi {
  createRedemptionTransaction(
    organizationId: ID,
    request: CustomerRedemptionTransactionRequest,
  ): Promise<ApiResult<PendingRedemptionTransaction>> {
    return httpClient.post(
      `${base(organizationId)}/redemption-transactions`,
      request,
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
