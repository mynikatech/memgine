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

/**
 * TemplateSectionKey — the full catalogue of experience sections an F&B
 * business MAY surface. Some are mandatory (always present), the rest are
 * optional/configurable. This is intentionally richer than the legacy
 * `SecondarySectionKey` (which stays for the current Home layout) so a future
 * renderer can compose an experience beyond one vertical page.
 */
export enum TemplateSectionKey {
  // Mandatory — an F&B membership experience is meaningless without these.
  BUSINESS_IDENTITY = "BUSINESS_IDENTITY",
  MEMBERSHIP = "MEMBERSHIP",
  ACTIVE_BENEFITS = "ACTIVE_BENEFITS",
  // Optional / configurable.
  HERO_PROMOTION = "HERO_PROMOTION",
  FEATURED_PROMOTION = "FEATURED_PROMOTION",
  OFFERS = "OFFERS",
  STORES = "STORES",
  ACTIVITY = "ACTIVITY",
  BUSINESS_INFORMATION = "BUSINESS_INFORMATION",
  BUSINESS_PREFERENCES = "BUSINESS_PREFERENCES",
  REFERRAL = "REFERRAL",
}

/**
 * SectionPresentation — HOW a section MAY be surfaced. The template permits one
 * or more; the renderer/business chooses within these bounds. Crucially, the
 * template does NOT force every section into a single scrolling page.
 */
export enum SectionPresentation {
  OVERVIEW = "OVERVIEW", // summarised on an overview/home surface
  TAB = "TAB", // its own tab
  DETAIL = "DETAIL", // dedicated detail screen/view
  MODAL = "MODAL", // presented in a modal
  EXPANDABLE = "EXPANDABLE", // collapsible/expandable block
}

export interface TemplateSection {
  key: TemplateSectionKey;
  /** Mandatory sections cannot be disabled by a business configuration. */
  mandatory: boolean;
  /** Primary component this section renders with, if any. */
  component?: TemplateComponentKey;
  /** Presentations this template permits for the section (never empty). */
  allowedPresentations: SectionPresentation[];
  /** Presentation used when the business expresses no preference. */
  defaultPresentation: SectionPresentation;
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
  /** Full section catalogue (mandatory + optional) with presentation rules. */
  sections: TemplateSection[];
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
  sections: [
    // ---- Mandatory ----
    {
      key: TemplateSectionKey.BUSINESS_IDENTITY,
      mandatory: true,
      component: TemplateComponentKey.HERO_BANNER,
      allowedPresentations: [SectionPresentation.OVERVIEW],
      defaultPresentation: SectionPresentation.OVERVIEW,
    },
    {
      key: TemplateSectionKey.MEMBERSHIP,
      mandatory: true,
      component: TemplateComponentKey.MEMBERSHIP_CARD,
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.DETAIL,
        SectionPresentation.MODAL,
      ],
      defaultPresentation: SectionPresentation.OVERVIEW,
    },
    {
      key: TemplateSectionKey.ACTIVE_BENEFITS,
      mandatory: true,
      component: TemplateComponentKey.BENEFIT_LIST,
      allowedPresentations: [SectionPresentation.OVERVIEW, SectionPresentation.EXPANDABLE],
      defaultPresentation: SectionPresentation.OVERVIEW,
    },
    // ---- Optional / configurable ----
    {
      key: TemplateSectionKey.HERO_PROMOTION,
      mandatory: false,
      component: TemplateComponentKey.HERO_BANNER,
      allowedPresentations: [SectionPresentation.OVERVIEW],
      defaultPresentation: SectionPresentation.OVERVIEW,
    },
    {
      key: TemplateSectionKey.FEATURED_PROMOTION,
      mandatory: false,
      component: TemplateComponentKey.OFFER_CARD,
      allowedPresentations: [SectionPresentation.OVERVIEW, SectionPresentation.DETAIL],
      defaultPresentation: SectionPresentation.OVERVIEW,
    },
    {
      key: TemplateSectionKey.OFFERS,
      mandatory: false,
      component: TemplateComponentKey.OFFER_CARD,
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.TAB,
        SectionPresentation.DETAIL,
      ],
      defaultPresentation: SectionPresentation.TAB,
    },
    {
      key: TemplateSectionKey.STORES,
      mandatory: false,
      component: TemplateComponentKey.STORE_LIST,
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.TAB,
        SectionPresentation.DETAIL,
      ],
      defaultPresentation: SectionPresentation.TAB,
    },
    {
      key: TemplateSectionKey.ACTIVITY,
      mandatory: false,
      component: TemplateComponentKey.ACTIVITY_FEED,
      allowedPresentations: [SectionPresentation.OVERVIEW, SectionPresentation.TAB],
      defaultPresentation: SectionPresentation.TAB,
    },
    {
      key: TemplateSectionKey.BUSINESS_INFORMATION,
      mandatory: false,
      allowedPresentations: [
        SectionPresentation.DETAIL,
        SectionPresentation.MODAL,
        SectionPresentation.EXPANDABLE,
      ],
      defaultPresentation: SectionPresentation.DETAIL,
    },
    {
      key: TemplateSectionKey.BUSINESS_PREFERENCES,
      mandatory: false,
      allowedPresentations: [SectionPresentation.DETAIL, SectionPresentation.MODAL],
      defaultPresentation: SectionPresentation.DETAIL,
    },
    {
      key: TemplateSectionKey.REFERRAL,
      mandatory: false,
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.MODAL,
        SectionPresentation.DETAIL,
      ],
      defaultPresentation: SectionPresentation.MODAL,
    },
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
