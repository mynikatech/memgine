import { ID, ISODateString } from "../domain/common";
import {
  Benefit,
  Customer,
  RedemptionMethod,
  Subscription,
} from "../domain/entities";
import {
  BenefitService,
  CustomerService,
  MembershipProductService,
  RedemptionService,
  SubscriptionService,
  StatusService,
} from "../services/service-contracts";

/**
 * UI-agnostic redemption domain workflow.
 *
 * The engine deliberately uses the persisted service contracts only. In the
 * local app those contracts are backed by the local/mock persistence layer;
 * later the same contracts can be implemented by the server/plugin layer.
 *
 * All three Counter identification methods use the same redemption path:
 * QR, phone+OTP and STAFF_ASSISTED.
 */

export interface RedemptionToken {
  version: 1;
  code: string;
  customerId: ID;
  customerName?: string;
  organizationId: ID;
  subscriptionId: ID;
  /** Customer-facing membership reference. */
  subscriptionNumber?: string;
  membership?: {
    productId: ID;
    productName: string;
    tier?: string;
    planId: ID;
    planName: string;
    startDate: string;
    endDate: string;
  };
  benefitIds: ID[];
  benefits?: {
    id: ID;
    name: string;
  }[];
  createdAt: ISODateString;
}

export function encodeRedemptionToken(token: RedemptionToken): string {
  return JSON.stringify(token);
}

export function decodeRedemptionToken(raw: string): RedemptionToken | null {
  try {
    const value = JSON.parse(raw.trim());

    if (
      !value ||
      value.version !== 1 ||
      typeof value.code !== "string" ||
      typeof value.customerId !== "string" ||
      typeof value.organizationId !== "string" ||
      typeof value.subscriptionId !== "string" ||
      !Array.isArray(value.benefitIds)
    ) {
      return null;
    }

    return value as RedemptionToken;
  } catch {
    return null;
  }
}

export interface RedemptionServices {
  subscription: SubscriptionService;
  benefit: BenefitService;
  redemption: RedemptionService;
  customer: CustomerService;
  membershipProduct: MembershipProductService;
  status: StatusService;
  organization: {
    getOrganizationUser(organizationUserId: ID): Promise<{
      id: ID;
      organizationId: ID;
      userId: ID;
    } | null>;
  };
}

export interface RedemptionContext {
  organizationId: ID;
  storeId: ID;
  staffId: ID;
  method: RedemptionMethod;
  promoCode?: string;
}

export type BenefitOutcomeStatus = "REDEEMED" | "ALREADY_USED" | "INELIGIBLE";

export interface BenefitOutcome {
  benefitId: ID;
  title: string;
  status: BenefitOutcomeStatus;
  redemptionId?: ID;
}

export type RedemptionResultKind = "SUCCESS" | "PARTIAL" | "FAILED" | "INVALID";

export interface RedemptionMembershipDetails {
  productId: ID;
  productName: string;
  tier?: string;
  planId: ID;
  planName: string;
  subscriptionNumber: string;
  startDate: string;
  endDate: string;
}

export interface RedemptionResult {
  kind: RedemptionResultKind;
  message: string;
  customer?: Customer;
  subscription?: Subscription;
  membership?: RedemptionMembershipDetails;
  outcomes: BenefitOutcome[];
}

export type EligibleBenefit = Benefit & {
  available: boolean;
};

export interface MembershipOption {
  subscription: Subscription;
  productName: string;
  tier?: string;
  benefits: EligibleBenefit[];
}

async function resolveSubscriptionOwner(
  services: RedemptionServices,
  subscription: Subscription,
): Promise<{
  organizationId: ID;
  customerId: ID;
} | null> {
  const organizationUser = await services.organization.getOrganizationUser(
    subscription.organizationUserId,
  );

  if (!organizationUser) {
    return null;
  }

  return {
    organizationId: organizationUser.organizationId,
    customerId: organizationUser.userId,
  };
}

async function getActiveSubscriptionStatusIds(
  services: RedemptionServices,
): Promise<Set<ID>> {
  const statuses =
    await services.status.listStatusesByEntityTypeCode("SUBSCRIPTION");

  return new Set(
    statuses
      .filter(
        (status) =>
          status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
          status.statusName?.trim().toLowerCase() === "active",
      )
      .map((status) => status.id),
  );
}

/**
 * Resolve a subscription's product and plan from persisted MembershipProduct.plans.
 * No mock-only SubscriptionPlanService is required here.
 */
async function resolveProductForSubscription(
  services: RedemptionServices,
  organizationId: ID,
  subscription: Subscription,
) {
  const products =
    await services.membershipProduct.listProducts(organizationId);

  for (const product of products) {
    if (product.isDeleted) {
      continue;
    }

    const plan = product.plans.find(
      (candidate) =>
        !candidate.isDeleted &&
        candidate.id === subscription.subscriptionPlanId,
    );

    if (plan) {
      return { product, plan };
    }
  }

  return null;
}

export async function listActiveMemberships(
  services: RedemptionServices,
  organizationId: ID,
  customerId: ID,
): Promise<MembershipOption[]> {
  const [subs, activeStatusIds] = await Promise.all([
    services.subscription.listByCustomer(customerId),
    getActiveSubscriptionStatusIds(services),
  ]);

  const options: MembershipOption[] = [];

  for (const subscription of subs) {
    if (
      subscription.isDeleted ||
      !activeStatusIds.has(subscription.subscriptionStatusId)
    ) {
      continue;
    }

    const owner = await resolveSubscriptionOwner(services, subscription);

    if (
      !owner ||
      owner.organizationId !== organizationId ||
      owner.customerId !== customerId
    ) {
      continue;
    }

    const resolved = await resolveProductForSubscription(
      services,
      organizationId,
      subscription,
    );

    if (!resolved) {
      continue;
    }

    const { product, plan } = resolved;
    const organizationBenefits =
      await services.benefit.listByOrganization(organizationId);
    const benefits = organizationBenefits.filter(
      (benefit) =>
        !benefit.isDeleted && product.benefitIds.includes(benefit.id),
    );

    const used = new Set(
      (await services.redemption.listBySubscription(subscription.id))
        .filter((redemption) => !redemption.isDeleted)
        .map((redemption) => redemption.benefitId),
    );

    options.push({
      subscription,
      productName: product.membershipProductName,
      tier: plan.subscriptionPlanName || product.tier || product.displayName,
      benefits: benefits
        .filter((benefit) => !benefit.isDeleted)
        .map((benefit) => ({
          ...benefit,
          available: !used.has(benefit.id),
        })),
    });
  }

  return options;
}

export async function redeemBenefits(
  services: RedemptionServices,
  ctx: RedemptionContext,
  request: {
    subscriptionId: ID;
    benefitIds: ID[];
  },
): Promise<RedemptionResult> {
  const uniqueBenefitIds = Array.from(new Set(request.benefitIds));

  if (!uniqueBenefitIds.length) {
    return {
      kind: "INVALID",
      message: "Select at least one benefit to redeem.",
      outcomes: [],
    };
  }

  if (!ctx.storeId) {
    return {
      kind: "INVALID",
      message: "Select a store before processing a redemption.",
      outcomes: [],
    };
  }

  const subscription = await services.subscription.getSubscription(
    request.subscriptionId,
  );

  if (!subscription || subscription.isDeleted) {
    return {
      kind: "INVALID",
      message: "Membership not found.",
      outcomes: [],
    };
  }

  const owner = await resolveSubscriptionOwner(services, subscription);

  if (!owner) {
    return {
      kind: "FAILED",
      message: "The membership owner could not be resolved.",
      subscription,
      outcomes: [],
    };
  }

  const customer =
    (await services.customer.getCustomer(owner.customerId)) ?? undefined;

  if (owner.organizationId !== ctx.organizationId) {
    return {
      kind: "FAILED",
      message: "This membership belongs to a different business.",
      customer,
      subscription,
      outcomes: [],
    };
  }

  const activeStatusIds = await getActiveSubscriptionStatusIds(services);

  if (!activeStatusIds.has(subscription.subscriptionStatusId)) {
    return {
      kind: "FAILED",
      message: "This membership is not active.",
      customer,
      subscription,
      outcomes: [],
    };
  }

  const resolved = await resolveProductForSubscription(
    services,
    owner.organizationId,
    subscription,
  );

  if (!resolved) {
    return {
      kind: "FAILED",
      message:
        "The subscription plan associated with this membership could not be found.",
      customer,
      subscription,
      outcomes: [],
    };
  }

  const membership: RedemptionMembershipDetails = {
    productId: resolved.product.id,
    productName:
      resolved.product.displayName ?? resolved.product.membershipProductName,
    tier: resolved.product.tier,
    planId: resolved.plan.id,
    planName: resolved.plan.subscriptionPlanName,
    subscriptionNumber: subscription.subscriptionNumber,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
  };

  const organizationBenefits = await services.benefit.listByOrganization(
    owner.organizationId,
  );
  const productBenefits = organizationBenefits.filter(
    (benefit) =>
      !benefit.isDeleted && resolved.product.benefitIds.includes(benefit.id),
  );

  const benefitById = new Map(
    productBenefits.map((benefit) => [benefit.id, benefit]),
  );

  const used = new Set(
    (await services.redemption.listBySubscription(subscription.id))
      .filter((redemption) => !redemption.isDeleted)
      .map((redemption) => redemption.benefitId),
  );

  const outcomes: BenefitOutcome[] = [];

  for (const benefitId of uniqueBenefitIds) {
    const benefit = benefitById.get(benefitId);

    if (!benefit) {
      outcomes.push({
        benefitId,
        title: benefitId,
        status: "INELIGIBLE",
      });
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
      subscriptionId: subscription.id,
      benefitId,
      storeId: ctx.storeId,
      staffId: ctx.staffId || undefined,
      method: ctx.method,
      quantity: 1,
      createdBy: ctx.staffId,
      remarks: ctx.promoCode ? `Promo code: ${ctx.promoCode}` : undefined,
    });

    used.add(benefitId);

    outcomes.push({
      benefitId,
      title: benefit.displayName ?? benefit.benefitName,
      status: "REDEEMED",
      redemptionId: redemption.id,
    });
  }

  const redeemed = outcomes.filter(
    (outcome) => outcome.status === "REDEEMED",
  ).length;

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

  return {
    kind,
    message,
    customer,
    subscription,
    membership,
    outcomes,
  };
}

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

  if (token.organizationId !== ctx.organizationId) {
    return {
      kind: "FAILED",
      message: "This redemption QR belongs to a different business.",
      outcomes: [],
    };
  }

  const subscription = await services.subscription.getSubscription(
    token.subscriptionId,
  );

  if (!subscription) {
    return {
      kind: "INVALID",
      message: "The membership in this redemption QR could not be found.",
      outcomes: [],
    };
  }

  const owner = await resolveSubscriptionOwner(services, subscription);

  if (!owner || owner.organizationId !== ctx.organizationId) {
    return {
      kind: "FAILED",
      message: "This redemption QR is not valid for this business.",
      outcomes: [],
    };
  }

  if (owner.customerId !== token.customerId) {
    return {
      kind: "FAILED",
      message:
        "The customer in this redemption QR does not match the membership owner.",
      outcomes: [],
    };
  }

  return redeemBenefits(services, ctx, {
    subscriptionId: token.subscriptionId,
    benefitIds: token.benefitIds,
  });
}
