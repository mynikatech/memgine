import type { BusinessConfiguration } from "@/src/business/types";

import type {
  Benefit,
  BusinessSummary,
  Membership,
  MembershipProduct,
  Offer,
} from "./types";

/**
 * Mock dataset proving the template + configuration architecture: TWO
 * businesses share the SAME `food-beverage` template but differ only by
 * BusinessConfiguration (branding + enabled sections + content).
 */
export const businessSummaries: BusinessSummary[] = [
  {
    id: "biz-a",
    organizationId: "org-cafe",
    name: "Bean & Bloom",
    industry: "food_beverage",
    templateId: "food-beverage",
  },
  {
    id: "biz-b",
    organizationId: "org-bakery",
    name: "Crust & Crumb",
    industry: "food_beverage",
    templateId: "food-beverage",
  },
];

export const businessConfigurations: Record<string, BusinessConfiguration> = {
  "biz-a": {
    id: "biz-a",
    organizationId: "org-cafe",
    templateId: "food-beverage",
    branding: {
      name: "Bean & Bloom",
      logoText: "Bean & Bloom",
      primary: "#A16207",
      primarySoft: "#FEF3C7",
      onPrimary: "#FFFFFF",
      background: "#FFFFFF",
    },
    sections: ["hero", "memberships", "benefits", "offers", "stores", "activity", "profile"],
    content: { heroTitle: "Your café, your rewards", emphasis: "cafe" },
  },
  "biz-b": {
    id: "biz-b",
    organizationId: "org-bakery",
    templateId: "food-beverage",
    branding: {
      name: "Crust & Crumb",
      logoText: "Crust & Crumb",
      primary: "#9A3412",
      primarySoft: "#FFEDD5",
      onPrimary: "#FFFFFF",
      background: "#FFFFFF",
    },
    sections: ["hero", "memberships", "benefits", "offers", "stores", "profile"],
    content: { heroTitle: "Freshly baked rewards", emphasis: "bakery" },
  },
};

export const memberships: Membership[] = [
  {
    id: "m1",
    organizationId: "org-cafe",
    organizationName: "Bean & Bloom",
    productName: "Bean & Bloom Club",
    tier: "Gold",
    status: "Active",
    validUntil: "31 Dec 2026",
  },
  {
    id: "m2",
    organizationId: "org-bakery",
    organizationName: "Crust & Crumb",
    productName: "Crumb Rewards",
    tier: "Premium",
    status: "Active",
    validUntil: "30 Sep 2026",
  },
];

export const offersByOrg: Record<string, Offer[]> = {
  "org-cafe": [
    {
      id: "o1",
      organizationId: "org-cafe",
      title: "10% Off Beverages",
      description: "On all hot & cold drinks",
      badge: "Popular",
      validUntil: "31 Dec 2026",
    },
    {
      id: "o2",
      organizationId: "org-cafe",
      title: "Free Birthday Treat",
      description: "A pastry on your birthday",
      validUntil: "Birthday month",
    },
  ],
  "org-bakery": [
    {
      id: "o3",
      organizationId: "org-bakery",
      title: "Buy 5 Get 1 Loaf",
      description: "Sourdough loyalty reward",
      badge: "Loyalty",
      validUntil: "Ongoing",
    },
    {
      id: "o4",
      organizationId: "org-bakery",
      title: "Weekend Pastry Box",
      description: "20% off boxes on weekends",
      validUntil: "Weekends",
    },
  ],
};

export const benefitsByOrg: Record<string, Benefit[]> = {
  "org-cafe": [
    {
      id: "b1",
      organizationId: "org-cafe",
      title: "10% Off Beverages",
      description: "Every visit",
      validUntil: "31 Dec 2026",
    },
    {
      id: "b2",
      organizationId: "org-cafe",
      title: "Free Birthday Treat",
      description: "During birthday month",
    },
  ],
  "org-bakery": [
    {
      id: "b3",
      organizationId: "org-bakery",
      title: "Free Loaf Reward",
      description: "After 5 purchases",
    },
  ],
};

export const productsByOrg: Record<string, MembershipProduct[]> = {
  "org-cafe": [
    {
      id: "p1",
      organizationId: "org-cafe",
      name: "Bean & Bloom Club",
      tier: "Gold",
      description: "Perks for regulars",
      benefitIds: ["b1", "b2"],
      plans: [
        { id: "pl1", name: "Monthly", price: 5, interval: "month", benefitIds: ["b1", "b2"] },
        { id: "pl2", name: "Yearly", price: 49, interval: "year", benefitIds: ["b1", "b2"] },
      ],
    },
  ],
  "org-bakery": [
    {
      id: "p2",
      organizationId: "org-bakery",
      name: "Crumb Rewards",
      tier: "Premium",
      description: "For bakery lovers",
      benefitIds: ["b3"],
      plans: [{ id: "pl3", name: "Yearly", price: 39, interval: "year", benefitIds: ["b3"] }],
    },
  ],
};
