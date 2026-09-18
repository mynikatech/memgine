import type { ID } from "../domain/common";
import { CounterApi, type CounterContext, type CounterPurchase } from "@/src/data/api/counter-api";

export class CounterService {
  constructor(private readonly api: CounterApi) {}
  private unwrap<T>(result: { success: true; data: T } | { success: false; error: { message: string } }): T {
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }
  customers(ctx: CounterContext) { return this.api.customers(ctx).then(result => this.unwrap(result)); }
  subscriptions(ctx: CounterContext) { return this.api.subscriptions(ctx).then(result => this.unwrap(result)); }
  redemptions(ctx: CounterContext) { return this.api.redemptions(ctx).then(result => this.unwrap(result)); }
  qrSamples(ctx: CounterContext) { return this.api.qrSamples(ctx).then(result => this.unwrap(result)); }
  staffName(ctx: CounterContext) { return this.api.staffName(ctx).then(result => this.unwrap(result)); }
  eligibility(ctx: CounterContext, subscriptionId: ID, benefitIds: ID[]) {
    return this.api.eligibility(ctx, subscriptionId, benefitIds).then(result => this.unwrap(result));
  }
  purchase(ctx: CounterContext, request: Omit<CounterPurchase, "storeId" | "staffId">) {
    return this.api.purchase(ctx, request).then(result => this.unwrap(result));
  }
  redeem(ctx: CounterContext, subscriptionId: ID, benefitIds: ID[]) {
    return this.api.redeem(ctx, subscriptionId, benefitIds).then(result => this.unwrap(result));
  }
  redeemQr(ctx: CounterContext, token: string) {
    return this.api.redeemQr(ctx, token).then(result => this.unwrap(result));
  }
}
