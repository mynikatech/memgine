/**
 * English base translations. This is the only seeded locale for now, but the
 * structure (nested namespaces + interpolation) is ready for more locales and
 * RTL. See ARCHITECTURE.md → Localization.
 */
export const en = {
  common: {
    loading: "Loading…",
    empty: "Nothing here yet",
    error: "Something went wrong. Please try again.",
    retry: "Try again",
  },
  app: {
    name: "Memgine",
    tagline: "Memberships, reimagined",
  },
  foundation: {
    badge: "Foundation · Stage 2",
    switchLabel: "PREVIEW A BUSINESS",
  },
  customer: {
    home: {
      title: "Home",
      subtitle: "Your memberships, benefits and offers in one place",
      offers: "Offers for you",
    },
    cards: { title: "My Cards" },
    profile: { title: "Profile" },
  },
  staff: {
    counter: { title: "Counter" },
    customers: { title: "Customers" },
    configuration: { title: "Configuration" },
  },
} as const;
