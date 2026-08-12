import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { SALON_V1 } from "../template/salon-template-definition";

/**
 * SALON_DEFAULT_CONTENT — the REPLACEABLE generic starter/demo content a new
 * Beauty & Wellness / Salon-Spa business begins with on the `salon-v1`
 * template. Distinct tone/imagery from F&B (self-care, treatments) but the same
 * plain-data shape, so the same renderer consumes it unchanged.
 */
export const SALON_DEFAULT_CONTENT: TemplateDefaultContent = {
  templateId: SALON_V1.id,

  // ---- Mandatory ----
  businessIdentity: {
    displayName: "Your Salon",
    tagline: "Self-care, elevated.",
    logoUrl: "https://placeholder.memgine.app/logos/salon.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=60",
  },
  membership: {
    tierName: "Signature Member",
    productName: "Signature Care",
    description: "Your membership for monthly treatments and member-only pricing.",
    priceLabel: "$59 / month",
  },
  activeBenefits: [
    {
      title: "1 signature treatment / month",
      description: "A complimentary signature service every month, on us.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "Member pricing on retail",
      description: "Enjoy member pricing on all take-home products.",
      type: BenefitType.DISCOUNT,
    },
  ],

  // ---- Optional ----
  heroPromotion: {
    title: "Your glow-up awaits",
    description: "Your monthly signature treatment is ready to book at your salon.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=60",
  },
  businessInformation: {
    about: "A neighbourhood salon & spa dedicated to relaxed, expert self-care.",
    supportEmail: "hello@yoursalon.example",
    supportPhone: "+1 (000) 000-0000",
    website: "https://yoursalon.example",
  },
  referral: {
    headline: "Refer a friend, glow together",
    description: "Invite a friend to join and you both earn a complimentary add-on service.",
    rewardLabel: "1 free add-on each",
    code: "GLOWTOGETHER",
  },
};
