import type { TemplateDefinition } from "./types";

/**
 * First template family: Food & Beverage / Café-Bakery. One reusable template
 * configurable as café-heavy, bakery-heavy or café+bakery via configuration
 * only (proven by two businesses sharing this definition).
 */
export const foodAndBeverageTemplate: TemplateDefinition = {
  id: "food-beverage",
  name: "Food & Beverage",
  version: "1.0.0",
  industry: "food_beverage",
  description: "Café / bakery membership experience, configured per business.",
  sections: [
    { key: "hero", label: "Home / Hero", required: true },
    { key: "memberships", label: "Memberships", required: true },
    { key: "benefits", label: "Benefits" },
    { key: "offers", label: "Offers" },
    { key: "stores", label: "Stores / Locations" },
    { key: "activity", label: "Activity" },
    { key: "profile", label: "Profile", required: true },
  ],
  availableComponents: [
    "Banner",
    "MembershipCard",
    "OfferCard",
    "Card",
    "Button",
    "Table",
  ],
  configOptions: [
    { key: "emphasis", label: "Emphasis", type: "select", options: ["cafe", "bakery", "both"] },
    { key: "primary", label: "Primary color", type: "color" },
    { key: "logoText", label: "Logo text", type: "text" },
    { key: "heroTitle", label: "Hero title", type: "text" },
    { key: "sectionOrder", label: "Section ordering", type: "text" },
  ],
};
