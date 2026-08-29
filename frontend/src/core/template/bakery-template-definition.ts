import {
  CardStyle,
  CustomerNavKey,
  SecondarySectionKey,
  SectionPresentation,
  StaffNavKey,
  TemplateComponentKey,
  TemplateDefinition,
  TemplateSectionKey,
} from "./template-definition";

/**
 * BAKERY_V1
 *
 * Frozen platform template for Bakery organizations.
 *
 * This defines what a Bakery customer experience is capable of displaying.
 * Organization-owned content is supplied separately through
 * bakery-default-content.ts or later through Organization Admin.
 */
export const BAKERY_V1: TemplateDefinition = {
  id: "bakery-v1",
  version: "1.0.0",
  category: "FOOD_AND_BEVERAGE" as TemplateDefinition["category"],
  displayName: "Food & Beverage — Bakery",

  customerNavigation: [
    CustomerNavKey.HOME,
    CustomerNavKey.MY_CARDS,
    CustomerNavKey.PROFILE,
  ],

  staffNavigation: [
    StaffNavKey.COUNTER,
    StaffNavKey.CUSTOMERS,
    StaffNavKey.CONFIGURATION,
  ],

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
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.EXPANDABLE,
      ],
      defaultPresentation: SectionPresentation.OVERVIEW,
    },

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
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.DETAIL,
      ],
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
      allowedPresentations: [
        SectionPresentation.OVERVIEW,
        SectionPresentation.TAB,
      ],
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
      allowedPresentations: [
        SectionPresentation.DETAIL,
        SectionPresentation.MODAL,
      ],
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
