# Memgine Domain Model

Business concepts (not physical DB tables). Source of truth: `src/core/domain/`.

## Entities & relationships (from Fig 6-1 and Fig 8-1)

- **Organization** owns → **Store**, **Staff**, **MembershipProduct**. Has account context (**OrganizationAccount**: planTier, managementModel) and `legalName` — these are platform/entitlement context, NOT configuration.
- **MembershipProduct** — the product a business **sells**. Includes **Benefit**s (via `benefitIds`) and defines **SubscriptionPlan**s (price + billing interval).
- **Subscription** — a **Customer's** subscription **to a MembershipProduct** under a specific plan. Has status (PENDING/ACTIVE/EXPIRED/CANCELLED).
- **Customer** — platform-level identity. Relationship to a business is expressed **through a Subscription** (a customer may hold subscriptions across multiple organizations — the "My Memberships / My Cards" hub concept).
- **Benefit** — a perk offered by a product (DISCOUNT/FREEBIE/REWARD/PERK), optional validity window/recurrence.
- **Offer** — promotional; may target membership products (`targetProductIds`).
- **Redemption** — a Benefit redeemed against a Subscription, at a Store, by a Staff member.

```
Organization ──owns──> MembershipProduct ──includes──> Benefit
     │                        │
     │                        └──defines──> SubscriptionPlan
     ├──has──> Store                            ▲
     ├──has──> Staff                            │ (plan)
     │                                          │
Customer ──subscribes (Subscription)───────────┘
Subscription + Benefit + Store + Staff ──> Redemption
Organization ──publishes──> Offer ──targets──> MembershipProduct
```

## Critical distinction (do NOT collapse)
- **MembershipProduct** = what the business sells.
- **Subscription** = the customer's subscription to that product.
- **"My Cards"** is a **Customer UI** label, not a domain entity. The underlying domain is **subscription-oriented**; there is no `Membership` entity.

## Business journeys (from Fig 7.6, for context only — not implemented)
- **Organization journey**: onboarding → configure org → create stores → register staff → create benefits → create membership products → associate benefits/stores → publish products.
- **Customer journey**: registration → browse products → select plan → purchase subscription → active subscription → benefits available.
- **Redemption journey**: visit store → staff initiates redemption → validate customer/subscription/benefit/store eligibility → redeem benefit → record redemption → notify.

## Enumerations
`PlanTier` (BASIC/PRO/ENTERPRISE) · `ManagementModel` (SELF_SERVICE/MANAGED_SERVICE) · `BenefitType` (DISCOUNT/FREEBIE/REWARD/PERK) · `SubscriptionStatus` · `RedemptionStatus` · `BillingInterval`. Staff RBAC: `StaffRole` + `Capability` (see `CONFIGURATION.md` / permissions).
