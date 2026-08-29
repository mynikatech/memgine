import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { BAKERY_V1 } from "../template/bakery-template-definition";

/**
 * Platform-owned generic starter content for Bakery organizations.
 *
 * This content is copied into a new organization only when the Platform
 * Administrator selects "Use default business content".
 *
 * It is not tied to Sunrise Bakery or any other existing organization.
 */
export const BAKERY_DEFAULT_CONTENT: TemplateDefaultContent = {
  templateId: BAKERY_V1.id,

  businessIdentity: {
    displayName: "Your Bakery",
    tagline: "Freshly baked moments, made every day.",
    logoUrl: "https://placeholder.memgine.app/logos/bakery.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=60",
  },

  membership: {
    tierName: "Bakery Member",
    productName: "Bakery Membership",
    description:
      "Enjoy member-only treats, special offers and rewards from your favourite bakery.",
    priceLabel: "$18 / month",
  },

  activeBenefits: [
    {
      title: "Member treat",
      description:
        "Enjoy a complimentary bakery favourite as part of your membership.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "Member pricing",
      description:
        "Enjoy special pricing on selected baked goods and seasonal favourites.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Early access",
      description:
        "Get early access to seasonal bakes, new products and limited releases.",
      type: BenefitType.PERK,
    },
  ],

  heroPromotion: {
    title: "Something fresh is waiting",
    description:
      "Discover freshly baked favourites and enjoy an exclusive member treat.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=60",
  },

  featuredPromotion: {
    title: "Bakery Member Special",
    description:
      "Enjoy a special bakery treat available exclusively to members.",
    badge: "LIMITED TIME",
    expiryLabel: "Limited time",
    imageUrl:
      "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1200&q=60",
  },

  offers: [
    {
      title: "Member Bakery Special",
      description:
        "Enjoy a special offer on selected freshly baked favourites.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Bring a Friend",
      description:
        "Introduce a friend to your favourite bakery and share the experience.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Seasonal Favourites",
      description: "Discover seasonal baked goods and limited-time favourites.",
      badge: "SEASONAL",
      imageUrl:
        "https://images.unsplash.com/photo-1519869325930-281384150729?auto=format&fit=crop&w=800&q=60",
    },
  ],

  stores: [
    {
      name: "Main Bakery",
      area: "Your Area",
      addressLine: "Business address",
      hours: "Opening hours",
    },
  ],

  activity: [],

  businessInformation: {
    about:
      "A neighbourhood bakery serving freshly baked bread, pastries, cakes and seasonal favourites made for everyday moments and special occasions.",
    supportEmail: "hello@yourbakery.example",
    supportPhone: "+1 (000) 000-0000",
    website: "https://yourbakery.example",
  },

  businessPreferences: {
    notifications: true,
    marketingEmails: false,
    favoriteRoast: "",
  },

  referral: {
    headline: "Share something delicious",
    description:
      "Invite a friend to discover your bakery and enjoy the experience together.",
    rewardLabel: "Member referral reward",
    code: "BAKERYFRIEND",
  },
};
