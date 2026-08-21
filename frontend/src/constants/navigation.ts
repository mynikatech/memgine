import { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type CustomerRoute = {
  name: string;
  title: string;
  icon: IoniconName;
};

export type StaffRoute = {
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

export type CounterRoute = {
  name: string;
  title: string;
  href: string;
  icon: IoniconName;
};

/** Customer (mobile/native) bottom-tab shells. */
export const CUSTOMER_ROUTES: CustomerRoute[] = [
  { name: "home", title: "Home", icon: "home-outline" },
  { name: "cards", title: "My Cards", icon: "card-outline" },
  { name: "profile", title: "Profile", icon: "person-outline" },
];

/** Counter (web/desktop) sidebar shells. */

/** Counter (web/desktop) sidebar shells. */
export const COUNTER_ROUTES: CounterRoute[] = [
  {
    name: "counter",
    title: "Counter",
    href: "/counter",
    icon: "storefront-outline",
  },
  {
    name: "customers",
    title: "Customers",
    href: "/counter/customers",
    icon: "people-outline",
  },
  {
    name: "configuration",
    title: "Configuration",
    href: "/counter/configuration",
    icon: "settings-outline",
  },
];

/** Organization Admin (web) sidebar. */
export const ORG_ADMIN_ROUTES: AdminRoute[] = [
  { title: "Dashboard", href: "/org-admin", icon: "grid-outline" },
  { title: "Business", href: "/org-admin/business", icon: "business-outline" },
  {
    title: "Branding",
    href: "/org-admin/branding",
    icon: "color-palette-outline",
  },
  { title: "Stores", href: "/org-admin/stores", icon: "storefront-outline" },
  { title: "Staff", href: "/org-admin/staff-members", icon: "people-outline" },
  { title: "Benefits", href: "/org-admin/benefits", icon: "gift-outline" },
  {
    title: "Memberships",
    href: "/org-admin/memberships",
    icon: "card-outline",
  },
  { title: "Offers", href: "/org-admin/offers", icon: "pricetags-outline" },
  { title: "Customers", href: "/org-admin/customers", icon: "people-outline" },
  {
    title: "Subscriptions",
    href: "/org-admin/subscriptions",
    icon: "card-outline",
  },
  {
    title: "Redemptions",
    href: "/org-admin/redemptions",
    icon: "card-outline",
  },
  {
    title: "Settings",
    href: "/org-admin/settings",
    icon: "settings-outline",
    children: [
      {
        title: "Notifications",
        href: "/org-admin/settings/notifications",
        icon: "notifications-outline",
      },
      {
        title: "Integrations",
        href: "/org-admin/settings/integrations",
        icon: "git-network-outline",
      },
    ],
  },
];

/** Platform Admin (web) sidebar. */
export const PLATFORM_ADMIN_ROUTES: AdminRoute[] = [
  {
    title: "Dashboard",
    href: "/platform-admin",
    icon: "grid-outline",
  },

  {
    title: "Organizations",
    href: "/platform-admin/organizations",
    icon: "business-outline",
  },

  {
    title: "Organization Types",
    href: "/platform-admin/organization-types",
    icon: "albums-outline",
  },

  {
    title: "Templates",
    href: "/platform-admin/templates",
    icon: "duplicate-outline",
  },

  {
    title: "Regional Settings",
    href: "/platform-admin/regional-settings",
    icon: "globe-outline",
  },

  {
    title: "Payment Configuration",
    href: "/platform-admin/payment-configuration",
    icon: "cash-outline",
  },

  {
    title: "Platform Settings",
    href: "/platform-admin/platform-settings",
    icon: "settings-outline",
  },
];
