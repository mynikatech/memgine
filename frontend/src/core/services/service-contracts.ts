import { BusinessContext } from "../context/business-context";
import { ID, Money } from "../domain/common";
import { CurrencyCode } from "../localization/localization";
import {
  Benefit,
  Customer,
  EntityStatus,
  EntityType,
  MembershipProduct,
  PaymentMethod,
  PurchaseSource,
  Offer,
  Staff,
  Organization,
  OrganizationDetails,
  OrganizationBranding,
  NotificationConfiguration,
  IntegrationConfiguration,
  OrganizationAccount,
  Redemption,
  RedemptionMethod,
  Store,
  Subscription,
  OrganizationUser,
  UserAcquisition,
  SubscriptionPlan,
  Status,
} from "../domain/entities";

/**
 * Typed service contracts for the FUTURE service layer. These define expected
 * operations and types only — no database, no external backend. Mock in-memory
 * implementations live under ../mocks purely to prove the contracts compile and
 * can be consumed. No business workflows are implemented here.
 */

export interface CustomerLookupQuery {
  email?: string;
  phone?: string;
  nameContains?: string;
}

export interface CreateCustomerInput {
  fullName: string;
  email?: string;
  phone?: string;
}

export interface CreateSubscriptionInput {
  subscriptionNumber: string;
  subscriptionPlanId: ID;
  organizationUserId: ID;

  subscriptionDate: string;
  startDate: string;
  endDate: string;

  subscriptionStatusId: ID;

  totalAmount: Money;

  createdBy: ID;
}

export interface PerformRedemptionInput {
  subscriptionId: ID;
  benefitId: ID;
  storeId: ID;
  staffId?: ID;

  method: RedemptionMethod;

  quantity?: number;
  remarks?: string;

  createdBy: ID;
}

export interface EntityTypeService {
  getEntityType(id: ID): Promise<EntityType | null>;

  getEntityTypeByCode(code: string): Promise<EntityType | null>;

  listEntityTypes(): Promise<EntityType[]>;

  listActiveEntityTypes(): Promise<EntityType[]>;
}

export interface StatusService {
  getStatus(id: ID): Promise<Status | null>;

  getStatusByCode(code: string): Promise<Status | null>;

  listStatuses(): Promise<Status[]>;

  listActiveStatuses(): Promise<Status[]>;
}

export interface EntityStatusService {
  getEntityStatus(id: ID): Promise<EntityStatus | null>;

  listByEntityType(entityTypeId: ID): Promise<EntityStatus[]>;

  listByEntityTypeCode(entityTypeCode: string): Promise<EntityStatus[]>;

  listStatusesByEntityType(entityTypeId: ID): Promise<Status[]>;

  listStatusesByEntityTypeCode(entityTypeCode: string): Promise<Status[]>;
}

export interface OrganizationService {
  getOrganization(id: ID): Promise<Organization | null>;
  getAccount(organizationId: ID): Promise<OrganizationAccount | null>;
  getBusinessContext(organizationId: ID): Promise<BusinessContext | null>;
  listStores(organizationId: ID): Promise<Store[]>;
  createStore(organizationId: ID, store: Store): Promise<Store>;
  updateStore(organizationId: ID, store: Store): Promise<Store>;
  deleteStore(organizationId: ID, storeId: ID): Promise<void>;
  listOrganizationUsersByUser(userId: ID): Promise<OrganizationUser[]>;
  getOrganizationUser(id: ID): Promise<OrganizationUser | null>;
  getOrganizationDetails(
    organizationId: ID,
  ): Promise<OrganizationDetails | null>;
  getOrganizationBranding(
    organizationId: ID,
  ): Promise<OrganizationBranding | null>;
  getNotificationConfiguration(
    organizationId: ID,
  ): Promise<NotificationConfiguration | null>;
  listIntegrationConfigurations(
    organizationId: ID,
  ): Promise<IntegrationConfiguration[]>;
  updateOrganization(
    organizationId: ID,
    organization: Organization,
  ): Promise<Organization>;
  updateOrganizationDetails(
    organizationId: ID,
    details: OrganizationDetails,
  ): Promise<OrganizationDetails>;
  updateOrganizationBranding(
    organizationId: ID,
    branding: OrganizationBranding,
  ): Promise<OrganizationBranding>;
  updateNotificationConfiguration(
    organizationId: ID,
    configuration: NotificationConfiguration,
  ): Promise<NotificationConfiguration>;
  updateIntegrationConfiguration(
    organizationId: ID,
    configuration: IntegrationConfiguration,
  ): Promise<IntegrationConfiguration>;
  listIntegrationConfigurations(
    organizationId: string,
  ): Promise<IntegrationConfiguration[]>;

  createIntegrationConfiguration(
    organizationId: string,
    configuration: IntegrationConfiguration,
  ): Promise<IntegrationConfiguration>;

  updateIntegrationConfiguration(
    organizationId: string,
    configuration: IntegrationConfiguration,
  ): Promise<IntegrationConfiguration>;

  deleteIntegrationConfiguration(
    organizationId: string,
    configurationId: string,
  ): Promise<void>;
  listStaff(organizationId: ID): Promise<Staff[]>;
  createStaff(organizationId: ID, staff: Staff): Promise<Staff>;
  updateStaff(organizationId: ID, staff: Staff): Promise<Staff>;
  deleteStaff(organizationId: ID, staffId: ID): Promise<void>;
  listOrganizationUsers(organizationId: ID): Promise<OrganizationUser[]>;
  createOrganizationUser(
    organizationId: ID,
    organizationUser: OrganizationUser,
  ): Promise<OrganizationUser>;
}

export interface CustomerService {
  getCustomer(id: ID): Promise<Customer | null>;
  findCustomers(query: CustomerLookupQuery): Promise<Customer[]>;
  createCustomer(input: CreateCustomerInput): Promise<Customer>;
}

export interface MembershipProductService {
  listProducts(organizationId: ID): Promise<MembershipProduct[]>;
  getProduct(id: ID): Promise<MembershipProduct | null>;

  createProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct>;

  updateProduct(
    organizationId: ID,
    product: MembershipProduct,
  ): Promise<MembershipProduct>;

  deleteProduct(organizationId: ID, productId: ID): Promise<void>;
}

export interface SubscriptionService {
  /**
   * Returns all subscriptions owned by a global user/customer.
   *
   * The lookup is resolved through OrganizationUser.
   * Subscription does NOT directly contain customerId.
   */
  listByCustomer(customerId: ID): Promise<Subscription[]>;
  /** Customer "My Cards" view. */
  listByOrganizationUser(organizationUserId: ID): Promise<Subscription[]>;

  /** Organization Admin subscription view. */
  listByOrganization(organizationId: ID): Promise<Subscription[]>;

  getSubscription(id: ID): Promise<Subscription | null>;

  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
}

export interface SubscriptionPlanService {
  getPlan(id: ID): Promise<SubscriptionPlan | null>;

  listByProduct(membershipProductId: ID): Promise<SubscriptionPlan[]>;
}

export interface BenefitService {
  listByOrganization(organizationId: ID): Promise<Benefit[]>;
  listByProduct(membershipProductId: ID): Promise<Benefit[]>;
  createBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit>;
  updateBenefit(organizationId: ID, benefit: Benefit): Promise<Benefit>;
  deleteBenefit(organizationId: ID, benefitId: ID): Promise<void>;
}

export interface RedemptionService {
  performRedemption(input: PerformRedemptionInput): Promise<Redemption>;
  listBySubscription(subscriptionId: ID): Promise<Redemption[]>;
}

/* ------------------------------------------------------------------ *
 * Customer acquisition service boundaries (mock in this stage).
 * Provider-neutral — a real SMS/OTP or payment provider can implement
 * these later with no UI changes.
 * ------------------------------------------------------------------ */

export interface SendOtpInput {
  mobile: string;
}
export interface SendOtpResult {
  requestId: string;
  /** Development-only convenience so the mock OTP can be shown in the UI. */
  devCode: string;
}
export interface VerifyOtpInput {
  requestId: string;
  code: string;
}
export interface VerifyOtpResult {
  verified: boolean;
  customerId?: ID;
}

export interface CustomerAuthService {
  sendOtp(input: SendOtpInput): Promise<SendOtpResult>;
  verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult>;
}

export type PaymentStatus = "PAID" | "FAILED";

export interface PaymentRequest {
  amountMinor: number;
  currency: CurrencyCode;
  description?: string;
}
export interface PaymentResult {
  status: PaymentStatus;
  reference: string;
}

export interface PaymentService {
  pay(request: PaymentRequest): Promise<PaymentResult>;
}

export interface OfferService {
  listByOrganization(organizationId: ID): Promise<Offer[]>;
  createOffer(organizationId: ID, offer: Offer): Promise<Offer>;
  updateOffer(organizationId: ID, offer: Offer): Promise<Offer>;
  deleteOffer(organizationId: ID, offerId: ID): Promise<void>;
}

export interface UserAcquisitionService {
  getByUser(userId: ID): Promise<UserAcquisition[]>;

  listByOrganization(organizationId: ID): Promise<UserAcquisition[]>;

  listBySourceStore(storeId: ID): Promise<UserAcquisition[]>;

  createAcquisition(acquisition: UserAcquisition): Promise<UserAcquisition>;
}
