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

  platformAdmin: {
    root: "/platform-admin",
    organizations: "/platform-admin/organizations",
    organizationNew: "/platform-admin/organization-new",
    organizationTypes: "/platform-admin/organization-types",
    templates: "/platform-admin/templates",
    regionalSettings: "/platform-admin/regional-settings",
    paymentConfiguration: "/platform-admin/payment-configuration",
    platformSettings: "/platform-admin/platform-settings",
  },

  orgAdmin: {
    root: "/org-admin",
    business: "/org-admin/business",
    branding: "/org-admin/branding",
    stores: "/org-admin/stores",
    staffMembers: "/org-admin/staff-members",
    benefits: "/org-admin/benefits",
    memberships: "/org-admin/memberships",
    offers: "/org-admin/offers",
    customers: "/org-admin/customers",
    subscriptions: "/org-admin/subscriptions",
    redemptions: "/org-admin/redemptions",

    settings: {
      root: "/org-admin/settings",
      notifications: "/org-admin/settings/notifications",
      integrations: "/org-admin/settings/integrations",
    },
  },

  counter: {
    root: "/counter",
    customers: "/counter/customers",
    configuration: "/counter/configuration",
  },

  customer: {
    root: "/customer",
    home: "/customer/home",
    cards: "/customer/cards",
    profile: "/customer/profile",
  },

  business: {
    subscription: (subscriptionId: string) => `/business/${subscriptionId}`,
  },

  discover: {
    organization: (organizationId: string) => `/discover/${organizationId}`,
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
    name: "configuration",
    title: "Configuration",
    href: APP_ROUTES.counter.configuration,
    icon: "settings-outline",
  },
];

/** Organization Admin (web) sidebar. */
export const ORG_ADMIN_ROUTES: AdminRoute[] = [
  {
    title: "Dashboard",
    href: APP_ROUTES.orgAdmin.root,
    icon: "grid-outline",
  },
  {
    title: "Business",
    href: APP_ROUTES.orgAdmin.business,
    icon: "business-outline",
  },
  {
    title: "Branding",
    href: APP_ROUTES.orgAdmin.branding,
    icon: "color-palette-outline",
  },
  {
    title: "Stores",
    href: APP_ROUTES.orgAdmin.stores,
    icon: "storefront-outline",
  },
  {
    title: "Staff",
    href: APP_ROUTES.orgAdmin.staffMembers,
    icon: "people-outline",
  },
  {
    title: "Benefits",
    href: APP_ROUTES.orgAdmin.benefits,
    icon: "gift-outline",
  },
  {
    title: "Memberships",
    href: APP_ROUTES.orgAdmin.memberships,
    icon: "card-outline",
  },
  {
    title: "Offers",
    href: APP_ROUTES.orgAdmin.offers,
    icon: "pricetags-outline",
  },
  {
    title: "Customers",
    href: APP_ROUTES.orgAdmin.customers,
    icon: "people-outline",
  },
  {
    title: "Subscriptions",
    href: APP_ROUTES.orgAdmin.subscriptions,
    icon: "card-outline",
  },
  {
    title: "Redemptions",
    href: APP_ROUTES.orgAdmin.redemptions,
    icon: "card-outline",
  },
  {
    title: "Settings",
    href: APP_ROUTES.orgAdmin.settings.root,
    icon: "settings-outline",
    children: [
      {
        title: "Notifications",
        href: APP_ROUTES.orgAdmin.settings.notifications,
        icon: "notifications-outline",
      },
      {
        title: "Integrations",
        href: APP_ROUTES.orgAdmin.settings.integrations,
        icon: "git-network-outline",
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
    title: "Regional Settings",
    href: APP_ROUTES.platformAdmin.regionalSettings,
    icon: "globe-outline",
  },
  {
    title: "Payment Configuration",
    href: APP_ROUTES.platformAdmin.paymentConfiguration,
    icon: "cash-outline",
  },
  {
    title: "Platform Settings",
    href: APP_ROUTES.platformAdmin.platformSettings,
    icon: "settings-outline",
  },
];
