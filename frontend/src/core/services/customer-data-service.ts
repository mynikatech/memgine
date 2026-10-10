import type {
  Benefit,
  BenefitUsageRule,
  ID,
  MembershipProduct,
  Offer,
  Store,
} from "@/src/core";
import { CustomerDataApi } from "@/src/data/api/customer-data-api";
import type { PoyntCollectBootstrap, PoyntCollectCheckoutSession } from "@/src/data/api/customer-data-api";
import type {
  CustomerDiscoverableOrganization,
  CustomerCombinedOffer,
  CustomerDiscoveryDetail,
  CustomerRedemptionItemStatus,
  CustomerRedemptionTransactionStatus,
  CustomerRedemptionTransactionRequest,
  PendingRedemptionTransaction,
  RedemptionTransactionQr,
  CustomerMembershipPurchaseOfferQr,
} from "@/src/data/api/customer-data-api";
import type {
  CounterPurchaseResult,
  CounterSubscription,
} from "@/src/data/api/counter-api";
import type {
  MembershipPurchaseQuote,
  PaymentConfirmation,
  PaymentIntent,
} from "@/src/data/api/counter-api";
import type { OrgAdminRedemption } from "@/src/data/api/org-admin-transaction-api";

export type CustomerChoice = { userId: ID; displayName: string };

export class CustomerPaymentStatusError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}
export type CustomerProfile = {
  organizationUserId: ID;
  organizationId: ID;
  organizationName: string;
  userId: ID;
  userCode: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  primaryEmail?: string | null;
  primaryPhone: string;
  userStatusId: ID;
  userStatusName: string;
  organizationUserTypeId: ID;
  organizationUserStatusId: ID;
  relationshipStatusName: string;
  joiningDate: string;
  subscriptionCount: number;
  membershipName?: string | null;
};

/** Customer-facing data only. Server errors always reach the screen. */
export class CustomerDataService {
  constructor(private readonly api: CustomerDataApi) {}

  async choices(): Promise<CustomerChoice[]> {
    const result = await this.api.choices();
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async discoverOrganizations(): Promise<CustomerDiscoverableOrganization[]> {
    const result = await this.api.discoverOrganizations();
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }
  async issueMembershipPurchaseOfferQr(
    organizationId: ID,
    offerId: ID,
  ): Promise<CustomerMembershipPurchaseOfferQr> {
    const result = await this.api.issueMembershipPurchaseOfferQr(
      organizationId,
      offerId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async discoverOrganizationDetail(
    organizationId: ID,
  ): Promise<CustomerDiscoveryDetail> {
    const result = await this.api.discoverOrganizationDetail(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async redemptionItemStatuses(
    organizationId: ID,
    subscriptionId: ID,
  ): Promise<CustomerRedemptionItemStatus[]> {
    const result = await this.api.redemptionItemStatuses(
      organizationId,
      subscriptionId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async createRedemptionTransaction(
    organizationId: ID,
    request: CustomerRedemptionTransactionRequest,
  ): Promise<PendingRedemptionTransaction> {
    const result = await this.api.createRedemptionTransaction(
      organizationId,
      request,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async issueRedemptionTransactionQr(
    organizationId: ID,
    transactionId: ID,
  ): Promise<RedemptionTransactionQr> {
    const result = await this.api.issueRedemptionTransactionQr(
      organizationId,
      transactionId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async redemptionTransactionStatus(
    organizationId: ID,
    transactionId: ID,
  ): Promise<CustomerRedemptionTransactionStatus> {
    const result = await this.api.redemptionTransactionStatus(
      organizationId,
      transactionId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async profiles(userId?: ID): Promise<CustomerProfile[]> {
    const result = await this.api.profiles(userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async subscriptions(
    organizationId: ID,
    userId: ID,
  ): Promise<CounterSubscription[]> {
    const result = await this.api.subscriptions(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async redemptions(
    organizationId: ID,
    userId: ID,
  ): Promise<OrgAdminRedemption[]> {
    const result = await this.api.redemptions(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async membershipProducts(
    organizationId: ID,
    userId?: ID,
  ): Promise<MembershipProduct[]> {
    const result = await this.api.membershipProducts(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async benefits(organizationId: ID, userId?: ID): Promise<Benefit[]> {
    const result = await this.api.benefits(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  benefitRules(
    organizationId: ID,
    userId: ID,
    benefitId: ID,
  ): Promise<BenefitUsageRule[]> {
    return this.api.benefitRules(organizationId, userId, benefitId);
  }

  async offers(organizationId: ID, userId: ID): Promise<Offer[]> {
    const result = await this.api.offers(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async combinedOffers(organizationId: ID): Promise<CustomerCombinedOffer[]> {
    const result = await this.api.combinedOffers(organizationId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async stores(organizationId: ID, userId: ID): Promise<Store[]> {
    const result = await this.api.stores(organizationId, userId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async purchase(
    organizationId: ID,
    input: {
      planId: ID;
      customerUserId?: ID;
      firstName?: string;
      lastName?: string;
      primaryEmail?: string;
      primaryPhone?: string;
    },
  ): Promise<CounterPurchaseResult> {
    const result = await this.api.purchase(organizationId, input);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async startAuthenticatedPayment(
    organizationId: ID,
    planId: ID,
    idempotencyKey: string,
    productId?: ID,
    explicitOfferId?: ID,
  ): Promise<PaymentIntent> {
    const result = await this.api.startAuthenticatedPayment(
      organizationId,
      planId,
      idempotencyKey,
      productId,
      explicitOfferId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async purchaseQuote(
    organizationId: ID,
    planId: ID,
    explicitOfferId?: ID,
  ): Promise<MembershipPurchaseQuote> {
    const result = await this.api.purchaseQuote(
      organizationId,
      planId,
      explicitOfferId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async confirmTestPayment(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<PaymentConfirmation> {
    const result = await this.api.confirmTestPayment(
      organizationId,
      paymentIntentId,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async confirmMonerisPayment(
    organizationId: ID,
    paymentIntentId: ID,
    temporaryToken: string,
  ): Promise<PaymentConfirmation> {
    const result = await this.api.confirmMonerisPayment(
      organizationId,
      paymentIntentId,
      temporaryToken,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async collectBootstrap(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<PoyntCollectBootstrap> {
    const result = await this.api.collectBootstrap(organizationId, paymentIntentId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async createCollectBrowserCheckout(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<PoyntCollectCheckoutSession> {
    const result = await this.api.createCollectBrowserCheckout(organizationId, paymentIntentId);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async confirmCollectPayment(
    organizationId: ID,
    paymentIntentId: ID,
    nonce: string,
  ): Promise<PaymentConfirmation> {
    const result = await this.api.confirmCollectPayment(organizationId, paymentIntentId, nonce);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  }

  async paymentStatus(
    organizationId: ID,
    paymentIntentId: ID,
  ): Promise<PaymentConfirmation> {
    const result = await this.api.paymentStatus(organizationId, paymentIntentId);
    if (!result.success) throw new CustomerPaymentStatusError(result.error.message, result.error.code);
    return result.data;
  }

  async preference(
    organizationId: ID,
    userId: ID,
    code: string,
  ): Promise<string | null> {
    const result = await this.api.preference(organizationId, userId, code);
    if (!result.success) throw new Error(result.error.message);
    return result.data.value;
  }

  async setPreference(
    organizationId: ID,
    userId: ID,
    code: string,
    value: string,
  ): Promise<string> {
    const result = await this.api.setPreference(
      organizationId,
      userId,
      code,
      value,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data.value;
  }
}
