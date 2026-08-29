import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { RESTAURANT_V1 } from "../template/restaurant-template-definition";

/**
 * Platform-owned generic starter content for Restaurant organizations.
 */
export const RESTAURANT_DEFAULT_CONTENT: TemplateDefaultContent = {
  templateId: RESTAURANT_V1.id,

  businessIdentity: {
    displayName: "Your Restaurant",
    tagline: "Good food. Memorable experiences.",
    logoUrl: "https://placeholder.memgine.app/logos/restaurant.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=60",
  },

  membership: {
    tierName: "Dining Member",
    productName: "Dining Membership",
    description:
      "Enjoy member-only dining benefits, special offers and rewards.",
    priceLabel: "$25 / month",
  },

  activeBenefits: [
    {
      title: "Member welcome benefit",
      description:
        "Enjoy a complimentary signature item or welcome benefit with your membership.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "Member dining offers",
      description:
        "Enjoy special pricing and exclusive offers on selected dining experiences.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Early access",
      description:
        "Be first to discover seasonal dishes, special menus and new dining experiences.",
      type: BenefitType.PERK,
    },
  ],

  heroPromotion: {
    title: "Something delicious is waiting",
    description:
      "Discover your next dining experience and enjoy an exclusive member benefit.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=60",
  },

  featuredPromotion: {
    title: "Signature Dining Special",
    description:
      "Enjoy a special dining offer available exclusively to members.",
    badge: "MEMBER SPECIAL",
    expiryLabel: "Limited time",
    imageUrl:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=60",
  },

  offers: [
    {
      title: "Member Dining Special",
      description: "Enjoy an exclusive offer on selected dining experiences.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Bring a Friend",
      description:
        "Invite a friend to enjoy a memorable dining experience together.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Seasonal Menu",
      description: "Discover seasonal dishes and chef-inspired favourites.",
      badge: "SEASONAL",
      imageUrl:
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60",
    },
  ],

  stores: [
    {
      name: "Main Restaurant",
      area: "Your Area",
      addressLine: "Business address",
      hours: "Opening hours",
    },
  ],

  activity: [],

  businessInformation: {
    about:
      "A welcoming restaurant serving thoughtfully prepared dishes and memorable dining experiences for everyday meals, celebrations and special occasions.",
    supportEmail: "hello@yourrestaurant.example",
    supportPhone: "+1 (000) 000-0000",
    website: "https://yourrestaurant.example",
  },

  businessPreferences: {
    notifications: true,
    marketingEmails: false,
    favoriteRoast: "",
  },

  referral: {
    headline: "Share the table",
    description:
      "Invite a friend to discover your restaurant and enjoy a memorable meal together.",
    rewardLabel: "Member referral reward",
    code: "DINEWITHUS",
  },
};
