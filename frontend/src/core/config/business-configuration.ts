import { TemplateCategory } from "../domain/common";
import { CurrencyCode, LanguageCode, TimezoneId } from "../localization/localization";
import { CardStyle } from "../template/template-definition";

/**
 * BusinessConfiguration — FROZEN. Presentation and UX configuration only,
 * constrained by the referenced TemplateDefinition. It must NOT contain domain
 * data (products, benefits, customers, subscriptions, redemptions) nor
 * account/entitlement context (planTier, managementModel, legalName).
 */

export interface BusinessIdentity {
  displayName: string;
  category: TemplateCategory;
}

export interface BusinessBranding {
  logoUrl: string;
  primaryColor: string;
  secondaryColor?: string;
}

export interface CustomerExperienceConfig {
  welcomeMessage: string;
  cardStyle: CardStyle;
  showOffers: boolean;
  showStores: boolean;
  showActivity: boolean;
}

export interface BusinessLocalizationConfig {
  defaultLanguage: LanguageCode;
  defaultCurrency: CurrencyCode;
  timezone: TimezoneId;
}

export interface BusinessConfiguration {
  /** References TemplateDefinition.id — a business cannot escape the template. */
  templateId: string;
  identity: BusinessIdentity;
  branding: BusinessBranding;
  customerExperience: CustomerExperienceConfig;
  localization: BusinessLocalizationConfig;
}
