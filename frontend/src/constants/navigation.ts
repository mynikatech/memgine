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

/** Customer (mobile/native) bottom-tab shells. */
export const CUSTOMER_ROUTES: CustomerRoute[] = [
  { name: "home", title: "Home", icon: "home-outline" },
  { name: "cards", title: "My Cards", icon: "card-outline" },
  { name: "profile", title: "Profile", icon: "person-outline" },
];

/** Staff (web/desktop) sidebar shells. */
export const STAFF_ROUTES: StaffRoute[] = [
  { name: "counter", title: "Counter", href: "/staff/counter", icon: "calculator-outline" },
  { name: "customers", title: "Customers", href: "/staff/customers", icon: "people-outline" },
  {
    name: "configuration",
    title: "Configuration",
    href: "/staff/configuration",
    icon: "settings-outline",
  },
];
