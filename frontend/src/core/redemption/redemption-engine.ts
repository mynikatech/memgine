import type { ID, ISODateString } from "../domain/common";
import {
  Benefit,
  BenefitUsageRule,
  Customer,
  RedemptionMethod,
  Subscription,
  User,
} from "../domain/entities";
import {
  BenefitService,
  MembershipProductService,
  RedemptionService,
  SubscriptionService,
  StatusService,
} from "../services/service-contracts";
import type { BenefitUsageRuleService } from "../services/benefit-usage-rule-service";
import type { BenefitRedemptionQRService } from "../services/benefit-redemption-qr-service";

/**
 * UI-agnostic benefit redemption workflow.
 *
 * Stage 6 resolves the opaque customer-presented redemption QR through the
 * persisted BenefitRedemptionQRContext. The QR payload itself is never treated
 * as a JSON business object.
 *
 * Benefit redemption remains independent from Offer redemption.
 */

export interface RedemptionServices {
  subscription: SubscriptionService;
  benefit: BenefitService;
  redemption: RedemptionService;
  membershipProduct: MembershipProductService;
  status: StatusService;
  benefitUsageRule: BenefitUsageRuleService;
  benefitRedemptionQR: BenefitRedemptionQRService;
  organization: {
    getOrganizationUser(organizationUserId: ID): Promise<{
      id: ID;
      organizationId: ID;
      userId: ID;
    } | null>;
    getUser(userId: ID): Promise<User | null>;
  };
}

export interface RedemptionContext {
  organizationId: ID;
  storeId: ID;
  staffId: ID;
  method: RedemptionMethod;
  promoCode?: string;
}

export type BenefitOutcomeStatus =
  | "REDEEMED"
  | "ALREADY_USED"
  | "INELIGIBLE"
  | "USAGE_LIMIT_REACHED"
  | "OUTSIDE_VALIDITY";

export interface BenefitOutcome {
  benefitId: ID;
  title: string;
  status: BenefitOutcomeStatus;
  redemptionId?: ID;
  reason?: string;
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

function customerProjection(user: User): Customer {
  return {
    id: user.id,
    fullName:
      user.displayName?.trim() ||
      `${user.firstName} ${user.middleName ?? ""} ${user.lastName}`
        .replace(/\s+/g, " ")
        .trim(),
    email: user.primaryEmail,
    phone: user.primaryPhone
      ? `${user.primaryPhone.callingCode ?? ""}${user.primaryPhone.number ?? ""}`
      : undefined,
    createdAt: user.createdAt,
  };
}

async function resolveSubscriptionOwner(
  services: RedemptionServices,
  subscription: Subscription,
): Promise<{
  organizationId: ID;
  userId: ID;
} | null> {
  const organizationUser = await services.organization.getOrganizationUser(
    subscription.organizationUserId,
  );

  if (!organizationUser) {
    return null;
  }

  return {
    organizationId: organizationUser.organizationId,
    userId: organizationUser.userId,
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

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateWithinValidity(
  now: Date,
  effectiveDate?: string,
  expiryDate?: string,
): boolean {
  const start = toDate(effectiveDate);
  const end = toDate(expiryDate);

  if (start && now < start) return false;
  if (end && now > end) return false;

  return true;
}

function getZonedDateParts(
  date: Date,
  timeZone?: string,
): {
  dayName: string;
  hour: number;
  minute: number;
} {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timeZone || "UTC",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    dayName: value("weekday").toUpperCase(),
    hour: Number(value("hour")) || 0,
    minute: Number(value("minute")) || 0,
  };
}

function parseClock(value: string | undefined): number | null {
  if (!value) return null;

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

function isApplicableNow(rule: BenefitUsageRule, now: Date): boolean {
  if (!isDateWithinValidity(now, rule.effectiveDate, rule.expiryDate)) {
    return false;
  }

  const zoned = getZonedDateParts(now, rule.timeZone);

  if (rule.applicableDays?.length) {
    const allowed = new Set(
      rule.applicableDays.map((day) => day.trim().toUpperCase()),
    );

    const shortDay = zoned.dayName.slice(0, 3);

    if (!allowed.has(zoned.dayName) && !allowed.has(shortDay)) {
      return false;
    }
  }

  const currentMinutes = zoned.hour * 60 + zoned.minute;
  const startMinutes = parseClock(rule.windowStartTime);
  const endMinutes = parseClock(rule.windowEndTime);

  if (startMinutes !== null && endMinutes !== null) {
    if (startMinutes <= endMinutes) {
      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        return false;
      }
    } else {
      // Overnight window, e.g. 22:00 -> 02:00.
      if (currentMinutes > endMinutes && currentMinutes < startMinutes) {
        return false;
      }
    }
  } else if (startMinutes !== null && currentMinutes < startMinutes) {
    return false;
  } else if (endMinutes !== null && currentMinutes > endMinutes) {
    return false;
  }

  return true;
}

function subtractFrequencyWindow(
  now: Date,
  rule: BenefitUsageRule,
  subscription: Subscription,
): Date {
  if (rule.frequencyType === "ONE_TIME") {
    return toDate(subscription.startDate) ?? new Date(0);
  }

  const interval = Math.max(1, rule.frequencyInterval || 1);
  const start = new Date(now);

  switch (rule.frequencyType) {
    case "DAILY":
      start.setDate(start.getDate() - interval);
      break;
    case "WEEKLY":
      start.setDate(start.getDate() - interval * 7);
      break;
    case "MONTHLY":
      start.setMonth(start.getMonth() - interval);
      break;
    case "YEARLY":
      start.setFullYear(start.getFullYear() - interval);
      break;
    default:
      return new Date(0);
  }

  return start;
}

async function validateBenefitUsage(
  services: RedemptionServices,
  benefit: Benefit,
  subscription: Subscription,
  now: Date,
): Promise<
  { ok: true } | { ok: false; status: BenefitOutcomeStatus; reason: string }
> {
  if (!isDateWithinValidity(now, benefit.effectiveDate, benefit.expiryDate)) {
    return {
      ok: false,
      status: "OUTSIDE_VALIDITY",
      reason: "This benefit is outside its validity period.",
    };
  }

  const benefitStatuses =
    await services.status.listStatusesByEntityTypeCode("BENEFIT");

  if (benefitStatuses.length) {
    const activeBenefitStatusIds = new Set(
      benefitStatuses
        .filter(
          (status) =>
            status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
            status.statusName?.trim().toLowerCase() === "active",
        )
        .map((status) => status.id),
    );

    if (!activeBenefitStatusIds.has(benefit.benefitStatusId)) {
      return {
        ok: false,
        status: "INELIGIBLE",
        reason: "This benefit is not active.",
      };
    }
  }

  const rules = await services.benefitUsageRule.listByBenefit(benefit.id);

  for (const rule of rules) {
    const ruleStatus = await services.status.getStatus(
      rule.benefitUsageRuleStatusId,
    );

    if (ruleStatus && !ruleStatus.isActive) {
      continue;
    }

    if (!isApplicableNow(rule, now)) {
      return {
        ok: false,
        status: "USAGE_LIMIT_REACHED",
        reason: "This benefit cannot be used at the current time.",
      };
    }

    const existing = (
      await services.redemption.listBySubscription(subscription.id)
    ).filter(
      (redemption) =>
        !redemption.isDeleted && redemption.benefitId === benefit.id,
    );

    const windowStart = subtractFrequencyWindow(now, rule, subscription);

    const usageCount = existing
      .filter((redemption) => {
        const redemptionDate = toDate(redemption.redemptionDateTime);
        return redemptionDate ? redemptionDate >= windowStart : false;
      })
      .reduce((total, redemption) => total + (redemption.quantity || 0), 0);

    if (usageCount >= Math.max(1, rule.usageLimit || 1)) {
      return {
        ok: false,
        status: "USAGE_LIMIT_REACHED",
        reason: `Usage limit reached for rule "${rule.ruleName}".`,
      };
    }
  }

  return { ok: true };
}

export async function listActiveMemberships(
  services: RedemptionServices,
  organizationId: ID,
  userId: ID,
): Promise<MembershipOption[]> {
  const [subs, activeStatusIds] = await Promise.all([
    services.subscription.listByCustomer(userId),
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
      owner.userId !== userId
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

    const organizationBenefits =
      await services.benefit.listByOrganization(organizationId);

    const used = new Set(
      (await services.redemption.listBySubscription(subscription.id))
        .filter((redemption) => !redemption.isDeleted)
        .map((redemption) => redemption.benefitId),
    );

    options.push({
      subscription,
      productName: resolved.product.membershipProductName,
      tier:
        resolved.plan.subscriptionPlanName ||
        resolved.product.tier ||
        resolved.product.displayName,
      benefits: organizationBenefits
        .filter(
          (benefit) =>
            !benefit.isDeleted &&
            resolved.product.benefitIds.includes(benefit.id),
        )
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
    userId?: ID;
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

  if (owner.organizationId !== ctx.organizationId) {
    return {
      kind: "FAILED",
      message: "This membership belongs to a different business.",
      subscription,
      outcomes: [],
    };
  }

  if (request.userId && owner.userId !== request.userId) {
    return {
      kind: "FAILED",
      message:
        "The user in this redemption QR does not match the membership owner.",
      subscription,
      outcomes: [],
    };
  }

  const activeStatusIds = await getActiveSubscriptionStatusIds(services);

  if (!activeStatusIds.has(subscription.subscriptionStatusId)) {
    return {
      kind: "FAILED",
      message: "This membership is not active.",
      subscription,
      outcomes: [],
    };
  }

  const now = new Date();

  if (
    !isDateWithinValidity(now, subscription.startDate, subscription.endDate)
  ) {
    return {
      kind: "FAILED",
      message: "This membership is outside its validity period.",
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
      subscription,
      outcomes: [],
    };
  }

  const user = await services.organization.getUser(owner.userId);

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

  const productBenefitIds = new Set(resolved.product.benefitIds);

  const benefitById = new Map(
    organizationBenefits
      .filter(
        (benefit) => !benefit.isDeleted && productBenefitIds.has(benefit.id),
      )
      .map((benefit) => [benefit.id, benefit]),
  );

  const existingRedemptions = await services.redemption.listBySubscription(
    subscription.id,
  );

  const used = new Set(
    existingRedemptions
      .filter((redemption) => !redemption.isDeleted)
      .map((redemption) => redemption.benefitId),
  );

  const outcomes: BenefitOutcome[] = [];

  // Validate every selected benefit before writing any new redemption.
  // This prevents a multi-benefit QR from creating an avoidable partial
  // redemption because one selected benefit is already invalid.
  const eligibleForWrite: Benefit[] = [];

  for (const benefitId of uniqueBenefitIds) {
    const benefit = benefitById.get(benefitId);

    if (!benefit) {
      outcomes.push({
        benefitId,
        title: benefitId,
        status: "INELIGIBLE",
        reason: "Benefit is not part of the subscribed membership product.",
      });
      continue;
    }

    const title = benefit.displayName ?? benefit.benefitName;

    if (used.has(benefitId)) {
      outcomes.push({
        benefitId,
        title,
        status: "ALREADY_USED",
        reason: "This benefit has already been redeemed.",
      });
      continue;
    }

    const validation = await validateBenefitUsage(
      services,
      benefit,
      subscription,
      now,
    );

    if (!validation.ok) {
      outcomes.push({
        benefitId,
        title,
        status: validation.status,
        reason: validation.reason,
      });
      continue;
    }

    eligibleForWrite.push(benefit);
  }

  for (const benefit of eligibleForWrite) {
    const redemption = await services.redemption.performRedemption({
      subscriptionId: subscription.id,
      benefitId: benefit.id,
      storeId: ctx.storeId,
      staffId: ctx.staffId || undefined,
      method: ctx.method,
      quantity: 1,
      createdBy: ctx.staffId,
      remarks: ctx.promoCode ? `Promo code: ${ctx.promoCode}` : undefined,
    });

    used.add(benefit.id);

    outcomes.push({
      benefitId: benefit.id,
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
    message = "No selected benefits could be redeemed.";
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
    customer: user ? customerProjection(user) : undefined,
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
  const token = rawToken.trim();

  if (!token) {
    return {
      kind: "INVALID",
      message: "Enter or scan a redemption QR token.",
      outcomes: [],
    };
  }

  /*
   * Stage 5 created a secure opaque token and persisted its companion
   * BenefitRedemptionQRContext. Stage 6 resolves that persisted context.
   *
   * We intentionally do NOT JSON.parse the token.
   */
  const qr = await services.benefitRedemptionQR.getByToken(token);

  if (!qr) {
    return {
      kind: "INVALID",
      message:
        "This redemption QR could not be found or is not a Benefit Redemption QR.",
      outcomes: [],
    };
  }

  if (qr.qrCode.isDeleted) {
    return {
      kind: "INVALID",
      message: "This redemption QR is no longer active.",
      outcomes: [],
    };
  }

  const qrStatus = await services.status.getStatus(qr.qrCode.statusId);

  if (qrStatus && !qrStatus.isActive) {
    return {
      kind: "INVALID",
      message: "This redemption QR is no longer active.",
      outcomes: [],
    };
  }

  if (qr.context.qrCodeToken !== qr.qrCode.qrCodeToken) {
    return {
      kind: "INVALID",
      message: "This redemption QR has an invalid context.",
      outcomes: [],
    };
  }

  if (qr.context.organizationId !== ctx.organizationId) {
    return {
      kind: "FAILED",
      message: "This redemption QR belongs to a different business.",
      outcomes: [],
    };
  }

  return redeemBenefits(services, ctx, {
    subscriptionId: qr.context.subscriptionId,
    benefitIds: qr.context.benefitIds,
    userId: qr.context.userId,
  });
}

/**
 * Kept only as a compatibility type for older UI code that may still
 * reference the former JSON-token contract. New Stage 5/6 redemption QR
 * generation does not use this structure.
 */
export interface RedemptionToken {
  version: 1;
  code: string;
  customerId: ID;
  customerName?: string;
  organizationId: ID;
  subscriptionId: ID;
  subscriptionNumber?: string;
  membership?: RedemptionMembershipDetails;
  benefitIds: ID[];
  benefits?: {
    id: ID;
    name: string;
  }[];
  createdAt: ISODateString;
}

/**
 * Legacy encoder/decoder retained for source compatibility only.
 * Stage 6 QR redemption does not consume this JSON format.
 */
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
