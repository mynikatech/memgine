import { BusinessContext } from "../context/business-context";
import { ID } from "../domain/common";
import { CurrencyCode } from "../localization/localization";
import {
  Benefit,
  Customer,
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
  organizationId: ID;
  customerId: ID;
  membershipProductId: ID;
  planId: ID;
  /** Staff-assisted purchase attribution (optional). */
  source?: PurchaseSource;
  staffId?: ID;
  storeId?: ID;
  paymentMethod?: PaymentMethod;
}

export interface PerformRedemptionInput {
  organizationId: ID;
  customerId: ID;
  subscriptionId: ID;
  benefitId: ID;
  storeId: ID;
  staffId: ID;
  method: RedemptionMethod;
  promoCode?: string;
}

export interface OrganizationService {
  getOrganization(id: ID): Promise<Organization | null>;
  getAccount(organizationId: ID): Promise<OrganizationAccount | null>;
  getBusinessContext(organizationId: ID): Promise<BusinessContext | null>;
  listStores(organizationId: ID): Promise<Store[]>;
  createStore(organizationId: ID, store: Store): Promise<Store>;
  updateStore(organizationId: ID, store: Store): Promise<Store>;
  deleteStore(organizationId: ID, storeId: ID): Promise<void>;
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
  /** Backs the customer "My Cards" view. */
  listByCustomer(customerId: ID): Promise<Subscription[]>;
  listByOrganization(organizationId: ID): Promise<Subscription[]>;
  getSubscription(id: ID): Promise<Subscription | null>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
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
}
