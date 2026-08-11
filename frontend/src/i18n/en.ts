/**
 * English string catalog. English only is seeded; the nested structure keeps
 * UI text decoupled from screen components and ready for more locales.
 */
export const en = {
  common: {
    loading: "Loading…",
    empty: "Nothing here yet",
    error: "Something went wrong",
    retry: "Try again",
    close: "Close",
    save: "Save",
    cancel: "Cancel",
  },
  customer: {
    home: "Home",
    myCards: "My Cards",
    profile: "Profile",
  },
  staff: {
    counter: "Counter",
    customers: "Customers",
    configuration: "Configuration",
  },
  membership: {
    member: "Member",
    validUntil: "Valid until",
    active: "Active",
    expired: "Expired",
  },
  benefits: {
    title: "Benefits",
  },
  receipt: {
    total: "Total",
  },
} as const;

export type StringCatalog = typeof en;
