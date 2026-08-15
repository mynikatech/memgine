// src/core/domain/membership-helpers.ts

import type { SubscriptionPlan } from "./entities";

export function getSubscriptionPeriodLabel(plan: SubscriptionPlan): string {
  const unit = plan.subscriptionPeriodUnit.toUpperCase();

  if (plan.subscriptionPeriod === 1 && unit === "MONTH") {
    return "Monthly";
  }

  if (plan.subscriptionPeriod === 12 && unit === "MONTH") {
    return "Yearly";
  }

  if (plan.subscriptionPeriod === 1 && unit === "YEAR") {
    return "Yearly";
  }

  const normalizedUnit =
    unit === "MONTH" ? "month" : unit === "YEAR" ? "year" : unit.toLowerCase();

  return `${plan.subscriptionPeriod} ${normalizedUnit}${
    plan.subscriptionPeriod === 1 ? "" : "s"
  }`;
}
