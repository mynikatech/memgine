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
export * from "./template/template-content";
export * from "./config/business-configuration";
export * from "./context/business-context";
export * from "./services/service-contracts";
export * from "./defaults/sunrise-bakery";
export * from "./defaults/f-and-b-default-content";
export * from "./defaults/sunrise-bakery-content";
export * from "./defaults/business-content";
export * from "./mocks/mock-services";
