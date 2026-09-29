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
import type { MembershipPurchaseQuote, PaymentConfirmation, PaymentIntent } from "./counter-api";
import type { OrgAdminRedemption } from "./org-admin-transaction-api";
import type { CustomerChoice, CustomerProfile } from "@/src/core/services/customer-data-service";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiSuccess, type ApiResult } from "./result";
import { MembershipProductApi } from "./membership-product-api";
import { BenefitApi } from "./benefit-api";
import { OfferApi } from "./offer-api";
import { StoreApi } from "./store-api";

const base = (organizationId: ID) =>
  `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}`;

export type CustomerDiscoverableOrganization = {
  organizationId: ID;
  name: string;
  displayName?: string | null;
  logoUrl?: string | null;
  tagline?: string | null;
};

export type CustomerDiscoveryDetail = {
  organization: Pick<
    Organization,
    "id" | "name" | "displayName" | "website" | "primaryEmail" | "primaryPhone"
  >;
  publishedExperience: {
    configuration: BusinessConfiguration;
    template: Pick<TemplateDefinition, "id" | "sections" | "supportedCardStyles">;
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
    return httpClient.post(`${base(organizationId)}/redemption-transactions`, request);
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
  discoverOrganizations(): Promise<ApiResult<CustomerDiscoverableOrganization[]>> {
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
    return httpClient.get("/api/v1/customer/relationships");
  }

  purchase(organizationId: ID, input: {
    planId: ID; customerUserId?: ID; firstName?: string; lastName?: string;
    primaryEmail?: string; primaryPhone?: string;
  }): Promise<ApiResult<CounterPurchaseResult>> {
    const { customerUserId: _customerUserId, ...request } = input;
    return httpClient.post(
      `${base(organizationId)}/purchases`, request,
    );
  }

  startAuthenticatedPayment(
    organizationId: ID,
    planId: ID,
    idempotencyKey: string,
    productId?: ID,
  ): Promise<ApiResult<PaymentIntent>> {
    return httpClient.post(`${base(organizationId)}/purchases/payment/start-authenticated`, {
      planId,
      idempotencyKey,
      returnContext: productId ? { productId } : undefined,
    });
  }

  purchaseQuote(
    organizationId: ID,
    planId: ID,
  ): Promise<ApiResult<MembershipPurchaseQuote>> {
    return httpClient.get(
      `${base(organizationId)}/purchases/quote?planId=${encodeURIComponent(planId)}`,
    );
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

  preference(organizationId: ID, userId: ID, code: string): Promise<ApiResult<{ value: string | null }>> {
    return httpClient.get(
      `${base(organizationId)}/preferences/${encodeURIComponent(code)}`,
    );
  }

  setPreference(organizationId: ID, userId: ID, code: string, value: string): Promise<ApiResult<{ value: string }>> {
    return httpClient.put(
      `${base(organizationId)}/preferences/${encodeURIComponent(code)}`,
      { value },
    );
  }

  async subscriptions(organizationId: ID, userId: ID): Promise<ApiResult<CounterSubscription[]>> {
    const result = await httpClient.get<CounterSubscription[]>(
      `${base(organizationId)}/subscriptions`,
    );
    if (!result.success) return result;
    return apiSuccess(await Promise.all(result.data.map(async (row) => ({
      ...row,
      subscriptionStatusId: await entityStatusApi.resolveStatusId(row.subscriptionStatusId),
    }))));
  }

  async redemptions(organizationId: ID, userId: ID): Promise<ApiResult<OrgAdminRedemption[]>> {
    const result = await httpClient.get<OrgAdminRedemption[]>(
      `${base(organizationId)}/history/redemptions`,
    );
    if (!result.success) return result;
    return apiSuccess(await Promise.all(result.data.map(async (row) => ({
      ...row, redemptionStatusId: await entityStatusApi.resolveStatusId(row.redemptionStatusId),
    }))));
  }

  membershipProducts(organizationId: ID, userId?: ID): Promise<ApiResult<MembershipProduct[]>> {
    return new MembershipProductApi().listForCustomer(organizationId, userId);
  }

  benefits(organizationId: ID, userId?: ID): Promise<ApiResult<Benefit[]>> {
    return new BenefitApi().listForCustomer(organizationId, userId);
  }

  async benefitRules(organizationId: ID, userId: ID, benefitId: ID): Promise<BenefitUsageRule[]> {
    return new BenefitApi().rulesForCustomer(organizationId, userId, benefitId);
  }

  offers(organizationId: ID, userId: ID): Promise<ApiResult<Offer[]>> {
    return new OfferApi().listForCustomer(organizationId, userId);
  }

  stores(organizationId: ID, userId: ID): Promise<ApiResult<Store[]>> {
    return new StoreApi().listForCustomer(organizationId, userId);
  }
}
