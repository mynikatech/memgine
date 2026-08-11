# Memgine — Project Manifest

Single entry point for future Agent tasks. Captures what Memgine is, what is frozen, and where the source of truth lives — so work does not depend on the Support conversation.

## What Memgine is
A reusable, **configuration-driven** membership platform. Businesses do not get bespoke apps; they get a Memgine **template** configured by a **BusinessConfiguration**, rendering over shared **domain data**. Navigation stays Memgine-controlled; only branding and supported presentation/content are business-configurable.

## Tech stack (frozen)
- Expo SDK 55, React Native 0.83, React 19.2 — Android / iOS / Web.
- Expo Router (file-based routing).
- No database or external backend yet. Frontend talks only to typed service contracts (`src/core/services`). Mock/in-memory only.

## Stage status
- **Stage 1 — FROZEN.** Expo foundation + platform-split navigation shells: Customer (native tabs: Home / My Cards / Profile) and Staff (web sidebar: Counter / Customers / Configuration). Placeholder content only.
- **Stage 2 — this task.** Domain + configuration **contracts** only (no UI, no provider, no theme engine, no backend). Source of truth = `src/core/`.
- **Later stages (NOT started).** BusinessProvider, theme engine, UI component library, Customer/Staff/Business-Admin screens, QR/OTP, purchase/redemption flows, real APIs.

## Source of truth (code)
`src/core/` — the only place domain/config/template/permission/localization/service contracts are defined. Do not redefine these elsewhere or create screen-specific variants.

| Concern | File |
|---|---|
| Primitives, `TemplateCategory`, `Money`, `Address`, `BillingInterval` | `src/core/domain/common.ts` |
| Entities (Organization, Store, Customer, Staff, MembershipProduct, Benefit, Offer, Subscription, Redemption, OrganizationAccount) | `src/core/domain/entities.ts` |
| RBAC capabilities / roles / principals | `src/core/permissions/permissions.ts` |
| Localization readiness contract | `src/core/localization/localization.ts` |
| Frozen `TemplateDefinition` + `f-and-b-bakery-v1` | `src/core/template/template-definition.ts` |
| Frozen `BusinessConfiguration` | `src/core/config/business-configuration.ts` |
| `BusinessContext` / `SessionContext` (for future BusinessProvider) | `src/core/context/business-context.ts` |
| Service contracts | `src/core/services/service-contracts.ts` |
| Sunrise Bakery default config example | `src/core/defaults/sunrise-bakery.ts` |
| In-memory mocks (compile-demonstration only) | `src/core/mocks/mock-services.ts` |

## Docs
- `ARCHITECTURE.md` — layered/service architecture and boundaries.
- `DOMAIN_MODEL.md` — entities, relationships, business journeys.
- `CONFIGURATION.md` — template vs configuration vs domain data; entitlements.
- `UI_REFERENCE.md` — approved GUI visual baseline (not yet implemented).
