# Memgine — PRD

## Original Problem Statement
Build the Memgine MVP in small, credit-controlled stages. Frontend: Expo / React Native (native + web) + Expo Router. A reusable, configuration-driven membership platform (Template + BusinessConfiguration + Domain Data). No DB/backend yet.

## Stage status
- **Stage 1 — FROZEN**: Expo foundation + platform-split navigation shells (Customer tabs: Home/My Cards/Profile; Staff sidebar: Counter/Customers/Configuration), placeholder content. SDK 55.
- **Stage 2A — DONE**: domain + configuration contracts. Single source of truth = `src/core/`.
- **Stage 2B — DONE**: reusable UI & frontend foundation (providers, theme, template registry, UI primitives, domain components, layout, i18n).
- **Stage 3B — DONE**: multi-subscription/org card-context foundation (CustomerContextProvider; org-grouped My Cards).
- **Stage 5 — DONE**: Branded Organization Experience & Template-Driven UI.
- **Task 5B — DONE (frozen)**: F&B template section catalogue (mandatory vs optional + presentation rules) and a replaceable default-content layer (`f-and-b-default-content.ts`).
- **Task 5C — DONE (pending user verify)**: Reusable, template-driven **Business Experience Renderer**. Top level is now the Memgine platform shell ("Your Memberships" + "Profile"); selecting a membership pushes a full-screen branded business experience (`app/business/[subscriptionId].tsx`) that covers the platform tabs, with only a "‹ Your Memberships" return and a subtle "Powered by Memgine" footer. Renderer = `src/experience/` (`resolveExperience` + `BusinessExperience`), driven by TemplateDefinition + BusinessConfiguration + TemplateDefaultContent + domain data. Config-gated tabs (Card / Offers / History / Profile) with overview/tab/detail/modal presentations. Added `SUNRISE_BAKERY_CONTENT` + `getBusinessContent(orgId)` so the same renderer produces a branded Sunrise Bakery experience without hard-coding. Steep & Sip default content untouched. Multi-subscription architecture preserved.
- **Task 5D — DONE (pending user verify)**: Same-business multi-subscription context. Entering any subscription opens the same org experience; the business route loads ALL of the customer's subscriptions for that org and an unobtrusive in-header membership selector (pills) lets the customer switch Gold ↔ Silver in place. Added `CustomerContextProvider.setActiveSubscription(id)` (updates subscriptionId only, org unchanged). No new context/screens/backend.
- **Task 6A — DONE (pending user verify)**: Second-template proof. Added `salon-v1` TemplateDefinition + generic `SALON_DEFAULT_CONTENT` + one demo Salon business **Glow Studio** (config + `GLOW_STUDIO_CONTENT` + mock domain data: org/store/benefits/product/subscription/offers/redemption). Added `TemplateCategory.BEAUTY_AND_WELLNESS`, a `BUSINESS_CONTEXTS` registry, and made `BusinessProvider` switch the active business per org via `setActiveBusiness(orgId)` (branding/template/locale follow). The wallet now lists both orgs; tapping a Glow membership renders the salon experience (rose/violet, classic cards, USD) through the SAME `BusinessExperience` renderer — zero salon-specific renderer code. Resolver now template-gates optional content sections (generic). `tsc --noEmit` clean.
- **Later — NOT started**: 5D (Platform→Business nav proof), Staff experience, real APIs/backend, onboarding/config editor.

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
