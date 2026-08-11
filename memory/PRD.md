# Memgine — PRD

## Original Problem Statement
Build the Memgine MVP in small, credit-controlled stages. Frontend: Expo / React Native (native + web) + Expo Router. A reusable, configuration-driven membership platform (Template + BusinessConfiguration + Domain Data). No DB/backend yet.

## Stage status
- **Stage 1 — FROZEN**: Expo foundation + platform-split navigation shells (Customer tabs: Home/My Cards/Profile; Staff sidebar: Counter/Customers/Configuration), placeholder content. SDK 55.
- **Stage 2 — DONE (this task): Domain + Configuration Contracts** — strongly-typed domain models, TemplateDefinition, BusinessConfiguration, permissions, localization contract, service contracts, Sunrise Bakery default config, and repo documentation. Single source of truth = `src/core/`.
- **Later — NOT started**: BusinessProvider, theme engine, UI component library, Customer/Staff/Business-Admin screens, QR/OTP, purchase/redemption/invoice flows, onboarding, auth, DB, payments, SMS, POS, analytics, additional templates.

## Source of truth
`src/core/` — domain (`domain/common.ts`, `domain/entities.ts`), permissions, localization, template, config, context, services, defaults, mocks. See `MEMGINE_MANIFEST.md`.

## Key architectural decisions
- Three-way separation: Template (what's possible) vs BusinessConfiguration (presentation) vs Domain Data (actual data).
- MembershipProduct (sold) ≠ Subscription (customer's). No `Membership` entity; "My Cards" is UI-only.
- Entitlements (planTier/managementModel/legalName) live on Organization/OrganizationAccount, not config.
- Capability-based RBAC; localization-ready (en only now).
- Backend independence via typed service contracts; mock/in-memory only.

## Docs
`MEMGINE_MANIFEST.md`, `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `CONFIGURATION.md`, `UI_REFERENCE.md` (GUI baseline recorded, not implemented).

## Backlog (later phases, do not start without instruction)
Phase: BusinessProvider + theme engine → UI component library → Customer Hub + Café/Bakery template screens → Lean Org Admin → real APIs/backend.
