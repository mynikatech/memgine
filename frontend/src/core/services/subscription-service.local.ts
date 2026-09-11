import type {
  ID,
  OrganizationService,
  Subscription,
  SubscriptionService,
} from "@/src/core";

import { apis } from "@/src/data";
import type { QRMembershipAcquisitionAttributionService } from "./qr-membership-acquisition-attribution-service";

const SUBSCRIPTION_NUMBER_PREFIX = "SUB";

const generateSubscriptionNumber = (
  existingSubscriptions: Subscription[],
): string => {
  const year = new Date().getFullYear();

  const prefix = `${SUBSCRIPTION_NUMBER_PREFIX}-${year}`;

  const usedNumbers = new Set(
    existingSubscriptions
      .map((subscription) =>
        subscription.subscriptionNumber.trim().toUpperCase(),
      )
      .filter(Boolean),
  );

  let sequence = 1;

  while (usedNumbers.has(`${prefix}-${String(sequence).padStart(6, "0")}`)) {
    sequence += 1;
  }

  return `${prefix}-${String(sequence).padStart(6, "0")}`;
};

export class LocalSubscriptionService implements SubscriptionService {
  constructor(
    private readonly fallback: SubscriptionService,
    private readonly organizationService: OrganizationService,
    private readonly qrMembershipAcquisitionAttributionService?: QRMembershipAcquisitionAttributionService,
  ) {}

  private async getPersistedSubscriptions(): Promise<Subscription[]> {
    const result = await apis.subscription.list();

    if (!result.success) {
      throw new Error(result.error.message);
    }

    return result.data;
  }

  private async getMergedSubscriptions(): Promise<Subscription[]> {
    const persisted = await this.getPersistedSubscriptions();

    const fallbackSubscriptions = await this.fallback
      .listByOrganization("__ALL_ORGANIZATIONS__")
      .catch(() => []);

    const byId = new Map<string, Subscription>();

    for (const subscription of fallbackSubscriptions) {
      byId.set(subscription.id, subscription);
    }

    for (const subscription of persisted) {
      byId.set(subscription.id, subscription);
    }

    return Array.from(byId.values()).filter(
      (subscription) => !subscription.isDeleted,
    );
  }

  async listByCustomer(customerId: ID): Promise<Subscription[]> {
    const organizationUsers =
      await this.organizationService.listOrganizationUsersByUser(customerId);

    const organizationUserIds = new Set(
      organizationUsers
        .filter((item) => !item.isDeleted)
        .map((item) => item.id),
    );

    const persisted = await this.getPersistedSubscriptions();

    const fallback = await this.fallback.listByCustomer(customerId);

    const byId = new Map<string, Subscription>();

    for (const subscription of fallback) {
      byId.set(subscription.id, subscription);
    }

    for (const subscription of persisted) {
      if (organizationUserIds.has(subscription.organizationUserId)) {
        byId.set(subscription.id, subscription);
      }
    }

    return Array.from(byId.values()).filter(
      (subscription) =>
        !subscription.isDeleted &&
        organizationUserIds.has(subscription.organizationUserId),
    );
  }

  async listByOrganizationUser(
    organizationUserId: ID,
  ): Promise<Subscription[]> {
    const persisted = await this.getPersistedSubscriptions();

    const fallback =
      await this.fallback.listByOrganizationUser(organizationUserId);

    const byId = new Map<string, Subscription>();

    for (const subscription of fallback) {
      byId.set(subscription.id, subscription);
    }

    for (const subscription of persisted) {
      if (subscription.organizationUserId === organizationUserId) {
        byId.set(subscription.id, subscription);
      }
    }

    return Array.from(byId.values()).filter(
      (subscription) =>
        !subscription.isDeleted &&
        subscription.organizationUserId === organizationUserId,
    );
  }

  async listByOrganization(organizationId: ID): Promise<Subscription[]> {
    const organizationUsers =
      await this.organizationService.listOrganizationUsers(organizationId);

    const organizationUserIds = new Set(
      organizationUsers
        .filter((item) => !item.isDeleted)
        .map((item) => item.id),
    );

    const persisted = await this.getPersistedSubscriptions();

    const fallback = await this.fallback.listByOrganization(organizationId);

    const byId = new Map<string, Subscription>();

    for (const subscription of fallback) {
      byId.set(subscription.id, subscription);
    }

    for (const subscription of persisted) {
      if (organizationUserIds.has(subscription.organizationUserId)) {
        byId.set(subscription.id, subscription);
      }
    }

    return Array.from(byId.values()).filter(
      (subscription) =>
        !subscription.isDeleted &&
        organizationUserIds.has(subscription.organizationUserId),
    );
  }

  async getSubscription(id: ID): Promise<Subscription | null> {
    const result = await apis.subscription.get(id);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    if (result.data) {
      return result.data;
    }

    return this.fallback.getSubscription(id);
  }

  async createSubscription(
    input: Parameters<SubscriptionService["createSubscription"]>[0],
  ): Promise<Subscription> {
    const organizationUser = await this.organizationService.getOrganizationUser(
      input.organizationUserId,
    );

    if (!organizationUser) {
      throw new Error(
        `OrganizationUser not found: ${input.organizationUserId}`,
      );
    }

    const existingSubscriptions = await this.getPersistedSubscriptions();

    const fallbackSubscriptions = await this.fallback.listByOrganizationUser(
      input.organizationUserId,
    );

    const allKnownSubscriptions = [
      ...fallbackSubscriptions,
      ...existingSubscriptions,
    ];

    const subscriptionNumber =
      input.subscriptionNumber?.trim() ||
      generateSubscriptionNumber(allKnownSubscriptions);

    const now = new Date().toISOString();

    const subscription: Subscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

      subscriptionNumber,

      subscriptionPlanId: input.subscriptionPlanId,

      organizationUserId: input.organizationUserId,

      subscriptionDate: input.subscriptionDate,

      startDate: input.startDate,

      endDate: input.endDate,

      subscriptionStatusId: input.subscriptionStatusId,

      totalAmount: input.totalAmount,

      createdAt: now,

      createdBy: input.createdBy,

      updatedAt: now,

      updatedBy: input.createdBy,

      isDeleted: false,

      versionNo: 1,
    };

    const result = await apis.subscription.create(subscription);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    /*
     * QR attribution is deliberately best-effort.
     *
     * The subscription is already persisted successfully. If attribution
     * cannot be resolved, the purchase must still succeed.
     */
    if (this.qrMembershipAcquisitionAttributionService) {
      try {
        await this.qrMembershipAcquisitionAttributionService.attributeSubscription(
          result.data,
        );
      } catch (error) {
        console.warn("QR MEMBERSHIP ACQUISITION ATTRIBUTION FAILED", error);
      }
    }

    return result.data;
  }
}
