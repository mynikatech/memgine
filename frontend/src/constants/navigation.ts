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

/** Customer (mobile/native) bottom-tab shells. */
export const CUSTOMER_ROUTES: CustomerRoute[] = [
  { name: "home", title: "Home", icon: "home-outline" },
  { name: "cards", title: "My Cards", icon: "card-outline" },
  { name: "profile", title: "Profile", icon: "person-outline" },
];

/** Staff (web/desktop) sidebar shells. */
export const STAFF_ROUTES: StaffRoute[] = [
  {
    name: "counter",
    title: "Counter",
    href: "/staff/counter",
    icon: "calculator-outline",
  },
  {
    name: "customers",
    title: "Customers",
    href: "/staff/customers",
    icon: "people-outline",
  },
  {
    name: "configuration",
    title: "Configuration",
    href: "/staff/configuration",
    icon: "settings-outline",
  },
];

/** Organization Admin (web) sidebar. */
export const ORG_ADMIN_ROUTES: AdminRoute[] = [
  { title: "Dashboard", href: "/dashboard", icon: "grid-outline" },
  { title: "Business", href: "/business", icon: "business-outline" },
  { title: "Branding", href: "/branding", icon: "color-palette-outline" },
  { title: "Stores", href: "/stores", icon: "storefront-outline" },
  { title: "Staff", href: "/staff-members", icon: "people-outline" },
  { title: "Memberships", href: "/memberships", icon: "card-outline" },
  { title: "Benefits", href: "/benefits", icon: "gift-outline" },
  { title: "Offers", href: "/offers", icon: "pricetags-outline" },
  { title: "Customers", href: "/customers", icon: "people-outline" },
  { title: "Subscriptions", href: "/subscriptions", icon: "card-outline" },
  {
    title: "Settings",
    href: "/settings",
    icon: "settings-outline",
    children: [
      {
        title: "Notifications",
        href: "/notifications",
        icon: "notifications-outline",
      },
      {
        title: "Integrations",
        href: "/integrations",
        icon: "git-network-outline",
      },
    ],
  },
];

/** Platform Admin (web) sidebar. */
export const PLATFORM_ADMIN_ROUTES: AdminRoute[] = [
  { title: "Dashboard", href: "/platform-dashboard", icon: "grid-outline" },
  { title: "Organizations", href: "/organizations", icon: "business-outline" },
  {
    title: "Organization Types",
    href: "/organization-types",
    icon: "albums-outline",
  },
  { title: "Templates", href: "/templates", icon: "duplicate-outline" },
  {
    title: "Regional Settings",
    href: "/regional-settings",
    icon: "globe-outline",
  },
  {
    title: "Payment Configuration",
    href: "/payment-configuration",
    icon: "cash-outline",
  },
  {
    title: "Platform Settings",
    href: "/platform-settings",
    icon: "settings-outline",
  },
];
