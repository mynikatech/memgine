# Memgine — PRD

## Original Problem Statement
Build the Memgine MVP in small, credit-controlled stages. Frontend: Expo / React Native (native + web) + Expo Router. A reusable, configuration-driven membership platform (Template + BusinessConfiguration + Domain Data). No DB/backend yet.

## Stage status
- **Stage 1 — FROZEN**: Expo foundation + platform-split navigation shells (Customer tabs: Home/My Cards/Profile; Staff sidebar: Counter/Customers/Configuration), placeholder content. SDK 55.
- **Stage 2A — DONE**: domain + configuration contracts. Single source of truth = `src/core/`.
- **Stage 2B — DONE**: reusable UI & frontend foundation (providers, theme, template registry, UI primitives, domain components, layout, i18n).
- **Stage 3A — DONE (this task): Customer Visual Experience** — real branded Home, My Cards (subscription-card wallet + detail modal with QR placeholder), and Profile screens. Configuration-driven via BusinessProvider (Sunrise Bakery); reuses Stage 2B components; mock data via `mockServices`. Frozen tabs Home/My Cards/Profile preserved. No QR/purchase/redemption/staff/backend.
- **Later — NOT started**: Stage 3B+ (Staff experience, purchase/redemption/QR/OTP, Customer Hub, offers/stores/activity real data, real APIs/backend).

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
