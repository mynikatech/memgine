import { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type CustomerRoute = {
  name: string;

  title: string;

  icon: IoniconName;
};

export type CounterRoute = {
  name: string;

  title: string;

  href: string;

  icon: IoniconName;
};

/** Generic admin sidebar nav item. */

export type AdminRoute = {
  title: string;

  href: string;

  icon: IoniconName;

  children?: AdminRoute[];
};

/**

 * Canonical application routes.

 *

 * This is the single source of truth for application URLs.

 *

 * - Static routes are constants.

 * - Dynamic routes are represented as builders.

 * - UI components should use these constants instead of hard-coded

 *   navigation paths.

 */

export const APP_ROUTES = {
  root: "/",

  login: "/login",

  customerLogin: "/customer-login",

  register: "/register",

  mobileEntry: "/mobile-entry",

  paymentReturn: "/payment-return",

  counterUnlock: "/counter-unlock",

  workspaces: "/workspaces",

  platformAdmin: {
    root: "/platform-admin",

    organizations: "/platform-admin/organizations",

    organizationMaintenance: "/platform-admin/organization-maintenance",

    organizationMaintenanceFor: (organizationId: string) =>
      `/platform-admin/organization-maintenance/${encodeURIComponent(organizationId)}`,

    organizationNew: "/platform-admin/organization-new",

    organizationTypes: "/platform-admin/organization-types",

    templates: "/platform-admin/templates",

    themeBuilder: "/platform-admin/theme-builder",

    regionalSettings: "/platform-admin/regional-settings",

    paymentConfiguration: "/platform-admin/payment-configuration",

    supportRequests: "/platform-admin/support-requests",

    platformSettings: "/platform-admin/platform-settings",
  },

  orgAdmin: {
    root: "/org-admin",

    organization: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}`,

    business: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/business`,

    branding: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/branding`,

    stores: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/stores`,

    staffMembers: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/staff-members`,

    usersAccess: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/users-access`,

    products: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/products`,

    benefits: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/benefits`,

    memberships: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/memberships`,

    offers: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/offers`,

    customers: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/customers`,

    subscriptions: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/subscriptions`,

    transactions: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/transactions`,

    paymentExceptions: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/payment-exceptions`,

    supportRequests: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/support-requests`,

    notifications: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/notifications`,

    redemptions: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/redemptions`,

    customerExperience: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/customer-experience`,

    customerExperiencePreview: (organizationId: string) =>
      `/org-admin/${encodeURIComponent(organizationId)}/customer-experience-preview`,

    customerExperienceSection: (organizationId: string, section: string) =>
      `/org-admin/${encodeURIComponent(
        organizationId,
      )}/customer-experience/${encodeURIComponent(section)}`,

    settings: {
      root: (organizationId: string) =>
        `/org-admin/${encodeURIComponent(organizationId)}/settings`,

      fixedPos: (organizationId: string) =>
        `/org-admin/${encodeURIComponent(organizationId)}/settings/fixed-pos`,

      notifications: (organizationId: string) =>
        `/org-admin/${encodeURIComponent(
          organizationId,
        )}/settings/notifications`,

      integrations: (organizationId: string) =>
        `/org-admin/${encodeURIComponent(
          organizationId,
        )}/settings/integrations`,
    },
  },

  counter: {
    root: "/counter",

    organization: (organizationId: string) =>
      `/counter?organizationId=${encodeURIComponent(organizationId)}`,

    customers: "/counter/customers",

    organizationCustomers: (organizationId: string) =>
      `/counter/customers?organizationId=${encodeURIComponent(organizationId)}`,

    pendingTransactions: "/counter/pending-transactions",

    supportRequests: "/counter/support-requests",
  },

  customer: {
    root: "/customer",

    home: "/customer/home",

    cards: "/customer/cards",

    support: "/customer/support",

    newSupportRequest: (organizationId?: string) =>
      organizationId
        ? `/customer/support/new?organizationId=${encodeURIComponent(organizationId)}`
        : "/customer/support/new",

    supportRequest: (requestId: string) =>
      `/customer/support/${encodeURIComponent(requestId)}`,

    profile: "/customer/profile",
  },

  business: {
    subscription: (subscriptionId: string) => `/business/${subscriptionId}`,
  },

  discover: {
    organization: (organizationId: string) => `/discover/${organizationId}`,
  },

  qr: {
    /** Public QR entry point. The token is the only QR-specific URL value. */

    resolve: (token: string) => `/qr/${encodeURIComponent(token)}`,
  },

  join: {
    root: "/join",

    organization: (organizationId: string) =>
      `/join?organizationId=${encodeURIComponent(organizationId)}`,

    membership: (organizationId: string, productId: string) =>
      `/join?organizationId=${encodeURIComponent(
        organizationId,
      )}&productId=${encodeURIComponent(productId)}`,
  },
} as const;

/** Customer (mobile/native) bottom-tab shells. */

export const CUSTOMER_ROUTES: CustomerRoute[] = [
  {
    name: "home",

    title: "Home",

    icon: "home-outline",
  },

  {
    name: "cards",

    title: "My Cards",

    icon: "card-outline",
  },

  {
    name: "profile",

    title: "Profile",

    icon: "person-outline",
  },
];

/** Counter (web/desktop) sidebar shells. */

export const COUNTER_ROUTES: CounterRoute[] = [
  {
    name: "counter",

    title: "Counter",

    href: APP_ROUTES.counter.root,

    icon: "storefront-outline",
  },

  {
    name: "customers",

    title: "Customers",

    href: APP_ROUTES.counter.customers,

    icon: "people-outline",
  },

  {
    name: "pending-transactions",

    title: "Pending Transactions",

    href: APP_ROUTES.counter.pendingTransactions,

    icon: "time-outline",
  },

  {
    name: "support-requests",

    title: "Support Requests",

    href: APP_ROUTES.counter.supportRequests,

    icon: "help-circle-outline",
  },
];

/** Organization Admin (web) sidebar. */

export const createOrgAdminRoutes = (organizationId: string): AdminRoute[] => [
  {
    title: "Dashboard",

    href: APP_ROUTES.orgAdmin.organization(organizationId),

    icon: "grid-outline",
  },

  {
    title: "Business",

    href: APP_ROUTES.orgAdmin.business(organizationId),

    icon: "business-outline",
  },

  {
    title: "Branding",

    href: APP_ROUTES.orgAdmin.branding(organizationId),

    icon: "color-palette-outline",
  },

  {
    title: "Stores",

    href: APP_ROUTES.orgAdmin.stores(organizationId),

    icon: "storefront-outline",
  },

  {
    title: "Staff",

    href: APP_ROUTES.orgAdmin.staffMembers(organizationId),

    icon: "people-outline",
  },

  {
    title: "Users & Access",

    href: APP_ROUTES.orgAdmin.usersAccess(organizationId),

    icon: "people-circle-outline",
  },

  {
    title: "Integrations",

    href: APP_ROUTES.orgAdmin.settings.integrations(organizationId),

    icon: "git-network-outline",
  },

  {
    title: "Products",

    href: APP_ROUTES.orgAdmin.products(organizationId),

    icon: "cube-outline",
  },

  {
    title: "Benefits",

    href: APP_ROUTES.orgAdmin.benefits(organizationId),

    icon: "gift-outline",
  },

  {
    title: "Memberships",

    href: APP_ROUTES.orgAdmin.memberships(organizationId),

    icon: "card-outline",
  },

  {
    title: "Offers",

    href: APP_ROUTES.orgAdmin.offers(organizationId),

    icon: "pricetags-outline",
  },

  {
    title: "Customer Experience",

    href: APP_ROUTES.orgAdmin.customerExperience(organizationId),

    icon: "phone-portrait-outline",
  },

  {
    title: "Customers",

    href: APP_ROUTES.orgAdmin.customers(organizationId),

    icon: "people-outline",
  },

  {
    title: "Subscriptions",

    href: APP_ROUTES.orgAdmin.subscriptions(organizationId),

    icon: "card-outline",
  },
  {
    title: "Transactions",
    href: APP_ROUTES.orgAdmin.transactions(organizationId),
    icon: "receipt-outline",
  },
  {
    title: "Payment Exceptions",
    href: APP_ROUTES.orgAdmin.paymentExceptions(organizationId),
    icon: "alert-circle-outline",
  },
  {
    title: "Support Requests",
    href: APP_ROUTES.orgAdmin.supportRequests(organizationId),
    icon: "help-circle-outline",
  },

  {
    title: "Redemptions",

    href: APP_ROUTES.orgAdmin.redemptions(organizationId),

    icon: "card-outline",
  },

  {
    title: "Settings",

    href: APP_ROUTES.orgAdmin.settings.root(organizationId),

    icon: "settings-outline",

    children: [
      {
        title: "Fixed POS",

        href: APP_ROUTES.orgAdmin.settings.fixedPos(organizationId),

        icon: "desktop-outline",
      },

      {
        title: "Notifications",

        href: APP_ROUTES.orgAdmin.settings.notifications(organizationId),

        icon: "notifications-outline",
      },

    ],
  },
];

/** Platform Admin (web) sidebar. */

export const PLATFORM_ADMIN_ROUTES: AdminRoute[] = [
  {
    title: "Dashboard",

    href: APP_ROUTES.platformAdmin.root,

    icon: "grid-outline",
  },

  {
    title: "Organizations",

    href: APP_ROUTES.platformAdmin.organizations,

    icon: "business-outline",
  },

  {
    title: "Organization Maintenance",

    href: APP_ROUTES.platformAdmin.organizationMaintenance,

    icon: "people-circle-outline",
  },

  {
    title: "Organization Types",

    href: APP_ROUTES.platformAdmin.organizationTypes,

    icon: "albums-outline",
  },

  {
    title: "Templates",

    href: APP_ROUTES.platformAdmin.templates,

    icon: "duplicate-outline",
  },
  {
    title: "Theme Builder",
    href: APP_ROUTES.platformAdmin.themeBuilder,
    icon: "color-palette-outline",
  },

  {
    title: "Regional Settings",

    href: APP_ROUTES.platformAdmin.regionalSettings,

    icon: "globe-outline",
  },

  {
    title: "Integrations",

    href: APP_ROUTES.platformAdmin.paymentConfiguration,

    icon: "cash-outline",
  },

  {
    title: "Support Requests",

    href: APP_ROUTES.platformAdmin.supportRequests,

    icon: "help-buoy-outline",
  },

  {
    title: "Platform Settings",

    href: APP_ROUTES.platformAdmin.platformSettings,

    icon: "settings-outline",
  },
];
