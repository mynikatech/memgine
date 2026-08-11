import { TemplateCategory } from "../domain/common";

/**
 * TemplateDefinition — Memgine-controlled and FROZEN. Defines what is possible:
 * navigation, sections, supported card styles and allowed components. A
 * business configures WITHIN these bounds and can NOT add arbitrary
 * navigation, pages or components.
 */

export enum CustomerNavKey {
  HOME = "HOME",
  MY_CARDS = "MY_CARDS",
  PROFILE = "PROFILE",
}

export enum StaffNavKey {
  COUNTER = "COUNTER",
  CUSTOMERS = "CUSTOMERS",
  CONFIGURATION = "CONFIGURATION",
}

export enum SecondarySectionKey {
  OFFERS = "OFFERS",
  STORES = "STORES",
  ACTIVITY = "ACTIVITY",
}

export enum CardStyle {
  MODERN = "MODERN",
  CLASSIC = "CLASSIC",
  MINIMAL = "MINIMAL",
}

/** Components a template may expose for the Café/Bakery experience. */
export enum TemplateComponentKey {
  HERO_BANNER = "HERO_BANNER",
  MEMBERSHIP_CARD = "MEMBERSHIP_CARD",
  BENEFIT_LIST = "BENEFIT_LIST",
  OFFER_CARD = "OFFER_CARD",
  STORE_LIST = "STORE_LIST",
  ACTIVITY_FEED = "ACTIVITY_FEED",
  PROFILE_SUMMARY = "PROFILE_SUMMARY",
  QR_CODE = "QR_CODE",
}

export interface TemplateDefinition {
  id: string;
  version: string;
  category: TemplateCategory;
  displayName: string;
  customerNavigation: CustomerNavKey[];
  staffNavigation: StaffNavKey[];
  secondarySections: SecondarySectionKey[];
  /** Which secondary sections a business is allowed to toggle. */
  configurableSections: SecondarySectionKey[];
  supportedCardStyles: CardStyle[];
  allowedComponents: TemplateComponentKey[];
}

/** First frozen template: Food & Beverage / Café-Bakery. */
export const F_AND_B_BAKERY_V1: TemplateDefinition = {
  id: "f-and-b-bakery-v1",
  version: "1.0.0",
  category: TemplateCategory.FOOD_AND_BEVERAGE,
  displayName: "Food & Beverage — Café / Bakery",
  customerNavigation: [CustomerNavKey.HOME, CustomerNavKey.MY_CARDS, CustomerNavKey.PROFILE],
  staffNavigation: [StaffNavKey.COUNTER, StaffNavKey.CUSTOMERS, StaffNavKey.CONFIGURATION],
  secondarySections: [
    SecondarySectionKey.OFFERS,
    SecondarySectionKey.STORES,
    SecondarySectionKey.ACTIVITY,
  ],
  configurableSections: [
    SecondarySectionKey.OFFERS,
    SecondarySectionKey.STORES,
    SecondarySectionKey.ACTIVITY,
  ],
  supportedCardStyles: [CardStyle.MODERN, CardStyle.CLASSIC, CardStyle.MINIMAL],
  allowedComponents: [
    TemplateComponentKey.HERO_BANNER,
    TemplateComponentKey.MEMBERSHIP_CARD,
    TemplateComponentKey.BENEFIT_LIST,
    TemplateComponentKey.OFFER_CARD,
    TemplateComponentKey.STORE_LIST,
    TemplateComponentKey.ACTIVITY_FEED,
    TemplateComponentKey.PROFILE_SUMMARY,
    TemplateComponentKey.QR_CODE,
  ],
};
