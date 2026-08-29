import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { COFFEE_CHAIN_V1 } from "../template/coffee-chain-template-definition";

/**
 * Platform-owned generic starter content for Coffee Chain organizations.
 */
export const COFFEE_CHAIN_DEFAULT_CONTENT: TemplateDefaultContent = {
  templateId: COFFEE_CHAIN_V1.id,

  businessIdentity: {
    displayName: "Your Coffee House",
    tagline: "Great coffee. Great moments.",
    logoUrl: "https://placeholder.memgine.app/logos/coffee.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=60",
  },

  membership: {
    tierName: "Coffee Club Member",
    productName: "Coffee Club",
    description:
      "Enjoy member-only coffee benefits, special offers and rewards across your locations.",
    priceLabel: "$15 / month",
  },

  activeBenefits: [
    {
      title: "Daily coffee benefit",
      description:
        "Enjoy a complimentary signature coffee as part of your membership.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "Member pricing",
      description:
        "Enjoy special pricing on selected drinks and café favourites.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Early access",
      description:
        "Be first to discover seasonal drinks and new menu favourites.",
      type: BenefitType.PERK,
    },
  ],

  heroPromotion: {
    title: "Your next coffee is waiting",
    description:
      "Stop by your favourite location and enjoy your member benefits.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1509042239860-f550ce710eae?auto=format&fit=crop&w=1200&q=60",
  },

  featuredPromotion: {
    title: "Coffee Club Special",
    description: "Enjoy a member-only special on your next coffee visit.",
    badge: "MEMBER SPECIAL",
    expiryLabel: "Limited time",
    imageUrl:
      "https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=1200&q=60",
  },

  offers: [
    {
      title: "Member Coffee Special",
      description: "Enjoy a special price on selected coffee favourites.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Bring a Coffee Friend",
      description: "Invite a friend to discover your coffee house.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1511081692775-05d0f180a065?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Seasonal Coffee",
      description: "Discover seasonal drinks and new coffee favourites.",
      badge: "SEASONAL",
      imageUrl:
        "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=800&q=60",
    },
  ],

  stores: [
    {
      name: "Main Coffee House",
      area: "Your Area",
      addressLine: "Business address",
      hours: "Opening hours",
    },
    {
      name: "Downtown Location",
      area: "Downtown",
      addressLine: "Business address",
      hours: "Opening hours",
    },
  ],

  activity: [],

  businessInformation: {
    about:
      "A welcoming coffee house serving freshly prepared coffee, handcrafted drinks and café favourites in comfortable spaces designed for everyday moments.",
    supportEmail: "hello@yourcoffeehouse.example",
    supportPhone: "+1 (000) 000-0000",
    website: "https://yourcoffeehouse.example",
  },

  businessPreferences: {
    notifications: true,
    marketingEmails: false,
    favoriteRoast: "",
  },

  referral: {
    headline: "Share your coffee break",
    description:
      "Invite a friend to discover your coffee house and enjoy a great cup together.",
    rewardLabel: "Member referral reward",
    code: "COFFEEFRIEND",
  },
};
