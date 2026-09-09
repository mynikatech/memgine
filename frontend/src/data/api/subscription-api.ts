import type { ID, Subscription } from "@/src/core";

import type { SubscriptionRepository } from "../repositories/subscription/subscription-repository";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class SubscriptionApi {
  constructor(private readonly repository: SubscriptionRepository) {}

  async list(): Promise<ApiResult<Subscription[]>> {
    try {
      return apiSuccess(await this.repository.list());
    } catch (error) {
      return apiFailure(
        "SUBSCRIPTION_LIST_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to list subscriptions.",
      );
    }
  }

  async get(subscriptionId: ID): Promise<ApiResult<Subscription | null>> {
    try {
      return apiSuccess(await this.repository.get(subscriptionId));
    } catch (error) {
      return apiFailure(
        "SUBSCRIPTION_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load subscription.",
      );
    }
  }

  async create(subscription: Subscription): Promise<ApiResult<Subscription>> {
    try {
      return apiSuccess(await this.repository.create(subscription));
    } catch (error) {
      return apiFailure(
        "SUBSCRIPTION_CREATE_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to create subscription.",
      );
    }
  }
}
