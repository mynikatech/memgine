import { ID, ISODateString } from "../domain/common";
import {
  Benefit,
  Customer,
  RedemptionMethod,
  Subscription,
  SubscriptionStatus,
} from "../domain/entities";
import {
  BenefitService,
  CustomerService,
  MembershipProductService,
  RedemptionService,
  SubscriptionService,
} from "../services/service-contracts";

/**
 * Reusable, UI-agnostic redemption logic shared by ALL customer-identification
 * methods (QR, phone+OTP, membership ID). The Staff Counter is the only caller
 * today, but the same functions back any future channel with no changes.
 */

/* ------------------------------- Token ------------------------------------ */

/** The Task 7A redemption token payload carried by the customer's QR. */
export interface RedemptionToken {
  version: 1;
  code: string;
  customerId: ID;
  organizationId: ID;
  subscriptionId: ID;
  benefitIds: ID[];
  createdAt: ISODateString;
}

export function encodeRedemptionToken(token: RedemptionToken): string {
  return JSON.stringify(token);
}

export function decodeRedemptionToken(raw: string): RedemptionToken | null {
  try {
    const v = JSON.parse(raw.trim());
    if (
      !v ||
      v.version !== 1 ||
      typeof v.subscriptionId !== "string" ||
      !Array.isArray(v.benefitIds)
    ) {
      return null;
    }
    return v as RedemptionToken;
  } catch {
    return null;
  }
}

/* ------------------------------ Services ---------------------------------- */

export interface RedemptionServices {
  subscription: SubscriptionService;
  benefit: BenefitService;
  redemption: RedemptionService;
  customer: CustomerService;
  membershipProduct: MembershipProductService;
}

export interface RedemptionContext {
  organizationId: ID;
  storeId: ID;
  staffId: ID;
  method: RedemptionMethod;
  promoCode?: string;
}

/* ------------------------------- Results ---------------------------------- */

export type BenefitOutcomeStatus = "REDEEMED" | "ALREADY_USED" | "INELIGIBLE";

export interface BenefitOutcome {
  benefitId: ID;
  title: string;
  status: BenefitOutcomeStatus;
  redemptionId?: ID;
}

export type RedemptionResultKind = "SUCCESS" | "PARTIAL" | "FAILED" | "INVALID";

export interface RedemptionResult {
  kind: RedemptionResultKind;
  message: string;
  customer?: Customer;
  subscription?: Subscription;
  outcomes: BenefitOutcome[];
}

/* ---------------------------- Membership lookup --------------------------- */

export type EligibleBenefit = Benefit & { available: boolean };

export interface MembershipOption {
  subscription: Subscription;
  productName: string;
  tier?: string;
  benefits: EligibleBenefit[];
}

/** Active memberships (with per-benefit availability) for a customer at an org. */
export async function listActiveMemberships(
  services: RedemptionServices,
  organizationId: ID,
  customerId: ID,
): Promise<MembershipOption[]> {
  const subs = (await services.subscription.listByCustomer(customerId)).filter(
    (s) =>
      s.organizationId === organizationId &&
      s.status === SubscriptionStatus.ACTIVE,
  );
  const options: MembershipOption[] = [];
  for (const sub of subs) {
    const product = await services.membershipProduct.getProduct(
      sub.membershipProductId,
    );
    const benefits = await services.benefit.listByProduct(
      sub.membershipProductId,
    );
    const used = new Set(
      (await services.redemption.listBySubscription(sub.id)).map(
        (r) => r.benefitId,
      ),
    );
    options.push({
      subscription: sub,
      productName: product?.membershipProductName ?? "Membership",
      tier: product?.displayName,
      benefits: benefits.map((b) => ({ ...b, available: !used.has(b.id) })),
    });
  }
  return options;
}

/* ------------------------------- Redeem ----------------------------------- */

/**
 * Validate + redeem selected benefits for a subscription in ONE action.
 * Shared by QR and manual flows. Applies: active membership, correct business,
 * benefit eligibility and already-used rules; supports partial success.
 */
export async function redeemBenefits(
  services: RedemptionServices,
  ctx: RedemptionContext,
  request: { subscriptionId: ID; benefitIds: ID[] },
): Promise<RedemptionResult> {
  if (!request.benefitIds.length) {
    return {
      kind: "INVALID",
      message: "Select at least one benefit to redeem.",
      outcomes: [],
    };
  }

  const subscription = await services.subscription.getSubscription(
    request.subscriptionId,
  );
  if (!subscription) {
    return {
      kind: "INVALID",
      message: "Membership not found for this token/ID.",
      outcomes: [],
    };
  }
  const customer =
    (await services.customer.getCustomer(subscription.customerId)) ?? undefined;

  if (subscription.organizationId !== ctx.organizationId) {
    return {
      kind: "FAILED",
      message: "This membership belongs to a different business.",
      customer,
      subscription,
      outcomes: [],
    };
  }
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    return {
      kind: "FAILED",
      message: "This membership is not active.",
      customer,
      subscription,
      outcomes: [],
    };
  }

  const productBenefits = await services.benefit.listByProduct(
    subscription.membershipProductId,
  );
  const benefitById = new Map(productBenefits.map((b) => [b.id, b]));
  const used = new Set(
    (await services.redemption.listBySubscription(subscription.id)).map(
      (r) => r.benefitId,
    ),
  );

  const outcomes: BenefitOutcome[] = [];
  for (const benefitId of request.benefitIds) {
    const benefit = benefitById.get(benefitId);
    if (!benefit) {
      outcomes.push({ benefitId, title: benefitId, status: "INELIGIBLE" });
      continue;
    }
    if (used.has(benefitId)) {
      outcomes.push({
        benefitId,
        title: benefit.displayName ?? benefit.benefitName,
        status: "ALREADY_USED",
      });
      continue;
    }
    const redemption = await services.redemption.performRedemption({
      organizationId: ctx.organizationId,
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      benefitId,
      storeId: ctx.storeId,
      staffId: ctx.staffId,
      method: ctx.method,
      promoCode: ctx.promoCode,
    });
    used.add(benefitId);
    outcomes.push({
      benefitId,
      title: benefit.displayName ?? benefit.benefitName,
      status: "REDEEMED",
      redemptionId: redemption.id,
    });
  }

  const redeemed = outcomes.filter((o) => o.status === "REDEEMED").length;
  let kind: RedemptionResultKind;
  let message: string;
  if (redeemed === 0) {
    kind = "FAILED";
    message = "No benefits could be redeemed (already used or not eligible).";
  } else if (redeemed === outcomes.length) {
    kind = "SUCCESS";
    message = `Redeemed ${redeemed} benefit${redeemed > 1 ? "s" : ""}.`;
  } else {
    kind = "PARTIAL";
    message = `Redeemed ${redeemed} of ${outcomes.length}. Some benefits were unavailable.`;
  }

  return { kind, message, customer, subscription, outcomes };
}

/** QR path: decode the Task 7A token, then redeem its selected benefits. */
export async function redeemFromToken(
  services: RedemptionServices,
  ctx: RedemptionContext,
  rawToken: string,
): Promise<RedemptionResult> {
  const token = decodeRedemptionToken(rawToken);
  if (!token) {
    return {
      kind: "INVALID",
      message: "Invalid or unreadable redemption QR / token.",
      outcomes: [],
    };
  }
  return redeemBenefits(services, ctx, {
    subscriptionId: token.subscriptionId,
    benefitIds: token.benefitIds,
  });
}
