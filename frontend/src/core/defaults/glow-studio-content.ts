import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { SALON_V1 } from "../template/salon-template-definition";

/**
 * GLOW_STUDIO_CONTENT — Glow Studio's own resolved content on the salon-v1
 * template. Salon-appropriate copy & spa imagery, entirely distinct from the
 * F&B demo. Proves that swapping the content object (with no UI change)
 * re-brands the same renderer. Note: no `featuredPromotion` / `businessPreferences`
 * because salon-v1 does not surface those sections.
 */
export const GLOW_STUDIO_CONTENT: TemplateDefaultContent = {
  templateId: SALON_V1.id,

  // ---- Mandatory ----
  businessIdentity: {
    displayName: "Glow Studio",
    tagline: "Where your glow is the goal.",
    logoUrl: "https://placeholder.memgine.app/logos/glow-studio.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?auto=format&fit=crop&w=1200&q=60",
  },
  membership: {
    tierName: "Radiance Member",
    productName: "Radiance Membership",
    description: "Your membership for monthly facials, priority booking and member pricing.",
    priceLabel: "$59 / month",
  },
  activeBenefits: [
    {
      title: "Monthly signature facial",
      description: "One complimentary signature facial every month.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "15% off all products",
      description: "Member pricing on every take-home skincare product.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Priority booking",
      description: "Skip the waitlist with member-only priority appointments.",
      type: BenefitType.PERK,
    },
  ],

  // ---- Optional ----
  heroPromotion: {
    title: "Your monthly glow is ready",
    description: "Your complimentary signature facial is ready to book at Glow Studio.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=60",
  },
  businessInformation: {
    about:
      "Glow Studio is a boutique skincare & beauty studio offering expert facials, treatments and self-care rituals in a calm, modern space.",
    supportEmail: "hello@glowstudio.example",
    supportPhone: "+1 (415) 555-0173",
    website: "https://glowstudio.example",
  },
  referral: {
    headline: "Share the glow",
    description: "Invite a friend to become a Radiance Member and you both earn a free add-on service.",
    rewardLabel: "1 free add-on each",
    code: "GLOWFRIEND",
  },
};
