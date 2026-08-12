import { TemplateCategory } from "../domain/common";
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
 * SALON_V1 — the second frozen template family: Beauty & Wellness / Salon-Spa.
 *
 * It exists to PROVE the platform is genuinely template-driven: it reuses the
 * exact same section keys, presentations, components and card styles as the
 * F&B template, but expresses a DIFFERENT section catalogue (no featured
 * promotion, no preferences; location surfaced as profile detail). The
 * BusinessExperience renderer consumes this with ZERO template-specific code.
 */
export const SALON_V1: TemplateDefinition = {
  id: "salon-v1",
  version: "1.0.0",
  category: TemplateCategory.BEAUTY_AND_WELLNESS,
  displayName: "Beauty & Wellness — Salon / Spa",
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
        SectionPresentation.DETAIL,
      ],
      // Salons are typically single-location: surface as a profile detail.
      defaultPresentation: SectionPresentation.DETAIL,
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
  // Salons lean elegant/editorial — classic first.
  supportedCardStyles: [CardStyle.CLASSIC, CardStyle.MINIMAL, CardStyle.MODERN],
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
