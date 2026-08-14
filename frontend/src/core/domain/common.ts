import { CurrencyCode } from "../localization/localization";

/** Shared primitive aliases and cross-cutting value types. */
export type ID = string;

/** ISO-8601 date-time string, e.g. "2026-06-01T00:00:00.000Z". */
export type ISODateString = string;

/** Business category. Drives which template family applies. */
export enum TemplateCategory {
  FOOD_AND_BEVERAGE = "FOOD_AND_BEVERAGE",
  BEAUTY_AND_WELLNESS = "BEAUTY_AND_WELLNESS",
}

/** How a subscription plan is billed (domain data, NOT Memgine billing). */
export enum BillingInterval {
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
  ONE_TIME = "ONE_TIME",
}

/** Money stored in minor units (e.g. cents) to avoid float issues. */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  /** ISO 3166-1 alpha-2, e.g. "US", "IN", "CA". */
  countryCode: string;
}

export interface PhoneNumber {
  countryCode: string;
  number: string;
}
