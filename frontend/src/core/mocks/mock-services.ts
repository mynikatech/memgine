import { BusinessContext } from "../context/business-context";
import { BillingInterval, ID } from "../domain/common";
import {
  Benefit,
  BenefitType,
  Customer,
  MembershipProduct,
  Offer,
  Organization,
  OrganizationAccount,
  Redemption,
  RedemptionStatus,
  Store,
  Subscription,
  SubscriptionStatus,
} from "../domain/entities";
import {
  BenefitService,
  CreateCustomerInput,
  CreateSubscriptionInput,
  CustomerAuthService,
  CustomerLookupQuery,
  CustomerService,
  MembershipProductService,
  OfferService,
  OrganizationService,
  PaymentRequest,
  PaymentResult,
  PaymentService,
  PerformRedemptionInput,
  RedemptionService,
  SendOtpInput,
  SendOtpResult,
  SubscriptionService,
  VerifyOtpInput,
  VerifyOtpResult,
} from "../services/service-contracts";
import {
  SUNRISE_BAKERY_ACCOUNT,
  SUNRISE_BAKERY_CONTEXT,
  SUNRISE_BAKERY_ORGANIZATION,
} from "../defaults/sunrise-bakery";

/**
 * In-memory service implementations. Their ONLY purpose is to demonstrate that
 * the frozen service contracts compile and can be consumed. They are not wired
 * into any UI and connect to no database or backend.
 */

let idCounter = 0;
const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${idCounter++}`;

const stores: Store[] = [
  {
    id: "store-1",
    organizationId: "org-sunrise",
    name: "Sunrise Bakery — Main St",
    address: {
      line1: "1 Main St",
      city: "San Francisco",
      region: "CA",
      postalCode: "94016",
      countryCode: "US",
    },
    timezone: "America/Los_Angeles",
    isActive: true,
  },
];

const benefits: Benefit[] = [
  {
    id: "ben-1",
    organizationId: "org-sunrise",
    title: "10% off pastries",
    description: "On all pastries",
    type: BenefitType.DISCOUNT,
  },
  {
    id: "ben-2",
    organizationId: "org-sunrise",
    title: "Free birthday cupcake",
    description: "During your birthday month",
    type: BenefitType.FREEBIE,
    validity: { recurrence: "birthday-month" },
  },
  {
    id: "ben-3",
    organizationId: "org-sunrise",
    title: "Free filter coffee",
    description: "One cup per day",
    type: BenefitType.FREEBIE,
  },
];

const products: MembershipProduct[] = [
  {
    id: "prod-1",
    organizationId: "org-sunrise",
    name: "Sunrise Club",
    description: "Perks for regulars",
    tier: "Gold",
    benefitIds: ["ben-1", "ben-2"],
    isPublished: true,
    plans: [
      {
        id: "plan-1",
        name: "Yearly",
        price: { amountMinor: 4900, currency: "CAD" },
        billingInterval: BillingInterval.YEARLY,
      },
    ],
  },
  {
    id: "prod-2",
    organizationId: "org-sunrise",
    name: "Coffee Club",
    description: "For daily coffee lovers",
    tier: "Silver",
    benefitIds: ["ben-3"],
    isPublished: true,
    plans: [
      {
        id: "plan-2",
        name: "Monthly",
        price: { amountMinor: 19900, currency: "INR" },
        billingInterval: BillingInterval.MONTHLY,
      },
    ],
  },
];

const customers: Customer[] = [
  {
    id: "cust-1",
    fullName: "Ada Baker",
    email: "ada@example.com",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
];

const subscriptions: Subscription[] = [
  {
    id: "sub-1",
    organizationId: "org-sunrise",
    customerId: "cust-1",
    membershipProductId: "prod-1",
    planId: "plan-1",
    status: SubscriptionStatus.ACTIVE,
    startedAt: "2026-02-01T00:00:00.000Z",
    currentPeriodEnd: "2027-02-01T00:00:00.000Z",
  },
  {
    id: "sub-2",
    organizationId: "org-sunrise",
    customerId: "cust-1",
    membershipProductId: "prod-2",
    planId: "plan-2",
    status: SubscriptionStatus.ACTIVE,
    startedAt: "2026-03-01T00:00:00.000Z",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
  },
];

const redemptions: Redemption[] = [
  {
    id: "red-1",
    organizationId: "org-sunrise",
    subscriptionId: "sub-1",
    benefitId: "ben-1",
    storeId: "store-1",
    staffId: "staff-dev-owner",
    redeemedAt: "2026-07-20T14:30:00.000Z",
    status: RedemptionStatus.COMPLETED,
  },
  {
    id: "red-2",
    organizationId: "org-sunrise",
    subscriptionId: "sub-1",
    benefitId: "ben-2",
    storeId: "store-1",
    staffId: "staff-dev-owner",
    redeemedAt: "2026-06-05T09:10:00.000Z",
    status: RedemptionStatus.COMPLETED,
  },
];

const offers: Offer[] = [
  {
    id: "off-1",
    organizationId: "org-sunrise",
    title: "Weekend Croissant Combo",
    description: "Any coffee + croissant for a sweet weekend price.",
    badge: "This weekend",
    targetProductIds: ["prod-1"],
  },
  {
    id: "off-2",
    organizationId: "org-sunrise",
    title: "Double Rewards Tuesday",
    description: "Earn twice the rewards on every visit this Tuesday.",
    badge: "Members only",
  },
];

export class InMemoryOrganizationService implements OrganizationService {
  async getOrganization(id: ID): Promise<Organization | null> {
    return id === SUNRISE_BAKERY_ORGANIZATION.id ? SUNRISE_BAKERY_ORGANIZATION : null;
  }
  async getAccount(organizationId: ID): Promise<OrganizationAccount | null> {
    return organizationId === SUNRISE_BAKERY_ACCOUNT.organizationId ? SUNRISE_BAKERY_ACCOUNT : null;
  }
  async getBusinessContext(organizationId: ID): Promise<BusinessContext | null> {
    return organizationId === SUNRISE_BAKERY_ORGANIZATION.id ? SUNRISE_BAKERY_CONTEXT : null;
  }
  async listStores(organizationId: ID): Promise<Store[]> {
    return stores.filter((s) => s.organizationId === organizationId);
  }
}

export class InMemoryCustomerService implements CustomerService {
  async getCustomer(id: ID): Promise<Customer | null> {
    return customers.find((c) => c.id === id) ?? null;
  }
  async findCustomers(query: CustomerLookupQuery): Promise<Customer[]> {
    return customers.filter(
      (c) =>
        (!query.email || c.email === query.email) &&
        (!query.phone || c.phone === query.phone) &&
        (!query.nameContains || c.fullName.toLowerCase().includes(query.nameContains.toLowerCase())),
    );
  }
  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const customer: Customer = {
      id: genId("cust"),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      createdAt: new Date().toISOString(),
    };
    customers.push(customer);
    return customer;
  }
}

export class InMemoryMembershipProductService implements MembershipProductService {
  async listProducts(organizationId: ID): Promise<MembershipProduct[]> {
    return products.filter((p) => p.organizationId === organizationId);
  }
  async getProduct(id: ID): Promise<MembershipProduct | null> {
    return products.find((p) => p.id === id) ?? null;
  }
}

export class InMemorySubscriptionService implements SubscriptionService {
  async listByCustomer(customerId: ID): Promise<Subscription[]> {
    return subscriptions.filter((s) => s.customerId === customerId);
  }
  async listByOrganization(organizationId: ID): Promise<Subscription[]> {
    return subscriptions.filter((s) => s.organizationId === organizationId);
  }
  async getSubscription(id: ID): Promise<Subscription | null> {
    return subscriptions.find((s) => s.id === id) ?? null;
  }
  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const subscription: Subscription = {
      id: genId("sub"),
      organizationId: input.organizationId,
      customerId: input.customerId,
      membershipProductId: input.membershipProductId,
      planId: input.planId,
      status: SubscriptionStatus.ACTIVE,
      startedAt: new Date().toISOString(),
    };
    subscriptions.push(subscription);
    return subscription;
  }
}

export class InMemoryBenefitService implements BenefitService {
  async listByOrganization(organizationId: ID): Promise<Benefit[]> {
    return benefits.filter((b) => b.organizationId === organizationId);
  }
  async listByProduct(membershipProductId: ID): Promise<Benefit[]> {
    const product = products.find((p) => p.id === membershipProductId);
    if (!product) return [];
    return benefits.filter((b) => product.benefitIds.includes(b.id));
  }
}

export class InMemoryRedemptionService implements RedemptionService {
  async performRedemption(input: PerformRedemptionInput): Promise<Redemption> {
    const redemption: Redemption = {
      id: genId("red"),
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      benefitId: input.benefitId,
      storeId: input.storeId,
      staffId: input.staffId,
      redeemedAt: new Date().toISOString(),
      status: RedemptionStatus.COMPLETED,
    };
    redemptions.push(redemption);
    return redemption;
  }
  async listBySubscription(subscriptionId: ID): Promise<Redemption[]> {
    return redemptions.filter((r) => r.subscriptionId === subscriptionId);
  }
}

/**
 * Mock customer OTP auth. NOT a real SMS/auth provider. Returns a dev code so
 * the UI can display it. Identifies the existing mock customer on success.
 */
export class InMemoryCustomerAuthService implements CustomerAuthService {
  private codes = new Map<string, string>();

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    const requestId = genId("otp");
    const devCode = String(Math.floor(100000 + Math.random() * 900000));
    this.codes.set(requestId, devCode);
    return { requestId, devCode };
  }

  async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const expected = this.codes.get(input.requestId);
    const verified = !!expected && expected === input.code;
    if (verified) this.codes.delete(input.requestId);
    return { verified, customerId: verified ? "cust-1" : undefined };
  }
}

/**
 * Mock payment. NOT a real gateway/vendor. Always succeeds and returns a
 * reference. Provider-neutral so a real processor can replace it later.
 */
export class InMemoryPaymentService implements PaymentService {
  async pay(request: PaymentRequest): Promise<PaymentResult> {
    return { status: "PAID", reference: genId("pay").toUpperCase() };
  }
}

export class InMemoryOfferService implements OfferService {
  async listByOrganization(organizationId: ID): Promise<Offer[]> {
    return offers.filter((o) => o.organizationId === organizationId);
  }
}

/** Convenience aggregate of the mock services (compile-demonstration only). */
export const mockServices = {
  organization: new InMemoryOrganizationService(),
  customer: new InMemoryCustomerService(),
  membershipProduct: new InMemoryMembershipProductService(),
  subscription: new InMemorySubscriptionService(),
  benefit: new InMemoryBenefitService(),
  redemption: new InMemoryRedemptionService(),
  offer: new InMemoryOfferService(),
  auth: new InMemoryCustomerAuthService(),
  payment: new InMemoryPaymentService(),
};
