# Memgine — PRD

## Original Problem Statement
Build the Memgine MVP in small controlled stages. **Stage 1 / Task 1: Project Foundation ONLY** — initialize the Expo/React Native app (native + web + Expo Router), establish a clean scalable folder structure, and create placeholder navigation shells for Customer (mobile) and Staff (web/desktop). No business logic. Stop after Task 1.

## Architecture
- Expo SDK 54, React Native 0.81, Expo Router 6 (file-based routing).
- Native + Web support (already configured in `app.json`).
- Platform-split entry: `Platform.OS === 'web'` → Staff shell; native → Customer shell.

## User Personas
- **Customer** (mobile/native): loyalty/membership end user.
- **Staff** (web/desktop workstation): operates counter, manages customers/config.

## Core Requirements (static)
- Customer nav: Home, My Cards, Profile (mobile-optimized tabs).
- Staff nav: Counter, Customers, Configuration (desktop-optimized sidebar).
- Placeholder content only in Stage 1.

## Implemented (2026-06)
- 2026-06 — Task 1 foundation:
  - `app/index.tsx` — platform redirect (web→Staff, native→Customer).
  - `app/(customer)/` — Tabs layout + Home/Cards/Profile placeholders.
  - `app/staff/` — desktop sidebar layout + Counter/Customers/Configuration placeholders.
  - `src/theme/colors.ts`, `src/constants/navigation.ts`, `src/components/Placeholder.tsx`.
  - Verified: web Staff shell renders + sidebar navigation works.

## Explicitly NOT built (deferred to later stages)
BusinessProvider, BusinessConfiguration, TemplateDefinition, Theme engine, Localization, Domain models, Service interfaces, QR generation/scanning, OTP, customer search, Membership, Redemption, Purchase, Invoice, Onboarding, Auth, Database, Payments, SMS, POS — any business logic.

## Backlog (later stages, do not start without instruction)
- P0: Domain models + service interfaces + BusinessProvider.
- P1: Theme engine, localization, membership/redemption/purchase flows.
- P2: QR gen/scan, OTP, POS/SMS/payment integrations, full UI stage.
