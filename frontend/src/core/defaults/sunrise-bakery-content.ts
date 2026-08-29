import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { BAKERY_V1 } from "../template/bakery-template-definition";

/**
 * SUNRISE_BAKERY_CONTENT — the Sunrise Bakery business's OWN resolved content on
 * the `f-and-b-bakery-v1` template.
 *
 * This is deliberately DISTINCT from `F_AND_B_DEFAULT_CONTENT` (the generic
 * starter/demo copy a brand-new F&B business begins with). It demonstrates the
 * architectural promise that business content/images are pure data that can be
 * replaced WITHOUT touching any UI code: the same renderer, fed this object,
 * produces a branded Sunrise Bakery experience instead of the generic starter.
 *
 * Copy/imagery are bakery-appropriate (bread, pastries, cakes) — NOT the
 * client's coffee mockup branding. Imagery uses royalty-free stock URLs so the
 * renderer has real placeholder visuals; they are content values, not bundled
 * assets, and every field is replaceable per business.
 */
export const SUNRISE_BAKERY_CONTENT: TemplateDefaultContent = {
  templateId: BAKERY_V1.id,

  // ---- Mandatory ----
  businessIdentity: {
    displayName: "Sunrise Bakery",
    tagline: "Fresh-baked happiness, every sunrise.",
    logoUrl: "https://placeholder.memgine.app/logos/sunrise-bakery.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=60",
  },
  membership: {
    tierName: "Gold Member",
    productName: "Sunrise Club",
    description:
      "Your membership for daily fresh-baked rewards and member-only pricing.",
    priceLabel: "$49 / year",
  },
  activeBenefits: [
    {
      title: "10% off pastries",
      description: "Enjoy member pricing on every pastry, every visit.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Free birthday cupcake",
      description:
        "A little something to celebrate you during your birthday month.",
      type: BenefitType.FREEBIE,
    },
  ],

  // ---- Optional ----
  heroPromotion: {
    title: "Today's treat is waiting",
    description:
      "Your daily fresh-baked reward is ready to redeem at any Sunrise Bakery.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?auto=format&fit=crop&w=1200&q=60",
  },
  featuredPromotion: {
    title: "Weekend Croissant Combo",
    description:
      "Any coffee paired with a fresh-baked butter croissant at a sweet weekend price. Members save more.",
    badge: "LIMITED TIME",
    expiryLabel: "This weekend only",
    imageUrl:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=60",
  },
  businessInformation: {
    about:
      "Sunrise Bakery has been baking fresh bread, pastries and celebration cakes for the neighbourhood since 2004 — always from scratch, always before sunrise.",
    supportEmail: "hello@sunrisebakery.example",
    supportPhone: "+1 (416) 555-0140",
    website: "https://sunrisebakery.example",
  },
  businessPreferences: {
    notifications: true,
    marketingEmails: false,
  },
  referral: {
    headline: "Share the warmth, earn a treat",
    description:
      "Invite a friend to join Sunrise Club and you both earn a free pastry on your next visit.",
    rewardLabel: "1 free pastry each",
    code: "SUNRISE10",
  },
};
