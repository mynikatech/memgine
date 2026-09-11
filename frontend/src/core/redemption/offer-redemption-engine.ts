import type { ID, ISODateString } from "../domain/common";
import type { Offer } from "../domain/entities";
import type { OfferUsageRule } from "../domain/entities";
import type { OfferRedemption } from "../domain/offer-redemption";
import type { OfferRedemptionQRService } from "../services/offer-redemption-qr-service";
import type { OfferRedemptionService } from "../services/offer-redemption-service.local";
import type {
  MembershipProductService,
  OfferService,
  OrganizationService,
  StatusService,
  SubscriptionService,
} from "../services/service-contracts";

/**
 * Stage 6 Offer Redemption Engine.
 *
 * The counter UI may be shared with Benefit Redemption, but this engine is
 * completely independent of the Benefit redemption engine and Benefit
 * Redemption persistence.
 *
 * Flow:
 *   opaque QR token
 *      -> OfferRedemptionQRContext
 *      -> QR validation
 *      -> User validation
 *      -> Offer validation
 *      -> optional membership eligibility
 *      -> Offer Usage Rules
 *      -> OfferRedemption persistence
 */
export interface OfferRedemptionEngineServices {
  offerRedemptionQR: OfferRedemptionQRService;
  offerRedemption: OfferRedemptionService;
  offer: OfferService;
  status: StatusService;
  organization: OrganizationService;
  subscription: SubscriptionService;
  membershipProduct: MembershipProductService;
}

export interface OfferRedemptionContext {
  organizationId: ID;
  storeId: ID;
  staffId: ID;
  method: OfferRedemption["method"];
  remarks?: string;
}

export type OfferRedemptionResultKind =
  | "SUCCESS"
  | "ALREADY_USED"
  | "INELIGIBLE"
  | "USAGE_LIMIT_REACHED"
  | "OUTSIDE_VALIDITY"
  | "INVALID"
  | "FAILED";

export interface OfferRedemptionResult {
  kind: OfferRedemptionResultKind;
  message: string;
  offer?: Offer;
  redemption?: OfferRedemption;
  userId?: ID;
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

function isApplicableNow(rule: OfferUsageRule, now: Date): boolean {
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

function subtractFrequencyWindow(now: Date, rule: OfferUsageRule): Date {
  if (rule.frequencyType === "ONE_TIME") {
    return new Date(0);
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

async function resolveOrganizationUser(
  organization: OrganizationService,
  organizationId: ID,
  userId: ID,
) {
  const organizationUsers =
    await organization.listOrganizationUsers(organizationId);

  return (
    organizationUsers.find(
      (item) => !item.isDeleted && item.userId === userId,
    ) ?? null
  );
}

async function isOfferActive(
  statusService: StatusService,
  offer: Offer,
): Promise<boolean> {
  const statuses = await statusService.listStatusesByEntityTypeCode("OFFER");

  if (!statuses.length) {
    return true;
  }

  const activeStatusIds = new Set(
    statuses
      .filter(
        (status) =>
          status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
          status.statusName?.trim().toLowerCase() === "active",
      )
      .map((status) => status.id),
  );

  return activeStatusIds.has(offer.statusId);
}

async function validateMembershipEligibility(
  services: OfferRedemptionEngineServices,
  organizationId: ID,
  userId: ID,
  offer: Offer,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!offer.membershipProductId) {
    return { ok: true };
  }

  const activeSubscriptionStatuses =
    await services.status.listStatusesByEntityTypeCode("SUBSCRIPTION");

  const activeStatusIds = new Set(
    activeSubscriptionStatuses
      .filter(
        (status) =>
          status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
          status.statusName?.trim().toLowerCase() === "active",
      )
      .map((status) => status.id),
  );

  const subscriptions = await services.subscription.listByCustomer(userId);

  for (const subscription of subscriptions) {
    if (
      subscription.isDeleted ||
      !activeStatusIds.has(subscription.subscriptionStatusId)
    ) {
      continue;
    }

    const organizationUser = await services.organization.getOrganizationUser(
      subscription.organizationUserId,
    );

    if (
      !organizationUser ||
      organizationUser.organizationId !== organizationId ||
      organizationUser.userId !== userId
    ) {
      continue;
    }

    if (
      !isDateWithinValidity(
        new Date(),
        subscription.startDate,
        subscription.endDate,
      )
    ) {
      continue;
    }

    const products =
      await services.membershipProduct.listProducts(organizationId);

    const matchingProduct = products.find(
      (product) =>
        !product.isDeleted && product.id === offer.membershipProductId,
    );

    if (!matchingProduct) {
      return {
        ok: false,
        message: "The membership product required by this offer was not found.",
      };
    }

    const planBelongsToProduct = matchingProduct.plans.some(
      (plan) => !plan.isDeleted && plan.id === subscription.subscriptionPlanId,
    );

    if (planBelongsToProduct) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    message:
      "This offer is available only to an active member of the required membership product.",
  };
}

async function validateUsageRules(
  services: OfferRedemptionEngineServices,
  offer: Offer,
  userId: ID,
  now: Date,
): Promise<
  | { ok: true }
  | {
      ok: false;
      kind: "OUTSIDE_VALIDITY" | "USAGE_LIMIT_REACHED";
      message: string;
    }
> {
  const rules = await services.offerRedemptionQR.constructor;

  void rules;

  // The OfferUsageRuleService is intentionally not part of the shared
  // Benefit redemption contract. The registry will inject it when this
  // engine is wired. The concrete lookup is performed by the overload below.
  return { ok: true };
}

/**
 * Redeem an Offer QR.
 *
 * The optional OfferUsageRule service is accepted separately so the Offer
 * flow never depends on Benefit Usage Rules or Benefit Redemption.
 */
export async function redeemOffer(
  services: OfferRedemptionEngineServices & {
    offerUsageRule: {
      listByOffer(offerId: ID): Promise<OfferUsageRule[]>;
    };
  },
  context: OfferRedemptionContext,
  request: { token: string },
): Promise<OfferRedemptionResult> {
  if (!context.organizationId) {
    return {
      kind: "INVALID",
      message: "Business context is required.",
    };
  }

  if (!context.storeId) {
    return {
      kind: "INVALID",
      message: "Select a store before processing an offer redemption.",
    };
  }

  const qr = await services.offerRedemptionQR.getByToken(request.token);

  if (!qr) {
    return {
      kind: "INVALID",
      message: "Invalid or unknown Offer redemption QR.",
    };
  }

  if (qr.qrCode.organizationId !== context.organizationId) {
    return {
      kind: "FAILED",
      message: "This Offer QR belongs to a different business.",
    };
  }

  const activeQRStatus = await services.status.getStatus(qr.qrCode.statusId);

  if (activeQRStatus && !activeQRStatus.isActive) {
    return {
      kind: "FAILED",
      message: "This Offer redemption QR is no longer active.",
    };
  }

  const user = await services.organization.getUser(qr.context.userId);

  if (!user || user.isDeleted) {
    return {
      kind: "FAILED",
      message: "The customer associated with this Offer QR could not be found.",
    };
  }

  const organizationUser = await resolveOrganizationUser(
    services.organization,
    context.organizationId,
    qr.context.userId,
  );

  if (!organizationUser) {
    return {
      kind: "FAILED",
      message: "The customer does not belong to this business.",
    };
  }

  if (qr.context.organizationId !== context.organizationId) {
    return {
      kind: "FAILED",
      message: "The Offer QR business context is invalid.",
    };
  }

  const offers = await services.offer.listByOrganization(
    context.organizationId,
  );

  const offer =
    offers.find(
      (candidate) =>
        candidate.id === qr.context.offerId && !candidate.isDeleted,
    ) ?? null;

  if (!offer) {
    return {
      kind: "FAILED",
      message: "The offer associated with this QR could not be found.",
    };
  }

  if (offer.organizationId !== context.organizationId) {
    return {
      kind: "FAILED",
      message: "The offer belongs to a different business.",
    };
  }

  if (!(await isOfferActive(services.status, offer))) {
    return {
      kind: "INELIGIBLE",
      message: "This offer is not active.",
      offer,
      userId: qr.context.userId,
    };
  }

  const now = new Date();

  if (!isDateWithinValidity(now, offer.effectiveDate, offer.expiryDate)) {
    return {
      kind: "OUTSIDE_VALIDITY",
      message: "This offer is outside its validity period.",
      offer,
      userId: qr.context.userId,
    };
  }

  if (offer.storeId && offer.storeId !== context.storeId) {
    return {
      kind: "INELIGIBLE",
      message: "This offer is not valid at the selected store.",
      offer,
      userId: qr.context.userId,
    };
  }

  const membershipEligibility = await validateMembershipEligibility(
    services,
    context.organizationId,
    qr.context.userId,
    offer,
  );

  if (!membershipEligibility.ok) {
    return {
      kind: "INELIGIBLE",
      message: membershipEligibility.message,
      offer,
      userId: qr.context.userId,
    };
  }

  const rules = await services.offerUsageRule.listByOffer(offer.id);

  const existing = await services.offerRedemption.listByUser(qr.context.userId);

  for (const rule of rules) {
    const ruleStatus = await services.status.getStatus(
      rule.offerUsageRuleStatusId,
    );

    if (ruleStatus && !ruleStatus.isActive) {
      continue;
    }

    if (!isApplicableNow(rule, now)) {
      return {
        kind: "USAGE_LIMIT_REACHED",
        message: "This offer cannot be used at the current time.",
        offer,
        userId: qr.context.userId,
      };
    }

    const windowStart = subtractFrequencyWindow(now, rule);

    const usageCount = existing
      .filter((redemption) => {
        if (redemption.offerId !== offer.id || redemption.isDeleted) {
          return false;
        }

        const redemptionDate = toDate(redemption.redemptionDateTime);

        return redemptionDate ? redemptionDate >= windowStart : false;
      })
      .reduce((total, redemption) => total + (redemption.quantity || 0), 0);

    if (usageCount >= Math.max(1, rule.usageLimit || 1)) {
      return {
        kind: "USAGE_LIMIT_REACHED",
        message: `Usage limit reached for rule "${rule.ruleName}".`,
        offer,
        userId: qr.context.userId,
      };
    }
  }

  /*
   * A redemption QR represents the customer credential. The QR itself is
   * single-use once an OfferRedemption exists for this offer/customer.
   *
   * We deliberately do not inspect Benefit Redemption records here.
   */
  const alreadyRedeemed = existing.some(
    (redemption) => redemption.offerId === offer.id && !redemption.isDeleted,
  );

  if (alreadyRedeemed) {
    return {
      kind: "ALREADY_USED",
      message: "This offer has already been redeemed by this customer.",
      offer,
      userId: qr.context.userId,
    };
  }

  const activeRedemptionStatus =
    await services.status.getStatusByCode("REDEEMED");

  if (!activeRedemptionStatus) {
    return {
      kind: "FAILED",
      message: "Redeemed status could not be resolved.",
      offer,
      userId: qr.context.userId,
    };
  }

  const timestamp = new Date().toISOString();

  const randomPart = Math.random().toString(36).slice(2, 10);

  const redemption: OfferRedemption = {
    id: `offer-redemption-${Date.now().toString(36)}-${randomPart}`,
    redemptionNumber: `OR-${Date.now().toString(36).toUpperCase()}-${randomPart.toUpperCase()}`,

    organizationId: context.organizationId,
    offerId: offer.id,
    userId: qr.context.userId,

    storeId: context.storeId,
    staffId: context.staffId,

    method: context.method,
    redemptionDateTime: timestamp,

    quantity: 1,

    redemptionStatusId: activeRedemptionStatus.id,

    remarks: context.remarks,

    createdAt: timestamp,
    createdBy: context.staffId,
    updatedAt: timestamp,
    updatedBy: context.staffId,

    isDeleted: false,
    versionNo: 1,
  };

  try {
    const created = await services.offerRedemption.create(redemption);

    return {
      kind: "SUCCESS",
      message: "Offer redeemed successfully.",
      offer,
      redemption: created,
      userId: qr.context.userId,
    };
  } catch (error) {
    return {
      kind: "FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Unable to create the Offer redemption.",
      offer,
      userId: qr.context.userId,
    };
  }
}
