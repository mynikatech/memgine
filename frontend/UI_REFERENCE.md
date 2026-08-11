# Memgine UI Reference (Visual Baseline)

## Approved visual baseline
One GUI mockup was supplied and is recorded as the **approved visual baseline** for the Café/Bakery Customer experience. It is **NOT implemented in this stage** and must not be redesigned.

Observed elements (for later UI implementation only):
- Memgine-branded top bar with back affordance and wordmark.
- Prominent **membership card** ("Gold Member", validity date) with a large **QR code** (maps to `TemplateComponentKey.QR_CODE` + `MEMBERSHIP_CARD`, card style `MODERN`).
- **Active Benefits** list with icon + title + validity (maps to `BENEFIT_LIST`).
- Warm café/bakery color treatment (business branding via `primaryColor`).
- A bottom navigation bar.

## Important: the other 18 images are NOT UI screenshots
They are architecture/domain/business-flow reference diagrams (layered architecture, service architecture, domain models, business journeys, brief slides). They inform terminology and structure only — see `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `CONFIGURATION.md`.

## Navigation reconciliation (inconsistency to note)
The mockup's bottom tabs read **Home / Benefits / Offers / Profile**, but the FROZEN template navigation is **HOME / MY_CARDS / PROFILE** with **OFFERS** (and STORES/ACTIVITY) as **secondary sections**. When UI is built later, follow the frozen `TemplateDefinition` (customer primary nav = HOME / MY_CARDS / PROFILE); treat Benefits/Offers as sections surfaced within those, not as primary tabs.

## Do / Don't for later UI stages
- Do render strictly from Template + BusinessConfiguration + domain data.
- Do use only `allowedComponents` and `supportedCardStyles` from the template.
- Don't add pages/navigation/components not permitted by the template.
- Don't hardcode business-specific values that belong in BusinessConfiguration.
