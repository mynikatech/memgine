import type { Benefit, ID } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";
import type { OrgAdminCustomer } from "./org-admin-customer-api";
import type {
  OrgAdminRedemption,
  OrgAdminSubscription,
} from "./org-admin-transaction-api";

export type CounterContext = {
  organizationId: ID;
  storeId: ID;
  staffId: ID;
};

export type CounterSubscription = OrgAdminSubscription & {
  userId: ID;
  subscriptionPlanId: ID;
  membershipProductId: ID;
};

export type CounterPurchase = {
  storeId: ID;
  staffId: ID;
  planId: ID;
  customerUserId?: ID;
  firstName?: string;
  lastName?: string;
  primaryEmail?: string;
  primaryPhone?: string;
};

export type CounterPurchaseResult = {
  subscriptionId: ID;
  organizationUserId: ID;
  userId: ID;
  subscriptionNumber: string;
  subscriptionPlanId: ID;
  subscriptionDate: string;
  startDate: string;
  endDate: string;
  subscriptionStatusId: ID;
  totalAmount: number;
  currencyCode: string;
};

export type PaymentIntent = {
  paymentIntentId: ID;
  providerCode: string;
  status: string;
  amount: number;
  currencyCode: string;
  providerReferenceId?: string | null;
  finalizedSubscriptionId?: ID | null;
  checkoutUrl?: string | null;
  monerisHostedTokenizationProfileId?: string | null;
  monerisHostedTokenizationUrl?: string | null;
  commerceTransactionId?: ID | null;
};

export type PaymentConfirmation = {
  payment: PaymentIntent;
  subscription?: CounterPurchaseResult | null;
};

export type MembershipPurchaseQuote = {
  planId: ID;
  membershipProductId?: ID;
  subtotalAmount: number;
  appliedOfferId?: ID | null;
  adjustmentType?: string | null;
  discountAmount?: number;
  netSubtotalAmount?: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currencyCode: string;
  taxCode?: string | null;
  taxName?: string | null;
};

export type CounterMembershipOfferQr = {
  offerId: ID;
  displayName: string;
};

export type CounterRedemption = {
  redemptionId: ID;
  benefitId: ID;
  redemptionNumber: string;
};

export type CounterRedemptionTransaction = {
  transactionId: ID;
  transactionNumber: string;
  status: string;
  expiresAt?: string | null;
  completedAt?: string | null;
};

export type CounterRedemptionTransactionValidation = {
  itemId: ID;
  itemType: "BENEFIT" | "OFFER" | string;
  benefitId?: ID | null;
  offerId?: ID | null;
  displayName?: string | null;
  description?: string | null;
  eligible: boolean;
  rejectionReason?: string | null;
};

export type CounterRedemptionSelectionItem = {
  id: ID;
  itemType: "BENEFIT" | "OFFER" | string;
  displayName: string;
  description?: string | null;
  status: string;
  displayReason?: string | null;
  badgeText?: string | null;
  discountPercentage?: number | null;
  promotionImageUrl?: string | null;
  disclaimerText?: string | null;
};

export type CounterRedemptionSelection = {
  benefits: CounterRedemptionSelectionItem[];
  offers: CounterRedemptionSelectionItem[];
};

export type CounterEligibility = {
  benefitId: ID;
  reason?: string | null;
};

export type CounterQr = {
  token: string;
  qrCodeTypeId: string;
  subscriptionId: ID;
  customerUserId: ID;
  customerName: string;
};

export type CounterOtpChallenge = {
  challengeId: string;
  destination?: string;
  expiresAt: string;
  resendAt: string;
  devCode?: string | null;
};

export type CounterPurchaseOtpChallenge = CounterOtpChallenge & {
  counterPurchaseId: ID;
};

export class CounterApi {
  private path(ctx: CounterContext, suffix: string) {
    return `/api/v1/organizations/${encodeURIComponent(ctx.organizationId)}/counter/${suffix}`;
  }

  private query(ctx: CounterContext, suffix: string) {
    return `${this.path(ctx, suffix)}?storeId=${encodeURIComponent(ctx.storeId)}&staffId=${encodeURIComponent(ctx.staffId)}`;
  }

  async customers(ctx: CounterContext): Promise<ApiResult<OrgAdminCustomer[]>> {
    try {
      const result = await httpClient.get<OrgAdminCustomer[]>(
        this.query(ctx, "customers"),
      );
      if (!result.success) return result;
      return apiSuccess(
        await Promise.all(
          result.data.map(async (row) => ({
            ...row,
            userStatusId: await entityStatusApi.resolveStatusId(
              row.userStatusId,
            ),
            organizationUserStatusId: await entityStatusApi.resolveStatusId(
              row.organizationUserStatusId,
            ),
          })),
        ),
      );
    } catch (error) {
      return apiFailure(
        "COUNTER_CUSTOMERS_FAILED",
        error instanceof Error ? error.message : "Unable to load customers",
      );
    }
  }

  async subscriptions(
    ctx: CounterContext,
  ): Promise<ApiResult<CounterSubscription[]>> {
    try {
      const result = await httpClient.get<CounterSubscription[]>(
        this.query(ctx, "subscriptions"),
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
    } catch (error) {
      return apiFailure(
        "COUNTER_SUBSCRIPTIONS_FAILED",
        error instanceof Error ? error.message : "Unable to load subscriptions",
      );
    }
  }

  subscriptionBenefits(
    ctx: CounterContext,
    subscriptionId: ID,
  ): Promise<ApiResult<Benefit[]>> {
    return httpClient.get<Benefit[]>(
      `${this.path(
        ctx,
        `subscriptions/${encodeURIComponent(subscriptionId)}/benefits`,
      )}?storeId=${encodeURIComponent(ctx.storeId)}&staffId=${encodeURIComponent(
        ctx.staffId,
      )}`,
    );
  }

  redemptionSelection(
    ctx: CounterContext,
    subscriptionId: ID,
    customerUserId: ID,
  ): Promise<ApiResult<CounterRedemptionSelection>> {
    return httpClient.get(
      `${this.path(ctx, `subscriptions/${encodeURIComponent(subscriptionId)}/redemption-selection`)}?storeId=${encodeURIComponent(ctx.storeId)}&staffId=${encodeURIComponent(ctx.staffId)}&customerUserId=${encodeURIComponent(customerUserId)}`,
    );
  }

  createRedemptionTransaction(
    ctx: CounterContext,
    subscriptionId: ID,
    benefitIds: ID[],
    offerIds: ID[],
    redemptionMethod: string,
  ): Promise<ApiResult<CounterRedemptionTransaction>> {
    return httpClient.post(this.path(ctx, "redemption-transactions"), {
      storeId: ctx.storeId,
      staffId: ctx.staffId,
      subscriptionId,
      benefitIds,
      offerIds,
      redemptionMethod,
    });
  }

  async redemptions(
    ctx: CounterContext,
  ): Promise<ApiResult<OrgAdminRedemption[]>> {
    try {
      const result = await httpClient.get<OrgAdminRedemption[]>(
        this.query(ctx, "redemptions"),
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
    } catch (error) {
      return apiFailure(
        "COUNTER_REDEMPTIONS_FAILED",
        error instanceof Error ? error.message : "Unable to load redemptions",
      );
    }
  }

  qrSamples(ctx: CounterContext): Promise<ApiResult<CounterQr[]>> {
    return httpClient.get(this.query(ctx, "qr-samples"));
  }

  staffName(ctx: CounterContext): Promise<ApiResult<string | null>> {
    return httpClient.get(this.query(ctx, "staff-name"));
  }

  eligibility(
    ctx: CounterContext,
    subscriptionId: ID,
    benefitIds: ID[],
  ): Promise<ApiResult<CounterEligibility[]>> {
    return httpClient.post(this.path(ctx, "eligibility"), {
      storeId: ctx.storeId,
      staffId: ctx.staffId,
      subscriptionId,
      benefitIds,
    });
  }

  // Kept only for compatibility; the backend deliberately rejects direct Counter purchases.
  purchase(
    ctx: CounterContext,
    request: Omit<CounterPurchase, "storeId" | "staffId">,
  ): Promise<ApiResult<CounterPurchaseResult>> {
    return httpClient.post(this.path(ctx, "purchases"), {
      ...request,
      storeId: ctx.storeId,
      staffId: ctx.staffId,
    });
  }

  purchaseQuote(
    ctx: CounterContext,
    planId: ID,
    customerUserId?: ID,
    explicitOfferId?: ID,
  ): Promise<ApiResult<MembershipPurchaseQuote>> {
    return httpClient.get(
      `${this.query(ctx, "purchases/quote")}&planId=${encodeURIComponent(planId)}${customerUserId ? `&customerUserId=${encodeURIComponent(customerUserId)}` : ""}${explicitOfferId ? `&explicitOfferId=${encodeURIComponent(explicitOfferId)}` : ""}`,
    );
  }

  resolveMembershipPurchaseOfferQr(
    ctx: CounterContext,
    token: string,
  ): Promise<ApiResult<CounterMembershipOfferQr>> {
    return httpClient.post(this.query(ctx, "purchases/offers/qr/resolve"), {
      token,
    });
  }

  requestPurchaseOtp(
    ctx: CounterContext,
    phone: string,
    purchase: Omit<CounterPurchase, "storeId" | "staffId">,
    regionCode?: string,
    counterPurchaseId?: ID,
  ): Promise<ApiResult<CounterPurchaseOtpChallenge>> {
    return httpClient.post(this.path(ctx, "purchases/otp/request"), {
      phone,
      regionCode,
      counterPurchaseId,
      purchase: {
        ...purchase,
        storeId: ctx.storeId,
        staffId: ctx.staffId,
      },
    });
  }

  verifyPurchaseOtp(
    ctx: CounterContext,
    challengeId: string,
    otp: string,
  ): Promise<ApiResult<boolean>> {
    return httpClient.post(this.path(ctx, "purchases/otp/complete"), {
      challengeId,
      otp,
    });
  }

  finalizePurchaseOtp(
    ctx: CounterContext,
    challengeId: string,
  ): Promise<ApiResult<CounterPurchaseResult>> {
    return httpClient.post(this.path(ctx, "purchases/otp/finalize"), {
      challengeId,
    });
  }

  startPurchasePayment(
    ctx: CounterContext,
    challengeId: string,
    idempotencyKey: string,
    productId?: ID,
    explicitOfferId?: ID,
  ): Promise<ApiResult<PaymentIntent>> {
    return httpClient.post(this.path(ctx, "purchases/payment/start"), {
      challengeId,
      idempotencyKey,
      explicitOfferId,
      returnContext: productId ? { productId } : undefined,
    });
  }

  startRemoteTerminalPayment(
    ctx: CounterContext,
    commerceTransactionId: ID,
  ): Promise<
    ApiResult<{
      commerceTransactionId: ID;
      referenceId: string;
      status: string;
    }>
  > {
    return httpClient.post(
      this.path(ctx, "purchases/payment/remote-terminal/start"),
      {
        commerceTransactionId,
      },
    );
  }

  payment(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<ApiResult<PaymentConfirmation>> {
    return httpClient.get(
      `/api/v1/organizations/${encodeURIComponent(organizationId)}/payments/${encodeURIComponent(paymentIntentId)}`,
    );
  }

  startCashPayment(
    ctx: CounterContext,
    challengeId: string,
    idempotencyKey: string,
    explicitOfferId?: ID,
  ): Promise<ApiResult<PaymentIntent>> {
    return httpClient.post(this.path(ctx, "purchases/payment/cash/start"), {
      challengeId,
      idempotencyKey,
      explicitOfferId,
    });
  }

  confirmCashPayment(
    ctx: CounterContext,
    paymentIntentId: ID,
  ): Promise<ApiResult<PaymentConfirmation>> {
    return httpClient.post(this.path(ctx, "purchases/payment/cash/confirm"), {
      paymentIntentId,
    });
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

  // Kept only for compatibility; the backend deliberately rejects direct manual redemptions.
  redeem(
    ctx: CounterContext,
    subscriptionId: ID,
    benefitIds: ID[],
  ): Promise<ApiResult<CounterRedemption[]>> {
    return httpClient.post(this.path(ctx, "redemptions"), {
      storeId: ctx.storeId,
      staffId: ctx.staffId,
      subscriptionId,
      benefitIds,
    });
  }

  requestRedemptionOtp(
    ctx: CounterContext,
    phone: string,
    subscriptionId: ID,
    benefitIds: ID[],
    offerIds: ID[],
    regionCode?: string,
  ): Promise<ApiResult<CounterOtpChallenge>> {
    return httpClient.post(this.path(ctx, "redemptions/otp/request"), {
      phone,
      regionCode,
      redemption: {
        storeId: ctx.storeId,
        staffId: ctx.staffId,
        subscriptionId,
        benefitIds,
        offerIds,
      },
    });
  }

  completeRedemptionOtp(
    ctx: CounterContext,
    challengeId: string,
    otp: string,
  ): Promise<ApiResult<CounterRedemptionTransaction>> {
    return httpClient.post(this.path(ctx, "redemptions/otp/complete"), {
      challengeId,
      otp,
    });
  }

  redeemQr(
    ctx: CounterContext,
    token: string,
  ): Promise<ApiResult<CounterRedemption[]>> {
    return httpClient.post(this.path(ctx, "qr-redemptions"), {
      storeId: ctx.storeId,
      staffId: ctx.staffId,
      token,
    });
  }

  resolveRedemptionTransactionQr(
    ctx: CounterContext,
    qrReference: string,
  ): Promise<ApiResult<CounterRedemptionTransaction>> {
    return httpClient.post(
      this.query(ctx, `redemption-qr/${encodeURIComponent(qrReference)}`),
      {},
    );
  }

  validateRedemptionTransaction(
    ctx: CounterContext,
    transactionId: ID,
  ): Promise<ApiResult<CounterRedemptionTransactionValidation[]>> {
    return httpClient.get(
      this.query(
        ctx,
        `redemption-transactions/${encodeURIComponent(transactionId)}/validation`,
      ),
    );
  }

  executeRedemptionTransaction(
    ctx: CounterContext,
    transactionId: ID,
  ): Promise<ApiResult<CounterRedemptionTransaction>> {
    return httpClient.post(
      this.path(
        ctx,
        `redemption-transactions/${encodeURIComponent(transactionId)}/execute`,
      ),
      { storeId: ctx.storeId, staffId: ctx.staffId },
    );
  }
}
