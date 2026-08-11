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
  home: {
    subtitle: "Welcome back",
    yourMembership: "Your membership",
    offersEmpty: "New offers will appear here.",
    storesEmpty: "Store locations will appear here.",
    activityEmpty: "Your recent activity will appear here.",
  },
  sections: {
    offers: "Offers",
    stores: "Stores",
    activity: "Activity",
  },
  cards: {
    title: "My Cards",
    subtitle: "Your subscription cards",
    empty: "No cards yet",
    emptyBody: "Your business subscription cards will appear here.",
    view: "View card",
    showAtCounter: "Show this at the counter",
    benefitsSummary: "{{count}} benefits included",
    detailTitle: "Card details",
  },
  profile: {
    title: "Profile",
    subtitle: "Your account",
    preferences: "Preferences",
    account: "Account",
    language: "Language",
    region: "Region",
    switchBusiness: "Switch Business",
    switchBusinessTitle: "Switch Business",
    switchBusinessBody: "Switching between your businesses arrives in a later stage.",
    about: "About Memgine",
  },
} as const;

export type StringCatalog = typeof en;
