/**
 * Memgine core contracts — the single source of truth for domain types,
 * configuration, template, permissions, localization and service contracts.
 *
 * Consumed by (future) Customer UI, Staff UI, Business Admin UI and backend/API
 * contracts. No React, no theme, no navigation, no database here.
 */

export * from "./domain/common";
export * from "./domain/entities";

export * from "./permissions/permissions";

export * from "./localization/localization";

export * from "./template/template-definition";
export * from "./template/salon-template-definition";

export * from "./services/template";
export * from "./services/template-cache";
export * from "./template/template-content";

export * from "./services/customer-experience";
export * from "./services/notification";

export * from "./config/business-configuration";

export * from "./context/business-context";

export * from "./services/service-contracts";

export * from "./services/reference-data";

export * from "./redemption/redemption-engine";

export * from "./defaults/sunrise-bakery";
export * from "./defaults/f-and-b-default-content";
export * from "./defaults/sunrise-bakery-content";
export * from "./defaults/salon-default-content";
export * from "./defaults/glow-studio";
export * from "./defaults/glow-studio-content";
export * from "./defaults/business-registry";
export * from "./defaults/business-content";
export * from "./customer/customer-registration";
export * from "./defaults/default-business-template";

export * from "./organization/organization-onboarding";

export * from "./services/service-registry";
