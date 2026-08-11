# Memgine — PRD

## Original Problem Statement
Build the Memgine MVP in small, credit-controlled stages. Frontend: Expo / React Native (native + web) + Expo Router. Backend: FastAPI + MongoDB. Product = a **reusable, configuration-driven** membership platform (template + configuration + business data), NOT a one-off app.

## Architecture (see /app/frontend/ARCHITECTURE.md)
- Rendering pipeline: UI Components → Templates → BusinessProvider → Rendered Experience.
- Platform-split entry: web → Staff shell, native → Customer shell.
- Single typed service boundary (`MemgineService`); mock today, REST later — no UI change.
- Conceptual domain model (business concepts, not physical DB tables).

## User Personas
- **Customer** (native): views memberships, benefits, offers; branded per business.
- **Staff** (web workstation): counter, customers, configuration.
- (Later) Organization Admin, Platform Admin.

## Core Requirements (static)
- Configuration over customization; navigation stays Memgine-controlled.
- Backend independence; globalization-ready from day one.

## Implemented
- **2026-06 — Stage 1 (Task 1): Project foundation** — Expo Router app, platform-split navigation shells (Customer tabs: Home/My Cards/Profile; Staff sidebar: Counter/Customers/Configuration), placeholder content. Verified.
- **2026-06 — SDK upgrade** — Expo SDK 54 → 55 (RN 0.83.10, React 19.2.0, expo-router ~55). Both shells verified.
- **2026-06 — Stage 2 (Task 2): Phase 1 framework foundation** —
  - Design tokens + theme engine (`src/theme`): tokens, `createTheme(branding)`, base theme.
  - Reusable UI component library (`src/design-system`): Button, Card, Input, Table, MembershipCard, OfferCard, Banner, Modal, StatusView.
  - Layout/shell (`src/layout/Screen`): safe-area + themed.
  - Localization foundation (`src/i18n`): I18nProvider, `t()`, region formatting, RTL flag; English seeded.
  - BusinessProvider (`src/business`): loads config → derives theme → resolves template.
  - Template Registry (`src/templates`): `TemplateDefinition` + first family Food & Beverage / Café-Bakery.
  - Typed service abstraction (`src/services`): `MemgineService` interface + `MockMemgineService` + mock data (2 businesses proving one template + two configs).
  - ARCHITECTURE.md written; providers wired into root `_layout`; Home screen is a live foundation proof (switch businesses → live re-theme).
  - Constraints honored: Expo/RN stack kept, mock data only, English only, no business-feature depth.

## Backlog (later phases — do not start without instruction)
- **Phase 2**: Customer Hub (My Memberships + business selection) + Café/Bakery template screens (Home/Hero, Memberships, Benefits, Offers, Stores, Activity, Profile).
- **Phase 3**: Lean Organization Admin (branding, configuration, products, benefits, offers, customers) — MVP depth only.
- **Later**: More templates (Fitness/Salon/Restaurant), Platform Admin depth, Staff application depth, real FastAPI/Mongo APIs, auth, payments, QR/OTP, redemption/purchase, advanced integrations, additional locales/RTL.
