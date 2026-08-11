# Memgine Frontend Architecture

_Expo / React Native (Android + iOS + Web) + Expo Router. No database or external backend in this stage._

## Layered architecture (from reference diagrams Fig 7-1 / Fig 7-5)

```
Presentation Layer            (later: Customer / Staff / Business-Admin UI)
  ↓
Application Interface Layer   (later: Membership / Customer / Benefits interfaces)
  ↓
Application Service Layer     → src/core/services/service-contracts.ts (typed contracts)
  ↓
Business Domain Layer         → src/core/domain/* (Organization, MembershipProduct, Benefits, Subscription, …)
  ↓
Shared Platform / Integration Services  (later: Notification, Reporting, Configuration, Scheduler)
  ↓
Data Access Layer → Data Stores        (later: backend + persistence; NOT in frontend scope)
```

The frontend understands **business concepts**, never physical database structures.

## Core principles (frozen)
- **Platform before product** — reusable framework, not a one-off app.
- **Configuration over customization** — businesses configure within a template; no arbitrary pages/navigation/components/custom code.
- **Separation of concerns** — Template (what's possible) vs BusinessConfiguration (how a business presents) vs Domain Data (actual data). See `CONFIGURATION.md`.
- **Backend independence** — UI ↔ typed `MemgineService`-style contracts ↔ (future) backend. Today only mock/in-memory implementations exist.
- **Navigation stays Memgine-controlled** — only branding + supported presentation/content are business-configurable.
- **Globalization-ready from day one** — locale/currency/timezone/country modelled separately; English only initially.
- **Capability-based access** — UI access is decided by capabilities, not ownership (`src/core/permissions`).

## Frontend ↔ backend boundary (from reference "Frontend ↔ Backend Boundary")

```
Frontend (pages, components, templates, config, localization, presentation state)
   → REST / API / Service  (typed contracts in src/core/services)
Backend (business rules, authorization, tenant isolation, subscription lifecycle, validation, integrations)
   → Persistence (later)
```

Mock/in-memory service implementations are acceptable now; real APIs plug into the same contracts later with no UI changes.

## Project structure (relevant)
```
app/                         # Expo Router routes (Stage 1 shells — FROZEN)
  (customer)/                #   tabs: home, cards, profile
  staff/                     #   sidebar: counter, customers, configuration
  index.tsx, _layout.tsx
src/
  core/                      # Stage 2 contracts — single source of truth (see MEMGINE_MANIFEST.md)
  components/Placeholder.tsx # shared placeholder for shells
  constants/navigation.ts    # route configs
  theme/colors.ts            # minimal shell tokens (theme engine is later)
  utils/storage              # pre-shipped kv storage
```

## Stage 2B — reusable frontend foundation (consumes `src/core/`, does not redefine it)
- `src/providers/BusinessProvider.tsx` — context surfacing organization/account, entitlements (planTier/managementModel), configuration, template, derived theme, localization context and capability checks (`can`). Defaults to the mock Sunrise Bakery context. Components read business values from here, never hard-coded.
- `src/providers/LocalizationProvider.tsx` — `t()` over the English catalog + `Intl` currency/number/date formatting driven by the active locale (compatible with en-IN / INR / Asia/Kolkata).
- `src/theme/` — design tokens (`tokens.ts`), `buildTheme(branding)` (`theme.ts`) letting BusinessConfiguration branding influence brand slots, `color-utils.ts`. Cross-platform shadows via `Platform.select`.
- `src/templates/registry.ts` — resolves `templateId → TemplateDefinition → allowed nav/sections/components`. Only `f-and-b-bakery-v1`. Not a page builder.
- `src/ui/` — primitives: Text, Button, IconButton, Card, Surface, Input, Badge, Section, Header, StateView (loading/empty/error), Modal.
- `src/ui/domain/` — presentation-only: MembershipCard (supports MODERN/CLASSIC/MINIMAL card styles), BenefitItem, ReceiptSummary. No workflows.
- `src/layout/Screen.tsx` — cross-platform safe-area screen primitive.
- Note: Stage 1 shells (`app/(customer)`, `app/staff`) still use `src/theme/colors.ts` and are visually unchanged; providers are mounted at the root for availability.

## Out of scope in this stage
BusinessProvider, theme engine, UI component library, Customer/Staff/Business-Admin screens, QR/OTP, purchase/redemption/invoice flows, onboarding, auth, database, payments, SMS, POS, analytics/reporting, page builder, additional templates.
