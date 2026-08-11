/**
 * Localization readiness contract. English only is used initially, but the
 * types support future locales such as en-IN / INR / Asia-Kolkata and
 * en-CA / CAD / Canada. No translation system is implemented here.
 *
 * Country != language != currency != timezone — each is modelled separately.
 */

/** BCP-47 language tag, e.g. "en", "en-IN", "en-CA". */
export type LanguageCode = string;
/** ISO 4217 currency code, e.g. "USD", "INR", "CAD". */
export type CurrencyCode = string;
/** IANA timezone id, e.g. "Asia/Kolkata". */
export type TimezoneId = string;
/** ISO 3166-1 alpha-2 country code, e.g. "IN", "CA", "US". */
export type CountryCode = string;

export interface LocaleProfile {
  language: LanguageCode;
  currency: CurrencyCode;
  timezone: TimezoneId;
  country?: CountryCode;
}

/** Inputs a future formatter (Intl-based) would consume. */
export interface FormattingContext {
  locale: LanguageCode;
  currency: CurrencyCode;
  timezone: TimezoneId;
  countryCode?: CountryCode;
}

export interface LocalizationContext {
  active: LocaleProfile;
  formatting: FormattingContext;
  isRTL: boolean;
  availableLanguages: LanguageCode[];
}

export const LOCALE_EN_US: LocaleProfile = {
  language: "en-US",
  currency: "USD",
  timezone: "America/Los_Angeles",
  country: "US",
};

export const LOCALE_EN_IN: LocaleProfile = {
  language: "en-IN",
  currency: "INR",
  timezone: "Asia/Kolkata",
  country: "IN",
};

export const LOCALE_EN_CA: LocaleProfile = {
  language: "en-CA",
  currency: "CAD",
  timezone: "America/Toronto",
  country: "CA",
};

export const DEFAULT_LOCALE: LocaleProfile = LOCALE_EN_US;

export function toFormattingContext(profile: LocaleProfile): FormattingContext {
  return {
    locale: profile.language,
    currency: profile.currency,
    timezone: profile.timezone,
    countryCode: profile.country,
  };
}
