import type { ID } from "../domain/common";
import {
  CounterApi,
  type CounterContext,
  type CounterPurchase,
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

  subscriptionBenefits(ctx: CounterContext, subscriptionId: ID) {
    return this.api
      .subscriptionBenefits(ctx, subscriptionId)
      .then((result) => this.unwrap(result));
  }

  requestPurchaseOtp(
    ctx: CounterContext,
    phone: string,
    purchase: Omit<CounterPurchase, "storeId" | "staffId">,
    regionCode?: string,
  ) {
    return this.api
      .requestPurchaseOtp(ctx, phone, purchase, regionCode)
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

  startPurchasePayment(ctx: CounterContext, challengeId: string, idempotencyKey: string, productId?: ID) {
    return this.api.startPurchasePayment(ctx, challengeId, idempotencyKey, productId)
      .then((result) => this.unwrap(result));
  }

  payment(organizationId: ID, paymentIntentId: ID) {
    return this.api.payment(organizationId, paymentIntentId)
      .then((result) => this.unwrap(result));
  }

  startCashPayment(ctx: CounterContext, challengeId: string, idempotencyKey: string) {
    return this.api.startCashPayment(ctx, challengeId, idempotencyKey)
      .then((result) => this.unwrap(result));
  }

  confirmCashPayment(ctx: CounterContext, paymentIntentId: ID) {
    return this.api.confirmCashPayment(ctx, paymentIntentId)
      .then((result) => this.unwrap(result));
  }

  confirmTestPayment(organizationId: ID, paymentIntentId: ID) {
    return this.api.confirmTestPayment(organizationId, paymentIntentId)
      .then((result) => this.unwrap(result));
  }

  confirmMonerisPayment(organizationId: ID, paymentIntentId: ID, temporaryToken: string) {
    return this.api.confirmMonerisPayment(organizationId, paymentIntentId, temporaryToken)
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
    regionCode?: string,
  ) {
    return this.api
      .requestRedemptionOtp(ctx, phone, subscriptionId, benefitIds, regionCode)
      .then((result) => this.unwrap(result));
  }

  completeRedemptionOtp(ctx: CounterContext, challengeId: string, otp: string) {
    return this.api
      .completeRedemptionOtp(ctx, challengeId, otp)
      .then((result) => this.unwrap(result));
  }

  redeemQr(ctx: CounterContext, token: string) {
    return this.api.redeemQr(ctx, token).then((result) => this.unwrap(result));
  }
}
