# Memgine Frontend Architecture

_Stage 2 · Phase 1 — Framework Foundation. Expo / React Native (native + web) + Expo Router. Backend: FastAPI + MongoDB (not yet wired; frontend talks only to a typed service boundary)._

## 1. Guiding principles (from the Frontend Architecture Brief)

- **Platform before product** — build a reusable, configuration-driven framework, not a one-off customer app.
- **Configuration over customization** — businesses configure within Memgine-controlled templates; no arbitrary pages, navigation, custom code, or unsupported components.
- **Separation of concerns** — UI components ← templates ← business configuration ← business data.
- **Backend independence** — the frontend uses business concepts (conceptual domain model), never physical DB structures. It talks to a single typed service boundary; a mock fulfills it today, a REST/API client later, with no UI changes.
- **Navigation stays Memgine-controlled** — only branding and supported presentation/content are business-configurable.
- **Globalization ready from day one** — locale, region formatting and RTL are structural even though only English is seeded now.

## 2. Rendering pipeline

```
UI Components  →  Templates  →  Business Provider  →  Rendered Experience
(design-system)  (registry)     (config → theme)      (template + config + data + i18n)
```

- **UI Components** (`src/design-system`) — Button, Card, Input, Table, MembershipCard, OfferCard, Banner, Modal, StatusView (loading/empty/error). All read the active theme via `useTheme()`.
- **Templates** (`src/templates`) — `TemplateDefinition` (Memgine-controlled) declares structure/sections, available components and allowed config options. Registered in a `TemplateRegistry`. First family: **Food & Beverage / Café-Bakery** (`food-beverage`).
- **Business Provider** (`src/business`) — loads a `BusinessConfiguration`, derives the active `Theme` from its branding, and resolves its `TemplateDefinition` from the registry.
- **Rendered Experience** — a screen composes template + configuration + data (+ localization) with zero business-specific code.

## 3. Folder structure

```
app/                         # Expo Router routes (Stage 1 shells, unchanged)
  (customer)/                #   native tabs: home, cards, profile
  staff/                     #   web sidebar: counter, customers, configuration
  index.tsx                  #   platform redirect (web→staff, native→customer)
  _layout.tsx                #   wraps app in I18nProvider + BusinessProvider
src/
  theme/                     # design tokens + theme engine
    tokens.ts                #   spacing, radius, typography, base palette, shadows
    theme.ts                 #   Theme type, createTheme(branding), baseTheme
    color-utils.ts           #   darken()
    colors.ts                #   back-compat COLORS/SPACING/RADIUS for shells
  i18n/                      # localization foundation (English seeded)
    en.ts, translations.ts, format.ts, I18nProvider.tsx, index.ts
  services/                  # typed service boundary (mock today)
    types.ts                 #   conceptual domain model + MemgineService interface
    mockData.ts, mockService.ts, index.ts (exports `service`)
  templates/                 # template registry
    types.ts, foodAndBeverage.ts, registry.ts, index.ts
  business/                  # BusinessProvider + config type
    types.ts, BusinessProvider.tsx, index.ts
  design-system/             # reusable UI components (+ barrel)
  layout/                    # Screen shell (safe-area + themed)
  components/Placeholder.tsx # themed placeholder for un-built shells
  constants/navigation.ts    # route configs
```

## 4. Theme + configuration model

- **Template Definition** (Memgine): structure, screens, sections, available components, allowed config options, version.
- **Business Configuration** (business, template-constrained): branding (logo text + colors), enabled sections + order, content slots.
- **Theme**: `createTheme(branding)` merges the constrained branding slice over the Memgine base tokens. Spacing / typography / radius / shadows remain Memgine-owned.
- **Proof of architecture**: two mock businesses (`biz-a` café+bakery, `biz-b` bakery-heavy) share the single `food-beverage` template and differ only by configuration — the Customer Home screen re-themes live when switching between them, with no per-business code.

## 5. Conceptual domain model (business concepts, not DB tables)

`Organization` → owns `MembershipProduct` → includes `Benefit` + defines `SubscriptionPlan`; `Customer` enrols via `Subscription`; `Campaign` publishes `Offer`; `Redemption` links Benefit/Subscription/Store/Staff. Represented as TypeScript interfaces in `src/services/types.ts`. The frontend understands these concepts but never reproduces the physical persistence model.

## 6. Frontend ↔ backend boundary

`Frontend → MemgineService (typed) → [mock | REST/API] → backend → MongoDB`. The app imports only `service` from `src/services`. Today it is `MockMemgineService` with simulated latency; swapping to a real client is a one-line change and requires no component edits.

## 7. Localization

`I18nProvider` exposes `t(path, vars)`, `locale`/`setLocale`, region-aware `formatCurrency` / `formatNumber` / `formatDate`, and an `isRTL` flag. Only `en` is seeded; the namespace + interpolation structure is ready for more locales and RTL. Regional formatting is separate from language (country ≠ language ≠ currency ≠ timezone). Regulatory/country rules belong in the backend, not the UI.

## 8. Explicitly out of scope for Phase 1

Actual template screens (Customer Hub, Café/Bakery pages), business selection UX at product depth, Organization/Platform/Staff admin depth, additional template families (Fitness/Salon/Restaurant), real API wiring, auth, payments, QR, OTP, redemption/purchase flows. These are later phases and were not built.
