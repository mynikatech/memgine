import type { ID } from "../domain/common";
import {
  CounterApi,
  type CounterContext,
  type CounterPurchase,
  type CounterRedemptionTransaction,
  type CounterRedemptionSelection,
} from "@/src/data/api/counter-api";
import type {
  MembershipPurchaseQuote,
  CounterRedemptionCheckout,
} from "@/src/data/api/counter-api";

export class CounterService {
  constructor(private readonly api: CounterApi) {}

  private unwrap<T>(
    result:
      | { success: true; data: T }
      | { success: false; error: { message: string } },
  ): T {
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  customers(ctx: CounterContext) {
    return this.api.customers(ctx).then((result) => this.unwrap(result));
  }

  subscriptions(ctx: CounterContext) {
    return this.api.subscriptions(ctx).then((result) => this.unwrap(result));
  }

  redemptions(ctx: CounterContext) {
    return this.api.redemptions(ctx).then((result) => this.unwrap(result));
  }

  qrSamples(ctx: CounterContext) {
    return this.api.qrSamples(ctx).then((result) => this.unwrap(result));
  }

  staffName(ctx: CounterContext) {
    return this.api.staffName(ctx).then((result) => this.unwrap(result));
  }

  eligibility(ctx: CounterContext, subscriptionId: ID, benefitIds: ID[]) {
    return this.api
      .eligibility(ctx, subscriptionId, benefitIds)
      .then((result) => this.unwrap(result));
  }

  purchase(
    ctx: CounterContext,
    request: Omit<CounterPurchase, "storeId" | "staffId">,
  ) {
    return this.api
      .purchase(ctx, request)
      .then((result) => this.unwrap(result));
  }

  purchaseQuote(
    ctx: CounterContext,
    planId: ID,
    customerUserId?: ID,
    explicitOfferId?: ID,
  ): Promise<MembershipPurchaseQuote> {
    return this.api
      .purchaseQuote(ctx, planId, customerUserId, explicitOfferId)
      .then((result) => this.unwrap(result));
  }

  resolveMembershipPurchaseOfferQr(ctx: CounterContext, token: string) {
    return this.api
      .resolveMembershipPurchaseOfferQr(ctx, token)
      .then((result) => this.unwrap(result));
  }

  subscriptionBenefits(ctx: CounterContext, subscriptionId: ID) {
    return this.api
      .subscriptionBenefits(ctx, subscriptionId)
      .then((result) => this.unwrap(result));
  }

  redemptionSelection(
    ctx: CounterContext,
    subscriptionId: ID,
    customerUserId: ID,
  ): Promise<CounterRedemptionSelection> {
    return this.api
      .redemptionSelection(ctx, subscriptionId, customerUserId)
      .then((result) => this.unwrap(result));
  }

  createRedemptionTransaction(
    ctx: CounterContext,
    subscriptionId: ID,
    benefitIds: ID[],
    offerIds: ID[],
    redemptionMethod: string,
  ): Promise<CounterRedemptionTransaction> {
    return this.api
      .createRedemptionTransaction(
        ctx,
        subscriptionId,
        benefitIds,
        offerIds,
        redemptionMethod,
      )
      .then((result) => this.unwrap(result));
  }

  prepareRedemptionCheckout(
    ctx: CounterContext,
    transactionId: ID,
  ): Promise<CounterRedemptionCheckout> {
    return this.api
      .prepareRedemptionCheckout(ctx, transactionId)
      .then((result) => this.unwrap(result));
  }

  redemptionCheckout(
    ctx: CounterContext,
    transactionId: ID,
  ): Promise<CounterRedemptionCheckout> {
    return this.api
      .redemptionCheckout(ctx, transactionId)
      .then((result) => this.unwrap(result));
  }

  startRedemptionRemoteTerminalPayment(ctx: CounterContext, transactionId: ID) {
    return this.api
      .startRedemptionRemoteTerminalPayment(ctx, transactionId)
      .then((result) => this.unwrap(result));
  }

  confirmRedemptionTestPayment(
    ctx: CounterContext,
    transactionId: ID,
    status: "SUCCEEDED" | "FAILED" | "CANCELLED" = "SUCCEEDED",
  ): Promise<CounterRedemptionCheckout> {
    return this.api
      .confirmRedemptionTestPayment(ctx, transactionId, status)
      .then((result) => this.unwrap(result));
  }

  requestPurchaseOtp(
    ctx: CounterContext,
    phone: string,
    purchase: Omit<CounterPurchase, "storeId" | "staffId">,
    regionCode?: string,
    counterPurchaseId?: ID,
  ) {
    return this.api
      .requestPurchaseOtp(ctx, phone, purchase, regionCode, counterPurchaseId)
      .then((result) => this.unwrap(result));
  }

  verifyPurchaseOtp(ctx: CounterContext, challengeId: string, otp: string) {
    return this.api
      .verifyPurchaseOtp(ctx, challengeId, otp)
      .then((result) => this.unwrap(result));
  }

  finalizePurchaseOtp(ctx: CounterContext, challengeId: string) {
    return this.api
      .finalizePurchaseOtp(ctx, challengeId)
      .then((result) => this.unwrap(result));
  }

  startPurchasePayment(
    ctx: CounterContext,
    challengeId: string,
    idempotencyKey: string,
    productId?: ID,
    explicitOfferId?: ID,
  ) {
    return this.api
      .startPurchasePayment(
        ctx,
        challengeId,
        idempotencyKey,
        productId,
        explicitOfferId,
      )
      .then((result) => this.unwrap(result));
  }

  startRemoteTerminalPayment(ctx: CounterContext, commerceTransactionId: ID) {
    return this.api
      .startRemoteTerminalPayment(ctx, commerceTransactionId)
      .then((result) => this.unwrap(result));
  }

  payment(organizationId: ID, paymentIntentId: ID) {
    return this.api
      .payment(organizationId, paymentIntentId)
      .then((result) => this.unwrap(result));
  }

  startCashPayment(
    ctx: CounterContext,
    challengeId: string,
    idempotencyKey: string,
    explicitOfferId?: ID,
  ) {
    return this.api
      .startCashPayment(ctx, challengeId, idempotencyKey, explicitOfferId)
      .then((result) => this.unwrap(result));
  }

  confirmCashPayment(ctx: CounterContext, paymentIntentId: ID) {
    return this.api
      .confirmCashPayment(ctx, paymentIntentId)
      .then((result) => this.unwrap(result));
  }

  confirmTestPayment(organizationId: ID, paymentIntentId: ID) {
    return this.api
      .confirmTestPayment(organizationId, paymentIntentId)
      .then((result) => this.unwrap(result));
  }

  confirmMonerisPayment(
    organizationId: ID,
    paymentIntentId: ID,
    temporaryToken: string,
  ) {
    return this.api
      .confirmMonerisPayment(organizationId, paymentIntentId, temporaryToken)
      .then((result) => this.unwrap(result));
  }

  redeem(ctx: CounterContext, subscriptionId: ID, benefitIds: ID[]) {
    return this.api
      .redeem(ctx, subscriptionId, benefitIds)
      .then((result) => this.unwrap(result));
  }

  requestRedemptionOtp(
    ctx: CounterContext,
    phone: string,
    subscriptionId: ID,
    benefitIds: ID[],
    offerIds: ID[],
    regionCode?: string,
  ) {
    return this.api
      .requestRedemptionOtp(
        ctx,
        phone,
        subscriptionId,
        benefitIds,
        offerIds,
        regionCode,
      )
      .then((result) => this.unwrap(result));
  }

  completeRedemptionOtp(
    ctx: CounterContext,
    challengeId: string,
    otp: string,
  ): Promise<CounterRedemptionTransaction> {
    return this.api
      .completeRedemptionOtp(ctx, challengeId, otp)
      .then((result) => this.unwrap(result));
  }

  redeemQr(ctx: CounterContext, token: string) {
    return this.api.redeemQr(ctx, token).then((result) => this.unwrap(result));
  }

  resolveRedemptionTransactionQr(ctx: CounterContext, qrReference: string) {
    return this.api
      .resolveRedemptionTransactionQr(ctx, qrReference)
      .then((result) => this.unwrap(result));
  }

  validateRedemptionTransaction(ctx: CounterContext, transactionId: string) {
    return this.api
      .validateRedemptionTransaction(ctx, transactionId)
      .then((result) => this.unwrap(result));
  }

  executeRedemptionTransaction(
    ctx: CounterContext,
    transactionId: string,
  ): Promise<CounterRedemptionTransaction> {
    return this.api
      .executeRedemptionTransaction(ctx, transactionId)
      .then((result) => this.unwrap(result));
  }
}
