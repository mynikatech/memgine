# Memgine Template, Configuration & Entitlements

Strict three-way separation. Source of truth: `src/core/template`, `src/core/config`, `src/core/domain`.

## 1. TEMPLATE — defines what is POSSIBLE (Memgine-controlled, frozen)
`TemplateDefinition` (`src/core/template/template-definition.ts`). First template `f-and-b-bakery-v1`:
- category: `FOOD_AND_BEVERAGE`
- customer navigation: `HOME`, `MY_CARDS`, `PROFILE`
- staff navigation: `COUNTER`, `CUSTOMERS`, `CONFIGURATION`
- secondary sections: `OFFERS`, `STORES`, `ACTIVITY` (also the configurable ones)
- supported card styles: `MODERN`, `CLASSIC`, `MINIMAL`
- allowed components: HERO_BANNER, MEMBERSHIP_CARD, BENEFIT_LIST, OFFER_CARD, STORE_LIST, ACTIVITY_FEED, PROFILE_SUMMARY, QR_CODE

A business **cannot** create arbitrary navigation, pages or components — everything must reference keys the template allows.

## 2. BUSINESS CONFIGURATION — defines HOW a business presents itself (frozen)
`BusinessConfiguration` (`src/core/config/business-configuration.ts`):
- `identity`: `displayName`, `category`
- `branding`: `logoUrl`, `primaryColor`, `secondaryColor?`
- `customerExperience`: `welcomeMessage`, `cardStyle` (a supported CardStyle), `showOffers`, `showStores`, `showActivity` (toggle the template's configurable sections)
- `localization`: `defaultLanguage`, `defaultCurrency`, `timezone`
- `templateId`: references the TemplateDefinition it is bound to

Configuration holds **presentation/UX only**. It must **not** contain frequently-changing domain data.

## 3. DOMAIN DATA — the actual data (NOT configuration)
MembershipProducts, Benefits, Offers, Customers, Subscriptions, Redemptions, Stores, Staff live in `src/core/domain`. These are **never** duplicated inside BusinessConfiguration.

## Entitlements / management context (NOT configuration)
`planTier` (BASIC/PRO/ENTERPRISE), `managementModel` (SELF_SERVICE/MANAGED_SERVICE) and `legalName` live on the **Organization / OrganizationAccount** (`src/core/domain/entities.ts`). The future `BusinessProvider` will surface these via `BusinessContext` (`src/core/context/business-context.ts`). Memgine commercial billing is **not** implemented.

## Permissions (frozen MVP RBAC)
`src/core/permissions/permissions.ts`. UI access is capability-based, not ownership-based.
- `Capability` includes `EDIT_CONFIG` and `PERFORM_REDEMPTION` (plus VIEW_CONFIG, MANAGE_*, VIEW_CUSTOMERS, VIEW_ACTIVITY).
- `StaffRole` (OWNER/MANAGER/STAFF) with `DEFAULT_ROLE_CAPABILITIES`.
- `Principal` (Staff/Customer) + helpers `hasCapability`, `canEditConfig`, `canPerformRedemption`.

## Localization contract
`src/core/localization/localization.ts`. Separate `LanguageCode` / `CurrencyCode` / `TimezoneId` / `CountryCode`; `LocaleProfile`, `FormattingContext`, `LocalizationContext`. Presets for en-US (default), en-IN/INR/Asia-Kolkata, en-CA/CAD/Canada. English only is used now; no translation system implemented.

## Default example
`src/core/defaults/sunrise-bakery.ts` — "Sunrise Bakery" BusinessConfiguration + Organization/account/context using `f-and-b-bakery-v1`.
